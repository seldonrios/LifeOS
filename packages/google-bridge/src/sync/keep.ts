import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const GOOGLE_KEEP_ENDPOINT = 'https://keep.googleapis.com/v1/notes';
const MAX_NOTES = 20;
const MAX_TITLE_CHARS = 180;
const MAX_CONTENT_CHARS = 800;
const KEEP_ID_TAG_PREFIX = 'keep:id:';

interface GoogleKeepTextContent {
  text?: string;
}

interface GoogleKeepBody {
  text?: GoogleKeepTextContent;
}

interface GoogleKeepNote {
  name?: string;
  title?: string;
  textContent?: GoogleKeepTextContent;
  body?: GoogleKeepBody;
  updateTime?: string;
}

interface GoogleKeepNotesResponse {
  notes?: GoogleKeepNote[];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toKeepTag(noteName: string): string {
  return `${KEEP_ID_TAG_PREFIX}${noteName}`;
}

function extractKeepBody(note: GoogleKeepNote): string {
  const direct = note.textContent?.text?.trim();
  if (direct) {
    return direct;
  }
  const nested = note.body?.text?.text?.trim();
  if (nested) {
    return nested;
  }
  return '';
}

function isApiUnavailableStatus(status: number): boolean {
  return status === 403 || status === 404 || status === 501;
}

export async function syncGoogleKeepNotes(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const url = new URL(GOOGLE_KEEP_ENDPOINT);
  url.searchParams.set('pageSize', String(MAX_NOTES));

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    if (isApiUnavailableStatus(response.status)) {
      await context.publish(
        'lifeos.bridge.google.keep.updated',
        {
          count: 0,
          scanned: 0,
          reason: 'api_unavailable',
          syncedAt: new Date().toISOString(),
        },
        'google-bridge',
      );
      return 0;
    }
    const body = await response.text();
    throw new Error(`Google Keep request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GoogleKeepNotesResponse;
  const notes = (payload.notes ?? [])
    .map((note) => {
      const name = note.name?.trim();
      if (!name) {
        return null;
      }
      return {
        name,
        title: clampText(note.title?.trim() || 'Untitled keep note', MAX_TITLE_CHARS),
        body: clampText(extractKeepBody(note), MAX_CONTENT_CHARS),
        updateTime: note.updateTime?.trim() ?? '',
      };
    })
    .filter((note): note is NonNullable<typeof note> => note !== null);

  if (notes.length === 0) {
    await context.publish(
      'lifeos.bridge.google.keep.updated',
      {
        count: 0,
        scanned: 0,
        syncedAt: new Date().toISOString(),
      },
      'google-bridge',
    );
    return 0;
  }

  const graph = await client.loadGraph();
  const existingTags = new Set(
    (graph.notes ?? [])
      .flatMap((note) => note.tags ?? [])
      .filter((tag) => tag.startsWith(KEEP_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const note of notes) {
    const dedupeTag = toKeepTag(note.name);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const content = clampText(
      [
        note.body ? `Content: ${note.body}` : null,
        note.updateTime ? `Updated: ${note.updateTime}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );

    const persisted = await client.appendNote({
      title: `Keep: ${note.title}`,
      content: content || 'Google Keep note',
      tags: ['google-keep', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.keep.updated',
    {
      count: appended,
      scanned: notes.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
