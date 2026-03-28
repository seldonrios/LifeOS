import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseEvent, LifeOSModule } from '@lifeos/module-sdk';

import { templateModule } from './index';

test('template module subscribes and publishes', async () => {
  const moduleCandidate = templateModule as LifeOSModule;
  const subscriptions = new Map<string, (event: BaseEvent<unknown>) => Promise<void> | void>();
  const published: string[] = [];

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
      throw new Error('not used in this template test');
    },
    async subscribe(topic, handler) {
      subscriptions.set(topic, handler as (event: BaseEvent<unknown>) => Promise<void> | void);
    },
    async publish(topic) {
      published.push(topic);
      return {
        id: 'evt-template',
        type: topic,
        timestamp: new Date().toISOString(),
        source: 'template-module',
        version: '0.1.0',
        data: {},
      };
    },
    log() {
      return;
    },
  });

  const tickHandler = subscriptions.get('lifeos.tick.overdue');
  assert.ok(tickHandler);
  await tickHandler?.({
    id: 'evt-trigger',
    type: 'lifeos.tick.overdue',
    timestamp: new Date().toISOString(),
    source: 'test',
    version: '0.1.0',
    data: {},
  });

  assert.equal(published.includes('lifeos.template-module.handled'), true);
});
