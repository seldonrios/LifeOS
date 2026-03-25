import { Topics } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

import {
  HABIT_TOPICS,
  type HabitCheckinIntentPayload,
  type HabitCheckinRecordedEvent,
  type HabitCreateIntentPayload,
  type HabitStatusIntentPayload,
  type HabitStreakMilestoneEvent,
} from './events';
import { moduleSchema } from './schema';
import { createHabit, getHabitStatus, listHabits, recordCheckin, toStoreError } from './store';
import { fuzzyMatchHabit, parseHabitCheckin, parseHabitCreate, parseHabitStatus } from './voice';

interface HabitStreakModuleOptions {
  now?: () => Date;
}

function createClient(context: ModuleRuntimeContext): LifeGraphClient {
  return context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveCreatePayload(payload: HabitCreateIntentPayload): {
  name: string;
  description?: string;
} | null {
  const directName = getString(payload.name);
  const directDescription = getString(payload.description) ?? undefined;

  if (directName) {
    return directDescription === undefined
      ? {
          name: directName,
        }
      : {
          name: directName,
          description: directDescription,
        };
  }

  const utterance = getString(payload.utterance);
  const parsed = utterance ? parseHabitCreate(utterance) : null;
  const parsedName = getString(parsed?.payload.name);
  if (!parsedName) {
    return null;
  }

  return directDescription === undefined
    ? {
        name: parsedName,
      }
    : {
        name: parsedName,
        description: directDescription,
      };
}

function resolveCheckinPayload(payload: HabitCheckinIntentPayload): {
  habitId?: string;
  habitName?: string;
  note?: string;
} | null {
  const directHabitId = getString(payload.habitId) ?? undefined;
  const directHabitName = getString(payload.habitName) ?? undefined;
  const directNote = getString(payload.note) ?? undefined;

  if (directHabitId || directHabitName) {
    const resolved: { habitId?: string; habitName?: string; note?: string } = {};
    if (directHabitId !== undefined) {
      resolved.habitId = directHabitId;
    }
    if (directHabitName !== undefined) {
      resolved.habitName = directHabitName;
    }
    if (directNote !== undefined) {
      resolved.note = directNote;
    }
    return resolved;
  }

  const utterance = getString(payload.utterance);
  const parsed = utterance ? parseHabitCheckin(utterance) : null;
  const parsedHabitName = getString(parsed?.payload.habitName) ?? undefined;
  if (!parsedHabitName) {
    return null;
  }

  return directNote === undefined
    ? {
        habitName: parsedHabitName,
      }
    : {
        habitName: parsedHabitName,
        note: directNote,
      };
}

function resolveStatusPayload(payload: HabitStatusIntentPayload): {
  habitName?: string;
} {
  const directHabitName = getString(payload.habitName) ?? undefined;
  if (directHabitName) {
    return {
      habitName: directHabitName,
    };
  }

  const utterance = getString(payload.utterance);
  const parsed = utterance ? parseHabitStatus(utterance) : null;
  const habitName = getString(parsed?.payload.habitName) ?? undefined;
  return habitName === undefined ? {} : { habitName };
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'habit-streak');
  } catch (error: unknown) {
    context.log(`[HabitStreak] publish degraded (${topic}): ${toStoreError(error)}`);
  }
}

async function handleTickReminder(
  client: LifeGraphClient,
  context: ModuleRuntimeContext,
  now: Date,
): Promise<void> {
  const statuses = await getHabitStatus(client);
  const pendingHabits = statuses.filter((status) => !status.completedToday);

  if (pendingHabits.length === 0) {
    return;
  }

  const names = pendingHabits.slice(0, 3).map((status) => status.habit.name);
  await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
    kind: 'reminder',
    source: 'habit-streak',
    title: 'Habit check-in',
    message: `You have ${names.join(', ')} waiting for a ${now.toISOString().slice(0, 10)} check-in.`,
  });
}

function summarizeStatuses(
  statuses: Array<{
    habit: { name: string };
    streak: { currentStreak: number; longestStreak: number };
    completedToday: boolean;
  }>,
): string {
  if (statuses.length === 0) {
    return 'No active habits are being tracked yet.';
  }

  return statuses
    .slice(0, 3)
    .map((status) => {
      const todayText = status.completedToday ? 'checked in today' : 'not checked in today';
      return `${status.habit.name}: ${status.streak.currentStreak} day streak (${todayText}, longest ${status.streak.longestStreak})`;
    })
    .join('; ');
}

export function createHabitStreakModule(options: HabitStreakModuleOptions = {}): LifeOSModule {
  const now = options.now ?? (() => new Date());

  return {
    id: 'habit-streak',
    async init(context: ModuleRuntimeContext): Promise<void> {
      const client = createClient(context);

      try {
        await client.registerModuleSchema(moduleSchema);
      } catch (error: unknown) {
        context.log(`[HabitStreak] schema registration degraded: ${toStoreError(error)}`);
      }

      await context.subscribe<HabitCreateIntentPayload>(
        HABIT_TOPICS.voiceIntentCreate,
        async (event) => {
          const payload = resolveCreatePayload(event.data);
          if (!payload) {
            context.log('[HabitStreak] Ignored create intent with missing habit payload.');
            return;
          }

          try {
            const habit = await createHabit(client, payload.name, payload.description);
            await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
              kind: 'habit-created',
              source: 'habit-streak',
              message: `Habit created: ${habit.name}.`,
            });
          } catch (error: unknown) {
            context.log(`[HabitStreak] create intent degraded: ${toStoreError(error)}`);
          }
        },
      );

      await context.subscribe<HabitCheckinIntentPayload>(
        HABIT_TOPICS.voiceIntentCheckin,
        async (event) => {
          const payload = resolveCheckinPayload(event.data);
          if (!payload) {
            context.log('[HabitStreak] Ignored check-in intent with missing habit payload.');
            return;
          }

          try {
            const activeHabits = await listHabits(client);
            const matchedHabit = payload.habitId
              ? (activeHabits.find((habit) => habit.id === payload.habitId) ?? null)
              : payload.habitName
                ? fuzzyMatchHabit(payload.habitName, activeHabits)
                : null;

            if (!matchedHabit) {
              throw new Error('unable to resolve habit for check-in');
            }

            const result = await recordCheckin(client, matchedHabit.id, payload.note, now());
            const checkinEvent: HabitCheckinRecordedEvent = {
              habitId: matchedHabit.id,
              habitName: matchedHabit.name,
              date: result.entry.date,
              currentStreak: result.streak.currentStreak,
              completedAt: result.entry.completedAt,
            };
            await publishSafe(context, HABIT_TOPICS.checkinRecorded, { ...checkinEvent });
            await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
              kind: 'habit-checkin',
              source: 'habit-streak',
              message: `${matchedHabit.name} checked in. Current streak: ${result.streak.currentStreak}.`,
            });

            if (result.milestone !== undefined) {
              const milestoneEvent: HabitStreakMilestoneEvent = {
                habitId: matchedHabit.id,
                habitName: matchedHabit.name,
                milestone: result.milestone,
                currentStreak: result.streak.currentStreak,
                achievedAt: result.entry.completedAt,
              };
              await publishSafe(context, HABIT_TOPICS.streakMilestone, { ...milestoneEvent });
            }
          } catch (error: unknown) {
            context.log(`[HabitStreak] check-in intent degraded: ${toStoreError(error)}`);
          }
        },
      );

      await context.subscribe<HabitStatusIntentPayload>(
        HABIT_TOPICS.voiceIntentStatus,
        async (event) => {
          try {
            const payload = resolveStatusPayload(event.data);
            const activeHabits = await listHabits(client);
            const matchedHabit = payload.habitName
              ? fuzzyMatchHabit(payload.habitName, activeHabits)
              : null;
            const statuses = await getHabitStatus(client, matchedHabit?.id);
            await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
              kind: 'habit-status',
              source: 'habit-streak',
              message: summarizeStatuses(statuses),
            });
          } catch (error: unknown) {
            context.log(`[HabitStreak] status intent degraded: ${toStoreError(error)}`);
          }
        },
      );

      await context.subscribe<Record<string, unknown>>(Topics.lifeos.tickOverdue, async () => {
        try {
          await handleTickReminder(client, context, now());
        } catch (error: unknown) {
          context.log(`[HabitStreak] tick reminder degraded: ${toStoreError(error)}`);
        }
      });
    },
  };
}

export const habitStreakModule = createHabitStreakModule();
