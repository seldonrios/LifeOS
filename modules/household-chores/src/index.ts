import { randomUUID } from 'node:crypto';

import type {
  HouseholdAutomationFailed,
  HouseholdChoreCreateRequested,
  HouseholdChoreAssigned,
  HouseholdChoreCompleted,
} from '@lifeos/contracts';
import type { BaseEvent } from '@lifeos/event-bus';
import {
  HouseholdAutomationFailedSchema,
  HouseholdChoreCreateRequestedSchema,
  Topics,
  type LifeOSModule,
  type ModuleRuntimeContext,
} from '@lifeos/module-sdk';
import {
  createObservabilityClient,
  emitAutomationFailureSpan,
  type ObservabilityClient,
} from '@lifeos/observability';

export { calculateStreak } from './streak';
export { getNextDueDate, isOverdue } from './recurrence';

export type ChorePublishContext = Pick<ModuleRuntimeContext, 'publish'>;

export interface ChoreIntentStore {
  createRequestedChore(payload: HouseholdChoreCreateRequested): HouseholdChoreAssigned | null;
}

export interface ChoreAutomationFailure {
  errorCode: 'CHORE_NO_ASSIGNEE' | 'CHORE_RRULE_INVALID';
  fixSuggestion: string;
}

interface ChoreDatabase {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): unknown;
  };
  exec(sql: string): unknown;
}

function applyBestEffortMigration(db: ChoreDatabase, sql: string): void {
  try {
    db.exec(sql);
  } catch {
    return;
  }
}

export async function createChoreIntentStore(dbPath: string): Promise<ChoreIntentStore> {
  const sqlite = await import('better-sqlite3');
  const Database = sqlite.default;
  const db = new Database(dbPath) as ChoreDatabase;

  applyBestEffortMigration(db, 'ALTER TABLE chores ADD COLUMN original_capture_id TEXT');
  applyBestEffortMigration(
    db,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_chores_original_capture_id ON chores(original_capture_id) WHERE original_capture_id IS NOT NULL',
  );

  return {
    createRequestedChore(payload) {
      const existing = db
        .prepare(
          `SELECT id, title, assigned_to_user_id, due_at
           FROM chores
           WHERE original_capture_id = ?
           LIMIT 1`,
        )
        .get(payload.originalCaptureId) as
        | {
            id?: string;
            title?: string;
            assigned_to_user_id?: string;
            due_at?: string;
          }
        | undefined;

      if (existing?.id && existing.title && existing.assigned_to_user_id && existing.due_at) {
        return {
          householdId: payload.householdId,
          choreId: existing.id,
          choreTitle: existing.title,
          assignedToUserId: existing.assigned_to_user_id,
          dueAt: existing.due_at,
        };
      }

      const choreId = randomUUID();
      const now = new Date();
      const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const createdAt = now.toISOString();

      db.prepare(
        `INSERT INTO chores
          (id, household_id, title, assigned_to_user_id, due_at, status, recurrence_rule, completed_by_user_id, completed_at, created_at, original_capture_id)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
      ).run(
        choreId,
        payload.householdId,
        payload.choreTitle,
        payload.actorUserId,
        dueAt,
        createdAt,
        payload.originalCaptureId,
      );

      return {
        householdId: payload.householdId,
        choreId,
        choreTitle: payload.choreTitle,
        assignedToUserId: payload.actorUserId,
        dueAt,
      };
    },
  };
}

interface HouseholdChoresModuleOptions {
  createIntentStore?: (dbPath: string) => Promise<ChoreIntentStore>;
  observabilityClient?: ObservabilityClient;
}

function createModuleObservabilityClient(context: ModuleRuntimeContext): ObservabilityClient {
  return createObservabilityClient({
    serviceName: 'household-chores',
    environment: context.env.LIFEOS_PROFILE?.trim() || process.env.NODE_ENV || 'development',
  });
}

export function resolveChoreAutomationFailure(
  error: unknown,
  input: { choreTitle: string; recurrenceRule?: string | null },
): ChoreAutomationFailure | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/assignee not found|invalid assignee status/i.test(message)) {
    return {
      errorCode: 'CHORE_NO_ASSIGNEE',
      fixSuggestion: `Assign a member to chore '${input.choreTitle}' before enabling recurrence`,
    };
  }

  if (
    /unsupported recurrence frequency|unable to compute next allowed byday occurrence|recurrence/i.test(
      message,
    )
  ) {
    return {
      errorCode: 'CHORE_RRULE_INVALID',
      fixSuggestion: `Invalid recurrence rule: ${input.recurrenceRule ?? message}`,
    };
  }

  return null;
}

async function publishAutomationFailure(
  eventBus: ModuleRuntimeContext['eventBus'],
  payload: HouseholdAutomationFailed,
): Promise<void> {
  const event: BaseEvent<HouseholdAutomationFailed> = {
    id: randomUUID(),
    type: Topics.lifeos.householdAutomationFailed,
    timestamp: new Date().toISOString(),
    source: 'household-chores',
    version: '1',
    data: payload,
    metadata: {
      household_id: payload.household_id,
      actor_id: payload.actor_id,
      trace_id: payload.trace_id,
    },
  };

  await eventBus.publish(Topics.lifeos.householdAutomationFailed, event);
}

export function createHouseholdChoresModule(
  options: HouseholdChoresModuleOptions = {},
): LifeOSModule {
  const createIntentStore = options.createIntentStore ?? createChoreIntentStore;

  return {
    id: 'household-chores',
    async init(context: ModuleRuntimeContext) {
      const dbPath = context.env.LIFEOS_HOUSEHOLD_DB_PATH?.trim();
      if (!dbPath) {
        context.log(
          '[household-chores] skipped intent subscription: missing LIFEOS_HOUSEHOLD_DB_PATH',
        );
        return;
      }

      const store = await createIntentStore(dbPath);
      const observabilityClient =
        options.observabilityClient ?? createModuleObservabilityClient(context);

      await context.subscribe<HouseholdChoreCreateRequested>(
        Topics.lifeos.householdChoreCreateRequested,
        async (event) => {
          const payload = HouseholdChoreCreateRequestedSchema.parse(event.data);
          let assigned: HouseholdChoreAssigned | null;
          try {
            assigned = store.createRequestedChore(payload);
          } catch (error) {
            const failure = resolveChoreAutomationFailure(error, {
              choreTitle: payload.choreTitle,
            });
            if (failure) {
              const span = emitAutomationFailureSpan(observabilityClient, 'household.chore.run', {
                householdId: payload.householdId,
                actorId: payload.actorUserId,
                actionType: 'household.chore.run',
                errorCode: failure.errorCode,
                fixSuggestion: failure.fixSuggestion,
                objectId: payload.originalCaptureId,
                objectRef: `capture:${payload.originalCaptureId}`,
                details: {
                  chore_title: payload.choreTitle,
                },
              });
              await publishAutomationFailure(
                context.eventBus,
                HouseholdAutomationFailedSchema.parse({
                  household_id: payload.householdId,
                  actor_id: payload.actorUserId,
                  action_type: 'household.chore.run',
                  error_code: failure.errorCode,
                  fix_suggestion: failure.fixSuggestion,
                  span_id: span.spanId,
                  trace_id: span.traceId,
                  object_id: payload.originalCaptureId,
                  object_ref: `capture:${payload.originalCaptureId}`,
                  details: {
                    chore_title: payload.choreTitle,
                  },
                }),
              );
            }
            throw error;
          }
          if (!assigned) {
            return;
          }
          await publishChoreAssigned(context, assigned);
        },
      );

      context.log('[household-chores] initialized');
    },
  };
}

export const householdChoresModule: LifeOSModule = createHouseholdChoresModule();

export async function publishChoreAssigned(
  context: ChorePublishContext,
  payload: HouseholdChoreAssigned,
): Promise<void> {
  await context.publish(Topics.lifeos.householdChoreAssigned, payload, 'dashboard-service');
}

export async function publishChoreCompleted(
  context: ChorePublishContext,
  payload: HouseholdChoreCompleted,
): Promise<void> {
  await context.publish(Topics.lifeos.householdChoreCompleted, payload, 'dashboard-service');
}

export default householdChoresModule;
