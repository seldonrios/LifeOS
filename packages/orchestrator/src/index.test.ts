import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createOrchestratorModule, type OrchestratorDecision } from './index';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock() {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];
  const memoryEntries: Array<Record<string, unknown>> = [];
  const appliedUpdates: Array<Record<string, unknown>> = [];

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
          return {
            version: '0.1.0',
            updatedAt: '2026-03-25T08:00:00.000Z',
            plans: [
              {
                id: 'goal_1',
                title: 'Board prep',
                description: 'Prepare notes',
                deadline: null,
                createdAt: '2026-03-25T07:30:00.000Z',
                tasks: [{ id: 'task_1', title: 'Draft deck', status: 'todo', priority: 4 }],
              },
            ],
            calendarEvents: [
              {
                id: 'event_1',
                title: 'Grok planning meeting',
                start: '2026-03-25T14:00:00.000Z',
                end: '2026-03-25T14:30:00.000Z',
                status: 'confirmed',
              },
            ],
            researchResults: [
              {
                id: 'res_1',
                threadId: 'thread_1',
                query: 'Grok 4 roadmap',
                summary: 'Research summary',
                savedAt: '2026-03-25T07:45:00.000Z',
              },
            ],
            memory: [],
          };
        },
        async getLatestWeatherSnapshot() {
          return {
            id: 'weather_1',
            location: 'Boston',
            forecast: 'Light rain expected in the afternoon.',
            timestamp: '2026-03-25T07:00:00.000Z',
          };
        },
        async getLatestNewsDigest() {
          return {
            id: 'news_1',
            title: 'Top tech news',
            summary: 'AI chip demand keeps rising.',
            sources: ['https://example.com/news'],
            read: false,
          };
        },
        async appendMemoryEntry(entry: Record<string, unknown>) {
          memoryEntries.push(entry);
          return {
            ...entry,
            id: 'memory_1',
            timestamp: '2026-03-25T08:00:00.000Z',
            embedding: Array.from({ length: 384 }, () => 0),
            relatedTo: Array.isArray(entry.relatedTo) ? entry.relatedTo : [],
          };
        },
        async searchMemory() {
          return [];
        },
        async applyUpdates(updates: Record<string, unknown>[]) {
          appliedUpdates.push(...updates);
          return;
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
        timestamp: '2026-03-25T08:00:00.000Z',
        source: 'test',
        version: '0.1.0',
        data,
      };
    },
    log(line: string) {
      logs.push(line);
    },
  };

  return { context, subscriptions, published, logs, memoryEntries, appliedUpdates };
}

function mockTtsSink() {
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

function getHandler(
  subscriptions: CapturedSubscription[],
  topic: string,
): ((event: BaseEvent<unknown>) => Promise<void>) | undefined {
  return subscriptions.find((entry) => entry.topic === topic)?.handler;
}

test('orchestrator subscribes to lifeos wildcard events', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createOrchestratorModule({
    tts: mockTtsSink().tts,
    decisionEngine: async () => ({ action: 'nothing' }),
  });

  await module.init(context);
  assert.deepEqual(
    subscriptions.map((entry) => entry.topic),
    [Topics.lifeos.syncDelta, 'lifeos.>'],
  );
});

test('orchestrator re-evaluates when sync delta is received', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    decisionEngine: async ({ event }) => {
      if (event.type === 'sync_received') {
        return {
          action: 'speak',
          message: 'Sync update received. I rechecked your priorities.',
        };
      }
      return { action: 'nothing' };
    },
  });

  await module.init(context);
  const handler = getHandler(subscriptions, Topics.lifeos.syncDelta);
  assert.ok(handler);

  await handler?.({
    id: 'evt_sync',
    type: Topics.lifeos.syncDelta,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'sync-core',
    version: '0.1.0',
    data: {
      deltaId: 'delta_1',
      deviceId: 'device-a',
      deviceName: 'Laptop',
      timestamp: '2026-03-25T08:00:00.000Z',
      payload: {
        id: 'evt_remote',
        type: Topics.lifeos.noteAdded,
        timestamp: '2026-03-25T08:00:00.000Z',
        source: 'notes-module',
        version: '0.1.0',
        data: {
          title: 'remote note',
        },
      },
      version: '0.1.0',
    },
  });

  assert.equal(sink.spoken.length, 1);
  const suggestion = published.find(
    (entry) => entry.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(suggestion);
});

test('orchestrator speaks sync conflict notices when preference is enabled', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    personality: {
      async loadProfile() {
        return {
          communicationStyle: 'concise and direct',
          priorities: ['health'],
          quirks: [],
          preferences: {
            sync_conflict_voice_alerts: 'true',
          },
        };
      },
      async updatePreference() {
        return null;
      },
    },
    decisionEngine: async () => ({ action: 'nothing' }),
  });

  await module.init(context);
  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);

  await handler?.({
    id: 'evt_sync_conflict',
    type: Topics.lifeos.syncConflictDetected,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'sync-core',
    version: '0.1.0',
    data: {
      conflictCount: 2,
      deviceId: 'device-a',
      conflicts: [
        {
          collection: 'notes',
          id: 'note_1',
          reason: 'incoming_older',
        },
      ],
    },
  });

  assert.equal(sink.spoken.length, 1);
  assert.match(sink.spoken[0] ?? '', /sync conflict/i);
  assert.ok(published.some((entry) => entry.topic === Topics.lifeos.orchestratorSuggestion));
});

test('orchestrator keeps sync conflict notices silent by default', async () => {
  const { context, subscriptions } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    decisionEngine: async () => ({ action: 'nothing' }),
  });

  await module.init(context);
  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);

  await handler?.({
    id: 'evt_sync_conflict_silent',
    type: Topics.lifeos.syncConflictDetected,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'sync-core',
    version: '0.1.0',
    data: {
      conflictCount: 1,
      deviceId: 'device-b',
    },
  });

  assert.equal(sink.spoken.length, 0);
});

test('orchestrator handles explicit briefing intent and speaks summary', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    now: () => new Date('2026-03-25T08:00:00.000Z'),
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_briefing',
    type: Topics.lifeos.voiceIntentBriefing,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      requestedAt: '2026-03-25T08:00:00.000Z',
    },
  });

  assert.equal(sink.spoken.length, 1);
  assert.match(sink.spoken[0] ?? '', /Good morning/i);
  const briefingEvent = published.find((entry) => entry.topic === Topics.lifeos.briefingGenerated);
  assert.ok(briefingEvent);
});

test('orchestrator respects briefing_max_seconds preference when building briefings', async () => {
  const { context, subscriptions } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    now: () => new Date('2026-03-25T08:00:00.000Z'),
    personality: {
      async loadProfile() {
        return {
          communicationStyle: 'concise and direct',
          priorities: ['health', 'deep work'],
          quirks: ['hates long briefings'],
          preferences: {
            briefing_max_seconds: '20',
          },
        };
      },
      async updatePreference() {
        return null;
      },
    },
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_briefing_pref',
    type: Topics.lifeos.voiceIntentBriefing,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      requestedAt: '2026-03-25T08:00:00.000Z',
    },
  });

  assert.equal(sink.spoken.length, 1);
  assert.ok((sink.spoken[0]?.length ?? 0) <= 220);
});

test('orchestrator persists preference updates and emits personality update signal', async () => {
  const { context, subscriptions, published, memoryEntries } = createContextMock();
  const module = createOrchestratorModule({
    tts: mockTtsSink().tts,
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_preference',
    type: Topics.lifeos.voiceIntentPreferenceSet,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      key: 'communication_style',
      value: 'short answers',
      utterance: 'I prefer short answers',
    },
  });

  assert.equal(memoryEntries.length, 1);
  assert.equal(memoryEntries[0]?.type, 'preference');
  assert.equal(memoryEntries[0]?.key, 'communication_style');
  const personalityEvent = published.find(
    (entry) => entry.topic === Topics.lifeos.personalityUpdated,
  );
  assert.ok(personalityEvent);
});

test('orchestrator emits proactive suggestion when decision engine requests speech', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    decisionEngine: async () => ({
      action: 'speak',
      message: "Your Grok research is relevant to today's planning meeting.",
    }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_research_done',
    type: Topics.lifeos.researchCompleted,
    timestamp: '2026-03-25T08:05:00.000Z',
    source: 'research-module',
    version: '0.1.0',
    data: {
      query: 'Grok 4 roadmap',
      summary: 'summary',
    },
  });

  assert.equal(sink.spoken.length, 1);
  const suggestion = published.find(
    (entry) => entry.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(suggestion);
});

test('orchestrator emits context-spike suggestion on research events without model prompt', async () => {
  const { context, subscriptions, published, memoryEntries } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_context_spike',
    type: Topics.lifeos.researchCompleted,
    timestamp: '2026-03-25T08:05:00.000Z',
    source: 'research-module',
    version: '0.1.0',
    data: {
      query: 'Grok 4 roadmap',
      summary: 'summary',
    },
  });

  assert.equal(sink.spoken.length, 1);
  assert.match(sink.spoken[0] ?? '', /context spike/i);
  const suggestion = published.find(
    (entry) => entry.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(suggestion);
  assert.equal(suggestion?.data.source, 'context_spike');
  assert.ok(
    memoryEntries.some((entry) =>
      String(entry.content ?? '').includes('Suggestion (context_spike):'),
    ),
  );
});

test('orchestrator auto-briefing triggers on first wake once per day', async () => {
  const { context, subscriptions, published } = createContextMock();
  const module = createOrchestratorModule({
    tts: mockTtsSink().tts,
    now: () => new Date('2026-03-25T08:00:00.000Z'),
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);

  await handler?.({
    id: 'evt_wake_1',
    type: Topics.lifeos.voiceWakeDetected,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      text: 'Hey LifeOS',
    },
  });
  await handler?.({
    id: 'evt_wake_2',
    type: Topics.lifeos.voiceWakeDetected,
    timestamp: '2026-03-25T09:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      text: 'Hey LifeOS',
    },
  });

  const briefings = published.filter((entry) => entry.topic === Topics.lifeos.voiceIntentBriefing);
  assert.equal(briefings.length, 1);
});

test('orchestrator processes self-published auto-briefing intents', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    now: () => new Date('2026-03-25T08:00:00.000Z'),
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);

  await handler?.({
    id: 'evt_wake_first',
    type: Topics.lifeos.voiceWakeDetected,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      text: 'Hey LifeOS',
    },
  });

  const autoBriefingIntent = published.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentBriefing,
  );
  assert.ok(autoBriefingIntent);

  await handler?.({
    id: 'evt_auto_briefing',
    type: Topics.lifeos.voiceIntentBriefing,
    timestamp: '2026-03-25T08:00:01.000Z',
    source: 'orchestrator',
    version: '0.1.0',
    data: autoBriefingIntent?.data ?? {},
  });

  assert.equal(sink.spoken.length, 1);
  const generated = published.find((entry) => entry.topic === Topics.lifeos.briefingGenerated);
  assert.ok(generated);
});

test('orchestrator falls back to note-task heuristic when model is unavailable', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    fetchFn: async () => {
      throw new Error('model unavailable');
    },
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_note_added',
    type: Topics.lifeos.noteAdded,
    timestamp: '2026-03-25T08:10:00.000Z',
    source: 'notes-module',
    version: '0.1.0',
    data: {
      id: 'note_1',
      title: 'Deck updates for leadership',
      createdAt: '2026-03-25T08:10:00.000Z',
      tags: ['team'],
    },
  });

  assert.equal(sink.spoken.length, 1);
  const suggestion = published.find(
    (entry) => entry.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.ok(suggestion);
});

test('orchestrator suppresses duplicate proactive suggestions within cooldown', async () => {
  const { context, subscriptions, published } = createContextMock();
  const sink = mockTtsSink();
  const module = createOrchestratorModule({
    tts: sink.tts,
    now: () => new Date('2026-03-25T08:00:00.000Z'),
    decisionEngine: async () => ({
      action: 'speak',
      message: "Your research may help with today's meeting.",
    }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);

  await handler?.({
    id: 'evt_research_1',
    type: Topics.lifeos.noteAdded,
    timestamp: '2026-03-25T08:00:00.000Z',
    source: 'notes-module',
    version: '0.1.0',
    data: {
      title: 'Prep notes',
    },
  });
  await handler?.({
    id: 'evt_research_2',
    type: Topics.lifeos.noteAdded,
    timestamp: '2026-03-25T08:00:10.000Z',
    source: 'notes-module',
    version: '0.1.0',
    data: {
      title: 'Prep notes',
    },
  });

  assert.equal(sink.spoken.length, 1);
  const suggestions = published.filter(
    (entry) => entry.topic === Topics.lifeos.orchestratorSuggestion,
  );
  assert.equal(suggestions.length, 1);
});

test('orchestrator tolerates unserializable event payloads during memory/context capture', async () => {
  const { context, subscriptions, memoryEntries } = createContextMock();
  const module = createOrchestratorModule({
    tts: mockTtsSink().tts,
    decisionEngine: async () => ({ action: 'nothing' }),
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);

  const circular: Record<string, unknown> = {
    id: 'x',
  };
  circular.self = circular;

  await handler?.({
    id: 'evt_circular',
    type: Topics.lifeos.researchCompleted,
    timestamp: '2026-03-25T08:10:00.000Z',
    source: 'research-module',
    version: '0.1.0',
    data: circular,
  });

  assert.equal(memoryEntries.length, 1);
  assert.match(String(memoryEntries[0]?.content), /\[unserializable\]/i);
});

test('orchestrator normalizes unsafe decision updates before apply', async () => {
  const { context, subscriptions, appliedUpdates } = createContextMock();
  const module = createOrchestratorModule({
    tts: mockTtsSink().tts,
    decisionEngine: async () =>
      ({
        action: 'update',
        updates: [
          { op: 'drop_everything' } as never,
          ...Array.from({ length: 40 }, (_, index) => ({
            op: 'append_memory',
            entry: {
              type: 'insight',
              content: `memory ${index}`,
              relatedTo: ['test'],
            },
          })),
        ],
      }) as unknown as OrchestratorDecision,
  });
  await module.init(context);

  const handler = getHandler(subscriptions, 'lifeos.>');
  assert.ok(handler);
  await handler?.({
    id: 'evt_update_test',
    type: Topics.lifeos.researchCompleted,
    timestamp: '2026-03-25T08:30:00.000Z',
    source: 'research-module',
    version: '0.1.0',
    data: {
      query: 'test',
      summary: 'test',
    },
  });

  assert.equal(appliedUpdates.length, 24);
  assert.ok(appliedUpdates.every((entry) => entry.op === 'append_memory'));
});
