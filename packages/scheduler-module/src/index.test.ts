import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphDocument } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createSchedulerModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock(initialGraph?: LifeGraphDocument) {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];
  let savedGraph: LifeGraphDocument | null = null;
  let graph: LifeGraphDocument = initialGraph ?? {
    version: '0.1.0',
    updatedAt: '2026-03-23T00:00:00.000Z',
    plans: [
      {
        id: 'goal_1',
        title: 'Voice task: Finish report',
        description: 'Created from voice command',
        deadline: null,
        createdAt: '2026-03-23T00:00:00.000Z',
        tasks: [
          {
            id: 'task_1',
            title: 'Finish report',
            status: 'todo',
            priority: 4,
          },
        ],
      },
    ],
    calendarEvents: [],
  };

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
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return graph;
        },
        async saveGraph(next: LifeGraphDocument) {
          graph = next;
          savedGraph = next;
        },
      }) as never,
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
        timestamp: '2026-03-23T00:00:00.000Z',
        source: 'test',
        version: '0.1.0',
        data,
      };
    },
    log: (message: string) => {
      logs.push(message);
    },
  };

  return {
    context,
    subscriptions,
    published,
    logs,
    getSavedGraph: () => savedGraph,
  };
}

test('scheduler module subscribes to task intent and tick topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createSchedulerModule();
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(topics, [Topics.lifeos.tickOverdue, Topics.lifeos.voiceIntentTaskAdd].sort());
});

test('scheduler module marks voice task and infers due date', async () => {
  const { context, subscriptions, getSavedGraph } = createContextMock();
  const module = createSchedulerModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentTaskAdd,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_voice_task_1',
    type: Topics.lifeos.voiceIntentTaskAdd,
    timestamp: '2026-03-23T00:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      planId: 'goal_1',
      taskId: 'task_1',
      utterance: 'add a task to finish report by 2026-04-15',
    },
  });

  const saved = getSavedGraph();
  assert.ok(saved);
  const task = saved?.plans[0]?.tasks[0];
  assert.equal(task?.voiceTriggered, true);
  assert.equal(task?.dueDate, '2026-04-15');
});

test('scheduler module suggests reschedule for overdue tasks', async () => {
  const { context, subscriptions, published, getSavedGraph } = createContextMock();
  const module = createSchedulerModule();
  await module.init(context);

  const handler = subscriptions.find((entry) => entry.topic === Topics.lifeos.tickOverdue)?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'tick_evt_1',
    type: Topics.lifeos.tickOverdue,
    timestamp: '2026-03-23T00:00:00.000Z',
    source: 'lifeos-cli',
    version: '0.1.0',
    data: {
      checkedTasks: 1,
      overdueTasks: [
        {
          id: 'task_1',
          title: 'Finish report',
          goalTitle: 'Voice task',
          dueDate: '2026-03-22',
        },
      ],
      tickedAt: '2026-03-23T00:00:00.000Z',
    },
  });

  const saved = getSavedGraph();
  assert.ok(saved?.plans[0]?.tasks[0]?.suggestedReschedule);
  assert.equal(published[0]?.topic, Topics.lifeos.taskRescheduleSuggested);
});

test('scheduler module can resolve task by title when taskId is missing', async () => {
  const { context, subscriptions, getSavedGraph } = createContextMock();
  const module = createSchedulerModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentTaskAdd,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_voice_task_2',
    type: Topics.lifeos.voiceIntentTaskAdd,
    timestamp: '2026-03-23T00:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      planId: 'goal_1',
      taskTitle: 'Finish report',
      utterance: 'add a task to finish report by friday',
    },
  });

  const saved = getSavedGraph();
  assert.equal(saved?.plans[0]?.tasks[0]?.voiceTriggered, true);
});

test('scheduler module does not overwrite fresh reschedule suggestions', async () => {
  const initialGraph: LifeGraphDocument = {
    version: '0.1.0',
    updatedAt: '2026-03-23T00:00:00.000Z',
    plans: [
      {
        id: 'goal_1',
        title: 'Voice task: Finish report',
        description: 'Created from voice command',
        deadline: null,
        createdAt: '2026-03-23T00:00:00.000Z',
        tasks: [
          {
            id: 'task_1',
            title: 'Finish report',
            status: 'todo',
            priority: 4,
            suggestedReschedule: '2099-01-01T00:00:00.000Z',
          },
        ],
      },
    ],
    calendarEvents: [],
  };
  const { context, subscriptions, published, getSavedGraph } = createContextMock(initialGraph);
  const module = createSchedulerModule();
  await module.init(context);

  const handler = subscriptions.find((entry) => entry.topic === Topics.lifeos.tickOverdue)?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'tick_evt_2',
    type: Topics.lifeos.tickOverdue,
    timestamp: '2026-03-23T00:00:00.000Z',
    source: 'lifeos-cli',
    version: '0.1.0',
    data: {
      checkedTasks: 1,
      overdueTasks: [
        {
          id: 'task_1',
          title: 'Finish report',
          goalTitle: 'Voice task',
          dueDate: '2026-03-22',
        },
      ],
      tickedAt: '2026-03-23T00:00:00.000Z',
    },
  });

  assert.equal(getSavedGraph(), null);
  assert.equal(published.length, 0);
});
