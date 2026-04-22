import type { BaseEvent } from '@lifeos/event-bus';
import { Topics } from '@lifeos/contracts';
import type { LifeGraphClient, LifeGraphDocument } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

interface VoiceTaskIntentPayload {
  utterance?: string;
  taskTitle?: string;
  planId?: string;
  taskId?: string;
  dueDate?: string;
  requestedAt?: string;
}

interface TickOverduePayload {
  checkedTasks: number;
  overdueTasks: Array<{
    id: string;
    title: string;
    dueDate: string;
  } & ({ planId?: string } | { goalTitle: string })>;
  tickedAt: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASK_TITLE_CHARS = 160;
const MAX_OVERDUE_TASKS_PER_TICK = 200;

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

function isDateOnly(value: string): boolean {
  return DATE_ONLY_PATTERN.test(value);
}

function normalizeTitle(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_TASK_TITLE_CHARS);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nextWeekday(baseDate: Date, weekday: number): string {
  const candidate = new Date(baseDate);
  const delta = (weekday - candidate.getDay() + 7) % 7 || 7;
  candidate.setDate(candidate.getDate() + delta);
  return toDateOnly(candidate);
}

function parseDueDateFromUtterance(utterance: string | undefined, now: Date): string | null {
  const text = utterance?.trim().toLowerCase();
  if (!text) {
    return null;
  }

  const explicitIso = text.match(/\bby\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
  if (explicitIso && isDateOnly(explicitIso)) {
    return explicitIso;
  }

  if (text.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDateOnly(tomorrow);
  }

  const weekdayMatch = text.match(
    /\bby\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  )?.[1];
  if (weekdayMatch) {
    return nextWeekday(now, WEEKDAY_INDEX[weekdayMatch.toLowerCase()] ?? now.getDay());
  }

  const monthDayMatch = text.match(/\bby\s+([a-z]+)\s+(\d{1,2})\b/i);
  if (monthDayMatch) {
    const parsed = new Date(`${monthDayMatch[1]} ${monthDayMatch[2]}, ${now.getUTCFullYear()}`);
    if (!Number.isNaN(parsed.getTime())) {
      if (parsed.getTime() < now.getTime()) {
        parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
      }
      return toDateOnly(parsed);
    }
  }

  return null;
}

function resolveDueDate(payload: VoiceTaskIntentPayload, now: Date): string | null {
  if (payload.dueDate && isDateOnly(payload.dueDate)) {
    return payload.dueDate;
  }
  return parseDueDateFromUtterance(payload.utterance, now);
}

function resolveActionId(graph: LifeGraphDocument, payload: VoiceTaskIntentPayload): string | null {
  if (payload.taskId) {
    return payload.taskId;
  }

  const normalizedTitle = normalizeTitle(payload.taskTitle);
  if (!normalizedTitle) {
    return null;
  }

  for (const action of graph.plannedActions ?? []) {
    if (payload.planId && action.planId !== payload.planId) {
      continue;
    }
    if (normalizeTitle(action.title) === normalizedTitle) {
      return action.id;
    }
  }

  return null;
}

function resolveRequestedAt(value: string | undefined): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function markVoiceTask(
  graph: LifeGraphDocument,
  payload: VoiceTaskIntentPayload,
  now: Date,
): { nextGraph: LifeGraphDocument; updatedActionId: string | null; dueDate: string | null } {
  const dueDate = resolveDueDate(payload, now);
  const resolvedActionId = resolveActionId(graph, payload);
  if (!resolvedActionId) {
    return { nextGraph: graph, updatedActionId: null, dueDate };
  }

  let updatedActionId: string | null = null;
  const nextPlannedActions = (graph.plannedActions ?? []).map((action) => {
    if (action.id !== resolvedActionId) {
      return action;
    }

    updatedActionId = action.id;
    const resolvedDueDate = dueDate ?? action.dueDate;
    return {
      ...action,
      ...(resolvedDueDate ? { dueDate: resolvedDueDate } : {}),
    };
  });

  return {
    nextGraph: {
      ...graph,
      updatedAt: now.toISOString(),
      plannedActions: nextPlannedActions,
    },
    updatedActionId,
    dueDate,
  };
}

function applyRescheduleSuggestions(
  graph: LifeGraphDocument,
  overdueTaskIds: string[],
  suggestedIso: string,
  nowIso: string,
): { nextGraph: LifeGraphDocument; updatedTaskIds: string[] } {
  const updatedTaskIds: string[] = [];
  const overdueSet = new Set(overdueTaskIds.slice(0, MAX_OVERDUE_TASKS_PER_TICK));
  const nextPlannedActions = (graph.plannedActions ?? []).map((action) => {
    if (!overdueSet.has(action.id)) {
      return action;
    }
    if (action.status === 'done' || action.status === 'cancelled') {
      return action;
    }
    if (action.deferredUntil && action.deferredUntil >= nowIso) {
      return action;
    }

    updatedTaskIds.push(action.id);
    return {
      ...action,
      deferredUntil: suggestedIso,
    };
  });

  return {
    nextGraph: {
      ...graph,
      updatedAt: new Date().toISOString(),
      plannedActions: nextPlannedActions,
    },
    updatedTaskIds,
  };
}

async function handleVoiceTaskIntent(
  event: BaseEvent<VoiceTaskIntentPayload>,
  context: ModuleRuntimeContext,
): Promise<void> {
  const client = createClient(context);
  const graph = await client.loadGraph();
  const now = resolveRequestedAt(event.data.requestedAt);
  const { nextGraph, updatedActionId, dueDate } = markVoiceTask(graph, event.data, now);

  if (!updatedActionId) {
    context.log('[Scheduler] No matching planned action found for voice task intent.');
    return;
  }

  await client.saveGraph(nextGraph);
  context.log(
    `[Scheduler] Updated voice planned action ${updatedActionId}${dueDate ? ` due ${dueDate}` : ''}`,
  );
}

async function handleTickOverdue(
  event: BaseEvent<TickOverduePayload>,
  context: ModuleRuntimeContext,
): Promise<void> {
  if (event.data.overdueTasks.length === 0) {
    return;
  }

  const client = createClient(context);
  const graph = await client.loadGraph();
  const tickedAt = new Date(event.data.tickedAt);
  const base = Number.isNaN(tickedAt.getTime()) ? new Date() : tickedAt;
  const nowIso = base.toISOString();
  const suggestedIso = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { nextGraph, updatedTaskIds } = applyRescheduleSuggestions(
    graph,
    event.data.overdueTasks.map((task) => task.id),
    suggestedIso,
    nowIso,
  );
  if (updatedTaskIds.length === 0) {
    return;
  }

  await client.saveGraph(nextGraph);
  await context.publish(
    Topics.lifeos.taskRescheduleSuggested,
    {
      taskIds: updatedTaskIds,
      suggestedReschedule: suggestedIso,
      sourceEventId: event.id,
    },
    'scheduler-module',
  );
  context.log(`[Scheduler] Suggested reschedule for ${updatedTaskIds.length} overdue task(s).`);
}

export function createSchedulerModule(): LifeOSModule {
  return {
    id: 'scheduler',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<VoiceTaskIntentPayload>(
        Topics.lifeos.voiceIntentTaskAdd,
        async (event) => {
          try {
            await handleVoiceTaskIntent(event, context);
          } catch (error: unknown) {
            context.log(`[Scheduler] voice intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<TickOverduePayload>(Topics.lifeos.tickOverdue, async (event) => {
        try {
          await handleTickOverdue(event, context);
        } catch (error: unknown) {
          context.log(`[Scheduler] tick handler degraded: ${normalizeErrorMessage(error)}`);
        }
      });
    },
  };
}

export const schedulerModule = createSchedulerModule();
