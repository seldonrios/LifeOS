import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createEmailSummarizerModule } from './index';
import type { ImapCredentials, RawMessage } from './events';

interface CapturedSubscription {
  topic: string;
  handler: (event: BaseEvent<unknown>) => Promise<void>;
}

function createContextMock() {
  const subscriptions: CapturedSubscription[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const logs: string[] = [];
  const savedDigests: Array<Record<string, unknown>> = [];

  const context: ModuleRuntimeContext = {
    env: {
      LIFEOS_EMAIL_MARK_READ: '0',
      OLLAMA_HOST: 'http://127.0.0.1:11434',
      LIFEOS_EMAIL_MODEL: 'llama3.1:8b',
    },
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
        async registerModuleSchema() {
          return;
        },
        async appendEmailDigest(payload: Record<string, unknown>) {
          savedDigests.push(payload);
          return {
            ...payload,
            id: `email_${savedDigests.length}`,
          };
        },
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: '2026-03-25T00:00:00.000Z',
            plans: [],
            calendarEvents: [],
            notes: [],
            researchResults: [],
            weatherSnapshots: [],
            newsDigests: [],
            emailDigests: [{ id: 'email_1' }],
            memory: [],
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
        timestamp: '2026-03-25T00:00:00.000Z',
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
    logs,
    savedDigests,
  };
}

function createMockImapFactory(messages: RawMessage[]) {
  return () => ({
    async connect() {
      return;
    },
    async mailboxOpen() {
      return;
    },
    async *fetch() {
      for (const message of messages) {
        yield {
          uid: 1,
          envelope: {
            subject: message.subject,
            from: [{ name: 'Alice', address: 'alice@example.com' }],
            messageId: message.messageId,
            date: new Date(message.receivedAt),
          },
          source: message.body,
        };
      }
    },
    async messageFlagsAdd() {
      return;
    },
    async logout() {
      return;
    },
  });
}

test('email summarizer subscribes to summarize and briefing topics', async () => {
  const { context, subscriptions } = createContextMock();
  const module = createEmailSummarizerModule({
    readCredentialsFn: async () => [],
    imapFactory: createMockImapFactory([]),
    fetchFn: (async () => {
      throw new Error('unused');
    }) as typeof fetch,
  });

  await module.init(context);
  const topics = subscriptions.map((entry) => entry.topic).sort();
  assert.deepEqual(
    topics,
    [Topics.lifeos.voiceIntentBriefing, Topics.lifeos.voiceIntentEmailSummarize].sort(),
  );
});

test('email summarizer fetches and persists digests then publishes ready event', async () => {
  const { context, subscriptions, savedDigests, published } = createContextMock();
  const creds: ImapCredentials[] = [
    {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'user@example.com', pass: 'secret' },
      label: 'work',
    },
  ];

  const module = createEmailSummarizerModule({
    readCredentialsFn: async () => creds,
    imapFactory: createMockImapFactory([
      {
        subject: 'Status update',
        from: 'Alice <alice@example.com>',
        messageId: '<abc@example.com>',
        receivedAt: '2026-03-25T08:00:00.000Z',
        body: 'Please review the draft by Friday.',
        accountLabel: 'work',
      },
    ]),
    fetchFn: (async () =>
      ({
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content:
                '[{"messageId":"<abc@example.com>","summary":"Please review the draft by Friday."}]',
            },
          };
        },
      }) as Response) as typeof fetch,
  });

  await module.init(context);

  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentEmailSummarize,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_email_1',
    type: Topics.lifeos.voiceIntentEmailSummarize,
    timestamp: '2026-03-25T08:01:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      account: 'work',
      limit: 5,
    },
  });

  assert.equal(savedDigests.length, 1);
  assert.equal(savedDigests[0]?.accountLabel, 'work');
  assert.ok(published.some((entry) => entry.topic === Topics.lifeos.emailDigestReady));
});

test('email summarizer logs friendly message when no credentials exist', async () => {
  const { context, subscriptions, logs, savedDigests } = createContextMock();
  const module = createEmailSummarizerModule({
    readCredentialsFn: async () => [],
    imapFactory: createMockImapFactory([]),
    fetchFn: (async () => {
      throw new Error('unused');
    }) as typeof fetch,
  });

  await module.init(context);
  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentEmailSummarize,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_email_2',
    type: Topics.lifeos.voiceIntentEmailSummarize,
    timestamp: '2026-03-25T08:10:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {},
  });

  assert.equal(savedDigests.length, 0);
  assert.match(logs.join('\n'), /No IMAP accounts configured/i);
});

test('briefing hook publishes orchestrator suggestion when digests exist', async () => {
  const { context, subscriptions, published } = createContextMock();
  const module = createEmailSummarizerModule({
    readCredentialsFn: async () => [],
    imapFactory: createMockImapFactory([]),
    fetchFn: (async () => {
      throw new Error('unused');
    }) as typeof fetch,
  });

  await module.init(context);
  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentBriefing,
  )?.handler;
  assert.ok(handler);
  await handler?.({
    id: 'evt_brief_1',
    type: Topics.lifeos.voiceIntentBriefing,
    timestamp: '2026-03-25T08:15:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {},
  });

  assert.ok(published.some((entry) => entry.topic === Topics.lifeos.orchestratorSuggestion));
});

test('email summarizer handles IMAP fetch errors with degradation logging', async () => {
  const { context, subscriptions, logs, savedDigests } = createContextMock();
  const creds: ImapCredentials[] = [
    {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'user@example.com', pass: 'secret' },
      label: 'work',
    },
  ];

  const mockFactory = () => ({
    async connect() {
      throw new Error('IMAP fetch iteration timed out.');
    },
    async mailboxOpen() {
      return;
    },
    async *fetch() {
      // Simulate hanging by never yielding
      await new Promise(() => {
        // This will never resolve, simulating a hang
      });
    },
    async messageFlagsAdd() {
      return;
    },
    async logout() {
      return;
    },
  });

  const module = createEmailSummarizerModule({
    readCredentialsFn: async () => creds,
    imapFactory: mockFactory as never,
    fetchFn: (async () => {
      throw new Error('unused');
    }) as typeof fetch,
  });

  await module.init(context);
  const handler = subscriptions.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentEmailSummarize,
  )?.handler;
  assert.ok(handler);

  await handler?.({
    id: 'evt_email_timeout',
    type: Topics.lifeos.voiceIntentEmailSummarize,
    timestamp: '2026-03-25T08:20:00.000Z',
    source: 'voice-core',
    version: '0.1.0',
    data: {
      account: 'work',
      limit: 5,
    },
  });

  // Verify degradation was logged
  assert.ok(
    logs.some((log) => log.includes('degraded')),
    'Should log account degradation',
  );
  assert.equal(savedDigests.length, 0, 'No digests should be saved on fetch error');
});
