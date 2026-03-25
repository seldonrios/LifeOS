import type { LifeGraphClient } from '@lifeos/life-graph';

const METRIC_MEMORY_KEY_PREFIX = 'health.metric.';
const STREAK_MEMORY_KEY_PREFIX = 'health.streak.';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface MetricEntry {
  id: string;
  metric: string;
  value: number;
  unit: string;
  note?: string;
  loggedAt: string;
}

export interface DailyStreak {
  id: string;
  metric: string;
  currentStreak: number;
  longestStreak: number;
  lastLoggedDate: string;
}

export interface LogMetricInput {
  metric: string;
  value: number;
  unit: string;
  note?: string;
  loggedAt?: string;
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeMetric(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeUnit(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '_');
}

function toDateOnly(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

function dayDiff(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00.000Z`).getTime();
  const b = new Date(`${dateB}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.trunc((a - b) / ONE_DAY_MS);
}

function parseMetricEntryFromMemoryEntry(entry: {
  id: string;
  key?: string;
  content: string;
}): MetricEntry | null {
  if (!entry.key?.startsWith(METRIC_MEMORY_KEY_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(entry.content) as Record<string, unknown>;
    if (
      typeof parsed.metric !== 'string' ||
      typeof parsed.value !== 'number' ||
      typeof parsed.unit !== 'string' ||
      typeof parsed.loggedAt !== 'string'
    ) {
      return null;
    }
    return {
      id: entry.id,
      metric: parsed.metric,
      value: parsed.value,
      unit: parsed.unit,
      note: typeof parsed.note === 'string' ? parsed.note : undefined,
      loggedAt: parsed.loggedAt,
    };
  } catch {
    return null;
  }
}

function parseStreakFromMemoryEntry(entry: {
  id: string;
  key?: string;
  content: string;
}): DailyStreak | null {
  if (!entry.key?.startsWith(STREAK_MEMORY_KEY_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(entry.content) as Record<string, unknown>;
    if (
      typeof parsed.metric !== 'string' ||
      typeof parsed.currentStreak !== 'number' ||
      typeof parsed.longestStreak !== 'number' ||
      typeof parsed.lastLoggedDate !== 'string'
    ) {
      return null;
    }
    return {
      id: entry.id,
      metric: parsed.metric,
      currentStreak: parsed.currentStreak,
      longestStreak: parsed.longestStreak,
      lastLoggedDate: parsed.lastLoggedDate,
    };
  } catch {
    return null;
  }
}

async function readMetricEntriesFromMemory(client: LifeGraphClient): Promise<MetricEntry[]> {
  const graph = await client.loadGraph();
  const memory = Array.isArray(graph.memory) ? graph.memory : [];
  return memory
    .map((entry) =>
      parseMetricEntryFromMemoryEntry({
        id: entry.id,
        key: entry.key,
        content: entry.content,
      }),
    )
    .filter((entry): entry is MetricEntry => entry !== null);
}

async function readLatestStreakFromMemory(
  client: LifeGraphClient,
  metric: string,
): Promise<DailyStreak | null> {
  const graph = await client.loadGraph();
  const memory = Array.isArray(graph.memory) ? graph.memory : [];
  for (let index = memory.length - 1; index >= 0; index -= 1) {
    const entry = memory[index];
    if (!entry) {
      continue;
    }
    const parsed = parseStreakFromMemoryEntry({
      id: entry.id,
      key: entry.key,
      content: entry.content,
    });
    if (parsed?.metric === metric) {
      return parsed;
    }
  }
  return null;
}

async function saveMetricEntryFallback(
  client: LifeGraphClient,
  entry: Omit<MetricEntry, 'id'>,
): Promise<MetricEntry> {
  const saved = await client.appendMemoryEntry({
    type: 'insight',
    role: 'system',
    key: `${METRIC_MEMORY_KEY_PREFIX}${entry.metric}`,
    value: String(entry.value),
    content: JSON.stringify(entry),
    relatedTo: ['health-tracker', entry.metric],
  });
  return {
    ...entry,
    id: saved.id,
  };
}

async function saveStreakFallback(client: LifeGraphClient, streak: DailyStreak): Promise<void> {
  await client.appendMemoryEntry({
    type: 'insight',
    role: 'system',
    key: `${STREAK_MEMORY_KEY_PREFIX}${streak.metric}`,
    value: String(streak.currentStreak),
    content: JSON.stringify(streak),
    relatedTo: ['health-tracker', streak.metric],
  });
}

export function validateMetricEntryInput(input: LogMetricInput): LogMetricInput {
  const metric = normalizeMetric(input.metric ?? '');
  const unit = normalizeUnit(input.unit ?? '');
  if (!metric) {
    throw new Error('metric must be a non-empty string');
  }
  if (!unit) {
    throw new Error('unit must be a non-empty string');
  }
  if (!Number.isFinite(input.value)) {
    throw new Error('value must be a finite number');
  }

  return {
    ...input,
    metric,
    unit,
    note: input.note?.trim() || undefined,
    loggedAt: input.loggedAt,
  };
}

export async function getStreak(
  client: LifeGraphClient,
  metricInput: string,
): Promise<DailyStreak | null> {
  const metric = normalizeMetric(metricInput);
  try {
    const results = await client.query<DailyStreak>('health.DailyStreak', {
      metric,
      limit: 1,
    });
    return results[0] ?? null;
  } catch {
    return readLatestStreakFromMemory(client, metric);
  }
}

export async function logMetric(
  client: LifeGraphClient,
  input: LogMetricInput,
): Promise<{ entry: MetricEntry; streak: DailyStreak }> {
  const normalized = validateMetricEntryInput(input);
  const loggedAt = normalized.loggedAt ?? new Date().toISOString();
  const dateOnly = toDateOnly(loggedAt);

  let entry: MetricEntry;
  try {
    const createdId = await client.createNode('health.MetricEntry', {
      metric: normalized.metric,
      value: normalized.value,
      unit: normalized.unit,
      note: normalized.note,
      loggedAt,
    });
    entry = {
      id: createdId,
      metric: normalized.metric,
      value: normalized.value,
      unit: normalized.unit,
      note: normalized.note,
      loggedAt,
    };
  } catch {
    entry = await saveMetricEntryFallback(client, {
      metric: normalized.metric,
      value: normalized.value,
      unit: normalized.unit,
      note: normalized.note,
      loggedAt,
    });
  }

  const existing = await getStreak(client, normalized.metric);
  let currentStreak = 1;
  let longestStreak = 1;

  if (existing) {
    const diff = dayDiff(dateOnly, existing.lastLoggedDate);
    if (diff === 0) {
      currentStreak = existing.currentStreak;
      longestStreak = Math.max(existing.longestStreak, currentStreak);
    } else if (diff === 1) {
      currentStreak = existing.currentStreak + 1;
      longestStreak = Math.max(existing.longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      longestStreak = Math.max(existing.longestStreak, 1);
    }
  }

  const streak: DailyStreak = {
    id: existing?.id ?? `health_streak_${normalized.metric}`,
    metric: normalized.metric,
    currentStreak,
    longestStreak,
    lastLoggedDate: dateOnly,
  };

  try {
    if (existing?.id) {
      await client.createNode('health.DailyStreak', streak);
    } else {
      await client.createNode('health.DailyStreak', streak);
    }
  } catch {
    await saveStreakFallback(client, streak);
  }

  return {
    entry,
    streak,
  };
}

export async function queryMetrics(
  client: LifeGraphClient,
  metricInput?: string,
  sinceDays?: number,
): Promise<MetricEntry[]> {
  const normalizedMetric = metricInput ? normalizeMetric(metricInput) : undefined;
  const sinceThreshold =
    typeof sinceDays === 'number' && Number.isFinite(sinceDays) && sinceDays > 0
      ? Date.now() - sinceDays * ONE_DAY_MS
      : null;

  let entries: MetricEntry[] = [];
  try {
    entries = await client.query<MetricEntry>('health.MetricEntry', {
      metric: normalizedMetric,
      sinceDays,
    });
  } catch {
    entries = await readMetricEntriesFromMemory(client);
  }

  return entries
    .filter((entry) =>
      normalizedMetric ? normalizeMetric(entry.metric) === normalizedMetric : true,
    )
    .filter((entry) => {
      if (sinceThreshold === null) {
        return true;
      }
      const ts = new Date(entry.loggedAt).getTime();
      return Number.isFinite(ts) && ts >= sinceThreshold;
    })
    .sort((left, right) => right.loggedAt.localeCompare(left.loggedAt))
    .slice(0, 20);
}

export async function hasMetricLoggedToday(
  client: LifeGraphClient,
  metric: string,
): Promise<boolean> {
  const entries = await queryMetrics(client, metric, 1);
  const today = new Date().toISOString().slice(0, 10);
  return entries.some((entry) => entry.loggedAt.startsWith(today));
}

export function toStoreError(error: unknown): string {
  return normalizeErrorMessage(error);
}
