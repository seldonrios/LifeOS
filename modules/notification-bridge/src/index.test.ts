import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseEvent, LifeOSModule } from '@lifeos/module-sdk';

import { notificationBridgeModule } from './index';

test('notification bridge emits failed event when webhook is not configured', async () => {
  const subscriptions = new Map<string, (event: BaseEvent<unknown>) => Promise<void> | void>();
  const published: string[] = [];

  const moduleCandidate = notificationBridgeModule as LifeOSModule;
  await moduleCandidate.init({
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
        return 'in-memory';
      },
    },
    createLifeGraphClient() {
      throw new Error('not used in notification bridge test');
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
        source: 'notification-bridge',
        version: '0.1.0',
        data: {},
      };
    },
    log() {
      return;
    },
  });

  const handler = subscriptions.get('lifeos.tick.overdue');
  assert.ok(handler);
  await handler?.({
    id: 'evt-trigger',
    type: 'lifeos.tick.overdue',
    timestamp: new Date().toISOString(),
    source: 'test',
    version: '0.1.0',
    data: {},
  });

  assert.equal(published.includes('lifeos.notification-bridge.failed'), true);
});
