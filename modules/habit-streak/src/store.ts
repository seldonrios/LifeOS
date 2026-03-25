import type { LifeGraphClient } from '@lifeos/life-graph';

const HABIT_MEMORY_KEY_PREFIX = 'habit.habit.';
const ENTRY_MEMORY_KEY_PREFIX = 'habit.entry.';
const STREAK_MEMORY_KEY_PREFIX = 'habit.streak.';
const DEFAULT_FREQUENCY = 'daily';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const MILESTONE_THRESHOLDS = [3, 7, 14, 21, 30, 60, 90, 100] as const;

export interface Habit {
  id: string;
  name: string;
  description?: string;
  frequency: string;
  active: boolean;
  createdAt: string;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  date: string;
  completedAt: string;
  note?: string;
}

export interface HabitStreak {
  id: string;
  habitId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string;
}

export interface HabitStatus {
  habit: Habit;
  streak: HabitStreak;
  completedToday: boolean;
}

export interface CreateHabitInput {
  name: string;
  description?: string;
}

export interface CheckinResult {
  entry: HabitEntry;
  streak: HabitStreak;
  milestone?: number;
}

type MemorySnapshot = {
  id: string;
  key?: string;
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function dayDiff(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00.000Z`).getTime();
  const b = new Date(`${dateB}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.trunc((a - b) / ONE_DAY_MS);
}

function normalizeHabitName(name: string): string {
  return name.trim().toLowerCase();
}

function withOptionalString<T extends Record<string, unknown>>(
  object: T,
  key: string,
  value: string | undefined,
): T {
  if (value === undefined) {
    return object;
  }

  return {
    ...object,
    [key]: value,
  };
}

function parseHabitFromMemory(entry: { id: string; key?: string; content: string }): Habit | null {
  if (!entry.key?.startsWith(HABIT_MEMORY_KEY_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(entry.content) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.frequency !== 'string' ||
      typeof parsed.active !== 'boolean' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }

    const description = normalizeText(parsed.description);
    return withOptionalString(
      {
        id: entry.id,
        name: parsed.name,
        frequency: parsed.frequency,
        active: parsed.active,
        createdAt: parsed.createdAt,
      },
      'description',
      description,
    ) as Habit;
  } catch {
    return null;
  }
}

function parseEntryFromMemory(entry: {
  id: string;
  key?: string;
  content: string;
}): HabitEntry | null {
  if (!entry.key?.startsWith(ENTRY_MEMORY_KEY_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(entry.content) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.habitId !== 'string' ||
      typeof parsed.date !== 'string' ||
      typeof parsed.completedAt !== 'string'
    ) {
      return null;
    }

    const note = normalizeText(parsed.note);
    return withOptionalString(
      {
        id: entry.id,
        habitId: parsed.habitId,
        date: parsed.date,
        completedAt: parsed.completedAt,
      },
      'note',
      note,
    ) as HabitEntry;
  } catch {
    return null;
  }
}

function parseStreakFromMemory(entry: {
  id: string;
  key?: string;
  content: string;
}): HabitStreak | null {
  if (!entry.key?.startsWith(STREAK_MEMORY_KEY_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(entry.content) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.habitId !== 'string' ||
      typeof parsed.currentStreak !== 'number' ||
      typeof parsed.longestStreak !== 'number' ||
      typeof parsed.lastCompletedDate !== 'string'
    ) {
      return null;
    }

    return {
      id: entry.id,
      habitId: parsed.habitId,
      currentStreak: parsed.currentStreak,
      longestStreak: parsed.longestStreak,
      lastCompletedDate: parsed.lastCompletedDate,
    };
  } catch {
    return null;
  }
}

async function loadMemory(client: LifeGraphClient): Promise<MemorySnapshot[]> {
  const graph = await client.loadGraph();
  const memory = Array.isArray(graph.memory) ? graph.memory : [];
  return memory.map(
    (entry) =>
      withOptionalString(
        {
          id: entry.id,
          content: entry.content,
        },
        'key',
        entry.key,
      ) as MemorySnapshot,
  );
}

async function readHabitsFromMemory(client: LifeGraphClient): Promise<Habit[]> {
  const memory = await loadMemory(client);
  return memory
    .map((entry) => parseHabitFromMemory(entry))
    .filter((entry): entry is Habit => entry !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function readEntriesFromMemory(client: LifeGraphClient): Promise<HabitEntry[]> {
  const memory = await loadMemory(client);
  return memory
    .map((entry) => parseEntryFromMemory(entry))
    .filter((entry): entry is HabitEntry => entry !== null)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
}

async function readLatestStreakFromMemory(
  client: LifeGraphClient,
  habitId: string,
): Promise<HabitStreak | null> {
  const memory = await loadMemory(client);
  for (let index = memory.length - 1; index >= 0; index -= 1) {
    const entry = memory[index];
    if (!entry) {
      continue;
    }
    const parsed = parseStreakFromMemory(entry);
    if (parsed?.habitId === habitId) {
      return parsed;
    }
  }
  return null;
}

async function saveHabitFallback(
  client: LifeGraphClient,
  habit: Omit<Habit, 'id'>,
): Promise<Habit> {
  const saved = await client.appendMemoryEntry({
    type: 'insight',
    role: 'system',
    key: `${HABIT_MEMORY_KEY_PREFIX}${normalizeHabitName(habit.name)}`,
    value: habit.name,
    content: JSON.stringify(habit),
    relatedTo: ['habit-streak', habit.name],
  });

  return {
    ...habit,
    id: saved.id,
  };
}

async function saveEntryFallback(
  client: LifeGraphClient,
  entry: Omit<HabitEntry, 'id'>,
): Promise<HabitEntry> {
  const saved = await client.appendMemoryEntry({
    type: 'insight',
    role: 'system',
    key: `${ENTRY_MEMORY_KEY_PREFIX}${entry.habitId}.${entry.date}`,
    value: entry.date,
    content: JSON.stringify(entry),
    relatedTo: ['habit-streak', entry.habitId],
  });

  return {
    ...entry,
    id: saved.id,
  };
}

async function saveStreakFallback(client: LifeGraphClient, streak: HabitStreak): Promise<void> {
  await client.appendMemoryEntry({
    type: 'insight',
    role: 'system',
    key: `${STREAK_MEMORY_KEY_PREFIX}${streak.habitId}`,
    value: String(streak.currentStreak),
    content: JSON.stringify(streak),
    relatedTo: ['habit-streak', streak.habitId],
  });
}

async function getHabitById(client: LifeGraphClient, habitId: string): Promise<Habit | null> {
  try {
    const results = await client.query<Habit>('habit.Habit', {
      id: habitId,
      limit: 1,
    });
    if (results[0]) {
      return results[0];
    }
  } catch {
    // Fall through to memory-backed lookup.
  }

  const habits = await readHabitsFromMemory(client);
  return habits.find((habit) => habit.id === habitId) ?? null;
}

async function getHabitStreak(
  client: LifeGraphClient,
  habitId: string,
): Promise<HabitStreak | null> {
  try {
    const results = await client.query<HabitStreak>('habit.Streak', {
      habitId,
      limit: 1,
    });
    return results[0] ?? null;
  } catch {
    return readLatestStreakFromMemory(client, habitId);
  }
}

async function findEntryForDate(
  client: LifeGraphClient,
  habitId: string,
  date: string,
): Promise<HabitEntry | null> {
  try {
    const results = await client.query<HabitEntry>('habit.Entry', {
      habitId,
      date,
      limit: 1,
    });
    return results[0] ?? null;
  } catch {
    const entries = await readEntriesFromMemory(client);
    return entries.find((entry) => entry.habitId === habitId && entry.date === date) ?? null;
  }
}

export async function createHabit(
  client: LifeGraphClient,
  name: string,
  description?: string,
): Promise<Habit> {
  const normalizedName = normalizeHabitName(name ?? '');
  if (!normalizedName) {
    throw new Error('habit name must be a non-empty string');
  }
  if (normalizedName.length > 80) {
    throw new Error('habit name must be 80 characters or fewer');
  }

  let existingHabits: Habit[] = [];
  try {
    existingHabits = await client.query<Habit>('habit.Habit', {
      active: true,
      limit: 100,
    });
  } catch {
    existingHabits = await readHabitsFromMemory(client);
  }

  const duplicate = existingHabits.find(
    (habit) => habit.active && normalizeHabitName(habit.name) === normalizedName,
  );
  if (duplicate) {
    throw new Error(`habit already exists: ${duplicate.name}`);
  }

  const createdAt = new Date().toISOString();
  const normalizedDescription = normalizeText(description);
  const habitData = withOptionalString(
    {
      name: name.trim(),
      frequency: DEFAULT_FREQUENCY,
      active: true,
      createdAt,
    },
    'description',
    normalizedDescription,
  ) as Omit<Habit, 'id'>;

  const habit = await (async (): Promise<Habit> => {
    try {
      const id = await client.createNode('habit.Habit', habitData);
      return {
        id,
        ...habitData,
      };
    } catch {
      return saveHabitFallback(client, habitData);
    }
  })();

  const streak: HabitStreak = {
    id: `habit_streak_${habit.id}`,
    habitId: habit.id,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: '',
  };

  try {
    const streakId = await client.createNode('habit.Streak', {
      habitId: habit.id,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: '',
    });
    streak.id = streakId;
  } catch {
    await saveStreakFallback(client, streak);
  }

  return habit;
}

export async function recordCheckin(
  client: LifeGraphClient,
  habitId: string,
  note?: string,
  now: Date = new Date(),
): Promise<CheckinResult> {
  const habit = await getHabitById(client, habitId);
  if (!habit || !habit.active) {
    throw new Error('habit not found or inactive');
  }

  const completedAt = now.toISOString();
  const date = toDateOnly(completedAt);
  const existingEntry = await findEntryForDate(client, habitId, date);
  if (existingEntry) {
    const existingStreak = (await getHabitStreak(client, habitId)) ?? {
      id: `habit_streak_${habitId}`,
      habitId,
      currentStreak: 1,
      longestStreak: 1,
      lastCompletedDate: date,
    };

    return {
      entry: existingEntry,
      streak: existingStreak,
    };
  }

  const entryNote = normalizeText(note);
  const entryData = withOptionalString(
    {
      habitId,
      date,
      completedAt,
    },
    'note',
    entryNote,
  ) as Omit<HabitEntry, 'id'>;

  const entry = await (async (): Promise<HabitEntry> => {
    try {
      const id = await client.createNode('habit.Entry', entryData);
      return {
        id,
        ...entryData,
      };
    } catch {
      return saveEntryFallback(client, entryData);
    }
  })();

  const existingStreak = await getHabitStreak(client, habitId);
  let currentStreak = 1;
  let longestStreak = 1;

  if (existingStreak) {
    const diff = dayDiff(date, existingStreak.lastCompletedDate);
    if (diff === 0) {
      currentStreak = existingStreak.currentStreak;
      longestStreak = Math.max(existingStreak.longestStreak, currentStreak);
    } else if (diff === 1) {
      currentStreak = existingStreak.currentStreak + 1;
      longestStreak = Math.max(existingStreak.longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      longestStreak = Math.max(existingStreak.longestStreak, 1);
    }
  }

  const streak: HabitStreak = {
    id: existingStreak?.id ?? `habit_streak_${habitId}`,
    habitId,
    currentStreak,
    longestStreak,
    lastCompletedDate: date,
  };

  try {
    const streakId = await client.createNode('habit.Streak', { ...streak });
    streak.id = streakId;
  } catch {
    await saveStreakFallback(client, streak);
  }

  const milestone = MILESTONE_THRESHOLDS.find((threshold) => threshold === streak.currentStreak);

  return milestone === undefined
    ? {
        entry,
        streak,
      }
    : {
        entry,
        streak,
        milestone,
      };
}

export async function getHabitStatus(
  client: LifeGraphClient,
  habitId?: string,
): Promise<HabitStatus[]> {
  const activeHabits = habitId
    ? await (async (): Promise<Habit[]> => {
        const habit = await getHabitById(client, habitId);
        return habit && habit.active ? [habit] : [];
      })()
    : await listHabits(client);

  const today = toDateOnly(new Date().toISOString());
  const statuses = await Promise.all(
    activeHabits.map(async (habit) => {
      const streak = (await getHabitStreak(client, habit.id)) ?? {
        id: `habit_streak_${habit.id}`,
        habitId: habit.id,
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDate: '',
      };
      const todayEntry = await findEntryForDate(client, habit.id, today);
      return {
        habit,
        streak,
        completedToday: todayEntry !== null,
      };
    }),
  );

  return statuses;
}

export async function listHabits(client: LifeGraphClient): Promise<Habit[]> {
  try {
    const results = await client.query<Habit>('habit.Habit', {
      active: true,
      sortBy: 'createdAt',
      sortDirection: 'asc',
      limit: 100,
    });

    return results
      .filter((habit) => habit.active)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch {
    const habits = await readHabitsFromMemory(client);
    return habits.filter((habit) => habit.active);
  }
}

export function toStoreError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
