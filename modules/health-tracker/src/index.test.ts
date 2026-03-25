import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { HEALTH_TOPICS } from './events';
import { createHealthTrackerModule } from './index';
import { logMetric, queryMetrics } from './store';
import { parseHealthLog } from './voice';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

interface ContextMockOptions {
  queryResponder?: (query: string, params?: Record<string, unknown>) => unknown[];
}

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
    async createNode(label: string, data: Record<string, unknown>): Promise<string> {
      createNodeCalls.push({ label, data });
      return `${label}-id-${createNodeCalls.length}`;
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
    async loadGraph() {
      return {
        version: '0.1.0',
        updatedAt: '2026-03-24T00:00:00.000Z',
        plans: [],
        memory: memoryEntries as never,
      };
    },
    async registerModuleSchema() {
      return;
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
        id: 'evt_1',
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

test('log steps via voice intent writes metric entry', async () => {
  const { client, createNodeCalls } = createClientMock({
    queryResponder: () => [],
  });
  const { context, subscriptions } = createContextMock(client);
  const module = createHealthTrackerModule({
    now: () => new Date('2026-03-24T08:00:00.000Z'),
  });

  await module.init(context);
  const logHandler = subscriptions.find(
    (entry) => entry.topic === HEALTH_TOPICS.voiceIntentLog,
  )?.handler;
  assert.ok(logHandler);

  await logHandler?.({
    id: 'evt_1',
    type: HEALTH_TOPICS.voiceIntentLog,
    timestamp: '2026-03-24T08:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      utterance: 'log 8000 steps',
    },
  });

  const metricCreate = createNodeCalls.find((entry) => entry.label === 'health.MetricEntry');
  assert.ok(metricCreate);
  assert.equal(metricCreate?.data.metric, 'steps');
  assert.equal(metricCreate?.data.value, 8000);
  assert.equal(metricCreate?.data.unit, 'steps');
});

test('streak increments on consecutive days', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'health.DailyStreak') {
        return [
          {
            id: 'streak-1',
            metric: 'steps',
            currentStreak: 2,
            longestStreak: 3,
            lastLoggedDate: '2026-03-23',
          },
        ];
      }
      return [];
    },
  });

  const result = await logMetric(client, {
    metric: 'steps',
    value: 6000,
    unit: 'steps',
    loggedAt: '2026-03-24T09:00:00.000Z',
  });

  assert.equal(result.streak.currentStreak, 3);
  assert.equal(result.streak.longestStreak, 3);
});

test('streak resets after logging gap', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'health.DailyStreak') {
        return [
          {
            id: 'streak-1',
            metric: 'steps',
            currentStreak: 5,
            longestStreak: 6,
            lastLoggedDate: '2026-03-20',
          },
        ];
      }
      return [];
    },
  });

  const result = await logMetric(client, {
    metric: 'steps',
    value: 5000,
    unit: 'steps',
    loggedAt: '2026-03-24T09:00:00.000Z',
  });

  assert.equal(result.streak.currentStreak, 1);
  assert.equal(result.streak.longestStreak, 6);
});

test('query metrics for last 7 days filters old entries', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'health.MetricEntry') {
        return [
          {
            id: 'm1',
            metric: 'steps',
            value: 1000,
            unit: 'steps',
            loggedAt: '2026-03-24T09:00:00.000Z',
          },
          {
            id: 'm2',
            metric: 'steps',
            value: 2000,
            unit: 'steps',
            loggedAt: '2026-03-10T09:00:00.000Z',
          },
        ];
      }
      return [];
    },
  });

  const originalNow = Date.now;
  Date.now = () => new Date('2026-03-24T12:00:00.000Z').getTime();
  try {
    const entries = await queryMetrics(client, 'steps', 7);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.id, 'm1');
  } finally {
    Date.now = originalNow;
  }
});

test('tick event triggers reminder when no log today', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'health.MetricEntry') {
        return [
          {
            id: 'm1',
            metric: 'steps',
            value: 7000,
            unit: 'steps',
            loggedAt: '2026-03-23T09:00:00.000Z',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHealthTrackerModule({
    now: () => new Date('2026-03-24T10:00:00.000Z'),
  });

  await module.init(context);
  const tickHandler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.tickOverdue,
  )?.handler;
  assert.ok(tickHandler);

  await tickHandler?.({
    id: 'evt_tick',
    type: Topics.lifeos.tickOverdue,
    timestamp: '2026-03-24T10:00:00.000Z',
    source: 'scheduler',
    version: '0.1.0',
    data: {},
  });

  assert.equal(
    published.some(
      (event) =>
        event.topic === Topics.lifeos.orchestratorSuggestion &&
        String(event.data.message ?? '')
          .toLowerCase()
          .includes('not logged'),
    ),
    true,
  );
});

test('invalid metric value does not create graph node', async () => {
  const { client, createNodeCalls } = createClientMock({ queryResponder: () => [] });
  const { context, subscriptions } = createContextMock(client);
  const module = createHealthTrackerModule();
  await module.init(context);

  const logHandler = subscriptions.find(
    (entry) => entry.topic === HEALTH_TOPICS.voiceIntentLog,
  )?.handler;
  assert.ok(logHandler);

  await logHandler?.({
    id: 'evt_invalid',
    type: HEALTH_TOPICS.voiceIntentLog,
    timestamp: '2026-03-24T11:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      metric: 'steps',
      value: Number.NaN,
      unit: 'steps',
    },
  });

  const metricCalls = createNodeCalls.filter((entry) => entry.label === 'health.MetricEntry');
  assert.equal(metricCalls.length, 0);
});

test('voice parsing extracts steps utterance', () => {
  const parsed = parseHealthLog('log 8000 steps');
  assert.deepEqual(parsed, {
    metric: 'steps',
    value: 8000,
    unit: 'steps',
  });
});

test('query payload merges metric with utterance-derived period', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'health.MetricEntry') {
        return [
          {
            id: 'm1',
            metric: 'steps',
            value: 8000,
            unit: 'steps',
            loggedAt: '2026-03-21T09:00:00.000Z',
          },
          {
            id: 'm2',
            metric: 'steps',
            value: 7000,
            unit: 'steps',
            loggedAt: '2026-03-19T09:00:00.000Z',
          },
          {
            id: 'm3',
            metric: 'steps',
            value: 6000,
            unit: 'steps',
            loggedAt: '2026-03-15T09:00:00.000Z',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHealthTrackerModule({
    now: () => new Date('2026-03-24T00:00:00.000Z'),
  });

  await module.init(context);
  const queryHandler = subscriptions.find(
    (entry) => entry.topic === HEALTH_TOPICS.voiceIntentQuery,
  )?.handler;
  assert.ok(queryHandler);

  // Query with metric but period in utterance (should merge and return only last 7 days)
  await queryHandler?.({
    id: 'evt_q1',
    type: HEALTH_TOPICS.voiceIntentQuery,
    timestamp: '2026-03-24T00:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      metric: 'steps',
      utterance: 'steps this week',
    },
  });

  const resultEvent = published.find(
    (event) => event.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(resultEvent);
  // Should only include m1 and m2 (last 7 days), not m3 which is older
  const message = String(resultEvent?.data.message ?? '');
  assert.match(message, /8000|7000/);
  assert.match(message, /Recent health entries/);
});

test('query payload uses direct period when provided, ignoring utterance', async () => {
  const { client } = createClientMock({
    queryResponder: (query: string) => {
      if (query === 'health.MetricEntry') {
        return [
          {
            id: 'm1',
            metric: 'sleep',
            value: 8,
            unit: 'hours',
            loggedAt: '2026-03-24T09:00:00.000Z',
          },
        ];
      }
      return [];
    },
  });
  const { context, subscriptions, published } = createContextMock(client);
  const module = createHealthTrackerModule({
    now: () => new Date('2026-03-24T00:00:00.000Z'),
  });

  await module.init(context);
  const queryHandler = subscriptions.find(
    (entry) => entry.topic === HEALTH_TOPICS.voiceIntentQuery,
  )?.handler;
  assert.ok(queryHandler);

  // Query with direct period should take precedence over utterance
  await queryHandler?.({
    id: 'evt_q2',
    type: HEALTH_TOPICS.voiceIntentQuery,
    timestamp: '2026-03-24T00:00:00.000Z',
    source: 'voice',
    version: '0.1.0',
    data: {
      metric: 'sleep',
      period: 30,
      utterance: 'sleep last week',
    },
  });

  const resultEvent = published.find(
    (event) => event.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(resultEvent);
  assert.match(String(resultEvent?.data.message ?? ''), /Recent health entries/);
});
