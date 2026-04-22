import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createReminderModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock() {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const createNodeCalls: Array<Record<string, unknown>> = [];
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
    createLifeGraphClient: () =>
      ({
        async createNode(_label: string, data: Record<string, unknown>) {
          createNodeCalls.push(data);
          return 'goal_followup_1';
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
        id: 'event_1',
        type: topic,
        timestamp: '2026-03-22T00:00:00.000Z',
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
    createNodeCalls,
    logs,
  };
}

test('reminder module subscribes to task scheduled, task complete, and overdue tick topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createReminderModule();

  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic);
  assert.deepEqual(
    topics.sort(),
    [Topics.task.scheduled, Topics.lifeos.taskCompleted, Topics.lifeos.tickOverdue].sort(),
  );
});

test('reminder module logs when a task is scheduled', async () => {
  const { context, subscriptions, logs } = createContextMock();
  const module = createReminderModule();
  await module.init(context);

  const scheduledHandler = subscriptions.find(
    (entry) => entry.topic === Topics.task.scheduled,
  )?.handler;

  assert.ok(scheduledHandler);
  await scheduledHandler?.({
    id: 'task_evt_1',
    type: Topics.task.scheduled,
    timestamp: '2026-03-22T00:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      taskId: 'task_buy_milk',
      planId: 'goal_voice_1',
      title: 'Buy milk',
      scheduledAt: '2026-03-22T00:00:00.000Z',
      origin: 'voice',
    },
  });

  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? '', /Tracking scheduled task/);
});

test('reminder module creates follow-up plan and emits reminder event on overdue tick', async () => {
  const { context, subscriptions, published, createNodeCalls } = createContextMock();
  const module = createReminderModule();
  await module.init(context);

  const overdueHandler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.tickOverdue,
  )?.handler;

  assert.ok(overdueHandler);
  await overdueHandler?.({
    id: 'tick_evt_1',
    type: Topics.lifeos.tickOverdue,
    timestamp: '2026-03-22T00:00:00.000Z',
    source: 'lifeos-cli',
    version: '0.1.0',
    data: {
      checkedTasks: 3,
      overdueTasks: [
        {
          id: 'task_1',
          title: 'Submit board packet',
          goalTitle: 'Board Prep',
          dueDate: '2026-03-21',
        },
      ],
      tickedAt: '2026-03-22T00:00:00.000Z',
    },
  });

  assert.equal(createNodeCalls.length, 1);
  assert.match(String(createNodeCalls[0]?.title), /Overdue reminder:/);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.topic, Topics.lifeos.reminderFollowupCreated);
  assert.equal(typeof published[0]?.data.followUpPlanId, 'string');
  assert.equal(published[0]?.data.overdueCount, 1);
  assert.equal(published[0]?.data.tickEventId, 'tick_evt_1');
  assert.equal(typeof published[0]?.data.createdAt, 'string');
});

test('reminder module does not create follow-up plan for overdue tick with no overdue tasks', async () => {
  const { context, subscriptions, published, createNodeCalls } = createContextMock();
  const module = createReminderModule();
  await module.init(context);

  const overdueHandler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.tickOverdue,
  )?.handler;

  assert.ok(overdueHandler);
  await overdueHandler?.({
    id: 'tick_evt_2',
    type: Topics.lifeos.tickOverdue,
    timestamp: '2026-03-22T00:00:00.000Z',
    source: 'lifeos-cli',
    version: '0.1.0',
    data: {
      checkedTasks: 0,
      overdueTasks: [],
      tickedAt: '2026-03-22T00:00:00.000Z',
    },
  });

  assert.equal(createNodeCalls.length, 0);
  assert.equal(published.length, 0);
});
