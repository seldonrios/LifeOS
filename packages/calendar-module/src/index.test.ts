import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphDocument } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createCalendarModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock() {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];
  let savedGraph: LifeGraphDocument | null = null;

  const graph: LifeGraphDocument = {
    version: '0.1.0',
    updatedAt: '2026-03-23T00:00:00.000Z',
    plans: [],
    calendarEvents: [],
    captureEntries: [],
    plannedActions: [],
    reminderEvents: [],
  };

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
        async loadGraph() {
          return graph;
        },
        async saveGraph(next: LifeGraphDocument) {
          savedGraph = next;
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
    log: (message: string) => {
      logs.push(message);
    },
  };

  return {
    context,
    subscriptions,
    published,
    logs,
    getSavedGraph: () => savedGraph,
  };
}

test('calendar module subscribes to voice intent and tick topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createCalendarModule();
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(
    topics,
    [Topics.lifeos.tickOverdue, Topics.lifeos.voiceIntentCalendarAdd].sort(),
  );
});

test('calendar module persists calendar events and emits calendar event added signal', async () => {
  const { context, subscriptions, published, getSavedGraph } = createContextMock();
  const module = createCalendarModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentCalendarAdd,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_1',
    type: Topics.lifeos.voiceIntentCalendarAdd,
    timestamp: '2026-03-23T10:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      id: '2d50a9ec-4550-4db0-bec5-f3b44fd0f5b5',
      title: 'Team Meeting',
      start: '2026-03-24T19:00:00.000Z',
      end: '2026-03-24T20:00:00.000Z',
      status: 'confirmed',
    },
  });

  const saved = getSavedGraph();
  assert.ok(saved);
  assert.equal(saved?.calendarEvents?.length, 1);
  assert.equal(saved?.calendarEvents?.[0]?.title, 'Team Meeting');
  assert.equal(published[0]?.topic, Topics.lifeos.calendarEventAdded);
});

test('calendar module normalizes invalid end time and oversized fields', async () => {
  const { context, subscriptions, getSavedGraph } = createContextMock();
  const module = createCalendarModule();
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentCalendarAdd,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_2',
    type: Topics.lifeos.voiceIntentCalendarAdd,
    timestamp: '2026-03-23T10:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      id: '2d50a9ec-4550-4db0-bec5-f3b44fd0f5b6',
      title: 'A'.repeat(400),
      start: '2026-03-24T20:00:00.000Z',
      end: '2026-03-24T19:00:00.000Z',
      location: 'L'.repeat(400),
      attendees: Array.from({ length: 30 }, (_, i) => `person-${i}`),
    },
  });

  const saved = getSavedGraph();
  const calendarEvent = saved?.calendarEvents?.[0];
  assert.ok(calendarEvent);
  assert.ok((calendarEvent?.title.length ?? 0) <= 200);
  assert.ok((calendarEvent?.location?.length ?? 0) <= 200);
  assert.ok((calendarEvent?.attendees?.length ?? 0) <= 20);
  assert.ok(
    new Date(String(calendarEvent?.end)).getTime() >
      new Date(String(calendarEvent?.start)).getTime(),
  );
});

test('calendar module swallows handler errors and logs degradation', async () => {
  const { context, subscriptions, logs } = createContextMock();
  context.createLifeGraphClient = () =>
    ({
      async loadGraph() {
        throw new Error('graph unavailable');
      },
    }) as never;

  const module = createCalendarModule();
  await module.init(context);
  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentCalendarAdd,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_3',
    type: Topics.lifeos.voiceIntentCalendarAdd,
    timestamp: '2026-03-23T10:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      id: '2d50a9ec-4550-4db0-bec5-f3b44fd0f5b7',
      title: 'Team sync',
      start: '2026-03-24T19:00:00.000Z',
      end: '2026-03-24T20:00:00.000Z',
    },
  });

  assert.match(logs.join('\n'), /voice intent degraded/i);
});
