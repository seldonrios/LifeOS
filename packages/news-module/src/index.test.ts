import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createNewsModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock(env: NodeJS.ProcessEnv = {}) {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const appendCalls: Array<Record<string, unknown>> = [];

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
    LIFEOS_NEWS_USE_OLLAMA: '0',
    LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
  });
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(topics, [Topics.agent.workRequested, Topics.lifeos.voiceIntentNews].sort());
});

test('news module persists digest from voice intent and emits ready event', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock({
    LIFEOS_NEWS_USE_OLLAMA: '0',
    LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
    now: () => new Date('2026-03-23T12:00:00.000Z'),
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
    LIFEOS_NEWS_USE_OLLAMA: '0',
    LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
  });
  const module = createNewsModule({
    fetchFn: (async () => createTextResponse(RSS_FEED)) as typeof fetch,
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
    LIFEOS_NEWS_USE_OLLAMA: '0',
    LIFEOS_NEWS_FEEDS: 'https://example.com/feed.xml',
  });
  const module = createNewsModule({
    fetchFn: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
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

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.summary), /temporarily unavailable/i);
  assert.equal(published[0]?.data.degraded, true);
});
