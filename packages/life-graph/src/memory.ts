import { randomUUID } from 'node:crypto';

import type {
  LifeGraphClient,
  LifeGraphMemoryEntry,
  LifeGraphMemoryRole,
  LifeGraphMemorySearchOptions,
  LifeGraphMemorySearchResult,
  LifeGraphMemoryType,
  LifeGraphMemoryThreadOptions,
} from './types';

const EMBEDDING_DIMENSION = 384;
const DEFAULT_MAX_MEMORY = 10_000;
const DEFAULT_CONTEXT_DAYS = 7;
const DEFAULT_CONTEXT_LIMIT = 8;
const DEFAULT_THREAD_SUMMARY_TRIGGER = 30;
const DEFAULT_THREAD_SUMMARY_KEEP = 12;
const MAX_CONTEXT_ENTRY_CHARS = 240;

export interface MemoryEventLike {
  type?: unknown;
  data?: unknown;
}

export interface MemoryEmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

function hashToken(token: string): number {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) | 0;
  }
  return hash;
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return values;
  }
  return values.map((value) => value / magnitude);
}

function normalizeEmbedding(values: number[]): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const source = values.slice(0, EMBEDDING_DIMENSION);
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    vector[index] = numeric;
  }
  return normalizeVector(vector);
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractMemoryType(eventType: string): LifeGraphMemoryType {
  const lower = eventType.toLowerCase();
  if (lower.includes('research')) {
    return 'research';
  }
  if (lower.includes('note')) {
    return 'note';
  }
  if (lower.includes('voice') || lower.includes('conversation')) {
    return 'conversation';
  }
  return 'insight';
}

function eventToSearchQuery(event: MemoryEventLike): string {
  const type = typeof event.type === 'string' ? event.type : 'event';
  const data = event.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const candidates = [
      record.query,
      record.utterance,
      record.text,
      record.title,
      record.summary,
      record.forecast,
      record.message,
    ]
      .map((entry) => toText(entry).trim())
      .filter((entry) => entry.length > 0);
    if (candidates.length > 0) {
      return `${type} ${candidates.join(' ')}`.trim();
    }
  }
  return `${type} ${toText(data)}`.trim();
}

export function createDeterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const normalizedText = text.toLowerCase();
  const tokens = normalizedText
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = Math.abs(hash) % EMBEDDING_DIMENSION;
    const sign = hash % 2 === 0 ? 1 : -1;
    const weight = Math.max(1, Math.min(token.length, 12));
    const current = vector[index] ?? 0;
    vector[index] = current + sign * weight;
  }

  return normalizeVector(vector);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const size = Math.min(left.length, right.length, EMBEDDING_DIMENSION);
  if (size === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    const leftCandidate = left[index] ?? 0;
    const rightCandidate = right[index] ?? 0;
    const leftValue = Number.isFinite(leftCandidate) ? leftCandidate : 0;
    const rightValue = Number.isFinite(rightCandidate) ? rightCandidate : 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm <= 0 || rightNorm <= 0) {
    return 0;
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export class DeterministicEmbeddingProvider implements MemoryEmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    return createDeterministicEmbedding(text);
  }
}

let transformersExtractorPromise: Promise<unknown> | null = null;

async function loadTransformersExtractor(modelName: string): Promise<unknown> {
  if (!transformersExtractorPromise) {
    transformersExtractorPromise = (async () => {
      const moduleName = '@xenova/transformers';
      const transformers = (await import(moduleName)) as unknown as {
        pipeline?: (
          task: string,
          model?: string,
          options?: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      if (typeof transformers.pipeline !== 'function') {
        throw new Error('Transformers pipeline is unavailable.');
      }
      return transformers.pipeline('feature-extraction', modelName, {
        quantized: true,
      });
    })();
  }
  return transformersExtractorPromise;
}

function extractEmbeddingArray(output: unknown): number[] {
  if (
    output &&
    typeof output === 'object' &&
    'data' in output &&
    Array.isArray((output as { data?: unknown }).data)
  ) {
    return (output as { data: number[] }).data.map((value) => (Number.isFinite(value) ? value : 0));
  }

  if (Array.isArray(output)) {
    const flattened = output.flat(3).filter((value): value is number => typeof value === 'number');
    return flattened;
  }

  if (output && typeof output === 'object' && 'tolist' in output) {
    const tolist = (output as { tolist?: unknown }).tolist;
    if (typeof tolist === 'function') {
      const listed = (tolist as () => unknown)();
      if (Array.isArray(listed)) {
        return listed.flat(3).filter((value): value is number => typeof value === 'number');
      }
    }
  }

  return [];
}

export interface TransformersEmbeddingProviderOptions {
  modelName?: string;
  fallbackProvider?: MemoryEmbeddingProvider;
}

export class TransformersEmbeddingProvider implements MemoryEmbeddingProvider {
  private readonly modelName: string;
  private readonly fallbackProvider: MemoryEmbeddingProvider;

  constructor(options: TransformersEmbeddingProviderOptions = {}) {
    this.modelName = options.modelName ?? 'Xenova/all-MiniLM-L6-v2';
    this.fallbackProvider = options.fallbackProvider ?? new DeterministicEmbeddingProvider();
  }

  async embed(text: string): Promise<number[]> {
    try {
      const extractor = (await loadTransformersExtractor(this.modelName)) as (
        input: string,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      const raw = extractEmbeddingArray(output);
      if (raw.length === 0) {
        throw new Error('empty embedding output');
      }
      return normalizeEmbedding(raw);
    } catch {
      return this.fallbackProvider.embed(text);
    }
  }
}

export interface MemoryManagerOptions {
  client: LifeGraphClient;
  embeddingProvider?: MemoryEmbeddingProvider;
  now?: () => Date;
  maxEntries?: number;
  contextDays?: number;
  contextLimit?: number;
  threadSummaryTrigger?: number;
  threadSummaryKeep?: number;
}

export interface RememberInput {
  type: LifeGraphMemoryType;
  content: string;
  relatedTo?: string[];
  role?: LifeGraphMemoryRole;
  threadId?: string;
  key?: string;
  value?: string;
  summaryOfThreadId?: string;
}

export interface ThreadMessageInput {
  content: string;
  role?: LifeGraphMemoryRole;
  type?: LifeGraphMemoryType;
  relatedTo?: string[];
  key?: string;
  value?: string;
}

export interface StartThreadOptions {
  initialMessage?: string;
  role?: LifeGraphMemoryRole;
  relatedTo?: string[];
}

export interface ConversationContextOptions extends LifeGraphMemorySearchOptions {
  threadId?: string;
  sinceDays?: number;
  limit?: number;
}

export class MemoryManager {
  private readonly client: LifeGraphClient;
  private readonly embeddingProvider: MemoryEmbeddingProvider;
  private readonly now: () => Date;
  private readonly maxEntries: number;
  private readonly contextDays: number;
  private readonly contextLimit: number;
  private readonly threadSummaryTrigger: number;
  private readonly threadSummaryKeep: number;

  constructor(options: MemoryManagerOptions) {
    this.client = options.client;
    this.embeddingProvider = options.embeddingProvider ?? new DeterministicEmbeddingProvider();
    this.now = options.now ?? (() => new Date());
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_MEMORY;
    this.contextDays = options.contextDays ?? DEFAULT_CONTEXT_DAYS;
    this.contextLimit = options.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    this.threadSummaryTrigger = options.threadSummaryTrigger ?? DEFAULT_THREAD_SUMMARY_TRIGGER;
    this.threadSummaryKeep = options.threadSummaryKeep ?? DEFAULT_THREAD_SUMMARY_KEEP;
  }

  async remember(input: RememberInput): Promise<LifeGraphMemoryEntry | null> {
    const content = input.content.trim();
    if (!content) {
      return null;
    }

    const embedding = await this.embeddingProvider.embed(content);
    return this.client.appendMemoryEntry({
      type: input.type,
      content,
      relatedTo: input.relatedTo ?? [],
      embedding,
      timestamp: this.now().toISOString(),
      ...(input.role ? { role: input.role } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.key ? { key: input.key.trim() } : {}),
      ...(input.value ? { value: input.value.trim() } : {}),
      ...(input.summaryOfThreadId ? { summaryOfThreadId: input.summaryOfThreadId } : {}),
    });
  }

  async rememberEvent(event: MemoryEventLike): Promise<LifeGraphMemoryEntry | null> {
    const type = typeof event.type === 'string' ? event.type : 'unknown';
    const content = eventToSearchQuery(event);
    return this.remember({
      type: extractMemoryType(type),
      content,
      relatedTo: [type],
    });
  }

  async search(
    query: string,
    options: LifeGraphMemorySearchOptions = {},
  ): Promise<LifeGraphMemorySearchResult[]> {
    return this.client.searchMemory(query, options);
  }

  async startThread(options: StartThreadOptions = {}): Promise<string> {
    const threadId = randomUUID();
    const initialMessage = options.initialMessage?.trim();
    if (initialMessage) {
      await this.remember({
        type: 'conversation',
        content: initialMessage,
        relatedTo: options.relatedTo ?? [],
        role: options.role ?? 'system',
        threadId,
      });
    }
    return threadId;
  }

  async addToThread(
    threadId: string,
    input: ThreadMessageInput,
  ): Promise<LifeGraphMemoryEntry | null> {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      return null;
    }

    const entry = await this.remember({
      type: input.type ?? 'conversation',
      content: input.content,
      relatedTo: input.relatedTo ?? [],
      role: input.role ?? 'user',
      threadId: normalizedThreadId,
      ...(input.key ? { key: input.key } : {}),
      ...(input.value ? { value: input.value } : {}),
    });

    await this.summarizeThreadIfNeeded(normalizedThreadId);
    return entry;
  }

  async getThread(
    threadId: string,
    options: LifeGraphMemoryThreadOptions = {},
  ): Promise<LifeGraphMemoryEntry[]> {
    return this.client.getMemoryThread(threadId, options);
  }

  async getRelevantContext(
    eventOrQuery: MemoryEventLike | string,
    options: LifeGraphMemorySearchOptions = {},
  ): Promise<string[]> {
    const query =
      typeof eventOrQuery === 'string' ? eventOrQuery.trim() : eventToSearchQuery(eventOrQuery);
    if (!query) {
      return [];
    }

    const limit = options.limit ?? 5;
    const results = await this.search(query, { ...options, limit });
    return results.map((entry) => this.toContextLine(entry, entry.score));
  }

  async getRelevantContextForCurrentConversation(
    query: string,
    options: ConversationContextOptions = {},
  ): Promise<string[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const limit = Math.max(1, options.limit ?? this.contextLimit);
    const sinceDays = Math.max(1, options.sinceDays ?? this.contextDays);
    const thresholdMs = this.now().getTime() - sinceDays * 24 * 60 * 60 * 1000;

    const graph = await this.client.loadGraph();
    const recent = (graph.memory ?? [])
      .filter((entry) => Date.parse(entry.timestamp) >= thresholdMs)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, limit)
      .map((entry) => this.toContextLine(entry));

    const relevant = await this.getRelevantContext(normalizedQuery, {
      ...options,
      limit,
    });

    const threadContext =
      options.threadId && options.threadId.trim().length > 0
        ? (await this.getThread(options.threadId, { limit }))
            .slice(-limit)
            .map((entry) => this.toContextLine(entry))
        : [];

    const merged = [...threadContext, ...recent, ...relevant];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const item of merged) {
      if (seen.has(item)) {
        continue;
      }
      seen.add(item);
      deduped.push(item);
      if (deduped.length >= limit) {
        break;
      }
    }
    return deduped;
  }

  async getRelevantContextForToday(limit = this.contextLimit): Promise<string[]> {
    const dayLimit = Math.max(1, limit);
    const graph = await this.client.loadGraph();
    const thresholdMs = this.now().getTime() - 24 * 60 * 60 * 1000;
    return (graph.memory ?? [])
      .filter((entry) => Date.parse(entry.timestamp) >= thresholdMs)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, dayLimit)
      .map((entry) => this.toContextLine(entry));
  }

  async summarizeThread(threadId: string): Promise<LifeGraphMemoryEntry | null> {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      return null;
    }

    const thread = await this.getThread(normalizedThreadId, {
      limit: this.threadSummaryTrigger * 2,
    });
    if (thread.length < this.threadSummaryTrigger) {
      return null;
    }

    const lastSummaryIndex = this.findLastSummaryIndex(thread, normalizedThreadId);
    const sinceSummary = lastSummaryIndex >= 0 ? thread.slice(lastSummaryIndex + 1) : [...thread];
    if (sinceSummary.length < this.threadSummaryTrigger) {
      return null;
    }

    const summary = this.buildThreadSummary(sinceSummary.slice(-this.threadSummaryKeep));
    if (!summary) {
      return null;
    }

    return this.remember({
      type: 'insight',
      role: 'system',
      threadId: normalizedThreadId,
      summaryOfThreadId: normalizedThreadId,
      content: summary,
      relatedTo: [`thread:${normalizedThreadId}`],
    });
  }

  async trim(): Promise<void> {
    const graph = await this.client.loadGraph();
    const memory = [...(graph.memory ?? [])];
    if (memory.length <= this.maxEntries) {
      return;
    }
    const trimmed = memory
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, this.maxEntries);
    await this.client.saveGraph({
      ...graph,
      memory: trimmed,
      updatedAt: this.now().toISOString(),
    });
  }

  private toContextLine(entry: LifeGraphMemoryEntry, score?: number): string {
    const rolePrefix = entry.role ? `${entry.role} ` : '';
    const content = entry.content.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT_ENTRY_CHARS);
    const scorePart = typeof score === 'number' ? ` score=${score.toFixed(2)}` : '';
    return `[${entry.type}] ${rolePrefix}${content}${scorePart} @${entry.timestamp}`;
  }

  private findLastSummaryIndex(thread: LifeGraphMemoryEntry[], threadId: string): number {
    for (let index = thread.length - 1; index >= 0; index -= 1) {
      const candidate = thread[index];
      if (!candidate) {
        continue;
      }
      if (candidate.summaryOfThreadId === threadId) {
        return index;
      }
      if (candidate.role === 'system' && candidate.content.startsWith('Thread summary:')) {
        return index;
      }
    }
    return -1;
  }

  private buildThreadSummary(entries: LifeGraphMemoryEntry[]): string {
    const fragments = entries
      .filter((entry) => entry.content.trim().length > 0)
      .map((entry) => {
        const role = entry.role ?? 'user';
        return `${role}: ${entry.content.trim().replace(/\s+/g, ' ')}`;
      })
      .slice(-this.threadSummaryKeep);
    if (fragments.length === 0) {
      return '';
    }
    return `Thread summary: ${fragments.join(' | ').slice(0, 1400)}`;
  }

  private async summarizeThreadIfNeeded(threadId: string): Promise<void> {
    try {
      await this.summarizeThread(threadId);
    } catch {
      return;
    }
  }
}
