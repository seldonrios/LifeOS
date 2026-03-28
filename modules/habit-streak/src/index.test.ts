import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent, type ModuleRuntimeContext } from '@lifeos/module-sdk';

import { HABIT_TOPICS } from './events';
import { createHabitStreakModule } from './index';
import { recordCheckin } from './store';
import { parseHabitCheckin, parseHabitStatus } from './voice';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

interface ContextMockOptions {
  queryResponder?: (query: string, params?: Record<string, unknown>) => unknown[];
}

type LifeGraphClient = ReturnType<ModuleRuntimeContext['createLifeGraphClient']>;

function createClientMock(options: ContextMockOptions = {}): {
  client: LifeGraphClient;
  createNodeCalls: Array<{ label: string; data: Record<string, unknown> }>;
  memoryEntries: Array<Record<string, unknown>>;
} {
  const createNodeCalls: Array<{ label: string; data: Record<string, unknown> }> = [];
  const memoryEntries: Array<Record<string, unknown>> = [];

  const client = {
    async query<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T[]> {
      if (options.queryResponder) {
        return options.queryResponder(query, params) as T[];
      }
      throw new Error('query not implemented in test mock');
    },
    async getNode() {
      return null;
    },
    async createNode(label: string, data: Record<string, unknown>): Promise<string> {
      createNodeCalls.push({ label, data });
      return `${label}-id-${createNodeCalls.length}`;
    },
    async createRelationship() {
      return;
    },
    async loadGraph() {
      return {
        version: '0.1.0',
        updatedAt: '2026-03-24T00:00:00.000Z',
        plans: [],
        memory: memoryEntries as never,
      };
    },
    async saveGraph() {
      return;
    },
    async appendNote() {
      throw new Error('not implemented');
    },
    async appendResearchResult() {
      throw new Error('not implemented');
    },
    async saveResearchResult() {
      throw new Error('not implemented');
    },
    async getResearchThread() {
      return null;
    },
    async appendWeatherSnapshot() {
      throw new Error('not implemented');
    },
    async getLatestWeatherSnapshot() {
      return null;
    },
    async appendNewsDigest() {
      throw new Error('not implemented');
    },
    async getLatestNewsDigest() {
      return null;
    },
    async appendEmailDigest() {
      throw new Error('not implemented');
    },
    async searchNotes() {
      return [];
    },
    async appendMemoryEntry(entry: Record<string, unknown>) {
      const saved = {
        id: `memory-${memoryEntries.length + 1}`,
        timestamp: '2026-03-24T00:00:00.000Z',
        embedding: [],
        ...entry,
      };
      memoryEntries.push(saved);
      return saved as never;
    },
    async searchMemory() {
      return [];
    },
    async getMemoryThread() {
      return [];
    },
    async mergeDelta() {
      throw new Error('not implemented');
    },
    async applyUpdates() {
      return;
    },
    async registerModuleSchema() {
      return;
    },
    async getSummary() {
      throw new Error('not implemented');
    },
    async generateReview() {
      throw new Error('not implemented');
    },
  } as unknown as LifeGraphClient;

  return {
    client,
    createNodeCalls,
    memoryEntries,
  };
}

function createContextMock(client: LifeGraphClient): {
  context: ModuleRuntimeContext;
  subscriptions: CapturedSubscription[];
  published: Array<{ topic: string; data: Record<string, unknown> }>;
  logs: string[];
} {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];

  const context: ModuleRuntimeContext = {
    env: {},
    eventBus: {
      async publish() {
        return;
      },
      async subscribe() {
        return;
      },
      async close() {
        return;
      },
      getTransport() {
        return 'unknown' as const;
      },
    },
    createLifeGraphClient: () => client,
    subscribe: async <T>(
      topic: string,
      handler: (event: BaseEvent<T>) => Promise<void> | void,
    ): Promise<void> => {
      subscriptions.push({
        topic,
        handler: handler as (event: BaseEvent<unknown>) => Promise<void>,
      });
    },
    publish: async <T extends Record<string, unknown>>(topic: string, data: T) => {
      published.push({ topic, data });
      return {
        id: `evt-${published.length}`,
        type: topic,
        timestamp: '2026-03-24T00:00:00.000Z',
        source: 'test',
        version: '0.1.0',
        data,
      };
    },
    log(line: string) {
      logs.push(line);
    },
  };

  return {
    context,
    subscriptions,
    published,
    logs,
  };
}

test('create habit creates habit node', async () => {
  const { client, createNodeCalls } = createClientMock({
    queryResponder: () => [],
  });
  const { context, subscriptions } = createContextMock(client);
  const module = createHabitStreakModule();

  await module.init(context);
  const createHandler = subscriptions.find(
    (entry) => entry.topic === HABIT_TOPICS.voiceIntentCreate,
  )?.handler;
  assert.ok(createHandler);

  await createHandler?.({
    id: 'evt-create',
    type: HABIT_TOPICS.voiceIntentCreate,
    timestamp: '2026-03-24T08:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      name: 'Meditate',
    },
  });

  const createCall = createNodeCalls.find((entry) => entry.label === 'habit.Habit');
  assert.ok(createCall);
  assert.equal(createCall?.data.name, 'Meditate');
});

test('duplicate habit is rejected and logged', async () => {
  const { client, createNodeCalls } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'habit.Habit') {
        return [
          {
            id: 'habit-1',
            name: 'Meditate',
            description: '',
            frequency: 'daily',
            active: true,
            createdAt: '2026-03-23T08:00:00.000Z',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, logs } = createContextMock(client);
  const module = createHabitStreakModule();

  await module.init(context);
  const createHandler = subscriptions.find(
    (entry) => entry.topic === HABIT_TOPICS.voiceIntentCreate,
  )?.handler;
  assert.ok(createHandler);

  await createHandler?.({
    id: 'evt-duplicate',
    type: HABIT_TOPICS.voiceIntentCreate,
    timestamp: '2026-03-24T08:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      name: 'Meditate',
    },
  });

  assert.equal(createNodeCalls.filter((entry) => entry.label === 'habit.Habit').length, 0);
  assert.equal(
    logs.some((line) => line.includes('create intent degraded')),
    true,
  );
});

test('check-in increments streak', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit') {
        if (params?.id === 'habit-1') {
          return [
            {
              id: 'habit-1',
              name: 'Meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
        return [];
      }
      if (query === 'habit.Entry') {
        return [];
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 2,
            longestStreak: 4,
            lastCompletedDate: '2026-03-23',
          },
        ];
      }
      return [];
    },
  });

  const result = await recordCheckin(
    client,
    'habit-1',
    undefined,
    new Date('2026-03-24T09:00:00.000Z'),
  );

  assert.equal(result.streak.currentStreak, 3);
  assert.equal(result.streak.longestStreak, 4);
});

test('check-in is idempotent when already completed today', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit') {
        if (params?.id === 'habit-1') {
          return [
            {
              id: 'habit-1',
              name: 'Meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
        return [];
      }
      if (query === 'habit.Entry') {
        return [
          {
            id: 'entry-1',
            habitId: 'habit-1',
            date: '2026-03-24',
            completedAt: '2026-03-24T07:00:00.000Z',
            note: 'morning',
          },
        ];
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 5,
            longestStreak: 5,
            lastCompletedDate: '2026-03-24',
          },
        ];
      }
      return [];
    },
  });

  const result = await recordCheckin(
    client,
    'habit-1',
    undefined,
    new Date('2026-03-24T09:00:00.000Z'),
  );

  assert.equal(result.entry.id, 'entry-1');
  assert.equal(result.streak.currentStreak, 5);
});

test('streak resets after a gap', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit') {
        if (params?.id === 'habit-1') {
          return [
            {
              id: 'habit-1',
              name: 'Meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
        return [];
      }
      if (query === 'habit.Entry') {
        return [];
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 6,
            longestStreak: 6,
            lastCompletedDate: '2026-03-21',
          },
        ];
      }
      return [];
    },
  });

  const result = await recordCheckin(
    client,
    'habit-1',
    undefined,
    new Date('2026-03-24T09:00:00.000Z'),
  );

  assert.equal(result.streak.currentStreak, 1);
});

test('milestone at seven days publishes event', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit') {
        if (params?.active === true) {
          return [
            {
              id: 'habit-1',
              name: 'Meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
        if (params?.id === 'habit-1') {
          return [
            {
              id: 'habit-1',
              name: 'Meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
      }
      if (query === 'habit.Entry') {
        return [];
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 6,
            longestStreak: 6,
            lastCompletedDate: '2026-03-23',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHabitStreakModule({
    now: () => new Date('2026-03-24T09:00:00.000Z'),
  });

  await module.init(context);
  const checkinHandler = subscriptions.find(
    (entry) => entry.topic === HABIT_TOPICS.voiceIntentCheckin,
  )?.handler;
  assert.ok(checkinHandler);

  await checkinHandler?.({
    id: 'evt-checkin',
    type: HABIT_TOPICS.voiceIntentCheckin,
    timestamp: '2026-03-24T09:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      habitId: 'habit-1',
    },
  });

  assert.equal(
    published.some((entry) => entry.topic === HABIT_TOPICS.streakMilestone),
    true,
  );
});

test('tick event publishes reminder for incomplete habits', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit' && params?.active === true) {
        return [
          {
            id: 'habit-1',
            name: 'Meditate',
            description: '',
            frequency: 'daily',
            active: true,
            createdAt: '2026-03-20T08:00:00.000Z',
          },
        ];
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 2,
            longestStreak: 3,
            lastCompletedDate: '2026-03-23',
          },
        ];
      }
      if (query === 'habit.Entry') {
        return [];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHabitStreakModule({
    now: () => new Date('2026-03-24T10:00:00.000Z'),
  });

  await module.init(context);
  const tickHandler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.tickOverdue,
  )?.handler;
  assert.ok(tickHandler);

  await tickHandler?.({
    id: 'evt-tick',
    type: Topics.lifeos.tickOverdue,
    timestamp: '2026-03-24T10:00:00.000Z',
    source: 'scheduler',
    version: '0.1.0',
    data: {},
  });

  assert.equal(
    published.some((entry) => entry.topic === Topics.lifeos.orchestratorSuggestion),
    true,
  );
});

test('voice parse supports informal check-in phrasing', () => {
  const parsed = parseHabitCheckin('I meditated today');
  assert.deepEqual(parsed?.payload, {
    habitName: 'meditate',
  });
});

test('voice parse supports show my habits', () => {
  const parsed = parseHabitStatus('show my habits');
  assert.deepEqual(parsed?.payload, {});
});

test('fuzzy check-in resolves meditation utterance to meditate habit', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit') {
        if (params?.active === true) {
          return [
            {
              id: 'habit-1',
              name: 'meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
        if (params?.id === 'habit-1') {
          return [
            {
              id: 'habit-1',
              name: 'meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
      }
      if (query === 'habit.Entry') {
        return [];
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 2,
            longestStreak: 3,
            lastCompletedDate: '2026-03-23',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHabitStreakModule({
    now: () => new Date('2026-03-24T10:00:00.000Z'),
  });

  await module.init(context);
  const checkinHandler = subscriptions.find(
    (entry) => entry.topic === HABIT_TOPICS.voiceIntentCheckin,
  )?.handler;
  assert.ok(checkinHandler);

  await checkinHandler?.({
    id: 'evt-fuzzy-checkin',
    type: HABIT_TOPICS.voiceIntentCheckin,
    timestamp: '2026-03-24T10:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      utterance: 'I did meditation today',
    },
  });

  assert.equal(
    published.some((entry) => entry.topic === HABIT_TOPICS.checkinRecorded),
    true,
  );
});

test('fuzzy status resolves meditation utterance to meditate habit', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string, params?: Record<string, unknown>) => {
      if (query === 'habit.Habit') {
        if (params?.active === true) {
          return [
            {
              id: 'habit-1',
              name: 'meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
        if (params?.id === 'habit-1') {
          return [
            {
              id: 'habit-1',
              name: 'meditate',
              description: '',
              frequency: 'daily',
              active: true,
              createdAt: '2026-03-20T08:00:00.000Z',
            },
          ];
        }
      }
      if (query === 'habit.Streak') {
        return [
          {
            id: 'streak-1',
            habitId: 'habit-1',
            currentStreak: 5,
            longestStreak: 8,
            lastCompletedDate: '2026-03-24',
          },
        ];
      }
      if (query === 'habit.Entry') {
        return [
          {
            id: 'entry-1',
            habitId: 'habit-1',
            date: '2026-03-24',
            completedAt: '2026-03-24T07:00:00.000Z',
            note: 'morning',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHabitStreakModule();

  await module.init(context);
  const statusHandler = subscriptions.find(
    (entry) => entry.topic === HABIT_TOPICS.voiceIntentStatus,
  )?.handler;
  assert.ok(statusHandler);

  await statusHandler?.({
    id: 'evt-fuzzy-status',
    type: HABIT_TOPICS.voiceIntentStatus,
    timestamp: '2026-03-24T10:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      utterance: 'how is my meditation streak',
    },
  });

  const statusEvent = published.find(
    (entry) => entry.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(statusEvent);
  assert.match(String(statusEvent?.data.message ?? ''), /meditate/i);
});
