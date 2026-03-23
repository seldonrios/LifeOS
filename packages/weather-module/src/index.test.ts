import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createWeatherModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock(
  options: {
    latestWeather?: {
      id: string;
      location: string;
      forecast: string;
      timestamp: string;
    } | null;
    strictLocationLookup?: boolean;
    latestLookupThrows?: boolean;
    createClientThrows?: boolean;
  } = {},
) {
  const latestWeather = options.latestWeather ?? null;
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const appendCalls: Array<Record<string, unknown>> = [];
  const logs: string[] = [];

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
    createLifeGraphClient: () => {
      if (options.createClientThrows) {
        throw new Error('graph unavailable');
      }
      return {
        async appendWeatherSnapshot(payload: Record<string, unknown>) {
          appendCalls.push(payload);
          return {
            id: 'weather_1',
            location: String(payload.location ?? 'current'),
            forecast: String(payload.forecast ?? ''),
            timestamp: String(payload.timestamp ?? '2026-03-23T00:00:00.000Z'),
          };
        },
        async getLatestWeatherSnapshot(location?: string) {
          if (options.latestLookupThrows) {
            throw new Error('graph read failed');
          }
          if (!latestWeather) {
            return null;
          }
          if (!options.strictLocationLookup || !location) {
            return latestWeather;
          }
          return latestWeather.location.toLowerCase().includes(location.toLowerCase())
            ? latestWeather
            : null;
        },
      } as never;
    },
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
    log(line: string) {
      logs.push(line);
    },
  };

  return {
    context,
    subscriptions,
    published,
    appendCalls,
    logs,
  };
}

function mockTts() {
  return {
    async speak() {
      return;
    },
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
    tts: mockTts(),
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
    tts: mockTts(),
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
  assert.match(String(appendCalls[0]?.forecast), /currently/i);
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
    tts: mockTts(),
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
    tts: mockTts(),
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

  assert.equal(appendCalls.length, 0);
  assert.match(String(published[0]?.data.forecast), /offline mode/i);
  assert.equal(published[0]?.data.degraded, true);
});

test('weather module uses latest persisted forecast when offline', async () => {
  const { context, subscriptions, published } = createContextMock({
    latestWeather: {
      id: 'weather_latest_1',
      location: 'Paris',
      forecast: 'Paris: clear and cool.',
      timestamp: '2026-03-23T09:00:00.000Z',
    },
  });
  const module = createWeatherModule({
    fetchFn: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentWeather,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_weather_3',
    type: Topics.lifeos.voiceIntentWeather,
    timestamp: '2026-03-23T12:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: { location: 'Paris' },
  });

  assert.match(String(published[0]?.data.forecast), /Paris: clear and cool/);
  assert.equal(published[0]?.data.degraded, true);
});

test('weather module falls back to global persisted forecast for current location', async () => {
  const { context, subscriptions, published } = createContextMock({
    latestWeather: {
      id: 'weather_latest_2',
      location: 'Boston, United States',
      forecast: 'Boston: cloudy and mild.',
      timestamp: '2026-03-23T08:00:00.000Z',
    },
    strictLocationLookup: true,
  });
  const module = createWeatherModule({
    fetchFn: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentWeather,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_weather_4',
    type: Topics.lifeos.voiceIntentWeather,
    timestamp: '2026-03-23T12:30:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: { location: 'current' },
  });

  assert.match(String(published[0]?.data.forecast), /Boston: cloudy and mild/);
  assert.equal(published[0]?.data.degraded, true);
});

test('weather module logs and degrades when graph client creation fails', async () => {
  const { context, subscriptions, logs } = createContextMock({
    createClientThrows: true,
  });
  const module = createWeatherModule({
    fetchFn: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentWeather,
  )?.handler;
  assert.ok(handler);
  await assert.doesNotReject(async () => {
    await handler?.({
      id: 'evt_weather_5',
      type: Topics.lifeos.voiceIntentWeather,
      timestamp: '2026-03-23T12:40:00.000Z',
      source: 'voice-core',
      version: '0.1.0',
      data: { location: 'current' },
    });
  });
  assert.match(logs.join('\n'), /voice intent degraded/i);
});
