import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';

import { VoiceSessionManager } from './voice-session';

class FakeEventBus implements ManagedEventBus {
  public readonly published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    this.published.push({ topic, event: event as BaseEvent<unknown> });
  }

  async subscribe<T>(_topic: string, _handler: (event: BaseEvent<T>) => Promise<void>): Promise<void> {
    void _topic;
    void _handler;
    return;
  }

  async close(): Promise<void> {
    return;
  }

  getTransport() {
    return 'nats' as const;
  }

  getConnectionHealth() {
    return 'connected' as const;
  }
}

test('VoiceSessionManager publishes lifecycle and household capture events on success', async () => {
  const eventBus = new FakeEventBus();
  const manager = new VoiceSessionManager({
    eventBus,
    transcriptionAdapter: {
      transcribe: async () => 'add oat milk to the shopping list',
    },
    now: () => new Date('2026-03-31T10:00:00.000Z'),
    idFactory: (() => {
      let counter = 0;
      return () => `voice-${++counter}`;
    })(),
  });

  const result = await manager.startSession({
    householdId: 'household-1',
    surfaceId: 'surface-kitchen-1',
    actorUserId: 'user-1',
    audioBuffer: Buffer.from([0x00, 0x00, 0xff, 0x7f]),
    quietHoursActive: false,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.session.targetHint, 'shopping');
  assert.equal(eventBus.published.length, 3);
  assert.deepEqual(
    eventBus.published.map((entry) => entry.topic),
    [
      Topics.lifeos.homeNodeVoiceSessionStarted,
      Topics.lifeos.householdVoiceCaptureCreated,
      Topics.lifeos.homeNodeVoiceSessionCompleted,
    ],
  );
  assert.equal(eventBus.published[1]?.event.metadata?.actor_id, 'surface-kitchen-1');
});

test('VoiceSessionManager publishes failed lifecycle events during quiet hours', async () => {
  const eventBus = new FakeEventBus();
  const manager = new VoiceSessionManager({
    eventBus,
    transcriptionAdapter: {
      transcribe: async () => 'unused',
    },
    now: () => new Date('2026-03-31T10:00:00.000Z'),
    idFactory: (() => {
      let counter = 0;
      return () => `quiet-${++counter}`;
    })(),
  });

  const result = await manager.startSession({
    householdId: 'household-1',
    surfaceId: 'surface-hallway-1',
    actorUserId: 'user-1',
    audioBuffer: Buffer.from([0x00]),
    quietHoursActive: true,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'quiet_hours');
  assert.deepEqual(
    eventBus.published.map((entry) => entry.topic),
    [Topics.lifeos.homeNodeVoiceSessionStarted, Topics.lifeos.homeNodeVoiceSessionFailed],
  );
});

test('VoiceSessionManager expires active sessions and publishes failed lifecycle events', async () => {
  const eventBus = new FakeEventBus();
  let callCount = 0;
  let markTranscriptionStarted: (() => void) | undefined;
  const transcriptionStarted = new Promise<void>((resolve) => {
    markTranscriptionStarted = resolve;
  });
  const manager = new VoiceSessionManager({
    eventBus,
    transcriptionAdapter: {
      transcribe: async () => {
        callCount += 1;
        markTranscriptionStarted?.();
        return new Promise<string>(() => undefined);
      },
    },
    now: (() => {
      let current = new Date('2026-03-31T10:00:00.000Z');
      return () => current;
    })(),
    idFactory: (() => {
      let counter = 0;
      return () => `exp-${++counter}`;
    })(),
  });

  const sessionPromise = manager.startSession({
    householdId: 'household-1',
    surfaceId: 'surface-kitchen-1',
    actorUserId: 'user-1',
    audioBuffer: Buffer.from([0x00, 0x01]),
    quietHoursActive: false,
  });

  await transcriptionStarted;
  assert.equal(callCount, 1);
  const expired = await manager.expireSessions(new Date('2026-03-31T10:02:00.000Z'));

  assert.equal(expired.length, 1);
  assert.equal(manager.getSession(expired[0]!)?.failureReason, 'expired');
  assert.equal(eventBus.published[1]?.topic, Topics.lifeos.homeNodeVoiceSessionFailed);
  void sessionPromise;
});

test('VoiceSessionManager does not publish completion after session is expired mid-transcription', async () => {
  const eventBus = new FakeEventBus();
  let resolveTranscription: ((value: string) => void) | undefined;
  let markTranscriptionStarted: (() => void) | undefined;
  const transcriptionStarted = new Promise<void>((resolve) => {
    markTranscriptionStarted = resolve;
  });

  const manager = new VoiceSessionManager({
    eventBus,
    transcriptionAdapter: {
      transcribe: async () => {
        markTranscriptionStarted?.();
        return new Promise<string>((resolve) => {
          resolveTranscription = resolve;
        });
      },
    },
    now: () => new Date('2026-03-31T10:00:00.000Z'),
    idFactory: (() => {
      let counter = 0;
      return () => `mid-exp-${++counter}`;
    })(),
  });

  const sessionPromise = manager.startSession({
    householdId: 'household-1',
    surfaceId: 'surface-kitchen-1',
    actorUserId: 'user-1',
    audioBuffer: Buffer.from([0x10, 0x20]),
    quietHoursActive: false,
  });

  await transcriptionStarted;
  const expired = await manager.expireSessions(new Date('2026-03-31T10:02:00.000Z'));
  assert.equal(expired.length, 1);

  resolveTranscription?.('buy oat milk');
  const result = await sessionPromise;

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'expired');
  assert.deepEqual(
    eventBus.published.map((entry) => entry.topic),
    [Topics.lifeos.homeNodeVoiceSessionStarted, Topics.lifeos.homeNodeVoiceSessionFailed],
  );
});