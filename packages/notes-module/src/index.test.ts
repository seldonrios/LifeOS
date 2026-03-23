import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createNotesModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock() {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];
  const appendCalls: Array<Record<string, unknown>> = [];

  const context: ModuleRuntimeContext = {
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
        return 'unknown' as const;
      },
    },
    createLifeGraphClient: () =>
      ({
        async appendNote(payload: Record<string, unknown>) {
          appendCalls.push(payload);
          return {
            id: 'note_1',
            title: String(payload.title ?? 'Untitled'),
            content: String(payload.content ?? ''),
            tags: Array.isArray(payload.tags) ? payload.tags : [],
            voiceTriggered: true,
            createdAt: '2026-03-23T00:00:00.000Z',
          };
        },
      }) as never,
    subscribe: async <T>(
      topic: string,
      handler: (event: BaseEvent<T>) => Promise<void> | void,
    ): Promise<void> => {
      subscriptions.push({
        topic,
        handler: handler as (event: BaseEvent<unknown>) => Promise<void>,
      });
    },
    publish: async <T extends Record<string, unknown>>(topic: string, data: T) => {
      published.push({ topic, data });
      return {
        id: 'evt_1',
        type: topic,
        timestamp: '2026-03-23T00:00:00.000Z',
        source: 'test',
        version: '0.1.0',
        data,
      };
    },
    log: (line: string) => {
      logs.push(line);
    },
  };

  return {
    context,
    subscriptions,
    published,
    logs,
    appendCalls,
  };
}

test('notes module subscribes to note voice and agent topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createNotesModule();
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(topics, [Topics.agent.workRequested, Topics.lifeos.voiceIntentNoteAdd].sort());
});

test('notes module saves note from voice intent and emits note-added event', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock();
  const module = createNotesModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNoteAdd,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_1',
    type: Topics.lifeos.voiceIntentNoteAdd,
    timestamp: '2026-03-23T12:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      utterance: 'note that the team prefers async updates',
      tags: ['team', 'process'],
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.content), /team prefers async updates/i);
  assert.equal(published[0]?.topic, Topics.lifeos.noteAdded);
});

test('notes module handles note intent from agent work requests', async () => {
  const { context, subscriptions, appendCalls } = createContextMock();
  const module = createNotesModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.agent.workRequested,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_agent_1',
    type: Topics.agent.workRequested,
    timestamp: '2026-03-23T12:05:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      intent: 'note',
      payload: {
        content: 'Remember to review draft on Friday',
      },
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.content), /review draft on friday/i);
});

test('notes module logs and skips empty payloads', async () => {
  const { context, subscriptions, appendCalls, logs } = createContextMock();
  const module = createNotesModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNoteAdd,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_2',
    type: Topics.lifeos.voiceIntentNoteAdd,
    timestamp: '2026-03-23T12:10:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {},
  });

  assert.equal(appendCalls.length, 0);
  assert.match(logs.join('\n'), /Ignored empty note payload/i);
});
