import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/module-sdk';

import { createHouseholdChoresModule } from './index';
import { getNextDueDate } from './recurrence';
import { calculateStreak } from './streak';

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

test('getNextDueDate supports FREQ=DAILY', () => {
  const fromDate = new Date('2026-03-30T10:00:00.000Z');
  const next = getNextDueDate('FREQ=DAILY', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-03-31T10:00:00.000Z');
});

test('getNextDueDate supports FREQ=WEEKLY;BYDAY=MO', () => {
  const fromDate = new Date('2026-03-31T10:00:00.000Z');
  const next = getNextDueDate('FREQ=WEEKLY;BYDAY=MO', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-04-06T10:00:00.000Z');
});

test('getNextDueDate supports FREQ=MONTHLY', () => {
  const fromDate = new Date('2026-03-30T10:00:00.000Z');
  const next = getNextDueDate('FREQ=MONTHLY', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-04-30T10:00:00.000Z');
});

test('getNextDueDate supports weekday BYDAY and skips weekend', () => {
  const fromDate = new Date('2026-04-03T10:00:00.000Z');
  const next = getNextDueDate('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-04-06T10:00:00.000Z');
});

test('getNextDueDate returns null when UNTIL has passed', () => {
  const fromDate = new Date('2026-03-30T10:00:00.000Z');
  const next = getNextDueDate('FREQ=WEEKLY;UNTIL=20250301T000000Z', fromDate);
  assert.equal(next, null);
});

test('calculateStreak increments for consecutive recurring completions', () => {
  const runs = [
    { completed_at: '2026-03-30T10:00:00.000Z' },
    { completed_at: '2026-03-29T10:00:00.000Z' },
    { completed_at: '2026-03-28T10:00:00.000Z' },
  ];
  const streak = calculateStreak(runs, 'FREQ=DAILY');
  assert.equal(streak, 3);
});

test('calculateStreak resets to 0 when recurrence gap is missed', () => {
  const runs = [
    { completed_at: '2026-03-30T10:00:00.000Z' },
    { completed_at: '2026-03-27T10:00:00.000Z' },
  ];
  const streak = calculateStreak(runs, 'FREQ=DAILY');
  assert.equal(streak, 0);
});

test('calculateStreak returns 1 for single completion', () => {
  const runs = [{ completed_at: '2026-03-30T10:00:00.000Z' }];
  const streak = calculateStreak(runs, 'FREQ=DAILY');
  assert.equal(streak, 1);
});

test('calculateStreak returns 0 for no completions', () => {
  const streak = calculateStreak([], 'FREQ=DAILY');
  assert.equal(streak, 0);
});

test('calculateStreak for non-recurring chores equals completion count', () => {
  const runs = [
    { completed_at: '2026-03-30T10:00:00.000Z' },
    { completed_at: '2026-03-20T10:00:00.000Z' },
    { completed_at: '2026-03-10T10:00:00.000Z' },
  ];
  const streak = calculateStreak(runs, null);
  assert.equal(streak, 3);
});

test('household-chores consumes create-requested intent and persists a chore', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const created: Array<Record<string, unknown>> = [];
  const module = createHouseholdChoresModule({
    createIntentStore: async () => ({
      createRequestedChore(payload) {
        created.push(payload);
        return {
          householdId: payload.householdId,
          choreId: 'chore_1',
          choreTitle: payload.choreTitle,
          assignedToUserId: payload.actorUserId,
          dueAt: '2026-03-31T10:00:00.000Z',
        };
      },
    }),
  });

  await module.init({
    env: {
      LIFEOS_HOUSEHOLD_DB_PATH: 'memory',
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
      published.push({ topic, data });
      return createEventEnvelope(topic, data, source ?? 'test-runtime');
    },
    log: () => {
      return;
    },
  });

  const handler = subscribers.get(Topics.lifeos.householdChoreCreateRequested);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  await handler({
    data: {
      householdId: 'house_1',
      actorUserId: 'user_1',
      originalCaptureId: 'cap_1',
      text: 'someone needs to vacuum the living room',
      choreTitle: 'vacuum the living room',
    },
  });

  assert.equal(created.length, 1);
  assert.equal(created[0]?.choreTitle, 'vacuum the living room');
  assert.equal(published[0]?.topic, Topics.lifeos.householdChoreAssigned);
});

test('household-chores allows retry when first persistence attempt fails', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  let invocationCount = 0;
  const module = createHouseholdChoresModule({
    createIntentStore: async () => ({
      createRequestedChore(payload) {
        invocationCount += 1;
        if (invocationCount === 1) {
          throw new Error('temporary persistence failure');
        }
        return {
          householdId: payload.householdId,
          choreId: `chore_${invocationCount}`,
          choreTitle: payload.choreTitle,
          assignedToUserId: payload.actorUserId,
          dueAt: '2026-03-31T10:00:00.000Z',
        };
      },
    }),
  });

  await module.init({
    env: {
      LIFEOS_HOUSEHOLD_DB_PATH: 'memory',
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

  const handler = subscribers.get(Topics.lifeos.householdChoreCreateRequested);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  const payload = {
    householdId: 'house_1',
    actorUserId: 'user_1',
    originalCaptureId: 'cap_2',
    text: 'someone needs to clean kitchen counters',
    choreTitle: 'clean kitchen counters',
  };

  await assert.rejects(async () => handler({ data: payload }));
  await handler({ data: payload });

  assert.equal(invocationCount, 2);
});

test('household-chores publishes full automation-failure envelope via context.eventBus.publish', async () => {
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  const eventBusPublishes: Array<{ topic: string; event: BaseEvent<Record<string, unknown>> }> = [];
  const module = createHouseholdChoresModule({
    createIntentStore: async () => ({
      createRequestedChore() {
        throw new Error('assignee not found');
      },
    }),
  });

  await module.init({
    env: {
      LIFEOS_HOUSEHOLD_DB_PATH: 'memory',
    } as NodeJS.ProcessEnv,
    eventBus: {
      subscribe: async () => {
        return;
      },
      publish: async (topic, event) => {
        eventBusPublishes.push({
          topic,
          event: event as BaseEvent<Record<string, unknown>>,
        });
      },
    },
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

  const handler = subscribers.get(Topics.lifeos.householdChoreCreateRequested);
  assert.ok(handler);
  if (!handler) {
    return;
  }

  await assert.rejects(async () =>
    handler({
      data: {
        householdId: 'house_1',
        actorUserId: 'user_1',
        originalCaptureId: 'cap_9',
        text: 'vacuum the living room',
        choreTitle: 'vacuum the living room',
      },
    }),
  );

  assert.equal(eventBusPublishes.length, 1);
  assert.equal(eventBusPublishes[0]?.topic, Topics.lifeos.householdAutomationFailed);
  const envelope = eventBusPublishes[0]?.event;
  assert.ok(envelope);
  assert.equal(envelope?.type, Topics.lifeos.householdAutomationFailed);
  assert.equal((envelope?.data as { error_code?: string }).error_code, 'CHORE_NO_ASSIGNEE');
  assert.equal((envelope?.data as { household_id?: string }).household_id, 'house_1');
  assert.equal((envelope?.data as { actor_id?: string }).actor_id, 'user_1');
  assert.equal(
    (envelope?.metadata as { trace_id?: string } | undefined)?.trace_id,
    (envelope?.data as { trace_id?: string }).trace_id,
  );
  assert.equal('type' in ((envelope?.data as Record<string, unknown>) ?? {}), false);
});
