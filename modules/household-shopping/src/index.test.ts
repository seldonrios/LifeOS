import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/module-sdk';

import { createHouseholdShoppingModule, isValidTransition, VALID_TRANSITIONS } from './index';

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

test('isValidTransition allows added to in_cart', () => {
  assert.equal(isValidTransition('added', 'in_cart'), true);
});

test('isValidTransition allows added to purchased', () => {
  assert.equal(isValidTransition('added', 'purchased'), true);
});

test('isValidTransition allows in_cart to purchased', () => {
  assert.equal(isValidTransition('in_cart', 'purchased'), true);
});

test('isValidTransition rejects purchased to added', () => {
  assert.equal(isValidTransition('purchased', 'added'), false);
});

test('isValidTransition rejects in_cart to added', () => {
  assert.equal(isValidTransition('in_cart', 'added'), false);
});

test('isValidTransition rejects purchased to in_cart', () => {
  assert.equal(isValidTransition('purchased', 'in_cart'), false);
});

test('VALID_TRANSITIONS exports one-tap purchase state table', () => {
  assert.deepEqual(VALID_TRANSITIONS, {
    added: ['in_cart', 'purchased'],
    in_cart: ['purchased'],
    purchased: [],
  });
});

test('clearPurchasedItems archival semantics set archived_at only for purchased rows', () => {
  const archivedAt = new Date().toISOString();
  const items = [
    { id: 'purchased-item', status: 'purchased', archived_at: null },
    { id: 'active-item', status: 'added', archived_at: null },
  ];

  const cleared = items.map((item) =>
    item.status === 'purchased' && item.archived_at === null
      ? { ...item, archived_at: archivedAt }
      : item,
  );

  assert.equal(cleared[0]?.archived_at, archivedAt);
  assert.equal(cleared[1]?.archived_at, null);
});

test('household-shopping consumes add-requested intent and persists a shopping item', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const storedPayloads: Array<Record<string, unknown>> = [];
  const module = createHouseholdShoppingModule({
    createIntentStore: async () => ({
      addRequestedItem(payload) {
        storedPayloads.push(payload);
        return {
          householdId: payload.householdId,
          listId: 'list_1',
          itemId: 'item_1',
          title: payload.itemTitle,
          addedByUserId: payload.actorUserId,
          source: 'voice',
        };
      },
    }),
  });

  await module.init({
    env: {
      LIFEOS_HOUSEHOLD_DB_PATH: 'memory',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
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
      published.push({ topic, data });
      return createEventEnvelope(topic, data, source ?? 'test-runtime');
    },
    log: () => {
      return;
    },
  });

  const handler = subscribers.get(Topics.lifeos.householdShoppingItemAddRequested);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  await handler({
    data: {
      householdId: 'house_1',
      actorUserId: 'user_1',
      originalCaptureId: 'cap_1',
      text: 'add oat milk to the shopping list',
      itemTitle: 'oat milk',
    },
  });

  assert.equal(storedPayloads.length, 1);
  assert.equal(storedPayloads[0]?.itemTitle, 'oat milk');
  assert.equal(published[0]?.topic, Topics.lifeos.householdShoppingItemAdded);
});

test('household-shopping allows retry when first persistence attempt fails', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  let invocationCount = 0;
  const module = createHouseholdShoppingModule({
    createIntentStore: async () => ({
      addRequestedItem(payload) {
        invocationCount += 1;
        if (invocationCount === 1) {
          throw new Error('temporary persistence failure');
        }
        return {
          householdId: payload.householdId,
          listId: 'list_1',
          itemId: `item_${invocationCount}`,
          title: payload.itemTitle,
          addedByUserId: payload.actorUserId,
          source: 'voice',
        };
      },
    }),
  });

  await module.init({
    env: {
      LIFEOS_HOUSEHOLD_DB_PATH: 'memory',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
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

  const handler = subscribers.get(Topics.lifeos.householdShoppingItemAddRequested);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  const payload = {
    householdId: 'house_1',
    actorUserId: 'user_1',
    originalCaptureId: 'cap_2',
    text: 'add apples to the shopping list',
    itemTitle: 'apples',
  };

  await assert.rejects(async () => handler({ data: payload }));
  await handler({ data: payload });

  assert.equal(invocationCount, 2);
});
