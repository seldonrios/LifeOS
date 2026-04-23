import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics } from '@lifeos/event-bus';
import type { BaseEvent } from '@lifeos/module-sdk';

import { householdCaptureRouterModule } from './index';

function createEventEnvelope<T extends Record<string, unknown>>(
  topic: string,
  data: T,
  source = 'test-runtime',
): BaseEvent<T> {
  return {
    id: `${topic}-id`,
    type: topic,
    timestamp: new Date().toISOString(),
    source,
    version: 'test',
    data,
  };
}

test('module publishes unresolved once for duplicate capture id', async () => {
  const publishes: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();

  await householdCaptureRouterModule.init({
    env: {
      LIFEOS_AI_ENABLED: 'false',
      LIFEOS_HOUSEHOLD_DB_PATH: '/tmp/test-household.db',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
    eventBus: undefined,
    createLifeGraphClient: (() => {
      throw new Error('not used');
    }) as never,
    subscribe: async (topic, handler) => {
      subscribers.set(
        topic,
        handler as (event: { data: Record<string, unknown> }) => Promise<void>,
      );
    },
    publish: async (topic, data, source) => {
      publishes.push({ topic, data });
      return createEventEnvelope(topic, data, source ?? 'test-runtime');
    },
    log: () => {
      return;
    },
  });

  const handler = subscribers.get(Topics.lifeos.householdVoiceCaptureCreated);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  const payload = {
    captureId: 'cap_1',
    householdId: 'house_1',
    actorUserId: 'user_1',
    text: 'thing for Saturday',
    audioRef: null,
    source: 'mobile',
    createdAt: '2026-03-30T21:00:00.000Z',
  };

  await handler({ data: payload });
  await handler({ data: payload });

  assert.equal(publishes.length, 1);
  assert.equal(publishes[0]?.topic, Topics.lifeos.householdCaptureUnresolved);
});

test('module publishes shopping intent event for deterministic route', async () => {
  const publishes: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();

  await householdCaptureRouterModule.init({
    env: {
      LIFEOS_AI_ENABLED: 'false',
      LIFEOS_HOUSEHOLD_DB_PATH: '/tmp/test-household.db',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
    eventBus: undefined,
    createLifeGraphClient: (() => {
      throw new Error('not used');
    }) as never,
    subscribe: async (topic, handler) => {
      subscribers.set(
        topic,
        handler as (event: { data: Record<string, unknown> }) => Promise<void>,
      );
    },
    publish: async (topic, data, source) => {
      publishes.push({ topic, data });
      return createEventEnvelope(topic, data, source ?? 'test-runtime');
    },
    log: () => {
      return;
    },
  });

  const handler = subscribers.get(Topics.lifeos.householdVoiceCaptureCreated);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  await handler({
    data: {
      captureId: 'cap_2',
      householdId: 'house_1',
      actorUserId: 'user_1',
      text: 'add oat milk to the shopping list',
      audioRef: null,
      source: 'mobile',
      createdAt: '2026-03-30T21:00:00.000Z',
    },
  });

  assert.equal(publishes.length, 1);
  assert.equal(publishes[0]?.topic, Topics.lifeos.householdShoppingItemAddRequested);
  assert.equal(publishes[0]?.data.itemTitle, 'oat milk');
});

test('module does not subscribe when LIFEOS_HOUSEHOLD_DB_PATH is missing', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  const logs: string[] = [];

  await householdCaptureRouterModule.init({
    env: {
      LIFEOS_AI_ENABLED: 'false',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
    eventBus: undefined,
    createLifeGraphClient: (() => {
      throw new Error('not used');
    }) as never,
    subscribe: async (topic, handler) => {
      subscribers.set(
        topic,
        handler as (event: { data: Record<string, unknown> }) => Promise<void>,
      );
    },
    publish: async (topic, data, source) => {
      return createEventEnvelope(topic, data, source ?? 'test-runtime');
    },
    log: (message) => {
      logs.push(message);
    },
  });

  assert.equal(subscribers.size, 0);
  assert.ok(
    logs.some(
      (message) =>
        message ===
        '[household-capture-router] skipped: missing LIFEOS_HOUSEHOLD_DB_PATH',
    ),
  );
});

test('module subscribes when LIFEOS_HOUSEHOLD_DB_PATH is present', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();

  await householdCaptureRouterModule.init({
    env: {
      LIFEOS_AI_ENABLED: 'false',
      LIFEOS_HOUSEHOLD_DB_PATH: '/tmp/test-household.db',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
    eventBus: undefined,
    createLifeGraphClient: (() => {
      throw new Error('not used');
    }) as never,
    subscribe: async (topic, handler) => {
      subscribers.set(
        topic,
        handler as (event: { data: Record<string, unknown> }) => Promise<void>,
      );
    },
    publish: async (topic, data, source) => {
      return createEventEnvelope(topic, data, source ?? 'test-runtime');
    },
    log: () => {
      return;
    },
  });

  assert.equal(subscribers.has(Topics.lifeos.householdVoiceCaptureCreated), true);
});
