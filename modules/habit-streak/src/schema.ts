import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'habit-streak-schema',
    version: '0.1.0',
    module: 'habit-streak',
  },
  entities: [
    {
      entity: 'habit.Habit',
      properties: {
        name: 'string',
        description: 'string',
        frequency: 'string',
        active: 'boolean',
        createdAt: 'datetime',
      },
    },
    {
      entity: 'habit.Entry',
      properties: {
        habitId: 'string',
        date: 'date',
        completedAt: 'datetime',
        note: 'string',
      },
    },
    {
      entity: 'habit.Streak',
      properties: {
        habitId: 'string',
        currentStreak: 'number',
        longestStreak: 'number',
        lastCompletedDate: 'date',
      },
    },
  ],
  relationships: [
    {
      type: 'habit.entry.for',
      from: 'habit.Entry',
      to: 'habit.Habit',
    },
    {
      type: 'habit.streak.tracks',
      from: 'habit.Streak',
      to: 'habit.Habit',
    },
  ],
  properties: [],
};
