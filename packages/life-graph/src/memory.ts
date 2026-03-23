import type {
  LifeGraphClient,
  LifeGraphMemoryEntry,
  LifeGraphMemorySearchOptions,
  LifeGraphMemorySearchResult,
  LifeGraphMemoryType,
} from './types';

const EMBEDDING_DIMENSION = 384;
const DEFAULT_MAX_MEMORY = 10_000;

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
}

export interface RememberInput {
  type: LifeGraphMemoryType;
  content: string;
  relatedTo?: string[];
}

export class MemoryManager {
  private readonly client: LifeGraphClient;
  private readonly embeddingProvider: MemoryEmbeddingProvider;
  private readonly now: () => Date;
  private readonly maxEntries: number;

  constructor(options: MemoryManagerOptions) {
    this.client = options.client;
    this.embeddingProvider = options.embeddingProvider ?? new DeterministicEmbeddingProvider();
    this.now = options.now ?? (() => new Date());
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_MEMORY;
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
    return results.map(
      (entry) =>
        `[${entry.type}] ${entry.content} (score=${entry.score.toFixed(2)}, at=${entry.timestamp})`,
    );
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
}
