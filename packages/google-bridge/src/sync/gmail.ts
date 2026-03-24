import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';
import { summarizeForBusyUser } from './summary';

const GMAIL_MESSAGES_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const MAX_GMAIL_MESSAGES = 10;
const MAX_SUBJECT_CHARS = 180;
const MAX_SNIPPET_CHARS = 600;
const GMAIL_ID_TAG_PREFIX = 'gmail:id:';

interface GmailMessageListItem {
  id?: string;
}

interface GmailMessagesListResponse {
  messages?: GmailMessageListItem[];
}

interface GmailMessageHeader {
  name?: string;
  value?: string;
}

interface GmailMessageDetails {
  id?: string;
  snippet?: string;
  payload?: {
    headers?: GmailMessageHeader[];
  };
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function getHeader(message: GmailMessageDetails, name: string): string | null {
  const target = name.toLowerCase();
  for (const header of message.payload?.headers ?? []) {
    if (header.name?.toLowerCase() === target) {
      const value = header.value?.trim();
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function toMessageTag(messageId: string): string {
  return `${GMAIL_ID_TAG_PREFIX}${messageId}`;
}

function hasMessageSynced(existingTags: string[] | undefined, messageId: string): boolean {
  if (!existingTags || existingTags.length === 0) {
    return false;
  }
  return existingTags.includes(toMessageTag(messageId));
}

async function fetchGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageDetails> {
  const detailsUrl = new URL(`${GMAIL_MESSAGES_ENDPOINT}/${encodeURIComponent(messageId)}`);
  detailsUrl.searchParams.set('format', 'metadata');
  detailsUrl.searchParams.set('metadataHeaders', 'Subject');
  detailsUrl.searchParams.set('metadataHeaders', 'From');
  detailsUrl.searchParams.set('metadataHeaders', 'Date');

  const detailsResponse = await fetch(detailsUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!detailsResponse.ok) {
    const body = await detailsResponse.text();
    throw new Error(
      `Gmail message request failed (${detailsResponse.status}): ${body.slice(0, 240)}`,
    );
  }
  return (await detailsResponse.json()) as GmailMessageDetails;
}

export async function syncGmailUnreadMessages(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const listUrl = new URL(GMAIL_MESSAGES_ENDPOINT);
  listUrl.searchParams.set('q', 'is:unread');
  listUrl.searchParams.set('maxResults', String(MAX_GMAIL_MESSAGES));

  const response = await fetch(listUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail list request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GmailMessagesListResponse;
  const messageIds = (payload.messages ?? [])
    .map((message) => message.id?.trim())
    .filter((id): id is string => Boolean(id));

  if (messageIds.length === 0) {
    await context.publish(
      'lifeos.bridge.google.gmail.updated',
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
  const existingNotes = graph.notes ?? [];
  const seenTags = new Set(
    existingNotes.flatMap((note) => note.tags).filter((tag) => tag.startsWith(GMAIL_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const messageId of messageIds) {
    if (seenTags.has(toMessageTag(messageId))) {
      continue;
    }

    const message = await fetchGmailMessage(accessToken, messageId);
    const subject = clampText(
      getHeader(message, 'Subject') ?? `Gmail message ${messageId.slice(0, 8)}`,
      MAX_SUBJECT_CHARS,
    );
    const from = getHeader(message, 'From');
    const date = getHeader(message, 'Date');
    const snippet = clampText(message.snippet ?? '', MAX_SNIPPET_CHARS);
    const summary = await summarizeForBusyUser(context, snippet);

    const contentLines = [
      from ? `From: ${from}` : null,
      date ? `Date: ${date}` : null,
      `Summary: ${summary}`,
      snippet ? `Snippet: ${snippet}` : 'Snippet: (empty)',
    ].filter((line): line is string => Boolean(line));

    const persisted = await client.appendNote({
      title: `Gmail: ${subject}`,
      content: contentLines.join('\n'),
      tags: ['gmail', 'google-bridge', 'unread', toMessageTag(messageId)],
      voiceTriggered: false,
    });

    if (hasMessageSynced(persisted.tags, messageId)) {
      appended += 1;
      seenTags.add(toMessageTag(messageId));
    }
  }

  const nowIso = new Date().toISOString();
  await context.publish(
    'lifeos.bridge.google.gmail.updated',
    {
      count: appended,
      scanned: messageIds.length,
      syncedAt: nowIso,
    },
    'google-bridge',
  );

  return appended;
}
