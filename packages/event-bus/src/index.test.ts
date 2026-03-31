import assert from 'node:assert/strict';
import test from 'node:test';

import type { NatsConnection } from 'nats';

import { createEventBusClient, type BaseEvent } from './index';

function createEvent<T>(type: string, data: T): BaseEvent<T> {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    timestamp: new Date().toISOString(),
    source: 'event-bus-test',
    version: '0.1.0',
    data,
  };
}

test('falls back to in-memory transport when nats is unavailable', async () => {
  const logs: string[] = [];
  const bus = createEventBusClient({
    servers: 'nats://127.0.0.1:1',
    timeoutMs: 20,
    maxReconnectAttempts: 0,
    logger: (line) => logs.push(line),
  });

  const seen: string[] = [];
  await bus.subscribe<{ value: string }>('lifeos.test.fallback', async (event) => {
    seen.push(event.data.value);
  });

  await bus.publish('lifeos.test.fallback', createEvent('lifeos.test.fallback', { value: 'ok' }));

  assert.equal(bus.getTransport(), 'in-memory');
  assert.deepEqual(seen, ['ok']);
  assert.match(logs.join('\n'), /in-memory fallback/i);
  await bus.close();
});

test('in-memory fallback supports wildcard subscriptions', async () => {
  const bus = createEventBusClient({
    servers: 'nats://127.0.0.1:1',
    timeoutMs: 20,
    maxReconnectAttempts: 0,
  });

  const received: string[] = [];
  await bus.subscribe<{ code: string }>('lifeos.>', async (event) => {
    received.push(event.type);
  });

  await bus.publish('lifeos.tick.overdue', createEvent('lifeos.tick.overdue', { code: 'A' }));
  await bus.publish(
    'lifeos.reminder.followup.created',
    createEvent('lifeos.reminder.followup.created', { code: 'B' }),
  );

  assert.deepEqual(received, ['lifeos.tick.overdue', 'lifeos.reminder.followup.created']);
  await bus.close();
});

test('connection health transitions to degraded after post-start disconnect', async () => {
  let disconnected = false;

  const fakeConnection = {
    publish: () => {
      return;
    },
    subscribe: () => ({
      unsubscribe: () => {
        return;
      },
      [Symbol.asyncIterator]: async function* () {
        return;
      },
    }),
    status: async function* () {
      yield { type: 'connect' };

      while (!disconnected) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      yield { type: 'disconnect' };
    },
    drain: async () => {
      return;
    },
    closed: async () => {
      return;
    },
    close: () => {
      disconnected = true;
    },
  } as unknown as NatsConnection;

  const bus = createEventBusClient({
    connectFn: async () => fakeConnection,
    allowInMemoryFallback: false,
  });

  await bus.publish('lifeos.test.health', createEvent('lifeos.test.health', { ok: true }));
  assert.equal(bus.getConnectionHealth(), 'connected');

  disconnected = true;
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(bus.getConnectionHealth(), 'degraded');
  await bus.close();
});
