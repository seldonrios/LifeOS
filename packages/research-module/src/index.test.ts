import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createResearchModule } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock(options: { publishThrows?: boolean } = {}) {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];
  const appendCalls: Array<Record<string, unknown>> = [];
  const savedByThread = new Map<string, Record<string, unknown>>();

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
        async saveResearchResult(payload: Record<string, unknown>) {
          appendCalls.push(payload);
          const threadId = String(payload.threadId ?? 'thread_default');
          savedByThread.set(threadId, payload);
          return {
            id: 'research_1',
            threadId,
            query: String(payload.query ?? 'unknown'),
            summary: String(payload.summary ?? ''),
            savedAt: String(payload.savedAt ?? '2026-03-23T00:00:00.000Z'),
            conversationContext: Array.isArray(payload.conversationContext)
              ? payload.conversationContext
              : [],
            sources: Array.isArray(payload.sources) ? payload.sources : [],
          };
        },
        async getResearchThread(threadId: string) {
          const entry = savedByThread.get(threadId);
          if (!entry) {
            return null;
          }
          return {
            id: 'research_prev',
            threadId,
            query: String(entry.query ?? 'unknown'),
            summary: String(entry.summary ?? ''),
            savedAt: String(entry.savedAt ?? '2026-03-23T00:00:00.000Z'),
            conversationContext: Array.isArray(entry.conversationContext)
              ? entry.conversationContext
              : [],
            sources: Array.isArray(entry.sources) ? entry.sources : [],
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
      if (options.publishThrows) {
        throw new Error('event bus offline');
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

function mockFetchWithSummary(summary: string): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      async json() {
        return {
          message: {
            content: summary,
          },
        };
      },
    }) as Response) as typeof fetch;
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

test('research module subscribes to research voice and agent topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createResearchModule({
    fetchFn: mockFetchWithSummary('summary'),
    tts: mockTts(),
  });
  await module.init(context);

  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(topics, [Topics.agent.workRequested, Topics.lifeos.voiceIntentResearch].sort());
});

test('research voice intent persists summary and emits completion event', async () => {
  const { context, subscriptions, appendCalls, published } = createContextMock();
  const module = createResearchModule({
    fetchFn: mockFetchWithSummary('Quantum systems improved this year.'),
    now: () => new Date('2026-03-23T10:00:00.000Z'),
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentResearch,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_1',
    type: Topics.lifeos.voiceIntentResearch,
    timestamp: '2026-03-23T10:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      query: 'research quantum computing breakthroughs this year',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.query), /quantum computing breakthroughs/i);
  assert.equal(published[0]?.topic, Topics.lifeos.researchCompleted);
});

test('research module handles agent work requested intent', async () => {
  const { context, subscriptions, appendCalls } = createContextMock();
  const module = createResearchModule({
    fetchFn: mockFetchWithSummary('Agent path summary'),
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.agent.workRequested,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_agent_1',
    type: Topics.agent.workRequested,
    timestamp: '2026-03-23T11:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      intent: 'research',
      utterance: 'research local llm benchmarks',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.query), /local llm benchmarks/i);
});

test('research module falls back when summarizer errors', async () => {
  const { context, subscriptions, appendCalls, logs } = createContextMock();
  const module = createResearchModule({
    fetchFn: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentResearch,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_2',
    type: Topics.lifeos.voiceIntentResearch,
    timestamp: '2026-03-23T12:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      query: 'research edge inference',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.match(String(appendCalls[0]?.summary), /local summarizer is unavailable/i);
  assert.match(logs.join('\n'), /summarizer degraded/i);
});

test('research follow-up reuses previous thread context', async () => {
  const { context, subscriptions, appendCalls } = createContextMock();
  const fetchResponses = ['Initial summary', 'Follow-up summary'];
  const module = createResearchModule({
    fetchFn: (async () =>
      ({
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content: fetchResponses.shift() ?? 'summary',
            },
          };
        },
      }) as Response) as typeof fetch,
    tts: mockTts(),
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentResearch,
  )?.handler;
  assert.ok(handler);

  const threadId = '9f8fdb16-19c1-4f2a-b4a8-81f6d96f2f41';
  await handler?.({
    id: 'evt_voice_3',
    type: Topics.lifeos.voiceIntentResearch,
    timestamp: '2026-03-23T12:10:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      query: 'research local llm benchmarks',
      threadId,
    },
  });
  await handler?.({
    id: 'evt_voice_4',
    type: Topics.lifeos.voiceIntentResearch,
    timestamp: '2026-03-23T12:12:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      query: 'tell me more',
      threadId,
    },
  });

  assert.equal(appendCalls.length, 2);
  assert.equal(appendCalls[0]?.threadId, threadId);
  assert.equal(appendCalls[1]?.threadId, threadId);
  assert.ok(Array.isArray(appendCalls[1]?.conversationContext));
});

test('research module degrades publish failures without dropping spoken feedback', async () => {
  const { context, subscriptions, appendCalls, logs } = createContextMock({ publishThrows: true });
  const tts = createMockTtsSink();
  const module = createResearchModule({
    fetchFn: mockFetchWithSummary('Short summary'),
    tts: tts.tts,
  });
  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentResearch,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_voice_5',
    type: Topics.lifeos.voiceIntentResearch,
    timestamp: '2026-03-23T13:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      query: 'research on-device inference',
    },
  });

  assert.equal(appendCalls.length, 1);
  assert.equal(tts.spoken.length, 1);
  assert.match(logs.join('\n'), /publish degraded/i);
});
