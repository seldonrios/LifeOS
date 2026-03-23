import {
  createLifeGraphClient,
  MemoryManager,
  type LifeGraphClient,
  type LifeGraphMemoryEntry,
} from '@lifeos/life-graph';

const MAX_PREFERENCE_KEY_CHARS = 80;
const MAX_PREFERENCE_VALUE_CHARS = 300;
const DEFAULT_COMMUNICATION_STYLE = 'concise and direct';
const DEFAULT_PRIORITIES = ['health', 'deep work', 'family'];
const DEFAULT_QUIRKS = ['hates long briefings', 'loves research rabbit holes'];

const PROFILE_KEY_ALIASES: Record<string, string> = {
  communication_style: 'communication_style',
  communicationstyle: 'communication_style',
  style: 'communication_style',
  response_style: 'communication_style',
  briefing_style: 'communication_style',
  priorities: 'priorities',
  priority: 'priorities',
  quirks: 'quirks',
  quirk: 'quirks',
};

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePreferenceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .slice(0, MAX_PREFERENCE_KEY_CHARS);
}

function normalizePreferenceValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().slice(0, MAX_PREFERENCE_VALUE_CHARS);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, MAX_PREFERENCE_VALUE_CHARS);
  }
  try {
    return JSON.stringify(value).slice(0, MAX_PREFERENCE_VALUE_CHARS);
  } catch {
    return String(value).slice(0, MAX_PREFERENCE_VALUE_CHARS);
  }
}

function parseListPreference(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }
  const items = value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : fallback;
}

function parsePreferenceContent(content: string): { key: string; value: string } | null {
  const separator = content.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const key = normalizePreferenceKey(content.slice(0, separator));
  const value = content
    .slice(separator + 1)
    .trim()
    .slice(0, MAX_PREFERENCE_VALUE_CHARS);
  if (!key || !value) {
    return null;
  }
  return { key, value };
}

function canonicalProfileKey(key: string): string {
  return PROFILE_KEY_ALIASES[key] ?? key;
}

function parseTimestampMs(value: string | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export interface PersonalityProfile {
  communicationStyle: string;
  priorities: string[];
  quirks: string[];
  preferences: Record<string, string>;
}

export interface PersonalityOptions {
  client?: LifeGraphClient;
  createLifeGraphClient?: typeof createLifeGraphClient;
  graphPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  memory?: MemoryManager;
}

export class Personality {
  private readonly client: LifeGraphClient;
  private readonly memory: MemoryManager;

  constructor(options: PersonalityOptions = {}) {
    const createClient = options.createLifeGraphClient ?? createLifeGraphClient;
    const clientOptions: Parameters<typeof createLifeGraphClient>[0] = {};
    if (options.env) {
      clientOptions.env = options.env;
    }
    if (options.graphPath) {
      clientOptions.graphPath = options.graphPath;
    }
    this.client = options.client ?? createClient(clientOptions);
    this.memory =
      options.memory ??
      new MemoryManager({
        client: this.client,
        ...(options.now ? { now: options.now } : {}),
      });
  }

  async loadProfile(): Promise<PersonalityProfile> {
    const entries = await this.loadPreferenceEntries();
    const preferences: Record<string, string> = {};
    const orderedEntries = [...entries].sort(
      (left, right) => parseTimestampMs(left.timestamp) - parseTimestampMs(right.timestamp),
    );

    for (const entry of orderedEntries) {
      const explicitKey = getString(entry.key);
      const explicitValue = getString(entry.value);
      if (explicitKey && explicitValue) {
        preferences[canonicalProfileKey(normalizePreferenceKey(explicitKey))] = explicitValue;
        continue;
      }

      const parsed = parsePreferenceContent(entry.content);
      if (!parsed) {
        continue;
      }
      preferences[canonicalProfileKey(parsed.key)] = parsed.value;
    }

    const communicationStyle =
      preferences.communication_style ??
      preferences.communicationstyle ??
      DEFAULT_COMMUNICATION_STYLE;
    const priorities = parseListPreference(preferences.priorities, DEFAULT_PRIORITIES);
    const quirks = parseListPreference(preferences.quirks, DEFAULT_QUIRKS);

    return {
      communicationStyle,
      priorities,
      quirks,
      preferences,
    };
  }

  private async loadPreferenceEntries(): Promise<LifeGraphMemoryEntry[]> {
    const maybeLoadGraph = (this.client as Partial<LifeGraphClient>).loadGraph;
    if (typeof maybeLoadGraph === 'function') {
      try {
        const graph = await maybeLoadGraph.call(this.client);
        const fromGraph = (graph.memory ?? []).filter((entry) => entry.type === 'preference');
        if (fromGraph.length > 0) {
          return fromGraph;
        }
      } catch {
        // Fall back to semantic search path.
      }
    }

    const searched = await this.client.searchMemory('user preferences personality style', {
      type: 'preference',
      limit: 256,
      minScore: -1,
    });
    return searched.map((entry) => ({
      id: entry.id,
      type: entry.type,
      content: entry.content,
      embedding: entry.embedding,
      timestamp: entry.timestamp,
      relatedTo: entry.relatedTo,
      ...(entry.threadId ? { threadId: entry.threadId } : {}),
      ...(entry.role ? { role: entry.role } : {}),
      ...(entry.key ? { key: entry.key } : {}),
      ...(entry.value ? { value: entry.value } : {}),
      ...(entry.summaryOfThreadId ? { summaryOfThreadId: entry.summaryOfThreadId } : {}),
    }));
  }

  async updatePreference(key: string, value: unknown): Promise<LifeGraphMemoryEntry | null> {
    const normalizedKey = normalizePreferenceKey(key);
    const normalizedValue = normalizePreferenceValue(value);
    if (!normalizedKey || !normalizedValue) {
      return null;
    }

    return this.memory.remember({
      type: 'preference',
      role: 'system',
      content: `${normalizedKey}: ${normalizedValue}`,
      key: normalizedKey,
      value: normalizedValue,
      relatedTo: ['personality'],
    });
  }
}

export const personality = new Personality();
