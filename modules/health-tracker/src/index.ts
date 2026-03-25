import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

import {
  HEALTH_TOPICS,
  type HealthLogIntentPayload,
  type HealthQueryIntentPayload,
} from './events';
import { moduleSchema } from './schema';
import { logMetric, queryMetrics, toStoreError, validateMetricEntryInput } from './store';
import { parseHealthLog, parseHealthQuery } from './voice';

interface HealthTrackerModuleOptions {
  now?: () => Date;
}

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

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getPositiveInt(value: unknown): number | null {
  const numeric = getNumber(value);
  if (numeric === null) {
    return null;
  }
  const normalized = Math.trunc(numeric);
  return normalized > 0 ? normalized : null;
}

function resolveLogPayload(payload: HealthLogIntentPayload): {
  metric: string;
  value: number;
  unit: string;
  note?: string;
} | null {
  const directMetric = getString(payload.metric);
  const directUnit = getString(payload.unit);
  const directValue = getNumber(payload.value);
  const note = getString(payload.note) ?? undefined;

  if (directMetric && directUnit && directValue !== null) {
    return {
      metric: directMetric,
      value: directValue,
      unit: directUnit,
      note,
    };
  }

  const utterance = getString(payload.utterance);
  if (!utterance) {
    return null;
  }

  return parseHealthLog(utterance);
}

function resolveQueryPayload(payload: HealthQueryIntentPayload): {
  metric?: string;
  period?: number;
} {
  const directMetric = getString(payload.metric) ?? undefined;
  const directPeriod = getPositiveInt(payload.period) ?? undefined;

  const utterance = getString(payload.utterance);
  const parsedUtterance = utterance ? (parseHealthQuery(utterance) ?? {}) : {};

  return {
    metric: directMetric ?? parsedUtterance.metric,
    period: directPeriod ?? parsedUtterance.period,
  };
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'health-tracker');
  } catch (error: unknown) {
    context.log(`[HealthTracker] publish degraded (${topic}): ${toStoreError(error)}`);
  }
}

function summarizeEntries(
  entries: Array<{ metric: string; value: number; unit: string; loggedAt: string }>,
): string {
  if (entries.length === 0) {
    return 'No health entries matched your query yet.';
  }

  const lines = entries
    .slice(0, 3)
    .map(
      (entry) => `${entry.metric} ${entry.value} ${entry.unit} at ${entry.loggedAt.slice(0, 10)}`,
    );
  return `Recent health entries: ${lines.join('; ')}.`;
}

async function handleTickReminder(
  client: LifeGraphClient,
  context: ModuleRuntimeContext,
  now: () => Date,
): Promise<void> {
  const recentEntries = await queryMetrics(client, undefined, 14);
  if (recentEntries.length === 0) {
    return;
  }

  const today = now().toISOString().slice(0, 10);
  const latestByMetric = new Map<string, string>();
  for (const entry of recentEntries) {
    const existing = latestByMetric.get(entry.metric);
    if (!existing || entry.loggedAt > existing) {
      latestByMetric.set(entry.metric, entry.loggedAt);
    }
  }

  const missingToday = Array.from(latestByMetric.entries())
    .filter(([, loggedAt]) => !loggedAt.startsWith(today))
    .map(([metric]) => metric);

  if (missingToday.length === 0) {
    return;
  }

  await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
    kind: 'reminder',
    source: 'health-tracker',
    title: 'Health check-in',
    message: `You have not logged ${missingToday.slice(0, 3).join(', ')} today.`,
  });
}

export function createHealthTrackerModule(options: HealthTrackerModuleOptions = {}): LifeOSModule {
  const now = options.now ?? (() => new Date());

  return {
    id: 'health-tracker',
    async init(context: ModuleRuntimeContext): Promise<void> {
      const client = createClient(context);

      try {
        await client.registerModuleSchema(moduleSchema);
      } catch (error: unknown) {
        context.log(`[HealthTracker] schema registration degraded: ${toStoreError(error)}`);
      }

      await context.subscribe<HealthLogIntentPayload>(
        HEALTH_TOPICS.voiceIntentLog,
        async (event) => {
          const payload = resolveLogPayload(event.data);
          if (!payload) {
            context.log('[HealthTracker] Ignored health log intent with missing metric payload.');
            return;
          }

          try {
            const validated = validateMetricEntryInput(payload);
            const saved = await logMetric(client, {
              ...validated,
              loggedAt: now().toISOString(),
            });

            await publishSafe(context, HEALTH_TOPICS.metricLogged, {
              metric: saved.entry.metric,
              value: saved.entry.value,
              unit: saved.entry.unit,
              loggedAt: saved.entry.loggedAt,
              entryId: saved.entry.id,
            });
            await publishSafe(context, HEALTH_TOPICS.streakUpdated, {
              metric: saved.streak.metric,
              currentStreak: saved.streak.currentStreak,
              longestStreak: saved.streak.longestStreak,
              date: saved.streak.lastLoggedDate,
            });
          } catch (error: unknown) {
            context.log(`[HealthTracker] log intent degraded: ${toStoreError(error)}`);
          }
        },
      );

      await context.subscribe<HealthQueryIntentPayload>(
        HEALTH_TOPICS.voiceIntentQuery,
        async (event) => {
          try {
            const query = resolveQueryPayload(event.data);
            const entries = await queryMetrics(client, query.metric, query.period);
            await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
              kind: 'health-query-result',
              source: 'health-tracker',
              message: summarizeEntries(entries),
            });
          } catch (error: unknown) {
            context.log(`[HealthTracker] query intent degraded: ${toStoreError(error)}`);
          }
        },
      );

      await context.subscribe<Record<string, unknown>>(Topics.lifeos.tickOverdue, async () => {
        try {
          await handleTickReminder(client, context, now);
        } catch (error: unknown) {
          context.log(`[HealthTracker] tick reminder degraded: ${toStoreError(error)}`);
        }
      });
    },
  };
}

export const healthTrackerModule = createHealthTrackerModule();

export function toHealthLogPayload(
  event: BaseEvent<Record<string, unknown>>,
): HealthLogIntentPayload {
  return {
    metric: event.data.metric,
    value: event.data.value,
    unit: event.data.unit,
    note: event.data.note,
    utterance: event.data.utterance,
  };
}
