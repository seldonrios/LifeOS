import assert from 'node:assert/strict';
import test from 'node:test';

import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { createGoogleCalendarEvent } from './calendar';
import { syncGoogleChatMessages } from './chat';
import { syncGoogleContacts } from './contacts';
import { syncGoogleDocs } from './docs';
import { syncGoogleDriveFiles } from './drive';
import { syncGoogleKeepNotes } from './keep';
import { syncGoogleMeetEvents } from './meet';
import { syncGoogleSheets } from './sheets';
import { createGoogleTaskFromVoice } from './tasks';

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
    env: {
      ...process.env,
      LIFEOS_GOOGLE_BRIDGE_LLM_SUMMARY: '0',
      LIFEOS_GOOGLE_BRIDGE_SPOKEN_FEEDBACK: '0',
    },
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

test('syncGoogleDriveFiles appends only unseen files and publishes summary', async () => {
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
    if (!url.includes('/drive/v3/files?')) {
      throw new Error(`Unexpected fetch URL in drive test: ${url}`);
    }
    return toResponse({
      files: [
        { id: 'f1', name: 'Existing File', mimeType: 'text/plain' },
        { id: 'f2', name: 'New File', mimeType: 'application/pdf' },
      ],
    });
  };

  try {
    const client = createClient(
      async () => ({
        notes: [{ tags: ['drive:id:f1'] }],
      }),
      async (note) => {
        appended.push(note);
        return { tags: note.tags };
      },
    );
    const context = createContext(published);
    const result = await syncGoogleDriveFiles(context, client, 'token');

    assert.equal(result, 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.title, 'Drive: New File');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.drive.updated');
    assert.equal(published[0]?.data.count, 1);
    assert.equal(published[0]?.data.scanned, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGoogleContacts appends unseen contacts and publishes summary', async () => {
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
    if (!url.includes('/v1/people/me/connections?')) {
      throw new Error(`Unexpected fetch URL in contacts test: ${url}`);
    }
    return toResponse({
      connections: [
        {
          resourceName: 'people/c1',
          names: [{ displayName: 'Existing Contact' }],
          emailAddresses: [{ value: 'existing@example.com' }],
        },
        {
          resourceName: 'people/c2',
          names: [{ displayName: 'New Contact' }],
          emailAddresses: [{ value: 'new@example.com' }],
        },
      ],
    });
  };

  try {
    const client = createClient(
      async () => ({
        notes: [{ tags: ['contacts:id:people/c1'] }],
      }),
      async (note) => {
        appended.push(note);
        return { tags: note.tags };
      },
    );
    const context = createContext(published);
    const result = await syncGoogleContacts(context, client, 'token');

    assert.equal(result, 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.title, 'Contact: New Contact');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.contacts.updated');
    assert.equal(published[0]?.data.count, 1);
    assert.equal(published[0]?.data.scanned, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGoogleKeepNotes gracefully degrades when Keep API is unavailable', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('keep.googleapis.com/v1/notes?')) {
      throw new Error(`Unexpected fetch URL in keep test: ${url}`);
    }
    return new Response('not enabled', { status: 403 });
  };

  try {
    const client = createClient(
      async () => ({ notes: [] }),
      async () => {
        throw new Error('appendNote should not be called');
      },
    );
    const context = createContext(published);
    const result = await syncGoogleKeepNotes(context, client, 'token');

    assert.equal(result, 0);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.keep.updated');
    assert.equal(published[0]?.data.count, 0);
    assert.equal(published[0]?.data.reason, 'api_unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGoogleChatMessages gracefully degrades when Chat API is unavailable', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('chat.googleapis.com/v1/spaces?')) {
      throw new Error(`Unexpected fetch URL in chat test: ${url}`);
    }
    return new Response('forbidden', { status: 403 });
  };

  try {
    const client = createClient(
      async () => ({ notes: [] }),
      async () => {
        throw new Error('appendNote should not be called');
      },
    );
    const context = createContext(published);
    const result = await syncGoogleChatMessages(context, client, 'token');

    assert.equal(result, 0);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.chat.updated');
    assert.equal(published[0]?.data.count, 0);
    assert.equal(published[0]?.data.reason, 'api_unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGoogleMeetEvents appends only unseen meet events and publishes summary', async () => {
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
    if (!url.includes('/calendar/v3/calendars/primary/events?')) {
      throw new Error(`Unexpected fetch URL in meet test: ${url}`);
    }
    return toResponse({
      items: [
        {
          id: 'evt_1',
          summary: 'Existing meet',
          hangoutLink: 'https://meet.google.com/existing',
        },
        {
          id: 'evt_2',
          summary: 'New meet',
          hangoutLink: 'https://meet.google.com/new',
        },
      ],
    });
  };

  try {
    const client = createClient(
      async () => ({
        notes: [{ tags: ['meet:id:evt_1'] }],
      }),
      async (note) => {
        appended.push(note);
        return { tags: note.tags };
      },
    );
    const context = createContext(published);
    const result = await syncGoogleMeetEvents(context, client, 'token');

    assert.equal(result, 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.title, 'Meet: New meet');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.meet.updated');
    assert.equal(published[0]?.data.count, 1);
    assert.equal(published[0]?.data.scanned, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGoogleDocs appends only unseen docs and publishes summary', async () => {
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
    if (url.includes('/drive/v3/files?')) {
      return toResponse({
        files: [
          { id: 'doc_1', name: 'Existing Doc', modifiedTime: '2026-03-24T10:00:00Z' },
          { id: 'doc_2', name: 'New Doc', modifiedTime: '2026-03-24T10:05:00Z' },
        ],
      });
    }
    if (url.includes('/v1/documents/doc_2')) {
      return toResponse({
        title: 'New Doc',
        body: {
          content: [
            {
              paragraph: {
                elements: [{ textRun: { content: 'Doc preview text.' } }],
              },
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected fetch URL in docs test: ${url}`);
  };

  try {
    const client = createClient(
      async () => ({
        notes: [{ tags: ['docs:id:doc_1'] }],
      }),
      async (note) => {
        appended.push(note);
        return { tags: note.tags };
      },
    );
    const context = createContext(published);
    const result = await syncGoogleDocs(context, client, 'token');

    assert.equal(result, 1);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.title, 'Docs: New Doc');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.docs.updated');
    assert.equal(published[0]?.data.count, 1);
    assert.equal(published[0]?.data.scanned, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncGoogleSheets gracefully degrades when Sheets API is unavailable', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/drive/v3/files?')) {
      return toResponse({
        files: [{ id: 'sheet_1', name: 'Sheet One', modifiedTime: '2026-03-24T11:00:00Z' }],
      });
    }
    if (url.includes('/v4/spreadsheets/sheet_1/values/')) {
      return new Response('forbidden', { status: 403 });
    }
    throw new Error(`Unexpected fetch URL in sheets test: ${url}`);
  };

  try {
    const client = createClient(
      async () => ({ notes: [] }),
      async () => {
        throw new Error('appendNote should not be called');
      },
    );
    const context = createContext(published);
    const result = await syncGoogleSheets(context, client, 'token');

    assert.equal(result, 0);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.sheets.updated');
    assert.equal(published[0]?.data.count, 0);
    assert.equal(published[0]?.data.reason, 'api_unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createGoogleCalendarEvent writes event and publishes created topic', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;
  const context = createContext(published);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('/calendar/v3/calendars/primary/events')) {
      throw new Error(`Unexpected fetch URL in calendar create test: ${url}`);
    }
    assert.equal(init?.method, 'POST');
    return toResponse({
      id: 'google_event_1',
    });
  };

  try {
    const created = await createGoogleCalendarEvent(context, 'token', {
      title: 'Team sync',
      start: '2026-03-25T15:00:00.000Z',
      end: '2026-03-25T16:00:00.000Z',
      utterance: 'schedule team sync',
    });
    assert.equal(created?.googleEventId, 'google_event_1');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.calendar.created');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createGoogleTaskFromVoice writes task and publishes created topic', async () => {
  const published: PublishedEvent[] = [];
  const originalFetch = globalThis.fetch;
  const context = createContext(published);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/tasks/v1/users/@me/lists?')) {
      return toResponse({
        items: [{ id: 'list_1', title: 'My Tasks' }],
      });
    }
    if (url.includes('/tasks/v1/lists/list_1/tasks')) {
      assert.equal(init?.method, 'POST');
      return toResponse({
        id: 'task_google_1',
        title: 'Buy milk',
      });
    }
    throw new Error(`Unexpected fetch URL in task create test: ${url}`);
  };

  try {
    const created = await createGoogleTaskFromVoice(context, 'token', {
      taskTitle: 'Buy milk',
      dueDate: '2026-03-30',
    });
    assert.equal(created?.googleTaskId, 'task_google_1');
    assert.equal(published.length, 1);
    assert.equal(published[0]?.topic, 'lifeos.bridge.google.tasks.created');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
