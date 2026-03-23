import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createNewsModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock(
  options: {
    env?: NodeJS.ProcessEnv;
    latestNews?: {
      id: string;
      title: string;
      summary: string;
      sources: string[];
      read: boolean;
    } | null;
    strictTopicLookup?: boolean;
    publishThrows?: boolean;
  } = {},
) {
  const env = options.env ?? {};
  const latestNews = options.latestNews ?? null;
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const appendCalls: Array<Record<string, unknown>> = [];
  const logs: string[] = [];

  const context: ModuleRuntimeContext = {
    env,
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
        async appendNewsDigest(payload: Record<string, unknown>) {
          appendCalls.push(payload);
          return {
            id: 'news_1',
            title: String(payload.title ?? ''),
            summary: String(payload.summary ?? ''),
            sources: Array.isArray(payload.sources) ? payload.sources : [],
            read: false,
          };
        },
        async getLatestNewsDigest(topic?: string) {
          if (!latestNews) {
            return null;
          }
          if (!options.strictTopicLookup || !topic) {
            return latestNews;
          }
          const haystack = `${latestNews.title} ${latestNews.summary}`.toLowerCase();
          return haystack.includes(topic.toLowerCase()) ? latestNews : null;
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
      if (options.publishThrows) {
        throw new Error('event bus unavailable');
      }
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

function createMockTtsSink() {
  const spoken: string[] = [];
  return {
    tts: {
      async speak(text: string) {
        spoken.push(text);
      },
    },
    spoken,
  };
}

function createTextResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    async text() {
      return body;
    },
  } as Response;
}

const RSS_FEED = `<?xml version="1.0"?>
<rss><channel>
  <item><title>Headline one</title><link>https://example.com/1</link><description>One</description></item>
  <item><title>Headline two</title><link>https://example.com/2</link><description>Two</description></item>
</channel></rss>`;

test('news module subscribes to news voice and agent topics', async () => {
  const { context, subscriptions } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(topics, [Topics.agent.workRequested, Topics.lifeos.voiceIntentNews].sort());
});

test('news module persists digest from voice intent and emits ready event', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
    now: () => new Date('2026-03-23T12:00:00.000Z'),
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNews,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_news_1',
    type: Topics.lifeos.voiceIntentNews,
    timestamp: '2026-03-23T12:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      topic: 'tech',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.title), /Top tech news/i);
  assert.match(String(appendCalls[0]?.summary), /Headline one/i);
  assert.equal(published[0]?.topic, Topics.lifeos.newsDigestReady);
});

test('news module handles news intent from agent work requests', async () => {
  const { context, subscriptions, appendCalls } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.agent.workRequested,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_news_agent_1',
    type: Topics.agent.workRequested,
    timestamp: '2026-03-23T12:05:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      intent: 'news',
      payload: { topic: 'world' },
      utterance: 'top news today',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.title), /Top world news/i);
});

test('news module falls back to degraded digest when fetch fails', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
  });
  const module = createNewsModule({
    fetchFn: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNews,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_news_2',
    type: Topics.lifeos.voiceIntentNews,
    timestamp: '2026-03-23T12:10:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      topic: 'tech',
    },
  });

  assert.equal(appendCalls.length, 0);
  assert.match(String(published[0]?.data.summary), /No internet/i);
  assert.equal(published[0]?.data.degraded, true);
});

test('news module uses latest persisted digest when offline', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
    latestNews: {
      id: 'news_latest_1',
      title: 'Top tech news',
      summary: 'Cached tech summary.',
      sources: ['https://example.com/cached'],
      read: false,
    },
  });
  const module = createNewsModule({
    fetchFn: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNews,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_news_3',
    type: Topics.lifeos.voiceIntentNews,
    timestamp: '2026-03-23T13:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      topic: 'tech',
    },
  });

  assert.equal(appendCalls.length, 0);
  assert.match(String(published[0]?.data.summary), /Cached tech summary/);
  assert.equal(published[0]?.data.degraded, true);
});

test('news module falls back to global digest when topic-specific digest is missing', async () => {
  const { context, subscriptions, published } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
    latestNews: {
      id: 'news_latest_2',
      title: 'Top world news',
      summary: 'Cached world summary.',
      sources: ['https://example.com/world'],
      read: false,
    },
    strictTopicLookup: true,
  });
  const module = createNewsModule({
    fetchFn: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNews,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_news_4',
    type: Topics.lifeos.voiceIntentNews,
    timestamp: '2026-03-23T13:05:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      topic: 'tech',
    },
  });

  assert.match(String(published[0]?.data.summary), /Cached world summary/);
  assert.equal(published[0]?.data.degraded, true);
});

test('news module degrades publish failures without dropping spoken feedback', async () => {
  const tts = createMockTtsSink();
  const { context, subscriptions, logs } = createContextMock({
    env: {
      LIFEOS_NEWS_USE_OLLAMA: '0',
      LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
    },
    publishThrows: true,
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
    tts: tts.tts,
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNews,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_news_5',
    type: Topics.lifeos.voiceIntentNews,
    timestamp: '2026-03-23T13:10:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      topic: 'tech',
    },
  });

  assert.equal(tts.spoken.length, 1);
  assert.match(logs.join('\n'), /publish degraded/i);
});
