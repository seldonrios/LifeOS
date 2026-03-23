import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { Topics, createEventBusClient, type BaseEvent } from '@lifeos/event-bus';

import { SyncEngine } from './sync-engine';

const fallbackEnv = {
  LIFEOS_NATS_URL: 'nats://127.0.0.1:1',
};

function createEvent<T extends Record<string, unknown>>(
  type: string,
  data: T,
  source: string,
): BaseEvent<T> {
  return {
    id: `${source}-${type}-evt`,
    type,
    timestamp: '2026-03-23T12:00:00.000Z',
    source,
    version: '0.1.0',
    data,
  };
}

test('sync engine broadcasts delta and replays to remote device once', async () => {
  const eventBusA = createEventBusClient({
    env: fallbackEnv,
    name: 'sync-test-a',
    timeoutMs: 50,
    maxReconnectAttempts: 0,
  });
  const eventBusB = createEventBusClient({
    env: fallbackEnv,
    name: 'sync-test-b',
    timeoutMs: 50,
    maxReconnectAttempts: 0,
  });
  const replayedEvents: BaseEvent<Record<string, unknown>>[] = [];
  await eventBusB.subscribe<Record<string, unknown>>(
    Topics.lifeos.voiceIntentTaskAdd,
    async (event) => {
      if (event.metadata?.syncReplayed === true) {
        replayedEvents.push(event as BaseEvent<Record<string, unknown>>);
      }
    },
  );

  const engineA = new SyncEngine({
    eventBus: eventBusA,
    deviceId: 'device-a',
    deviceName: 'Laptop',
    client: {
      async mergeDelta() {
        return { merged: true, conflicts: [] };
      },
    },
    shouldBroadcast: (event) => event.source === 'device-a',
  });
  const engineB = new SyncEngine({
    eventBus: eventBusB,
    deviceId: 'device-b',
    deviceName: 'Phone',
    client: {
      async mergeDelta() {
        return { merged: true, conflicts: [] };
      },
    },
    shouldBroadcast: (event) => event.source === 'device-b',
  });

  await engineA.start();
  await engineB.start();

  await eventBusA.publish(
    Topics.lifeos.voiceIntentTaskAdd,
    createEvent(
      Topics.lifeos.voiceIntentTaskAdd,
      {
        title: 'Buy milk',
      },
      'device-a',
    ),
  );

  await delay(25);

  assert.equal(replayedEvents.length, 1);
  const firstReplay = replayedEvents[0];
  assert.ok(firstReplay);
  assert.equal(firstReplay.metadata?.syncOriginDeviceId, 'device-a');
  assert.equal(engineA.getStats().deltasBroadcast, 1);
  assert.equal(engineB.getStats().deltasReceived, 1);
  assert.ok(engineB.getKnownDevices().some((entry) => entry.deviceId === 'device-a'));

  await engineA.close();
  await engineB.close();
  await eventBusA.close();
  await eventBusB.close();
});

test('sync engine ignores own delta payloads', async () => {
  const eventBus = createEventBusClient({
    env: fallbackEnv,
    name: 'sync-test-self',
    timeoutMs: 50,
    maxReconnectAttempts: 0,
  });
  const engine = new SyncEngine({
    eventBus,
    deviceId: 'device-self',
    deviceName: 'Tablet',
    client: {
      async mergeDelta() {
        return { merged: true, conflicts: [] };
      },
    },
  });
  await engine.start();

  const accepted = await engine.handleIncomingDelta({
    deltaId: 'delta-self',
    deviceId: 'device-self',
    deviceName: 'Tablet',
    timestamp: '2026-03-23T12:00:00.000Z',
    version: '0.1.0',
    payload: createEvent(Topics.lifeos.noteAdded, { title: 'x' }, 'device-self'),
  });

  assert.equal(accepted, false);
  assert.equal(engine.getStats().deltasReceived, 0);

  await engine.close();
  await eventBus.close();
});

test('sync engine calls mergeDelta when receiving remote delta', async () => {
  const eventBus = createEventBusClient({
    env: fallbackEnv,
    name: 'sync-test-merge',
    timeoutMs: 50,
    maxReconnectAttempts: 0,
  });
  const mergeCalls: unknown[] = [];
  const engine = new SyncEngine({
    eventBus,
    deviceId: 'device-local',
    deviceName: 'Laptop',
    client: {
      async mergeDelta(deltaPayload: unknown) {
        mergeCalls.push(deltaPayload);
        return { merged: true, conflicts: [] };
      },
    },
  });
  await engine.start();

  const accepted = await engine.handleIncomingDelta({
    deltaId: 'delta-remote-1',
    deviceId: 'device-remote',
    deviceName: 'Phone',
    timestamp: '2026-03-23T12:00:00.000Z',
    version: '0.1.0',
    payload: createEvent(Topics.lifeos.noteAdded, { id: 'note_1', title: 'x' }, 'device-remote'),
  });

  assert.equal(accepted, true);
  assert.equal(mergeCalls.length, 1);
  assert.equal(engine.getStats().deltasReceived, 1);

  await engine.close();
  await eventBus.close();
});

test('sync engine publishes sync conflict audit event when merge reports conflicts', async () => {
  const eventBus = createEventBusClient({
    env: fallbackEnv,
    name: 'sync-test-conflict',
    timeoutMs: 50,
    maxReconnectAttempts: 0,
  });
  const conflictEvents: BaseEvent<Record<string, unknown>>[] = [];
  await eventBus.subscribe<Record<string, unknown>>(
    Topics.lifeos.syncConflictDetected,
    async (event) => {
      conflictEvents.push(event as BaseEvent<Record<string, unknown>>);
    },
  );

  const engine = new SyncEngine({
    eventBus,
    deviceId: 'device-local',
    deviceName: 'Laptop',
    client: {
      async mergeDelta() {
        return {
          merged: true,
          conflicts: [
            {
              collection: 'notes',
              id: 'note_older',
              reason: 'incoming_older',
            },
          ],
        };
      },
    },
  });
  await engine.start();

  const accepted = await engine.handleIncomingDelta({
    deltaId: 'delta-remote-conflict',
    deviceId: 'device-remote',
    deviceName: 'Phone',
    timestamp: '2026-03-23T12:00:00.000Z',
    version: '0.1.0',
    payload: createEvent(
      Topics.lifeos.noteAdded,
      { id: 'note_older', title: 'x' },
      'device-remote',
    ),
  });

  assert.equal(accepted, true);
  assert.equal(conflictEvents.length, 1);
  assert.equal(conflictEvents[0]?.type, Topics.lifeos.syncConflictDetected);
  assert.equal(conflictEvents[0]?.data.conflictCount, 1);

  await engine.close();
  await eventBus.close();
});
