import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createWeatherModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock() {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
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
        async appendWeatherSnapshot(payload: Record<string, unknown>) {
          appendCalls.push(payload);
          return {
            id: 'weather_1',
            location: String(payload.location ?? 'current'),
            forecast: String(payload.forecast ?? ''),
            timestamp: String(payload.timestamp ?? '2026-03-23T00:00:00.000Z'),
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
    log() {
      return;
    },
  };

  return {
    context,
    subscriptions,
    published,
    appendCalls,
  };
}

function createJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  } as Response;
}

test('weather module subscribes to weather voice and agent topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createWeatherModule({
    fetchFn: (async () => createJsonResponse({})) as typeof fetch,
  });
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(topics, [Topics.agent.workRequested, Topics.lifeos.voiceIntentWeather].sort());
});

test('weather voice intent fetches and stores forecast', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock();
  const fetchResponses = [
    createJsonResponse({
      results: [{ name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -0.12 }],
    }),
    createJsonResponse({
      current: { temperature_2m: 11.2, weather_code: 2, wind_speed_10m: 20.1 },
      daily: { temperature_2m_max: [15], temperature_2m_min: [7], weather_code: [3] },
    }),
  ];
  const module = createWeatherModule({
    fetchFn: (async () => fetchResponses.shift() as Response) as typeof fetch,
    now: () => new Date('2026-03-23T10:00:00.000Z'),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentWeather,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_weather_1',
    type: Topics.lifeos.voiceIntentWeather,
    timestamp: '2026-03-23T10:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      location: 'London',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.location), /London/);
  assert.match(String(appendCalls[0]?.forecast), /Currently/i);
  assert.equal(published[0]?.topic, Topics.lifeos.weatherSnapshotCaptured);
});

test('weather module handles weather intent from agent work requests', async () => {
  const { context, subscriptions, appendCalls } = createContextMock();
  const fetchResponses = [
    createJsonResponse({
      results: [{ name: 'Boston', country: 'United States', latitude: 42.36, longitude: -71.06 }],
    }),
    createJsonResponse({
      current: { temperature_2m: 8, weather_code: 1, wind_speed_10m: 10 },
      daily: { temperature_2m_max: [12], temperature_2m_min: [3], weather_code: [1] },
    }),
  ];
  const module = createWeatherModule({
    fetchFn: (async () => fetchResponses.shift() as Response) as typeof fetch,
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.agent.workRequested,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_agent_weather_1',
    type: Topics.agent.workRequested,
    timestamp: '2026-03-23T11:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      intent: 'weather',
      payload: { location: 'Boston' },
      utterance: 'what is the weather in Boston',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.location), /Boston/);
});

test('weather module falls back to degraded snapshot when fetch fails', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock();
  const module = createWeatherModule({
    fetchFn: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentWeather,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_weather_2',
    type: Topics.lifeos.voiceIntentWeather,
    timestamp: '2026-03-23T11:30:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: { location: 'Paris' },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.forecast), /temporarily unavailable/i);
  assert.equal(published[0]?.data.degraded, true);
});
