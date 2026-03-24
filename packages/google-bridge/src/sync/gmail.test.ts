import assert from 'node:assert/strict';
import test from 'node:test';

import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { syncGmailUnreadMessages } from './gmail';

interface PublishedEvent {
  topic: string;
  data: Record<string, unknown>;
  source?: string;
}

function toResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createContext(published: PublishedEvent[]): ModuleRuntimeContext {
  return {
    env: process.env,
    eventBus: {} as ModuleRuntimeContext['eventBus'],
    createLifeGraphClient: () => {
      throw new Error('createLifeGraphClient should not be called');
    },
    subscribe: async () => {},
    publish: async (topic, data, source) => {
      published.push({
        topic,
        data,
        ...(source ? { source } : {}),
      });
      return {
        id: 'evt_1',
        type: topic,
        timestamp: new Date().toISOString(),
        source: source ?? 'google-bridge-test',
        version: '0.1.0',
        data,
      };
    },
    log: () => {},
  };
}

function createClient(
  loadGraphImpl: () => Promise<{ notes?: Array<{ tags?: string[] }> }>,
  appendNoteImpl: (note: {
    title: string;
    content: string;
    tags: string[];
    voiceTriggered: boolean;
  }) => Promise<{ tags: string[] }>,
): LifeGraphClient {
  return {
    loadGraph: loadGraphImpl,
    appendNote: appendNoteImpl,
  } as unknown as LifeGraphClient;
}

test('syncGmailUnreadMessages deduplicates already-imported messages', async () => {
  const published: PublishedEvent[] = [];
  const appended: Array<{
    title: string;
    content: string;
    tags: string[];
    voiceTriggered: boolean;
  }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/gmail/v1/users/me/messages?')) {
      return toResponse({
        messages: [{ id: 'm1' }, { id: 'm2' }],
      });
    }
    if (url.includes('/gmail/v1/users/me/messages/m1')) {
      return toResponse({
        id: 'm1',
        snippet: 'Already synced',
        payload: { headers: [{ name: 'Subject', value: 'Existing' }] },
      });
    }
    if (url.includes('/gmail/v1/users/me/messages/m2')) {
      return toResponse({
        id: 'm2',
        snippet: 'Need to follow up',
        payload: {
          headers: [
            { name: 'Subject', value: 'New email' },
            { name: 'From', value: 'sender@example.com' },
          ],
        },
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const client = createClient(
      async () => ({
        notes: [{ tags: ['gmail:id:m1'] }],
      }),
      async (note) => {
        appended.push(note);
        return { tags: note.tags };
      },
    );
    const context = createContext(published);

    const result = await syncGmailUnreadMessages(context, client, 'token');
    assert.equal(result, 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.title, 'Gmail: New email');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.gmail.updated');
    assert.equal(published[0]?.data.count, 1);
    assert.equal(published[0]?.data.scanned, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGmailUnreadMessages publishes zero update for empty unread inbox', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('/gmail/v1/users/me/messages?')) {
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }
    return toResponse({
      messages: [],
    });
  };

  try {
    const client = createClient(
      async () => ({ notes: [] }),
      async () => {
        throw new Error('appendNote should not be called');
      },
    );
    const context = createContext(published);

    const result = await syncGmailUnreadMessages(context, client, 'token');
    assert.equal(result, 0);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.data.count, 0);
    assert.equal(published[0]?.data.scanned, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGmailUnreadMessages throws on Gmail list API failure', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> => {
    return new Response('boom', { status: 500 });
  };

  try {
    const client = createClient(
      async () => ({ notes: [] }),
      async () => ({ tags: [] }),
    );
    const context = createContext(published);

    await assert.rejects(async () => {
      await syncGmailUnreadMessages(context, client, 'token');
    }, /Gmail list request failed/);
    assert.equal(published.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
