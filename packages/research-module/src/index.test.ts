import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createResearchModule } from './index';

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
        async appendResearchResult(payload: Record<string, unknown>) {
          appendCalls.push(payload);
          return {
            id: 'research_1',
            query: String(payload.query ?? 'unknown'),
            summary: String(payload.summary ?? ''),
            savedAt: String(payload.savedAt ?? '2026-03-23T00:00:00.000Z'),
            sources: Array.isArray(payload.sources) ? payload.sources : [],
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

test('research module subscribes to research voice and agent topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createResearchModule({
    fetchFn: mockFetchWithSummary('summary'),
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
