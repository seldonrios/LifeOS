import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const GOOGLE_CHAT_SPACES_ENDPOINT = 'https://chat.googleapis.com/v1/spaces';
const GOOGLE_CHAT_MESSAGES_BASE = 'https://chat.googleapis.com/v1';
const MAX_SPACES = 5;
const MAX_MESSAGES_PER_SPACE = 15;
const MAX_TITLE_CHARS = 180;
const MAX_CONTENT_CHARS = 800;
const CHAT_ID_TAG_PREFIX = 'chat:id:';

interface GoogleChatSpace {
  name?: string;
  displayName?: string;
}

interface GoogleChatSpacesResponse {
  spaces?: GoogleChatSpace[];
}

interface NormalizedChatSpace {
  name: string;
  displayName: string;
}

interface GoogleChatMessageSender {
  displayName?: string;
}

interface GoogleChatMessage {
  name?: string;
  text?: string;
  createTime?: string;
  sender?: GoogleChatMessageSender;
}

interface GoogleChatMessagesResponse {
  messages?: GoogleChatMessage[];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toChatTag(messageName: string): string {
  return `${CHAT_ID_TAG_PREFIX}${messageName}`;
}

async function fetchSpaces(accessToken: string): Promise<NormalizedChatSpace[]> {
  const spacesUrl = new URL(GOOGLE_CHAT_SPACES_ENDPOINT);
  spacesUrl.searchParams.set('pageSize', String(MAX_SPACES));
  const response = await fetch(spacesUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google Chat spaces request failed (${response.status}): ${body.slice(0, 240)}`,
    );
  }
  const payload = (await response.json()) as GoogleChatSpacesResponse;
  return (payload.spaces ?? [])
    .map((space) => {
      const name = space.name?.trim();
      if (!name) {
        return null;
      }
      return {
        name,
        displayName: space.displayName?.trim() ?? '',
      };
    })
    .filter((space): space is NonNullable<typeof space> => space !== null);
}

async function fetchMessagesForSpace(
  accessToken: string,
  spaceName: string,
): Promise<GoogleChatMessage[]> {
  const messagesUrl = new URL(
    `${GOOGLE_CHAT_MESSAGES_BASE}/${encodeURI(spaceName).replace(/%2F/g, '/')}/messages`,
  );
  messagesUrl.searchParams.set('pageSize', String(MAX_MESSAGES_PER_SPACE));
  const response = await fetch(messagesUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google Chat messages request failed (${response.status}): ${body.slice(0, 240)}`,
    );
  }
  const payload = (await response.json()) as GoogleChatMessagesResponse;
  return payload.messages ?? [];
}

export async function syncGoogleChatMessages(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  let spaces: NormalizedChatSpace[] = [];
  try {
    spaces = await fetchSpaces(accessToken);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('(403)') || message.includes('(404)') || message.includes('(501)')) {
      await context.publish(
        'lifeos.bridge.google.chat.updated',
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
    throw error;
  }

  if (spaces.length === 0) {
    await context.publish(
      'lifeos.bridge.google.chat.updated',
      {
        count: 0,
        scanned: 0,
        syncedAt: new Date().toISOString(),
      },
      'google-bridge',
    );
    return 0;
  }

  const messages: Array<{
    name: string;
    text: string;
    sender: string;
    createdAt: string;
    spaceName: string;
  }> = [];
  for (const space of spaces) {
    try {
      const spaceMessages = await fetchMessagesForSpace(accessToken, space.name);
      for (const message of spaceMessages) {
        const name = message.name?.trim();
        const text = message.text?.trim();
        if (!name || !text) {
          continue;
        }
        messages.push({
          name,
          text: clampText(text, MAX_CONTENT_CHARS),
          sender: message.sender?.displayName?.trim() || 'Unknown sender',
          createdAt: message.createTime?.trim() || '',
          spaceName: space.displayName || space.name,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('(403)') || message.includes('(404)') || message.includes('(501)')) {
        continue;
      }
      throw error;
    }
  }

  if (messages.length === 0) {
    await context.publish(
      'lifeos.bridge.google.chat.updated',
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
      .filter((tag) => tag.startsWith(CHAT_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const message of messages) {
    const dedupeTag = toChatTag(message.name);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const titlePreview = clampText(message.text, MAX_TITLE_CHARS);
    const content = clampText(
      [
        `From: ${message.sender}`,
        `Space: ${message.spaceName}`,
        message.createdAt ? `Created: ${message.createdAt}` : null,
        `Message: ${message.text}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );

    const persisted = await client.appendNote({
      title: `Chat: ${titlePreview || 'Message'}`,
      content,
      tags: ['google-chat', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.chat.updated',
    {
      count: appended,
      scanned: messages.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
