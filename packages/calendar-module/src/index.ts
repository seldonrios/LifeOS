import { Topics, type BaseEvent } from '@lifeos/event-bus';
import {
  CalendarEventSchema,
  type LifeGraphCalendarEvent,
  type LifeGraphClient,
} from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

interface TickOverduePayload {
  checkedTasks: number;
  overdueTasks: Array<{
    id: string;
    title: string;
    goalTitle: string;
    dueDate: string;
  }>;
  tickedAt: string;
}

const MAX_CALENDAR_EVENTS = 2000;
const MAX_CALENDAR_TITLE_CHARS = 200;
const MAX_LOCATION_CHARS = 200;
const MAX_ATTENDEES = 20;
const MAX_ATTENDEE_CHARS = 120;

function createClient(context: ModuleRuntimeContext): LifeGraphClient {
  return context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function normalizeAttendees(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => normalizeString(entry, MAX_ATTENDEE_CHARS))
    .filter((entry): entry is string => entry !== null)
    .slice(0, MAX_ATTENDEES);
  return normalized.length > 0 ? normalized : undefined;
}

function toCalendarEvent(
  data: Record<string, unknown>,
  now: Date = new Date(),
): LifeGraphCalendarEvent {
  const startRaw = data.start;
  const endRaw = data.end;
  const startDate = safeDate(startRaw);
  const endDate = safeDate(endRaw);
  const safeStart =
    startDate && !Number.isNaN(startDate.getTime())
      ? startDate
      : new Date(now.getTime() + 60 * 60 * 1000);
  const safeEnd =
    endDate && endDate.getTime() > safeStart.getTime()
      ? endDate
      : new Date(safeStart.getTime() + 60 * 60 * 1000);

  return CalendarEventSchema.parse({
    id: data.id,
    title: normalizeString(data.title, MAX_CALENDAR_TITLE_CHARS) ?? 'Calendar event',
    start: safeStart.toISOString(),
    end: safeEnd.toISOString(),
    attendees: normalizeAttendees(data.attendees),
    location: normalizeString(data.location, MAX_LOCATION_CHARS) ?? undefined,
    status: data.status,
  }) as LifeGraphCalendarEvent;
}

async function handleCalendarAdd(
  event: BaseEvent<Record<string, unknown>>,
  context: ModuleRuntimeContext,
): Promise<void> {
  const client = createClient(context);
  const now = safeDate(event.timestamp) ?? new Date();
  const calendarEvent = toCalendarEvent(event.data, now);

  const graph = await client.loadGraph();
  const nextEvents = [
    ...(graph.calendarEvents ?? []).filter((existing) => existing.id !== calendarEvent.id),
    calendarEvent,
  ]
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(-MAX_CALENDAR_EVENTS);

  await client.saveGraph({
    ...graph,
    updatedAt: new Date().toISOString(),
    calendarEvents: nextEvents,
  });

  await context.publish(
    Topics.lifeos.calendarEventAdded,
    {
      eventId: calendarEvent.id,
      title: calendarEvent.title,
      start: calendarEvent.start,
      end: calendarEvent.end,
    },
    'calendar-module',
  );

  context.log(`[Calendar] Added event: ${calendarEvent.title}`);
}

async function handleTickOverdue(
  event: BaseEvent<TickOverduePayload>,
  context: ModuleRuntimeContext,
): Promise<void> {
  void event;
  const client = createClient(context);
  const graph = await client.loadGraph();
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const upcoming = (graph.calendarEvents ?? []).filter((item) => {
    const start = new Date(item.start);
    if (Number.isNaN(start.getTime())) {
      return false;
    }
    return start >= now && start <= horizon;
  });

  if (upcoming.length > 0) {
    context.log(`[Calendar] ${upcoming.length} event(s) scheduled in the next 24 hours.`);
  }
}

export function createCalendarModule(): LifeOSModule {
  return {
    id: 'calendar',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentCalendarAdd,
        async (event) => {
          try {
            await handleCalendarAdd(event, context);
          } catch (error: unknown) {
            context.log(`[Calendar] voice intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<TickOverduePayload>(Topics.lifeos.tickOverdue, async (event) => {
        try {
          await handleTickOverdue(event, context);
        } catch (error: unknown) {
          context.log(`[Calendar] tick handler degraded: ${normalizeErrorMessage(error)}`);
        }
      });
    },
  };
}

export const calendarModule = createCalendarModule();
