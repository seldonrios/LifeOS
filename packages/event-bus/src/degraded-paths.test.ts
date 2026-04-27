import assert from 'node:assert/strict';
import test from 'node:test';

import { createEventBusClient, type BaseEvent } from './index';

test(
  'in-memory fallback does not replay events published before subscription (non-durability proof)',
  async () => {
    const busA = createEventBusClient({
      servers: 'nats://127.0.0.1:1',
      timeoutMs: 20,
      maxReconnectAttempts: 0,
    });

    const event: BaseEvent<{ value: string }> = {
      id: 'evt_non_durable_1',
      type: 'lifeos.test.non_durable',
      timestamp: new Date().toISOString(),
      source: 'event-bus-degraded-test',
      version: '0.1.0',
      data: { value: 'published-before-subscribe' },
    };

    await busA.publish('lifeos.test.non_durable', event);
    await busA.close();

    const busB = createEventBusClient({
      servers: 'nats://127.0.0.1:1',
      timeoutMs: 20,
      maxReconnectAttempts: 0,
    });

    const seen: BaseEvent<{ value: string }>[] = [];
    await busB.subscribe<{ value: string }>('lifeos.test.non_durable', async (received) => {
      seen.push(received);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(seen.length, 0);
    await busB.close();
  },
);
