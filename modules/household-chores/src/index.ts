import { randomUUID } from 'node:crypto';

import type {
  HouseholdChoreCreateRequested,
  HouseholdChoreAssigned,
  HouseholdChoreCompleted,
} from '@lifeos/contracts';
import {
  HouseholdChoreCreateRequestedSchema,
  Topics,
  type LifeOSModule,
  type ModuleRuntimeContext,
} from '@lifeos/module-sdk';

export { calculateStreak } from './streak';
export { getNextDueDate, isOverdue } from './recurrence';

export type ChorePublishContext = Pick<ModuleRuntimeContext, 'publish'>;

export interface ChoreIntentStore {
  createRequestedChore(payload: HouseholdChoreCreateRequested): HouseholdChoreAssigned | null;
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

      await context.subscribe<HouseholdChoreCreateRequested>(
        Topics.lifeos.householdChoreCreateRequested,
        async (event) => {
          const payload = HouseholdChoreCreateRequestedSchema.parse(event.data);
          const assigned = store.createRequestedChore(payload);
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
