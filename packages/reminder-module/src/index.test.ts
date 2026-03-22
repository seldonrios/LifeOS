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
    log: () => {
      return;
    },
  };

  return {
    context,
    subscriptions,
    published,
    createNodeCalls,
  };
}

test('reminder module subscribes to task complete and overdue tick topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createReminderModule();

  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic);
  assert.deepEqual(topics.sort(), [Topics.lifeos.taskCompleted, Topics.lifeos.tickOverdue].sort());
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
});
