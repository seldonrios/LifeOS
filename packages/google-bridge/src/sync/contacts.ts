import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const GOOGLE_CONTACTS_ENDPOINT = 'https://people.googleapis.com/v1/people/me/connections';
const MAX_CONTACTS = 50;
const MAX_NAME_CHARS = 140;
const MAX_CONTENT_CHARS = 700;
const CONTACT_ID_TAG_PREFIX = 'contacts:id:';

interface GooglePeopleName {
  displayName?: string;
}

interface GooglePeopleEmail {
  value?: string;
}

interface GooglePeoplePhone {
  value?: string;
}

interface GoogleContact {
  resourceName?: string;
  names?: GooglePeopleName[];
  emailAddresses?: GooglePeopleEmail[];
  phoneNumbers?: GooglePeoplePhone[];
}

interface GoogleContactsResponse {
  connections?: GoogleContact[];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toContactTag(resourceName: string): string {
  return `${CONTACT_ID_TAG_PREFIX}${resourceName}`;
}

export async function syncGoogleContacts(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const url = new URL(GOOGLE_CONTACTS_ENDPOINT);
  url.searchParams.set('pageSize', String(MAX_CONTACTS));
  url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Contacts request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GoogleContactsResponse;
  const contacts = (payload.connections ?? [])
    .map((connection) => {
      const resourceName = connection.resourceName?.trim();
      if (!resourceName) {
        return null;
      }
      const name = clampText(
        connection.names?.[0]?.displayName?.trim() || 'Unknown contact',
        MAX_NAME_CHARS,
      );
      const email = connection.emailAddresses?.[0]?.value?.trim() ?? '';
      const phone = connection.phoneNumbers?.[0]?.value?.trim() ?? '';
      return {
        resourceName,
        name,
        email,
        phone,
      };
    })
    .filter((contact): contact is NonNullable<typeof contact> => contact !== null);

  if (contacts.length === 0) {
    await context.publish(
      'lifeos.bridge.google.contacts.updated',
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
      .filter((tag) => tag.startsWith(CONTACT_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const contact of contacts) {
    const dedupeTag = toContactTag(contact.resourceName);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const content = clampText(
      [
        contact.email ? `Email: ${contact.email}` : null,
        contact.phone ? `Phone: ${contact.phone}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );

    const persisted = await client.appendNote({
      title: `Contact: ${contact.name}`,
      content: content || 'Google contact',
      tags: ['google-contacts', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.contacts.updated',
    {
      count: appended,
      scanned: contacts.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
