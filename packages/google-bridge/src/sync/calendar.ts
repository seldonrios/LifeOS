import { createHash } from 'node:crypto';

import { Topics } from '@lifeos/event-bus';
import {
  CalendarEventSchema,
  type LifeGraphCalendarEvent,
  type LifeGraphClient,
  type LifeGraphDocument,
} from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const MAX_EVENTS = 3000;
const MAX_TITLE_CHARS = 220;
const GOOGLE_CALENDAR_EVENTS_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

interface GoogleCalendarEventDateTime {
  dateTime?: string;
  date?: string;
}

interface GoogleCalendarEventItem {
  id?: string;
  summary?: string;
  start?: GoogleCalendarEventDateTime;
  end?: GoogleCalendarEventDateTime;
  status?: string;
  location?: string;
  attendees?: Array<{ email?: string }>;
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEventItem[];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function stableUuidFromGoogleId(seed: string): string {
  const digest = createHash('sha1').update(seed).digest();
  const bytes = digest.subarray(0, 16);
  const b6 = bytes[6] ?? 0;
  const b8 = bytes[8] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x40;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20, 32)}`;
}

function normalizeIso(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizeStatus(value: string | undefined): 'confirmed' | 'tentative' | 'cancelled' {
  if (value === 'cancelled') {
    return 'cancelled';
  }
  if (value === 'tentative') {
    return 'tentative';
  }
  return 'confirmed';
}

function toStartIso(item: GoogleCalendarEventItem, nowIso: string): string {
  return normalizeIso(item.start?.dateTime ?? item.start?.date, nowIso);
}

function toEndIso(item: GoogleCalendarEventItem, startIso: string): string {
  const fallback = new Date(Date.parse(startIso) + 60 * 60 * 1000).toISOString();
  const candidate = normalizeIso(item.end?.dateTime ?? item.end?.date, fallback);
  if (Date.parse(candidate) <= Date.parse(startIso)) {
    return fallback;
  }
  return candidate;
}

function mergeCalendarEvents(
  graph: LifeGraphDocument,
  incoming: LifeGraphCalendarEvent[],
): LifeGraphCalendarEvent[] {
  const existing = graph.calendarEvents ?? [];
  const byId = new Map(existing.map((event) => [event.id, event]));
  for (const event of incoming ?? []) {
    byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(-MAX_EVENTS);
}

export async function syncGoogleCalendar(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
  now = new Date(),
): Promise<number> {
  const nowIso = now.toISOString();
  const url = new URL(GOOGLE_CALENDAR_EVENTS_ENDPOINT);
  url.searchParams.set('timeMin', nowIso);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GoogleCalendarEventsResponse;
  const normalized = (payload.items ?? [])
    .filter((item) => typeof item.id === 'string')
    .map((item) => {
      const googleId = item.id ?? '';
      const start = toStartIso(item, nowIso);
      const end = toEndIso(item, start);
      const attendees = (item.attendees ?? [])
        .map((attendee) => attendee.email?.trim())
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 30);
      const parsed = CalendarEventSchema.parse({
        id: stableUuidFromGoogleId(`google-calendar:${googleId}`),
        title: clampText(item.summary?.trim() || 'Google Calendar Event', MAX_TITLE_CHARS),
        start,
        end,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: item.location?.trim() || undefined,
        status: normalizeStatus(item.status),
      });
      const normalizedEvent: LifeGraphCalendarEvent = {
        id: parsed.id,
        title: parsed.title,
        start: parsed.start,
        end: parsed.end,
        status: parsed.status,
        ...(parsed.attendees ? { attendees: parsed.attendees } : {}),
        ...(parsed.location ? { location: parsed.location } : {}),
      };
      return normalizedEvent;
    });

  const graph = await client.loadGraph();
  await client.saveGraph({
    ...graph,
    updatedAt: new Date().toISOString(),
    calendarEvents: mergeCalendarEvents(graph, normalized),
  });

  await context.publish(
    'lifeos.bridge.google.calendar.updated',
    {
      count: normalized.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  await context.publish(
    Topics.lifeos.calendarEventAdded,
    {
      count: normalized.length,
      source: 'google-bridge',
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return normalized.length;
}
