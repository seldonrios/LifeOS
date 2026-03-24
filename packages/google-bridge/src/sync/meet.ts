import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MAX_EVENTS = 12;
const MAX_TITLE_CHARS = 180;
const MAX_CONTENT_CHARS = 700;
const MEET_ID_TAG_PREFIX = 'meet:id:';

interface GoogleCalendarEntryPoint {
  uri?: string;
}

interface GoogleCalendarConferenceData {
  entryPoints?: GoogleCalendarEntryPoint[];
}

interface GoogleCalendarEventDate {
  dateTime?: string;
  date?: string;
}

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  hangoutLink?: string;
  start?: GoogleCalendarEventDate;
  conferenceData?: GoogleCalendarConferenceData;
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toMeetTag(eventId: string): string {
  return `${MEET_ID_TAG_PREFIX}${eventId}`;
}

function resolveMeetLink(event: GoogleCalendarEvent): string {
  const direct = event.hangoutLink?.trim();
  if (direct) {
    return direct;
  }
  const fromEntry = event.conferenceData?.entryPoints
    ?.map((entry) => entry.uri?.trim() ?? '')
    .find((candidate) => candidate.length > 0);
  return fromEntry ?? '';
}

export async function syncGoogleMeetEvents(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
  now = new Date(),
): Promise<number> {
  const url = new URL(GOOGLE_CALENDAR_EVENTS_ENDPOINT);
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', String(MAX_EVENTS));
  url.searchParams.set('q', 'meet');
  url.searchParams.set('fields', 'items(id,summary,hangoutLink,start,conferenceData(entryPoints))');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Meet request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GoogleCalendarEventsResponse;
  const events = (payload.items ?? [])
    .map((event) => {
      const id = event.id?.trim();
      if (!id) {
        return null;
      }
      const meetLink = resolveMeetLink(event);
      if (!meetLink) {
        return null;
      }
      return {
        id,
        title: clampText(event.summary?.trim() || 'Google Meet', MAX_TITLE_CHARS),
        meetLink,
        start: event.start?.dateTime?.trim() ?? event.start?.date?.trim() ?? '',
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);

  if (events.length === 0) {
    await context.publish(
      'lifeos.bridge.google.meet.updated',
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
      .filter((tag) => tag.startsWith(MEET_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const event of events) {
    const dedupeTag = toMeetTag(event.id);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const content = clampText(
      [event.start ? `Start: ${event.start}` : null, `Join: ${event.meetLink}`]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );
    const persisted = await client.appendNote({
      title: `Meet: ${event.title}`,
      content,
      tags: ['google-meet', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.meet.updated',
    {
      count: appended,
      scanned: events.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
