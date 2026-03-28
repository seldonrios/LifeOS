import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseEvent, LifeOSModule } from '@lifeos/module-sdk';

import { planningAssistantModule } from './index';

test('planning assistant publishes planning topics', async () => {
  const subscriptions = new Map<string, (event: BaseEvent<unknown>) => Promise<void> | void>();
  const published: string[] = [];

  const moduleCandidate = planningAssistantModule as LifeOSModule;
  await moduleCandidate.init({
    env: process.env,
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
        return 'in-memory';
      },
    },
    createLifeGraphClient() {
      return {
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: new Date().toISOString(),
            plans: [
              {
                id: 'plan-1',
                title: 'Plan',
                description: 'desc',
                deadline: null,
                createdAt: new Date().toISOString(),
                tasks: [{ id: 'task-1', title: 'Task', status: 'todo', priority: 3 }],
              },
            ],
          };
        },
        async saveGraph() {
          return;
        },
      } as never;
    },
    async subscribe(topic, handler) {
      subscriptions.set(topic, handler as (event: BaseEvent<unknown>) => Promise<void> | void);
    },
    async publish(topic) {
      published.push(topic);
      return {
        id: 'evt',
        type: topic,
        timestamp: new Date().toISOString(),
        source: 'planning-assistant',
        version: '0.1.0',
        data: {},
      };
    },
    log() {
      return;
    },
  });

  const tick = subscriptions.get('lifeos.tick.overdue');
  assert.ok(tick);
  await tick?.({
    id: 'evt-trigger',
    type: 'lifeos.tick.overdue',
    timestamp: new Date().toISOString(),
    source: 'test',
    version: '0.1.0',
    data: {},
  });

  assert.equal(published.includes('lifeos.planning-assistant.task.planned'), true);
  assert.equal(published.includes('lifeos.planning-assistant.reminder.scheduled'), true);
});
