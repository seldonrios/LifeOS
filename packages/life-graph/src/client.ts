import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { LifeGraphManager, type LifeGraphManagerOptions } from './manager';
import { cosineSimilarity, createDeterministicEmbedding } from './memory';
import { resolveLifeGraphPath } from './path';
import { parseGoalPlan } from './schema';
import { getGraphSummary } from './store';
import type {
  GoalPlan,
  LifeGraphMergeConflict,
  LifeGraphMergeDeltaResult,
  LifeGraphMemoryEntry,
  LifeGraphMemorySearchOptions,
  LifeGraphMemorySearchResult,
  LifeGraphUpdate,
  LifeGraphNewsDigest,
  LifeGraphNote,
  LifeGraphNoteSearchOptions,
  LifeGraphClient,
  LifeGraphResearchResult,
  LifeGraphReviewInsights,
  LifeGraphReviewPeriod,
  LifeGraphSummary,
  LifeGraphTask,
  LifeGraphWeatherSnapshot,
  ModuleSchema,
} from './types';

export class UnsupportedQueryError extends Error {
  constructor(public readonly query: string) {
    super(`Unsupported life graph query for MVP client: ${query}`);
    this.name = 'UnsupportedQueryError';
  }
}

export class UnsupportedLabelError extends Error {
  constructor(public readonly label: string) {
    super(`Unsupported node label for MVP client: ${label}`);
    this.name = 'UnsupportedLabelError';
  }
}

export class UnsupportedOperationError extends Error {
  constructor(operation: string) {
    super(`Unsupported operation for file-backed MVP life graph client: ${operation}`);
    this.name = 'UnsupportedOperationError';
  }
}

export interface CreateLifeGraphClientOptions extends LifeGraphManagerOptions {
  graphPath?: string;
  reviewClient?: ReviewChatClient;
}

interface ModuleSchemaDocument {
  schemas: ModuleSchema[];
}

interface ReviewChatRequest {
  model: string;
  format: 'json';
  options: {
    temperature: number;
    num_ctx: number;
  };
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

interface ReviewChatResponse {
  message: {
    content: string;
  };
}

interface ReviewChatClient {
  chat(request: ReviewChatRequest): Promise<ReviewChatResponse>;
}

type QueryParams = Record<string, unknown> | undefined;

interface TaskNode extends LifeGraphTask {
  planId: string;
}

interface PlanCreateInput {
  title: string;
  description: string;
  deadline?: string | null;
  tasks?: unknown[];
  id?: string;
  createdAt?: string;
}

const MAX_NOTES = 4000;
const MAX_RESEARCH_RESULTS = 1500;
const MAX_WEATHER_SNAPSHOTS = 500;
const MAX_NEWS_DIGESTS = 1200;
const MAX_MEMORY_ENTRIES = 10_000;
const MAX_MEMORY_CONTENT_CHARS = 6000;
const MAX_MEMORY_RELATED = 24;
const MEMORY_EMBEDDING_DIM = 384;
const MAX_MEMORY_KEY_CHARS = 80;
const MAX_MEMORY_VALUE_CHARS = 300;
const MAX_CALENDAR_EVENTS = 4000;
const MAX_CALENDAR_TITLE_CHARS = 220;
const MAX_CALENDAR_LOCATION_CHARS = 180;
const MAX_NOTE_TITLE_CHARS = 200;
const MAX_NOTE_CONTENT_CHARS = 8000;
const MAX_NOTE_TAGS = 20;
const MAX_NOTE_TAG_CHARS = 40;
const MAX_RESEARCH_QUERY_CHARS = 400;
const MAX_RESEARCH_SUMMARY_CHARS = 8000;
const MAX_RESEARCH_CONTEXT_ITEMS = 8;
const MAX_RESEARCH_CONTEXT_CHARS = 500;
const MAX_WEATHER_LOCATION_CHARS = 120;
const MAX_WEATHER_FORECAST_CHARS = 1000;
const MAX_NEWS_TITLE_CHARS = 220;
const MAX_NEWS_SUMMARY_CHARS = 5000;
const MAX_NEWS_SOURCES = 20;
const MAX_NEWS_SOURCE_CHARS = 240;
const MAX_NOTE_SEARCH_RESULTS = 50;

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return getString(value);
}

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function normalizeStringField(value: unknown, fallback: string, maxLength: number): string {
  const candidate = getString(value) ?? fallback;
  return clampText(candidate, maxLength);
}

function normalizeStringArray(value: unknown, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
    .map((entry) => clampText(entry, maxItemLength));
  if (normalized.length === 0) {
    return [];
  }
  return normalized.slice(0, maxItems);
}

function normalizeIsoTimestamp(value: unknown, fallbackIso: string): string {
  if (typeof value !== 'string') {
    return fallbackIso;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }
  return parsed.toISOString();
}

function getOptionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function parsePositiveIntegerOption(value: unknown, fallback: number, max: number): number {
  const parsed = parsePositiveInteger(value) ?? fallback;
  return Math.min(parsed, max);
}

function parseLimit(params: QueryParams): number | null {
  const limit = getOptionalNumber(params?.limit);
  if (limit === null) {
    return null;
  }

  const normalized = Math.trunc(limit);
  if (normalized <= 0) {
    return null;
  }

  return normalized;
}

function parsePlanId(params: QueryParams): string | null {
  return getString(params?.planId);
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    return null;
  }
  return normalized;
}

function resolveMemorySearchLimit(value: unknown): number {
  const parsed = parsePositiveInteger(value) ?? 5;
  return Math.min(parsed, 100);
}

function normalizeQuery(query: string): string {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new UnsupportedQueryError(query);
  }

  return normalized;
}

function toTaskNode(plan: GoalPlan): TaskNode[] {
  return plan.tasks.map((task) => ({
    ...task,
    planId: plan.id,
  }));
}

function applyLimit<T>(items: T[], limit: number | null): T[] {
  if (limit === null) {
    return items;
  }

  return items.slice(-limit);
}

function toPlanCreateInput(data: Record<string, unknown>): PlanCreateInput {
  const title = getString(data.title);
  const description = getString(data.description);

  if (!title) {
    throw new Error('createNode(plan): "title" is required.');
  }
  if (!description) {
    throw new Error('createNode(plan): "description" is required.');
  }

  const rawTasks = data.tasks;
  const tasks = Array.isArray(rawTasks) ? rawTasks : [];

  const input: PlanCreateInput = {
    title,
    description,
    deadline: getNullableString(data.deadline),
    tasks,
  };

  const id = getString(data.id);
  if (id) {
    input.id = id;
  }

  const createdAt = getString(data.createdAt);
  if (createdAt) {
    input.createdAt = createdAt;
  }

  return input;
}

function normalizeNoteInput(
  note: Omit<LifeGraphNote, 'id' | 'createdAt'> & Partial<Pick<LifeGraphNote, 'id' | 'createdAt'>>,
  nowIso: string,
): LifeGraphNote {
  return {
    id: getString(note.id) ?? randomUUID(),
    title: normalizeStringField(note.title, 'Voice note', MAX_NOTE_TITLE_CHARS),
    content: normalizeStringField(note.content, 'Untitled note', MAX_NOTE_CONTENT_CHARS),
    tags: normalizeStringArray(note.tags, MAX_NOTE_TAGS, MAX_NOTE_TAG_CHARS),
    voiceTriggered: typeof note.voiceTriggered === 'boolean' ? note.voiceTriggered : true,
    createdAt: normalizeIsoTimestamp(note.createdAt, nowIso),
  };
}

function normalizeCalendarEventInput(
  event: Record<string, unknown>,
  nowIso: string,
): {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
} {
  const start = normalizeIsoTimestamp(event.start, nowIso);
  const end = normalizeIsoTimestamp(event.end, start);
  const statusValue = getString(event.status);
  const status =
    statusValue === 'tentative' || statusValue === 'cancelled' || statusValue === 'confirmed'
      ? statusValue
      : 'confirmed';

  const attendees = normalizeStringArray(event.attendees, MAX_NOTE_TAGS, MAX_NOTE_TAG_CHARS);
  const locationValue = getString(event.location);

  return {
    id: getString(event.id) ?? randomUUID(),
    title: normalizeStringField(event.title, 'Untitled event', MAX_CALENDAR_TITLE_CHARS),
    start,
    end,
    ...(attendees.length > 0 ? { attendees } : {}),
    ...(locationValue
      ? {
          location: normalizeStringField(locationValue, locationValue, MAX_CALENDAR_LOCATION_CHARS),
        }
      : {}),
    status,
  };
}

function normalizeResearchInput(
  result:
    | (Omit<LifeGraphResearchResult, 'id' | 'savedAt' | 'threadId'> &
        Partial<Pick<LifeGraphResearchResult, 'id' | 'savedAt' | 'threadId'>>)
    | LifeGraphResearchResult,
  nowIso: string,
): LifeGraphResearchResult {
  const sources = normalizeStringArray(result.sources, MAX_NEWS_SOURCES, MAX_NEWS_SOURCE_CHARS);
  const conversationContext = normalizeStringArray(
    result.conversationContext,
    MAX_RESEARCH_CONTEXT_ITEMS,
    MAX_RESEARCH_CONTEXT_CHARS,
  );
  return {
    id: getString(result.id) ?? randomUUID(),
    threadId: getString(result.threadId) ?? randomUUID(),
    query: normalizeStringField(result.query, 'General research', MAX_RESEARCH_QUERY_CHARS),
    summary: normalizeStringField(
      result.summary,
      'No summary available.',
      MAX_RESEARCH_SUMMARY_CHARS,
    ),
    ...(conversationContext.length > 0 ? { conversationContext } : {}),
    ...(sources.length > 0 ? { sources } : {}),
    savedAt: normalizeIsoTimestamp(result.savedAt, nowIso),
  };
}

function normalizeWeatherInput(
  snapshot:
    | (Omit<LifeGraphWeatherSnapshot, 'id' | 'timestamp'> &
        Partial<Pick<LifeGraphWeatherSnapshot, 'id' | 'timestamp'>>)
    | LifeGraphWeatherSnapshot,
  nowIso: string,
): LifeGraphWeatherSnapshot {
  return {
    id: getString(snapshot.id) ?? randomUUID(),
    location: normalizeStringField(snapshot.location, 'current', MAX_WEATHER_LOCATION_CHARS),
    forecast: normalizeStringField(
      snapshot.forecast,
      'No forecast available.',
      MAX_WEATHER_FORECAST_CHARS,
    ),
    timestamp: normalizeIsoTimestamp(snapshot.timestamp, nowIso),
  };
}

function normalizeNewsInput(
  digest:
    | (Omit<LifeGraphNewsDigest, 'id' | 'read'> & Partial<Pick<LifeGraphNewsDigest, 'id' | 'read'>>)
    | LifeGraphNewsDigest,
): LifeGraphNewsDigest {
  const sources = normalizeStringArray(digest.sources, MAX_NEWS_SOURCES, MAX_NEWS_SOURCE_CHARS);
  return {
    id: getString(digest.id) ?? randomUUID(),
    title: normalizeStringField(digest.title, 'News digest', MAX_NEWS_TITLE_CHARS),
    summary: normalizeStringField(digest.summary, 'No summary available.', MAX_NEWS_SUMMARY_CHARS),
    sources: sources.length > 0 ? sources : ['local-cache'],
    read: typeof digest.read === 'boolean' ? digest.read : false,
  };
}

function normalizeEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }
  const vector: number[] = [];
  for (let index = 0; index < value.length && index < MEMORY_EMBEDDING_DIM; index += 1) {
    const candidate = value[index];
    const numeric = typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
    vector.push(numeric);
  }

  while (vector.length < MEMORY_EMBEDDING_DIM) {
    vector.push(0);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return vector;
  }
  return vector.map((item) => item / magnitude);
}

function toUuidOrUndefined(value: unknown): string | undefined {
  const candidate = getString(value);
  if (!candidate) {
    return undefined;
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(candidate) ? candidate : undefined;
}

function normalizeMemoryInput(
  entry:
    | (Omit<LifeGraphMemoryEntry, 'id' | 'timestamp' | 'embedding'> &
        Partial<Pick<LifeGraphMemoryEntry, 'id' | 'timestamp' | 'embedding'>>)
    | LifeGraphMemoryEntry,
  nowIso: string,
  options: {
    forceLocalEmbedding?: boolean;
  } = {},
): LifeGraphMemoryEntry {
  const type =
    entry.type === 'conversation' ||
    entry.type === 'research' ||
    entry.type === 'note' ||
    entry.type === 'insight' ||
    entry.type === 'preference'
      ? entry.type
      : 'insight';
  const content = normalizeStringField(entry.content, 'Untitled memory', MAX_MEMORY_CONTENT_CHARS);
  const relatedTo = normalizeStringArray(entry.relatedTo, MAX_MEMORY_RELATED, 120);
  const seedEmbedding =
    options.forceLocalEmbedding || !Array.isArray(entry.embedding) || entry.embedding.length === 0
      ? createDeterministicEmbedding(content)
      : normalizeEmbedding(entry.embedding);

  const threadId = toUuidOrUndefined(entry.threadId);
  const summaryOfThreadId = toUuidOrUndefined(entry.summaryOfThreadId);

  return {
    id: getString(entry.id) ?? randomUUID(),
    type,
    content,
    embedding: seedEmbedding,
    timestamp: normalizeIsoTimestamp(entry.timestamp, nowIso),
    relatedTo,
    ...(threadId ? { threadId } : {}),
    ...(entry.role === 'user' || entry.role === 'assistant' || entry.role === 'system'
      ? { role: entry.role }
      : {}),
    ...(getString(entry.key)
      ? { key: normalizeStringField(entry.key, 'preference', MAX_MEMORY_KEY_CHARS) }
      : {}),
    ...(getString(entry.value)
      ? { value: normalizeStringField(entry.value, '', MAX_MEMORY_VALUE_CHARS) }
      : {}),
    ...(summaryOfThreadId ? { summaryOfThreadId } : {}),
  };
}

function parseIsoOrZero(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toArrayOfRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function mergeByIdLastWriteWins<T extends { id: string }>(
  existingItems: T[],
  incomingItems: T[],
  collection: LifeGraphMergeConflict['collection'],
  getTimestamp: (item: T) => number,
  getTimestampIso?: (item: T) => string | undefined,
): {
  items: T[];
  conflicts: LifeGraphMergeConflict[];
} {
  const byId = new Map<string, T>();
  const conflicts: LifeGraphMergeConflict[] = [];
  for (const item of existingItems) {
    const id = item.id.trim();
    if (!id) {
      continue;
    }
    byId.set(id, item);
  }

  for (const incoming of incomingItems) {
    const id = incoming.id.trim();
    if (!id) {
      conflicts.push({
        collection,
        id: 'unknown',
        reason: 'incoming_invalid',
      });
      continue;
    }
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, incoming);
      continue;
    }
    const incomingTs = getTimestamp(incoming);
    const existingTs = getTimestamp(existing);
    if (incomingTs >= existingTs) {
      byId.set(id, incoming);
    } else {
      const existingTimestamp = getTimestampIso?.(existing);
      const incomingTimestamp = getTimestampIso?.(incoming);
      conflicts.push({
        collection,
        id,
        reason: 'incoming_older',
        ...(existingTimestamp ? { existingTimestamp } : {}),
        ...(incomingTimestamp ? { incomingTimestamp } : {}),
      });
    }
  }

  return {
    items: Array.from(byId.values()),
    conflicts,
  };
}

function toTopicQuery(topic: string | undefined): string | null {
  const value = getString(topic);
  return value ? value.toLowerCase() : null;
}

function toNoteQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function noteMatchesQuery(note: LifeGraphNote, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) {
    return true;
  }
  const haystack = [note.title, note.content, ...(note.tags ?? [])].join(' ').toLowerCase();
  return queryTokens.every((token) => haystack.includes(token));
}

function normalizeLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new UnsupportedLabelError(label);
  }

  return normalized;
}

function normalizeReviewPeriod(period: string): LifeGraphReviewPeriod {
  return period === 'daily' ? 'daily' : 'weekly';
}

function extractReviewJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === '}') {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  throw new Error('Review response did not contain valid JSON');
}

function parseInsightsOutput(raw: string): { wins: string[]; nextActions: string[] } {
  const parsed = JSON.parse(extractReviewJson(raw)) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Review JSON must be an object');
  }

  const candidate = parsed as {
    wins?: unknown;
    nextActions?: unknown;
  };

  const wins = Array.isArray(candidate.wins)
    ? candidate.wins.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  const nextActions = Array.isArray(candidate.nextActions)
    ? candidate.nextActions.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];

  if (wins.length === 0 && nextActions.length === 0) {
    throw new Error('Review JSON did not include wins or nextActions');
  }

  return {
    wins: wins.slice(0, 5),
    nextActions: nextActions.slice(0, 5),
  };
}

function deriveHeuristicInsights(
  plans: GoalPlan[],
  period: LifeGraphReviewPeriod,
): Pick<LifeGraphReviewInsights, 'wins' | 'nextActions'> {
  const completedTaskTitles = plans.flatMap((plan) =>
    plan.tasks
      .filter((task) => task.status === 'done')
      .map((task) => `${plan.title}: ${task.title}`),
  );
  const todoTaskTitles = plans.flatMap((plan) =>
    plan.tasks
      .filter((task) => task.status !== 'done')
      .sort((left, right) => right.priority - left.priority)
      .map((task) => `${plan.title}: ${task.title}`),
  );

  const wins =
    completedTaskTitles.slice(0, 3).length > 0
      ? completedTaskTitles.slice(0, 3)
      : [`No completed tasks recorded in the ${period} window yet.`];
  const nextActions =
    todoTaskTitles.slice(0, 3).length > 0
      ? todoTaskTitles.slice(0, 3)
      : ['Capture one next concrete task for your highest-priority goal.'];

  return { wins, nextActions };
}

function createReviewChatClient(host?: string): ReviewChatClient {
  const normalizedHost = host?.trim() || 'http://127.0.0.1:11434';
  const endpoint = `${normalizedHost.replace(/\/+$/, '')}/api/chat`;

  return {
    async chat(request: ReviewChatRequest): Promise<ReviewChatResponse> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          format: request.format,
          options: request.options,
          stream: false,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama request failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as { message?: { content?: unknown } };
      const content = data.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Ollama response missing message.content');
      }

      return {
        message: {
          content,
        },
      };
    },
  };
}

async function readModuleSchemaDocument(sidecarPath: string): Promise<ModuleSchemaDocument> {
  try {
    const content = await readFile(sidecarPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'schemas' in parsed &&
      Array.isArray((parsed as { schemas?: unknown }).schemas)
    ) {
      return { schemas: (parsed as { schemas: ModuleSchema[] }).schemas };
    }

    return { schemas: [] };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { schemas: [] };
    }

    throw error;
  }
}

async function writeModuleSchemaDocument(
  sidecarPath: string,
  document: ModuleSchemaDocument,
): Promise<void> {
  await mkdir(dirname(sidecarPath), { recursive: true });
  const tempPath = `${sidecarPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(tempPath, sidecarPath);
}

export function createLifeGraphClient(options: CreateLifeGraphClientOptions = {}): LifeGraphClient {
  const manager = new LifeGraphManager(options);
  const resolvedGraphPath = resolveLifeGraphPath(options.graphPath, options);
  const moduleSchemaPath = join(dirname(resolvedGraphPath), 'module-schemas.json');

  return {
    async loadGraph() {
      return manager.load(resolvedGraphPath);
    },

    async saveGraph(graph) {
      await manager.save(graph, resolvedGraphPath);
    },

    async appendNote(note) {
      const nowIso = new Date().toISOString();
      const graph = await manager.load(resolvedGraphPath);
      const normalized = normalizeNoteInput(note, nowIso);
      const notes = [...(graph.notes ?? []), normalized].slice(-MAX_NOTES);
      await manager.save(
        {
          ...graph,
          updatedAt: nowIso,
          notes,
          calendarEvents: graph.calendarEvents ?? [],
          researchResults: graph.researchResults ?? [],
          weatherSnapshots: graph.weatherSnapshots ?? [],
          newsDigests: graph.newsDigests ?? [],
          memory: graph.memory ?? [],
        },
        resolvedGraphPath,
      );
      return normalized;
    },

    async appendResearchResult(result) {
      const nowIso = new Date().toISOString();
      const graph = await manager.load(resolvedGraphPath);
      const normalized = normalizeResearchInput(result, nowIso);
      const researchResults = [...(graph.researchResults ?? []), normalized].slice(
        -MAX_RESEARCH_RESULTS,
      );
      await manager.save(
        {
          ...graph,
          updatedAt: nowIso,
          researchResults,
          calendarEvents: graph.calendarEvents ?? [],
          notes: graph.notes ?? [],
          weatherSnapshots: graph.weatherSnapshots ?? [],
          newsDigests: graph.newsDigests ?? [],
          memory: graph.memory ?? [],
        },
        resolvedGraphPath,
      );
      return normalized;
    },

    async saveResearchResult(result) {
      return this.appendResearchResult(result);
    },

    async getResearchThread(threadId) {
      const normalizedThreadId = getString(threadId);
      if (!normalizedThreadId) {
        return null;
      }
      const graph = await manager.load(resolvedGraphPath);
      const matches = (graph.researchResults ?? [])
        .filter((entry) => entry.threadId === normalizedThreadId)
        .sort((left, right) => parseIsoOrZero(right.savedAt) - parseIsoOrZero(left.savedAt));
      return matches[0] ?? null;
    },

    async appendWeatherSnapshot(snapshot) {
      const nowIso = new Date().toISOString();
      const graph = await manager.load(resolvedGraphPath);
      const normalized = normalizeWeatherInput(snapshot, nowIso);
      const weatherSnapshots = [...(graph.weatherSnapshots ?? []), normalized].slice(
        -MAX_WEATHER_SNAPSHOTS,
      );
      await manager.save(
        {
          ...graph,
          updatedAt: nowIso,
          weatherSnapshots,
          calendarEvents: graph.calendarEvents ?? [],
          notes: graph.notes ?? [],
          researchResults: graph.researchResults ?? [],
          newsDigests: graph.newsDigests ?? [],
          memory: graph.memory ?? [],
        },
        resolvedGraphPath,
      );
      return normalized;
    },

    async getLatestWeatherSnapshot(location) {
      const graph = await manager.load(resolvedGraphPath);
      const locationQuery = toTopicQuery(location);
      const matches = (graph.weatherSnapshots ?? [])
        .filter((entry) =>
          locationQuery ? entry.location.toLowerCase().includes(locationQuery) : true,
        )
        .sort((left, right) => parseIsoOrZero(right.timestamp) - parseIsoOrZero(left.timestamp));
      return matches[0] ?? null;
    },

    async appendNewsDigest(digest) {
      const nowIso = new Date().toISOString();
      const graph = await manager.load(resolvedGraphPath);
      const normalized = normalizeNewsInput(digest);
      const newsDigests = [...(graph.newsDigests ?? []), normalized].slice(-MAX_NEWS_DIGESTS);
      await manager.save(
        {
          ...graph,
          updatedAt: nowIso,
          newsDigests,
          calendarEvents: graph.calendarEvents ?? [],
          notes: graph.notes ?? [],
          researchResults: graph.researchResults ?? [],
          weatherSnapshots: graph.weatherSnapshots ?? [],
          memory: graph.memory ?? [],
        },
        resolvedGraphPath,
      );
      return normalized;
    },

    async getLatestNewsDigest(topic) {
      const graph = await manager.load(resolvedGraphPath);
      const topicQuery = toTopicQuery(topic);
      const matches = [...(graph.newsDigests ?? [])]
        .reverse()
        .filter((entry) =>
          topicQuery ? `${entry.title} ${entry.summary}`.toLowerCase().includes(topicQuery) : true,
        );
      return matches[0] ?? null;
    },

    async searchNotes(query, options: LifeGraphNoteSearchOptions = {}) {
      const normalizedQuery = getString(query);
      if (!normalizedQuery) {
        return [];
      }
      const graph = await manager.load(resolvedGraphPath);
      const tokens = toNoteQueryTokens(normalizedQuery);
      const sinceDays = parsePositiveInteger(options.sinceDays) ?? 0;
      const limit =
        Math.min(parsePositiveInteger(options.limit) ?? 10, MAX_NOTE_SEARCH_RESULTS) ||
        MAX_NOTE_SEARCH_RESULTS;
      const thresholdMs =
        sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;

      return (graph.notes ?? [])
        .filter((note) => parseIsoOrZero(note.createdAt) >= thresholdMs)
        .filter((note) => noteMatchesQuery(note, tokens))
        .sort((left, right) => parseIsoOrZero(right.createdAt) - parseIsoOrZero(left.createdAt))
        .slice(0, limit);
    },

    async appendMemoryEntry(entry) {
      const nowIso = new Date().toISOString();
      const graph = await manager.load(resolvedGraphPath);
      const normalized = normalizeMemoryInput(entry, nowIso);
      const memory = [...(graph.memory ?? []), normalized].slice(-MAX_MEMORY_ENTRIES);
      await manager.save(
        {
          ...graph,
          updatedAt: nowIso,
          memory,
          calendarEvents: graph.calendarEvents ?? [],
          notes: graph.notes ?? [],
          researchResults: graph.researchResults ?? [],
          weatherSnapshots: graph.weatherSnapshots ?? [],
          newsDigests: graph.newsDigests ?? [],
        },
        resolvedGraphPath,
      );
      return normalized;
    },

    async searchMemory(query, options: LifeGraphMemorySearchOptions = {}) {
      const normalizedQuery = getString(query);
      if (!normalizedQuery) {
        return [];
      }

      const graph = await manager.load(resolvedGraphPath);
      const queryEmbedding = createDeterministicEmbedding(normalizedQuery);
      const limit = resolveMemorySearchLimit(options.limit);
      const minScore = typeof options.minScore === 'number' ? options.minScore : -1;
      const type = options.type;
      const filtered = (graph.memory ?? []).filter((entry) => (type ? entry.type === type : true));

      const scored: LifeGraphMemorySearchResult[] = filtered
        .map((entry) => ({
          ...entry,
          score: cosineSimilarity(queryEmbedding, normalizeEmbedding(entry.embedding)),
        }))
        .filter((entry) => entry.score >= minScore)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);

      return scored;
    },

    async getMemoryThread(threadId, options = {}) {
      const normalizedThreadId = toUuidOrUndefined(threadId);
      if (!normalizedThreadId) {
        return [];
      }

      const graph = await manager.load(resolvedGraphPath);
      const limit = parsePositiveIntegerOption(options.limit, 100, 2000);
      const sinceDays = parsePositiveInteger(options.sinceDays) ?? 0;
      const thresholdMs =
        sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;

      return (graph.memory ?? [])
        .filter((entry) => entry.threadId === normalizedThreadId)
        .filter((entry) => parseIsoOrZero(entry.timestamp) >= thresholdMs)
        .sort((left, right) => parseIsoOrZero(left.timestamp) - parseIsoOrZero(right.timestamp))
        .slice(-limit);
    },

    async mergeDelta(deltaPayload): Promise<LifeGraphMergeDeltaResult> {
      const nowIso = new Date().toISOString();
      const graph = await manager.load(resolvedGraphPath);
      const payload = isRecord(deltaPayload) ? deltaPayload : {};
      const conflicts: LifeGraphMergeConflict[] = [];

      let plans = [...graph.plans];
      let calendarEvents = [...(graph.calendarEvents ?? [])];
      let notes = [...(graph.notes ?? [])];
      let researchResults = [...(graph.researchResults ?? [])];
      let weatherSnapshots = [...(graph.weatherSnapshots ?? [])];
      let newsDigests = [...(graph.newsDigests ?? [])];
      let memory = [...(graph.memory ?? [])];

      const incomingPlanRecords = toArrayOfRecords(payload.goals ?? payload.plans);
      const incomingPlans: GoalPlan[] = [];
      for (const entry of incomingPlanRecords) {
        try {
          incomingPlans.push(parseGoalPlan(entry));
        } catch {
          conflicts.push({
            collection: 'plans',
            id: getString(entry.id) ?? 'unknown',
            reason: 'incoming_invalid',
          });
        }
      }
      const mergedPlans = mergeByIdLastWriteWins(
        plans,
        incomingPlans,
        'plans',
        (item) => parseIsoOrZero(item.createdAt),
        (item) => item.createdAt,
      );
      plans = mergedPlans.items;
      conflicts.push(...mergedPlans.conflicts);

      const incomingCalendarEvents = toArrayOfRecords(payload.calendarEvents).map((entry) =>
        normalizeCalendarEventInput(entry, nowIso),
      );
      const mergedCalendarEvents = mergeByIdLastWriteWins(
        calendarEvents,
        incomingCalendarEvents,
        'calendarEvents',
        (item) => Math.max(parseIsoOrZero(item.start), parseIsoOrZero(item.end)),
        (item) => item.end,
      );
      calendarEvents = mergedCalendarEvents.items.slice(-MAX_CALENDAR_EVENTS);
      conflicts.push(...mergedCalendarEvents.conflicts);

      const incomingNotes = toArrayOfRecords(payload.notes).map((entry) =>
        normalizeNoteInput(entry as unknown as LifeGraphNote, nowIso),
      );
      const mergedNotes = mergeByIdLastWriteWins(
        notes,
        incomingNotes,
        'notes',
        (item) => parseIsoOrZero(item.createdAt),
        (item) => item.createdAt,
      );
      notes = mergedNotes.items.slice(-MAX_NOTES);
      conflicts.push(...mergedNotes.conflicts);

      const incomingResearch = toArrayOfRecords(payload.researchResults).map((entry) =>
        normalizeResearchInput(entry as unknown as LifeGraphResearchResult, nowIso),
      );
      const mergedResearch = mergeByIdLastWriteWins(
        researchResults,
        incomingResearch,
        'researchResults',
        (item) => parseIsoOrZero(item.savedAt),
        (item) => item.savedAt,
      );
      researchResults = mergedResearch.items.slice(-MAX_RESEARCH_RESULTS);
      conflicts.push(...mergedResearch.conflicts);

      const incomingWeather = toArrayOfRecords(payload.weatherSnapshots).map((entry) =>
        normalizeWeatherInput(entry as unknown as LifeGraphWeatherSnapshot, nowIso),
      );
      const mergedWeather = mergeByIdLastWriteWins(
        weatherSnapshots,
        incomingWeather,
        'weatherSnapshots',
        (item) => parseIsoOrZero(item.timestamp),
        (item) => item.timestamp,
      );
      weatherSnapshots = mergedWeather.items.slice(-MAX_WEATHER_SNAPSHOTS);
      conflicts.push(...mergedWeather.conflicts);

      const incomingNews = toArrayOfRecords(payload.newsDigests).map((entry) =>
        normalizeNewsInput(entry as unknown as LifeGraphNewsDigest),
      );
      const mergedNews = mergeByIdLastWriteWins(newsDigests, incomingNews, 'newsDigests', () => 0);
      newsDigests = mergedNews.items.slice(-MAX_NEWS_DIGESTS);
      conflicts.push(...mergedNews.conflicts);

      const incomingMemory = toArrayOfRecords(payload.memory).map((entry) =>
        normalizeMemoryInput(entry as unknown as LifeGraphMemoryEntry, nowIso, {
          forceLocalEmbedding: true,
        }),
      );
      const mergedMemory = mergeByIdLastWriteWins(
        memory,
        incomingMemory,
        'memory',
        (item) => parseIsoOrZero(item.timestamp),
        (item) => item.timestamp,
      );
      memory = mergedMemory.items.slice(-MAX_MEMORY_ENTRIES);
      conflicts.push(...mergedMemory.conflicts);

      const eventType = getString(payload.type);
      const eventData = isRecord(payload.data) ? payload.data : null;
      if (eventType && eventData) {
        if (
          eventType === 'lifeos.calendar.event.added' ||
          eventType === 'lifeos.voice.intent.calendar.add'
        ) {
          const singleCalendarMerge = mergeByIdLastWriteWins(
            calendarEvents,
            [normalizeCalendarEventInput(eventData, nowIso)],
            'calendarEvents',
            (item) => Math.max(parseIsoOrZero(item.start), parseIsoOrZero(item.end)),
            (item) => item.end,
          );
          calendarEvents = singleCalendarMerge.items.slice(-MAX_CALENDAR_EVENTS);
          conflicts.push(...singleCalendarMerge.conflicts);
        } else if (
          eventType === 'lifeos.note.added' ||
          eventType === 'lifeos.voice.intent.note.add'
        ) {
          const singleNoteMerge = mergeByIdLastWriteWins(
            notes,
            [normalizeNoteInput(eventData as unknown as LifeGraphNote, nowIso)],
            'notes',
            (item) => parseIsoOrZero(item.createdAt),
            (item) => item.createdAt,
          );
          notes = singleNoteMerge.items.slice(-MAX_NOTES);
          conflicts.push(...singleNoteMerge.conflicts);
        } else if (
          eventType === 'lifeos.research.completed' ||
          eventType === 'lifeos.voice.intent.research'
        ) {
          const singleResearchMerge = mergeByIdLastWriteWins(
            researchResults,
            [normalizeResearchInput(eventData as unknown as LifeGraphResearchResult, nowIso)],
            'researchResults',
            (item) => parseIsoOrZero(item.savedAt),
            (item) => item.savedAt,
          );
          researchResults = singleResearchMerge.items.slice(-MAX_RESEARCH_RESULTS);
          conflicts.push(...singleResearchMerge.conflicts);
        } else if (
          eventType === 'lifeos.weather.snapshot.captured' ||
          eventType === 'lifeos.voice.intent.weather'
        ) {
          const singleWeatherMerge = mergeByIdLastWriteWins(
            weatherSnapshots,
            [normalizeWeatherInput(eventData as unknown as LifeGraphWeatherSnapshot, nowIso)],
            'weatherSnapshots',
            (item) => parseIsoOrZero(item.timestamp),
            (item) => item.timestamp,
          );
          weatherSnapshots = singleWeatherMerge.items.slice(-MAX_WEATHER_SNAPSHOTS);
          conflicts.push(...singleWeatherMerge.conflicts);
        } else if (
          eventType === 'lifeos.news.digest.ready' ||
          eventType === 'lifeos.voice.intent.news'
        ) {
          const singleNewsMerge = mergeByIdLastWriteWins(
            newsDigests,
            [normalizeNewsInput(eventData as unknown as LifeGraphNewsDigest)],
            'newsDigests',
            () => 0,
          );
          newsDigests = singleNewsMerge.items.slice(-MAX_NEWS_DIGESTS);
          conflicts.push(...singleNewsMerge.conflicts);
        }
      }

      await manager.save(
        {
          ...graph,
          updatedAt: nowIso,
          plans,
          calendarEvents,
          notes,
          researchResults,
          weatherSnapshots,
          newsDigests,
          memory,
        },
        resolvedGraphPath,
      );

      return {
        merged: true,
        conflicts,
      };
    },

    async applyUpdates(updates: LifeGraphUpdate[]) {
      if (!Array.isArray(updates) || updates.length === 0) {
        return;
      }

      for (const update of updates) {
        if (!update || typeof update !== 'object') {
          continue;
        }
        if (update.op === 'append_memory') {
          await this.appendMemoryEntry(update.entry);
        }
      }
    },

    async query<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T[]> {
      const normalizedQuery = normalizeQuery(query);
      const graph = await manager.load(resolvedGraphPath);

      if (normalizedQuery === 'plans') {
        const limit = parseLimit(params);
        return applyLimit([...graph.plans], limit) as T[];
      }

      if (normalizedQuery === 'tasks') {
        const planId = parsePlanId(params);
        const plans = planId ? graph.plans.filter((plan) => plan.id === planId) : graph.plans;
        const tasks = plans.flatMap((plan) => toTaskNode(plan));
        const limit = parseLimit(params);
        return applyLimit(tasks, limit) as T[];
      }

      throw new UnsupportedQueryError(query);
    },

    async getNode<T = unknown>(id: string): Promise<T | null> {
      const nodeId = id.trim();
      if (!nodeId) {
        return null;
      }

      const graph = await manager.load(resolvedGraphPath);
      const plan = graph.plans.find((candidate) => candidate.id === nodeId);
      if (plan) {
        return plan as T;
      }

      for (const candidatePlan of graph.plans) {
        const task = candidatePlan.tasks.find((candidateTask) => candidateTask.id === nodeId);
        if (task) {
          return {
            ...task,
            planId: candidatePlan.id,
          } as T;
        }
      }

      return null;
    },

    async createNode<T extends Record<string, unknown>>(label: string, data: T): Promise<string> {
      const normalizedLabel = normalizeLabel(label);
      if (normalizedLabel !== 'plan') {
        throw new UnsupportedLabelError(label);
      }

      const input = toPlanCreateInput(data);
      const appendInput: {
        input: string;
        plan: {
          title: string;
          description: string;
          deadline: string | null;
          tasks: unknown[];
        };
        id?: string;
        createdAt?: string;
      } = {
        input: input.title,
        plan: {
          title: input.title,
          description: input.description,
          deadline: input.deadline ?? null,
          tasks: input.tasks ?? [],
        },
      };

      if (input.id) {
        appendInput.id = input.id;
      }
      if (input.createdAt) {
        appendInput.createdAt = input.createdAt;
      }

      const { record } = await manager.appendPlan(appendInput, resolvedGraphPath);

      return record.id;
    },

    async createRelationship(): Promise<void> {
      throw new UnsupportedOperationError('createRelationship');
    },

    async registerModuleSchema(schema: ModuleSchema): Promise<void> {
      const document = await readModuleSchemaDocument(moduleSchemaPath);
      const deduped = document.schemas.filter(
        (existing) =>
          !(existing.meta.id === schema.meta.id && existing.meta.version === schema.meta.version),
      );
      deduped.push(schema);
      await writeModuleSchemaDocument(moduleSchemaPath, { schemas: deduped });
    },

    async getSummary(): Promise<LifeGraphSummary> {
      return getGraphSummary(resolvedGraphPath);
    },

    async generateReview(
      period: LifeGraphReviewPeriod = 'weekly',
    ): Promise<LifeGraphReviewInsights> {
      const normalizedPeriod = normalizeReviewPeriod(period);
      const graph = await manager.load(resolvedGraphPath);
      const generatedAt = new Date().toISOString();
      const model = options.env?.LIFEOS_GOAL_MODEL?.trim() || 'llama3.1:8b';
      const host = options.env?.OLLAMA_HOST;
      const heuristic = deriveHeuristicInsights(graph.plans, normalizedPeriod);

      const reviewPrompt = JSON.stringify(
        {
          period: normalizedPeriod,
          updatedAt: graph.updatedAt,
          plans: graph.plans.map((plan) => ({
            title: plan.title,
            deadline: plan.deadline,
            tasks: plan.tasks.map((task) => ({
              title: task.title,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate ?? null,
            })),
          })),
        },
        null,
        2,
      );

      try {
        const reviewClient = options.reviewClient ?? createReviewChatClient(host);
        const response = await reviewClient.chat({
          model,
          format: 'json',
          options: {
            temperature: 0.2,
            num_ctx: 8192,
          },
          messages: [
            {
              role: 'system',
              content:
                'You are a practical LifeOS review assistant. Return only JSON with {"wins": string[], "nextActions": string[]}. Keep each item concise and actionable.',
            },
            {
              role: 'user',
              content: `Generate a ${normalizedPeriod} review from this life graph snapshot:\n\n${reviewPrompt}`,
            },
          ],
        });

        const parsed = parseInsightsOutput(response.message.content);
        return {
          period: normalizedPeriod,
          wins: parsed.wins,
          nextActions: parsed.nextActions,
          generatedAt,
          source: 'llm',
        };
      } catch {
        return {
          period: normalizedPeriod,
          wins: heuristic.wins,
          nextActions: heuristic.nextActions,
          generatedAt,
          source: 'heuristic',
        };
      }
    },
  };
}
