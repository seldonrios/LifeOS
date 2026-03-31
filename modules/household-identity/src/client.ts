import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AuditLogEntry,
  HomeStateChange,
  HouseholdCaptureStatusResponse,
  HouseholdContextSummary,
  HouseholdUpdateConfigRequest,
} from '@lifeos/contracts';
import { HouseholdRoleSchema } from '@lifeos/module-sdk';

import { calculateStreak, getNextDueDate, isOverdue } from './chore-logic';

import { canPerform } from './roles';

type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '001_household_schema.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');
const migration002Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '002_household_features.sql',
);
const migration002Sql = readFileSync(migration002Path, 'utf8');
const migration003Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '003_calendar_events.sql',
);
const migration003Sql = readFileSync(migration003Path, 'utf8');
const migration004Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '004_home_state.sql',
);
const migration004Sql = readFileSync(migration004Path, 'utf8');

function parseInviteExpiry(expiresAt: string): number {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error('Invite token expiry must be a valid ISO datetime');
  }

  return expiresAtMs;
}

export interface HouseholdRow {
  id: string;
  name: string;
  created_at: string;
  config_json: string | null;
}

export interface HouseholdMemberRow {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  status: string;
  invited_by: string | null;
  joined_at: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
}

export interface ShoppingItemRow {
  id: string;
  list_id: string;
  household_id: string;
  title: string;
  status: 'added' | 'in_cart' | 'purchased';
  added_by_user_id: string;
  source: 'manual' | 'voice' | 'routine';
  created_at: string;
  purchased_at?: string | null;
}

export interface ShoppingListRow {
  id: string;
  household_id: string;
  name: string;
}

export interface CalendarRow {
  id: string;
  household_id: string;
  name: string;
  color: string;
}

export interface CalendarEventRow {
  id: string;
  calendar_id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrence_rule: string | null;
  reminder_at: string | null;
  attendee_user_ids_json: string;
}

export interface CalendarEventWithCalendarColorRow extends CalendarEventRow {
  calendar_color: string;
}

export interface ChoreRow {
  id: string;
  household_id: string;
  title: string;
  assigned_to_user_id: string;
  due_at: string;
  status: 'pending' | 'completed';
  recurrence_rule: string | null;
  assigned_to_json?: string | null;
  rotation_policy?: string | null;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ChoreAssignmentRow {
  id: string;
  chore_id: string;
  assigned_to: string;
  due_at: string;
  status: string;
}

export interface ChoreRunRow {
  id: string;
  chore_id: string;
  completed_by: string;
  completed_at: string;
}

export interface ChoreWithDetail {
  id: string;
  title: string;
  recurrenceRule: string | null;
  assignedTo: {
    userId: string;
    displayName: string;
  };
  dueAt: string;
  status: 'pending' | 'overdue' | 'completed';
  streakCount: number;
  isOverdue: boolean;
}

export interface CompletedChoreRow extends ChoreRow {
  streakCount: number;
}

export interface ReminderRow {
  id: string;
  household_id: string;
  object_type: string;
  object_id: string;
  target_user_ids_json: string;
  remind_at: string;
  sensitive: number;
  created_at: string;
}

export type ReminderAutomationErrorCode =
  | 'REMINDER_NO_TOKEN'
  | 'REMINDER_QUIET_HOURS'
  | 'REMINDER_MEMBER_INACTIVE';

export interface ReminderAutomationFailure {
  targetUserId: string;
  errorCode: ReminderAutomationErrorCode;
  fixSuggestion: string;
  deliveryStatus: 'failed' | 'quiet_hours_suppressed';
}

export interface NoteRow {
  id: string;
  household_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

export interface HomeStateLogRow {
  id: string;
  household_id: string;
  device_id: string;
  state_key: string;
  previous_value: string | null;
  new_value: string;
  source: 'ha_bridge' | 'manual' | 'routine';
  consent_verified: number;
  created_at: string;
}

export class InvalidShoppingItemTransitionError extends Error {
  readonly code = 'INVALID_SHOPPING_ITEM_TRANSITION';

  constructor(currentStatus: string, nextStatus: string) {
    super(`Cannot transition shopping item from ${currentStatus} to ${nextStatus}`);
    this.name = 'InvalidShoppingItemTransitionError';
  }
}

export class InvalidAttendeeError extends Error {
  readonly code = 'INVALID_ATTENDEE';

  constructor(attendeeUserIds: string[]) {
    super(`Invalid attendee user ids: ${attendeeUserIds.join(', ')}`);
    this.name = 'InvalidAttendeeError';
  }
}

export class HouseholdGraphClient {
  private readonly db: Database.Database;

  constructor(dbPath: string = process.env.LIFEOS_HOUSEHOLD_DB_PATH ?? '') {
    if (!dbPath || dbPath.trim().length === 0) {
      throw new Error('HouseholdGraphClient requires a valid dbPath');
    }

    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initializeSchema(): void {
    this.db.exec(migrationSql);
    this.db.exec(migration002Sql);
    try {
      this.db.exec(migration003Sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column name/i.test(message)) {
        throw error;
      }
    }
    this.db.exec(migration004Sql);
    this.ensureFeatureSchema();
  }

  private ensureFeatureSchema(): void {
    this.ensureColumn('shopping_items', 'household_id', "TEXT DEFAULT ''");
    this.ensureColumn('shopping_items', 'added_by_user_id', "TEXT DEFAULT ''");
    this.ensureColumn('shopping_items', 'source', "TEXT DEFAULT 'manual'");
    this.ensureColumn('shopping_items', 'created_at', "TEXT DEFAULT ''");
    this.ensureColumn('shopping_items', 'archived_at', 'TEXT');
    this.ensureColumn('shopping_items', 'purchased_at', 'TEXT');
    this.ensureColumn('shopping_items', 'original_capture_id', 'TEXT');

    this.ensureColumn('chores', 'assigned_to_user_id', "TEXT DEFAULT ''");
    this.ensureColumn('chores', 'due_at', "TEXT DEFAULT ''");
    this.ensureColumn('chores', 'status', "TEXT DEFAULT 'pending'");
    this.ensureColumn('chores', 'completed_by_user_id', 'TEXT');
    this.ensureColumn('chores', 'completed_at', 'TEXT');
    this.ensureColumn('chores', 'created_at', "TEXT DEFAULT ''");
    this.ensureColumn('chores', 'original_capture_id', 'TEXT');

    this.ensureColumn('events', 'status', "TEXT NOT NULL DEFAULT 'confirmed'");
    this.ensureColumn('events', 'attendee_user_ids_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('events', 'household_id', 'TEXT');

    this.ensureColumn('reminders', 'sensitive', 'INTEGER NOT NULL DEFAULT 0');

    // Create capture_routing_log table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS capture_routing_log (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        capture_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'resolved', 'unresolved')),
        resolved_action TEXT,
        object_id TEXT,
        created_at TEXT NOT NULL
      )
    `);

    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_shopping_items_household_id ON shopping_items(household_id)',
    );
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_shopping_items_list_id ON shopping_items(list_id)',
    );
    this.db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_items_original_capture_id ON shopping_items(original_capture_id) WHERE original_capture_id IS NOT NULL',
    );
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_chores_household_id ON chores(household_id)');
    this.db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_chores_original_capture_id ON chores(original_capture_id) WHERE original_capture_id IS NOT NULL',
    );
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON events(calendar_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at)');
    this.db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_capture_routing_log_capture ON capture_routing_log(household_id, capture_id)',
    );

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS home_state_log (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT NOT NULL,
        source TEXT NOT NULL,
        consent_verified INTEGER NOT NULL CHECK(consent_verified IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
      )
    `);
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_home_state_log_household_created ON home_state_log(household_id, created_at DESC)',
    );
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_home_state_log_household_state_key ON home_state_log(household_id, state_key)',
    );
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_home_state_log_household_device ON home_state_log(household_id, device_id)',
    );
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const tableInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    const hasColumn = tableInfo.some((column) => column.name === columnName);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

  private getOrCreateDefaultShoppingListId(householdId: string): string {
    const existingList = this.db
      .prepare('SELECT id FROM shopping_lists WHERE household_id = ? LIMIT 1')
      .get(householdId) as { id: string } | undefined;
    if (existingList) {
      return existingList.id;
    }

    const listId = randomUUID();
    this.db
      .prepare('INSERT INTO shopping_lists (id, household_id, name) VALUES (?, ?, ?)')
      .run(listId, householdId, 'Default');
    return listId;
  }

  createHousehold(name: string, configJson?: string): HouseholdRow {
    const now = new Date().toISOString();
    const id = randomUUID();

    const transaction = this.db.transaction((householdId: string, createdAt: string) => {
      this.db
        .prepare('INSERT INTO households (id, name, created_at, config_json) VALUES (?, ?, ?, ?)')
        .run(householdId, name, createdAt, configJson ?? null);

      return this.db
        .prepare('SELECT id, name, created_at, config_json FROM households WHERE id = ?')
        .get(householdId) as HouseholdRow;
    });

    return transaction(id, now);
  }

  createHouseholdWithCreator(
    name: string,
    creatorUserId: string,
    role: HouseholdRole = 'Admin',
    configJson?: string,
  ): { household: HouseholdRow; member: HouseholdMemberRow } {
    const now = new Date().toISOString();
    const id = randomUUID();
    const parsedRole = HouseholdRoleSchema.parse(role) as HouseholdRole;

    const transaction = this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO households (id, name, created_at, config_json) VALUES (?, ?, ?, ?)')
        .run(id, name, now, configJson ?? null);

      this.db
        .prepare(
          `INSERT INTO household_members
            (household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at)
           VALUES (?, ?, ?, 'active', ?, ?, NULL, NULL)`,
        )
        .run(id, creatorUserId, parsedRole, creatorUserId, now);

      const household = this.db
        .prepare('SELECT id, name, created_at, config_json FROM households WHERE id = ?')
        .get(id) as HouseholdRow;
      const member = this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(id, creatorUserId) as HouseholdMemberRow;

      return { household, member };
    });

    return transaction();
  }

  getHousehold(id: string): HouseholdRow | null {
    const row = this.db
      .prepare('SELECT id, name, created_at, config_json FROM households WHERE id = ?')
      .get(id) as HouseholdRow | undefined;
    return row ?? null;
  }

  getHouseholdConfig(householdId: string): Record<string, unknown> {
    const household = this.getHousehold(householdId);
    if (!household?.config_json) {
      return {};
    }

    try {
      const parsed = JSON.parse(household.config_json) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  evaluateReminderAutomationFailures(
    householdId: string,
    targetUserIds: string[],
    remindAt: string,
  ): ReminderAutomationFailure[] {
    const remindAtDate = new Date(remindAt);
    const config = this.getHouseholdConfig(householdId);
    const notificationMembers = this.getNotificationRoutingMembers(config);

    return targetUserIds.flatMap((targetUserId) => {
      const member = this.getMember(householdId, targetUserId);
      const profile = notificationMembers[targetUserId] ?? null;

      if (!member || member.status !== 'active' || profile?.deviceActive === false) {
        return {
          targetUserId,
          errorCode: 'REMINDER_MEMBER_INACTIVE' as const,
          fixSuggestion: `Member ${targetUserId} has no active device`,
          deliveryStatus: 'failed' as const,
        };
      }

      if (profile?.quietHours && this.isWithinQuietHours(remindAtDate, profile.quietHours)) {
        return {
          targetUserId,
          errorCode: 'REMINDER_QUIET_HOURS' as const,
          fixSuggestion: `Reminder suppressed by quiet hours (${profile.quietHours.start}-${profile.quietHours.end})`,
          deliveryStatus: 'quiet_hours_suppressed' as const,
        };
      }

      if (!profile?.pushToken || profile.pushToken.trim().length === 0) {
        return {
          targetUserId,
          errorCode: 'REMINDER_NO_TOKEN' as const,
          fixSuggestion: `Check notification settings for ${targetUserId}`,
          deliveryStatus: 'failed' as const,
        };
      }

      return [];
    });
  }

  updateHouseholdConfig(householdId: string, patch: HouseholdUpdateConfigRequest): HouseholdRow {
    const currentConfig = this.getHouseholdConfig(householdId);
    const nextConfig: Record<string, unknown> = {
      ...currentConfig,
    };

    if (patch.haIntegrationEnabled !== undefined) {
      nextConfig.haIntegrationEnabled = patch.haIntegrationEnabled;
    }

    if (patch.haConsentedStateKeys !== undefined) {
      nextConfig.haConsentedStateKeys = patch.haConsentedStateKeys;
    }

    this.db
      .prepare('UPDATE households SET config_json = ? WHERE id = ?')
      .run(JSON.stringify(nextConfig), householdId);

    const household = this.getHousehold(householdId);
    if (!household) {
      throw new Error('Household not found');
    }

    return household;
  }

  addMember(
    householdId: string,
    userId: string,
    role: HouseholdRole,
    invitedBy: string,
  ): HouseholdMemberRow {
    const parsedRole = HouseholdRoleSchema.parse(role) as HouseholdRole;

    const transaction = this.db.transaction((validatedRole: HouseholdRole) => {
      this.db
        .prepare(
          `INSERT INTO household_members
            (household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at)
           VALUES (?, ?, ?, 'invited', ?, NULL, NULL, NULL)`,
        )
        .run(householdId, userId, validatedRole, invitedBy);

      return this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(householdId, userId) as HouseholdMemberRow;
    });

    return transaction(parsedRole);
  }

  updateMemberRole(
    householdId: string,
    userId: string,
    newRole: HouseholdRole,
  ): HouseholdMemberRow {
    const parsedRole = HouseholdRoleSchema.parse(newRole) as HouseholdRole;

    const transaction = this.db.transaction((validatedRole: HouseholdRole) => {
      this.db
        .prepare('UPDATE household_members SET role = ? WHERE household_id = ? AND user_id = ?')
        .run(validatedRole, householdId, userId);

      return this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(householdId, userId) as HouseholdMemberRow;
    });

    return transaction(parsedRole);
  }

  suspendMember(householdId: string, userId: string): HouseholdMemberRow {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE household_members SET status = 'suspended' WHERE household_id = ? AND user_id = ?",
        )
        .run(householdId, userId);

      return this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(householdId, userId) as HouseholdMemberRow;
    });

    return transaction();
  }

  storeInviteToken(
    householdId: string,
    userId: string,
    token: string,
    expiresAt: string,
  ): HouseholdMemberRow {
    parseInviteExpiry(expiresAt);

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE household_members
           SET invite_token = ?, invite_expires_at = ?
           WHERE household_id = ? AND user_id = ?`,
        )
        .run(token, expiresAt, householdId, userId);

      return this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(householdId, userId) as HouseholdMemberRow;
    });

    return transaction();
  }

  acceptInvite(token: string, expectedHouseholdId?: string): HouseholdMemberRow {
    const nowIso = new Date().toISOString();

    const transaction = this.db.transaction((inviteToken: string, acceptedAt: string) => {
      const member = this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE invite_token = ?`,
        )
        .get(inviteToken) as HouseholdMemberRow | undefined;

      if (!member) {
        throw new Error('Invite token not found');
      }

      if (expectedHouseholdId && member.household_id !== expectedHouseholdId) {
        throw new Error('Invite token not found');
      }

      if (!member.invite_expires_at) {
        throw new Error('Invite token has expired');
      }

      let expiresAtMs: number;
      try {
        expiresAtMs = parseInviteExpiry(member.invite_expires_at);
      } catch {
        throw new Error('Invite token has expired');
      }

      if (expiresAtMs <= Date.now()) {
        throw new Error('Invite token has expired');
      }

      this.db
        .prepare(
          `UPDATE household_members
           SET status = 'active', joined_at = ?, invite_token = NULL, invite_expires_at = NULL
           WHERE household_id = ? AND user_id = ?`,
        )
        .run(acceptedAt, member.household_id, member.user_id);

      return this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(member.household_id, member.user_id) as HouseholdMemberRow;
    });

    return transaction(token, nowIso);
  }

  acceptInviteForUser(
    token: string,
    expectedHouseholdId: string,
    expectedUserId: string,
  ): HouseholdMemberRow {
    const nowIso = new Date().toISOString();

    const transaction = this.db.transaction((inviteToken: string, acceptedAt: string) => {
      const householdMember = this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE invite_token = ? AND household_id = ?`,
        )
        .get(inviteToken, expectedHouseholdId) as HouseholdMemberRow | undefined;

      if (!householdMember) {
        throw new Error('Invite token not found');
      }

      if (householdMember.user_id !== expectedUserId) {
        throw new Error('Forbidden invite token');
      }

      const member = this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE invite_token = ? AND household_id = ? AND user_id = ?`,
        )
        .get(inviteToken, expectedHouseholdId, expectedUserId) as HouseholdMemberRow | undefined;

      if (!member) {
        throw new Error('Invite token not found');
      }

      if (!member.invite_expires_at) {
        throw new Error('Invite token has expired');
      }

      let expiresAtMs: number;
      try {
        expiresAtMs = parseInviteExpiry(member.invite_expires_at);
      } catch {
        throw new Error('Invite token has expired');
      }

      if (expiresAtMs <= Date.now()) {
        throw new Error('Invite token has expired');
      }

      this.db
        .prepare(
          `UPDATE household_members
           SET status = 'active', joined_at = ?, invite_token = NULL, invite_expires_at = NULL
           WHERE household_id = ? AND user_id = ?`,
        )
        .run(acceptedAt, member.household_id, member.user_id);

      return this.db
        .prepare(
          `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
           FROM household_members
           WHERE household_id = ? AND user_id = ?`,
        )
        .get(member.household_id, member.user_id) as HouseholdMemberRow;
    });

    return transaction(token, nowIso);
  }

  getMember(householdId: string, userId: string): HouseholdMemberRow | null {
    const member = this.db
      .prepare(
        `SELECT household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at
         FROM household_members
         WHERE household_id = ? AND user_id = ?`,
      )
      .get(householdId, userId) as HouseholdMemberRow | undefined;
    return member ?? null;
  }

  createCalendar(householdId: string, name: string, color: string): CalendarRow {
    const id = randomUUID();

    this.db
      .prepare(
        `INSERT INTO household_calendars
          (id, household_id, name, color)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, householdId, name, color);

    return this.getCalendar(householdId, id) as CalendarRow;
  }

  listCalendars(householdId: string): CalendarRow[] {
    return this.db
      .prepare(
        `SELECT id, household_id, name, color
         FROM household_calendars
         WHERE household_id = ?
         ORDER BY name ASC`,
      )
      .all(householdId) as CalendarRow[];
  }

  getCalendar(householdId: string, calendarId: string): CalendarRow | null {
    const row = this.db
      .prepare(
        `SELECT id, household_id, name, color
         FROM household_calendars
         WHERE household_id = ? AND id = ?`,
      )
      .get(householdId, calendarId) as CalendarRow | undefined;
    return row ?? null;
  }

  createEvent(
    calendarId: string,
    householdId: string,
    title: string,
    startAt: string,
    endAt: string,
    status: 'confirmed' | 'tentative' | 'cancelled',
    recurrenceRule: string | null,
    reminderAt: string | null,
    attendeeUserIds: string[],
  ): CalendarEventRow {
    const calendar = this.getCalendar(householdId, calendarId);
    if (!calendar) {
      throw new Error('Calendar not found');
    }

    const uniqueAttendeeUserIds = [...new Set(attendeeUserIds)];
    this.assertValidActiveAttendees(householdId, uniqueAttendeeUserIds);

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO events
          (id, calendar_id, household_id, title, start_at, end_at, status, recurrence_rule, reminder_at, attendee_user_ids_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        calendarId,
        householdId,
        title,
        startAt,
        endAt,
        status,
        recurrenceRule,
        reminderAt,
        JSON.stringify(uniqueAttendeeUserIds),
      );

    return this.getEvent(householdId, calendarId, id) as CalendarEventRow;
  }

  listEvents(
    householdId: string,
    calendarId: string,
    from?: string,
    to?: string,
  ): CalendarEventWithCalendarColorRow[] {
    const filters: string[] = ['e.household_id = ?', 'e.calendar_id = ?'];
    const args: string[] = [householdId, calendarId];

    if (from) {
      filters.push('e.start_at >= ?');
      args.push(from);
    }
    if (to) {
      filters.push('e.start_at <= ?');
      args.push(to);
    }

    return this.db
      .prepare(
        `SELECT e.id, e.calendar_id, e.title, e.start_at, e.end_at, e.status,
                e.recurrence_rule, e.reminder_at, e.attendee_user_ids_json,
                c.color AS calendar_color
         FROM events e
         INNER JOIN household_calendars c ON c.id = e.calendar_id
         WHERE ${filters.join(' AND ')}
         ORDER BY e.start_at ASC`,
      )
      .all(...args) as CalendarEventWithCalendarColorRow[];
  }

  getEvent(householdId: string, calendarId: string, eventId: string): CalendarEventRow | null {
    const row = this.db
      .prepare(
        `SELECT e.id, e.calendar_id, e.title, e.start_at, e.end_at, e.status,
                e.recurrence_rule, e.reminder_at, e.attendee_user_ids_json
         FROM events e
         INNER JOIN household_calendars c ON c.id = e.calendar_id
         WHERE e.id = ? AND e.calendar_id = ? AND e.household_id = ? AND c.household_id = ?`,
      )
      .get(eventId, calendarId, householdId, householdId) as CalendarEventRow | undefined;
    return row ?? null;
  }

  updateEvent(
    householdId: string,
    calendarId: string,
    eventId: string,
    patch: {
      title?: string;
      startAt?: string;
      endAt?: string;
      status?: 'confirmed' | 'tentative' | 'cancelled';
    },
  ): CalendarEventRow {
    const existing = this.getEvent(householdId, calendarId, eventId);
    if (!existing) {
      throw new Error('Event not found');
    }

    const updates: string[] = [];
    const args: string[] = [];

    if (patch.title !== undefined) {
      updates.push('title = ?');
      args.push(patch.title);
    }
    if (patch.startAt !== undefined) {
      updates.push('start_at = ?');
      args.push(patch.startAt);
    }
    if (patch.endAt !== undefined) {
      updates.push('end_at = ?');
      args.push(patch.endAt);
    }
    if (patch.status !== undefined) {
      updates.push('status = ?');
      args.push(patch.status);
    }

    if (updates.length === 0) {
      return existing;
    }

    args.push(eventId, calendarId, householdId);
    this.db
      .prepare(
        `UPDATE events
         SET ${updates.join(', ')}
         WHERE id = ? AND calendar_id = ? AND household_id = ?`,
      )
      .run(...args);

    return this.getEvent(householdId, calendarId, eventId) as CalendarEventRow;
  }

  addShoppingItem(
    householdId: string,
    title: string,
    addedByUserId: string,
    source: 'manual' | 'voice' | 'routine',
    listId?: string,
    originalCaptureId?: string,
  ): ShoppingItemRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      const targetListId = listId
        ? ((
            this.db
              .prepare('SELECT id FROM shopping_lists WHERE household_id = ? AND id = ? LIMIT 1')
              .get(householdId, listId) as { id: string } | undefined
          )?.id ?? null)
        : this.getOrCreateDefaultShoppingListId(householdId);

      if (!targetListId) {
        throw new Error('Shopping list not found');
      }

      this.db
        .prepare(
          `INSERT INTO shopping_items
            (id, list_id, household_id, title, added_by, added_by_user_id, status, source, created_at, original_capture_id)
           VALUES (?, ?, ?, ?, ?, ?, 'added', ?, ?, ?)`,
        )
        .run(
          id,
          targetListId,
          householdId,
          title,
          addedByUserId,
          addedByUserId,
          source,
          createdAt,
          originalCaptureId ?? null,
        );

      // Write routing log entry if this was created from a voice capture
      if (originalCaptureId) {
        this.writeRoutingLogEntry(
          householdId,
          originalCaptureId,
          'resolved',
          `Added: ${title} → Shopping list`,
          id,
        );
      }

      return this.getShoppingItem(householdId, id) as ShoppingItemRow;
    });

    return transaction();
  }

  updateShoppingItemStatus(
    householdId: string,
    itemId: string,
    newStatus: 'added' | 'in_cart' | 'purchased',
  ): ShoppingItemRow {
    const item = this.getShoppingItem(householdId, itemId);
    if (!item) {
      throw new Error('Shopping item not found');
    }

    const allowedTransitions: Record<ShoppingItemRow['status'], ShoppingItemRow['status'][]> = {
      added: ['in_cart', 'purchased'],
      in_cart: ['purchased'],
      purchased: [],
    };

    if (!allowedTransitions[item.status].includes(newStatus)) {
      throw new InvalidShoppingItemTransitionError(item.status, newStatus);
    }

    const purchasedAt = newStatus === 'purchased' ? new Date().toISOString() : null;

    this.db
      .prepare(
        'UPDATE shopping_items SET status = ?, purchased_at = ? WHERE id = ? AND household_id = ?',
      )
      .run(newStatus, purchasedAt, itemId, householdId);

    return this.getShoppingItem(householdId, itemId) as ShoppingItemRow;
  }

  listShoppingLists(householdId: string): ShoppingListRow[] {
    return this.db
      .prepare(
        `SELECT id, household_id, name
         FROM shopping_lists
         WHERE household_id = ?`,
      )
      .all(householdId) as ShoppingListRow[];
  }

  listShoppingItems(householdId: string, listId: string): ShoppingItemRow[] {
    return this.db
      .prepare(
        `SELECT id, list_id, household_id, title, status, added_by_user_id, source, created_at, purchased_at
         FROM shopping_items
         WHERE household_id = ? AND list_id = ? AND archived_at IS NULL
         ORDER BY created_at ASC`,
      )
      .all(householdId, listId) as ShoppingItemRow[];
  }

  clearPurchasedItems(householdId: string, listId: string): void {
    this.db
      .prepare(
        `UPDATE shopping_items
         SET archived_at = ?
         WHERE household_id = ? AND list_id = ? AND status = 'purchased' AND archived_at IS NULL`,
      )
      .run(new Date().toISOString(), householdId, listId);
  }

  getShoppingItem(householdId: string, itemId: string): ShoppingItemRow | null {
    const row = this.db
      .prepare(
        `SELECT id, list_id, household_id, title, status, added_by_user_id, source, created_at, purchased_at
         FROM shopping_items
         WHERE household_id = ? AND id = ?`,
      )
      .get(householdId, itemId) as ShoppingItemRow | undefined;
    return row ?? null;
  }

  createChore(
    householdId: string,
    title: string,
    assignedToUserId: string,
    dueAt: string,
    recurrenceRule?: string,
    originalCaptureId?: string,
  ): ChoreRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO chores
          (id, household_id, title, assigned_to_user_id, due_at, status, recurrence_rule, created_at, original_capture_id)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        id,
        householdId,
        title,
        assignedToUserId,
        dueAt,
        recurrenceRule ?? null,
        createdAt,
        originalCaptureId ?? null,
      );

    // Write routing log entry if this was created from a voice capture
    if (originalCaptureId) {
      this.writeRoutingLogEntry(
        householdId,
        originalCaptureId,
        'resolved',
        `Created chore: ${title}`,
        id,
      );
    }

    return this.getChore(householdId, id) as ChoreRow;
  }

  listChores(householdId: string): ChoreWithDetail[] {
    const chores = this.db
      .prepare(
        `SELECT id, household_id, title, assigned_to_user_id, due_at, status, recurrence_rule,
                completed_by_user_id, completed_at, created_at
         FROM chores
         WHERE household_id = ?
         ORDER BY created_at DESC`,
      )
      .all(householdId) as ChoreRow[];

    const latestAssignmentStatement = this.db.prepare(
      `SELECT id, chore_id, assigned_to, due_at, status
       FROM chore_assignments
       WHERE chore_id = ?
       ORDER BY due_at DESC, id DESC
       LIMIT 1`,
    );

    return chores.map((chore) => {
      const assignment = latestAssignmentStatement.get(chore.id) as ChoreAssignmentRow | undefined;
      const assignedUserId = assignment?.assigned_to ?? chore.assigned_to_user_id;
      const dueAt = assignment?.due_at ?? chore.due_at;

      const member = assignedUserId
        ? ((this.db
            .prepare(
              `SELECT user_id
               FROM household_members
               WHERE household_id = ? AND user_id = ?
               LIMIT 1`,
            )
            .get(householdId, assignedUserId) as { user_id: string } | undefined) ?? null)
        : null;

      const runs = this.getChoreRuns(chore.id);
      const overdue = isOverdue(dueAt);
      const derivedStatus: ChoreWithDetail['status'] =
        chore.status === 'completed' ? 'completed' : overdue ? 'overdue' : 'pending';

      return {
        id: chore.id,
        title: chore.title,
        recurrenceRule: chore.recurrence_rule,
        assignedTo: {
          userId: assignedUserId,
          displayName: member?.user_id ?? assignedUserId,
        },
        dueAt,
        status: derivedStatus,
        streakCount: calculateStreak(runs, chore.recurrence_rule),
        isOverdue: overdue,
      };
    });
  }

  getChoreHistory(householdId: string, choreId: string): ChoreRunRow[] {
    this.assertChoreBelongsToHousehold(householdId, choreId);

    return this.db
      .prepare(
        `SELECT id, chore_id, completed_by, completed_at
         FROM chore_runs
         WHERE chore_id = ?
         ORDER BY completed_at DESC`,
      )
      .all(choreId) as ChoreRunRow[];
  }

  assignChore(
    householdId: string,
    choreId: string,
    userId: string,
    actorId: string,
    fromDate: Date = new Date(),
  ): ChoreAssignmentRow {
    const actorMember = this.getMember(householdId, actorId);
    if (!actorMember || actorMember.status !== 'active') {
      throw new Error('Forbidden');
    }
    if (!canPerform(actorMember.role, 'complete_chore') || actorMember.role === 'Teen') {
      throw new Error('Insufficient role');
    }

    const chore = this.getChore(householdId, choreId);
    if (!chore) {
      throw new Error('Chore not found');
    }

    this.assertActiveHouseholdMember(householdId, userId);

    return this.createChoreAssignmentRecord(householdId, chore, userId, fromDate);
  }

  completeChore(
    householdId: string,
    choreId: string,
    completedByUserId: string,
  ): CompletedChoreRow {
    const completedAt = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      const actorMember = this.getMember(householdId, completedByUserId);
      if (!actorMember || actorMember.status !== 'active') {
        throw new Error('Forbidden');
      }
      if (!canPerform(actorMember.role, 'complete_chore')) {
        throw new Error('Insufficient role');
      }

      const chore = this.getChore(householdId, choreId);
      if (!chore) {
        throw new Error('Chore not found');
      }

      const currentlyAssignedUserId = this.getCurrentAssignedUserId(chore);
      if (actorMember.role !== 'Admin' && currentlyAssignedUserId !== completedByUserId) {
        throw new Error('Only assigned member or Admin can complete chore');
      }

      this.db
        .prepare(
          `UPDATE chores
           SET status = 'completed', completed_by_user_id = ?, completed_at = ?
           WHERE household_id = ? AND id = ?`,
        )
        .run(completedByUserId, completedAt, householdId, choreId);

      this.db
        .prepare(
          `INSERT INTO chore_runs
            (id, chore_id, completed_by, completed_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(randomUUID(), choreId, completedByUserId, completedAt);

      if (chore.rotation_policy === 'round-robin' && chore.assigned_to_json) {
        const assignees = this.parseAssigneeRotation(chore.assigned_to_json);
        if (assignees.length > 0) {
          const currentAssignee = currentlyAssignedUserId || completedByUserId;
          const currentIndex = Math.max(assignees.indexOf(currentAssignee), 0);
          const nextAssignee = assignees[(currentIndex + 1) % assignees.length];

          if (nextAssignee) {
            this.createChoreAssignmentRecord(
              householdId,
              chore,
              nextAssignee,
              new Date(completedAt),
            );
          }
        }
      }

      const updated = this.getChore(householdId, choreId);
      if (!updated) {
        throw new Error('Chore not found');
      }

      const runs = this.getChoreRuns(choreId);
      return {
        ...updated,
        streakCount: calculateStreak(runs, updated.recurrence_rule),
      };
    });

    return transaction();
  }

  getChore(householdId: string, choreId: string): ChoreRow | null {
    const row = this.db
      .prepare(
        `SELECT id, household_id, title, assigned_to_user_id, due_at, status, recurrence_rule,
                assigned_to_json, rotation_policy,
                completed_by_user_id, completed_at, created_at
         FROM chores
         WHERE household_id = ? AND id = ?`,
      )
      .get(householdId, choreId) as ChoreRow | undefined;
    return row ?? null;
  }

  private assertChoreBelongsToHousehold(householdId: string, choreId: string): void {
    const exists = this.db
      .prepare('SELECT id FROM chores WHERE household_id = ? AND id = ? LIMIT 1')
      .get(householdId, choreId) as { id: string } | undefined;

    if (!exists) {
      throw new Error('Chore not found');
    }
  }

  private assertActiveHouseholdMember(householdId: string, userId: string): void {
    const member = this.getMember(householdId, userId);
    if (!member) {
      throw new Error('Assignee not found');
    }
    if (member.status !== 'active') {
      throw new Error('Invalid assignee status');
    }
  }

  private assertValidActiveAttendees(householdId: string, attendeeUserIds: string[]): void {
    if (attendeeUserIds.length === 0) {
      return;
    }

    const placeholders = attendeeUserIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT user_id
         FROM household_members
         WHERE household_id = ? AND status = 'active' AND user_id IN (${placeholders})`,
      )
      .all(householdId, ...attendeeUserIds) as Array<{ user_id: string }>;

    if (rows.length === attendeeUserIds.length) {
      return;
    }

    const activeAttendees = new Set(rows.map((row) => row.user_id));
    const invalidAttendees = attendeeUserIds.filter((userId) => !activeAttendees.has(userId));
    throw new InvalidAttendeeError(invalidAttendees);
  }

  private createChoreAssignmentRecord(
    householdId: string,
    chore: ChoreRow,
    userId: string,
    fromDate: Date,
  ): ChoreAssignmentRow {
    this.assertActiveHouseholdMember(householdId, userId);

    let dueAt = chore.due_at;
    if (chore.recurrence_rule) {
      const nextDue = getNextDueDate(chore.recurrence_rule, fromDate);
      if (!nextDue) {
        throw new Error('Chore recurrence has ended');
      }
      dueAt = nextDue.toISOString();
    }

    const assignmentId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chore_assignments
          (id, chore_id, assigned_to, due_at, status)
         VALUES (?, ?, ?, ?, 'pending')`,
      )
      .run(assignmentId, chore.id, userId, dueAt);

    this.db
      .prepare(
        `UPDATE chores
         SET assigned_to_user_id = ?, due_at = ?, status = 'pending', completed_by_user_id = NULL, completed_at = NULL
         WHERE household_id = ? AND id = ?`,
      )
      .run(userId, dueAt, householdId, chore.id);

    return this.db
      .prepare(
        `SELECT id, chore_id, assigned_to, due_at, status
         FROM chore_assignments
         WHERE id = ?`,
      )
      .get(assignmentId) as ChoreAssignmentRow;
  }

  private getCurrentAssignedUserId(chore: ChoreRow): string {
    const latestAssignment = this.db
      .prepare(
        `SELECT assigned_to
         FROM chore_assignments
         WHERE chore_id = ?
         ORDER BY due_at DESC, id DESC
         LIMIT 1`,
      )
      .get(chore.id) as { assigned_to: string } | undefined;

    return latestAssignment?.assigned_to ?? chore.assigned_to_user_id;
  }

  private parseAssigneeRotation(assignedToJson: string): string[] {
    try {
      const parsed = JSON.parse(assignedToJson) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (entry): entry is string => typeof entry === 'string' && entry.length > 0,
      );
    } catch {
      return [];
    }
  }

  private getChoreRuns(choreId: string): ChoreRunRow[] {
    return this.db
      .prepare(
        `SELECT id, chore_id, completed_by, completed_at
         FROM chore_runs
         WHERE chore_id = ?
         ORDER BY completed_at DESC`,
      )
      .all(choreId) as ChoreRunRow[];
  }

  createReminder(
    householdId: string,
    objectType: string,
    objectId: string,
    targetUserIds: string[],
    remindAt: string,
    sensitive = false,
  ): ReminderRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO reminders
          (id, household_id, object_type, object_id, target_user_ids_json, remind_at, sensitive, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        householdId,
        objectType,
        objectId,
        JSON.stringify(targetUserIds),
        remindAt,
        sensitive ? 1 : 0,
        createdAt,
      );

    return this.db
      .prepare(
        `SELECT id, household_id, object_type, object_id, target_user_ids_json, remind_at, sensitive, created_at
         FROM reminders
         WHERE id = ?`,
      )
      .get(id) as ReminderRow;
  }

  createNote(householdId: string, authorUserId: string, body: string): NoteRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO notes
          (id, household_id, author_user_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, householdId, authorUserId, body, createdAt);

    return this.db
      .prepare(
        `SELECT id, household_id, author_user_id, body, created_at
         FROM notes
         WHERE id = ?`,
      )
      .get(id) as NoteRow;
  }

  appendHomeStateLog(input: {
    householdId: string;
    deviceId: string;
    stateKey: string;
    previousValue: unknown;
    newValue: unknown;
    source: 'ha_bridge' | 'manual' | 'routine';
    consentVerified: boolean;
  }): HomeStateLogRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO home_state_log
          (id, household_id, device_id, state_key, previous_value, new_value, source, consent_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.householdId,
        input.deviceId,
        input.stateKey,
        input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
        JSON.stringify(input.newValue),
        input.source,
        input.consentVerified ? 1 : 0,
        createdAt,
      );

    return this.db
      .prepare(
        `SELECT id, household_id, device_id, state_key, previous_value, new_value, source, consent_verified, created_at
         FROM home_state_log
         WHERE id = ?`,
      )
      .get(id) as HomeStateLogRow;
  }

  listRecentHomeStateChanges(householdId: string, limit = 20): HomeStateChange[] {
    const rows = this.db
      .prepare(
        `SELECT id, household_id, device_id, state_key, previous_value, new_value, source, consent_verified, created_at
         FROM home_state_log
         WHERE household_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(householdId, limit) as HomeStateLogRow[];

    return rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      stateKey: row.state_key,
      previousValue: row.previous_value ? JSON.parse(row.previous_value) : null,
      newValue: JSON.parse(row.new_value),
      source: row.source,
      consentVerified: row.consent_verified === 1,
      createdAt: row.created_at,
    }));
  }

  getHouseholdContextSummary(householdId: string): HouseholdContextSummary {
    const rows = this.db
      .prepare(
        `SELECT id, household_id, device_id, state_key, previous_value, new_value, source, consent_verified, created_at
         FROM home_state_log
         WHERE household_id = ?
         ORDER BY created_at DESC`,
      )
      .all(householdId) as HomeStateLogRow[];

    const recentStateChanges = rows.slice(0, 20).map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      stateKey: row.state_key,
      previousValue: row.previous_value ? JSON.parse(row.previous_value) : null,
      newValue: JSON.parse(row.new_value),
      source: row.source,
      consentVerified: row.consent_verified === 1,
      createdAt: row.created_at,
    }));

    const seenPresenceKeys = new Set<string>();
    const membersHome: string[] = [];

    const seenDevices = new Set<string>();
    const activeDevices: string[] = [];

    for (const row of rows) {
      if (row.state_key.startsWith('presence.') && !seenPresenceKeys.has(row.state_key)) {
        seenPresenceKeys.add(row.state_key);
        const memberId = row.state_key.slice('presence.'.length).trim();
        const currentValue = JSON.parse(row.new_value) as unknown;
        if (memberId.length > 0 && this.toBooleanHomeState(currentValue)) {
          membersHome.push(memberId);
        }
      }

      if (this.isActivityStateKey(row.state_key) && !seenDevices.has(row.device_id)) {
        seenDevices.add(row.device_id);
        const currentValue = JSON.parse(row.new_value) as unknown;
        if (this.toBooleanHomeState(currentValue)) {
          activeDevices.push(row.device_id);
        }
      }
    }

    return {
      membersHome,
      activeDevices,
      recentStateChanges,
    };
  }

  private toBooleanHomeState(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'on' ||
      normalized === 'home' ||
      normalized === 'present' ||
      normalized === 'active'
    );
  }

  private isActivityStateKey(stateKey: string): boolean {
    const normalized = stateKey.trim().toLowerCase();
    if (normalized.length === 0) {
      return false;
    }

    return (
      normalized.startsWith('presence.') ||
      normalized.startsWith('activity.') ||
      normalized.startsWith('power.') ||
      normalized.startsWith('occupancy.') ||
      normalized.startsWith('motion.') ||
      normalized.endsWith('.presence') ||
      normalized.endsWith('.activity') ||
      normalized.endsWith('.power') ||
      normalized.endsWith('.occupancy') ||
      normalized.endsWith('.motion')
    );
  }

  private getNotificationRoutingMembers(config: Record<string, unknown>): Record<
    string,
    {
      pushToken?: string;
      deviceActive?: boolean;
      quietHours?: { start: string; end: string };
    }
  > {
    const routing = config.notificationRouting;
    if (!routing || typeof routing !== 'object' || Array.isArray(routing)) {
      return {};
    }

    const members = (routing as { members?: unknown }).members;
    if (!members || typeof members !== 'object' || Array.isArray(members)) {
      return {};
    }

    return members as Record<
      string,
      { pushToken?: string; deviceActive?: boolean; quietHours?: { start: string; end: string } }
    >;
  }

  private isWithinQuietHours(value: Date, quietHours: { start: string; end: string }): boolean {
    const start = this.parseClockMinutes(quietHours.start);
    const end = this.parseClockMinutes(quietHours.end);
    if (start === null || end === null || Number.isNaN(value.getTime())) {
      return false;
    }

    const minutes = value.getUTCHours() * 60 + value.getUTCMinutes();
    if (start === end) {
      return false;
    }

    if (start < end) {
      return minutes >= start && minutes < end;
    }

    return minutes >= start || minutes < end;
  }

  private parseClockMinutes(value: string): number | null {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return null;
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }

  getCaptureStatus(householdId: string, captureId: string): HouseholdCaptureStatusResponse {
    const routingEntry = this.db
      .prepare(
        `SELECT status, resolved_action, object_id
         FROM capture_routing_log
         WHERE household_id = ? AND capture_id = ?
         LIMIT 1`,
      )
      .get(householdId, captureId) as
      | { status: string; resolved_action?: string | null; object_id?: string | null }
      | undefined;

    if (routingEntry) {
      const response: HouseholdCaptureStatusResponse = {
        status: routingEntry.status as 'pending' | 'resolved' | 'unresolved',
      };
      if (routingEntry.resolved_action) {
        response.resolvedAction = routingEntry.resolved_action;
      }
      if (routingEntry.object_id) {
        response.objectId = routingEntry.object_id;
      }
      return response;
    }

    return { status: 'pending' };
  }

  writeRoutingLogEntry(
    householdId: string,
    captureId: string,
    status: 'pending' | 'resolved' | 'unresolved',
    resolvedAction?: string,
    objectId?: string,
  ): void {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO capture_routing_log
          (id, household_id, capture_id, status, resolved_action, object_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, householdId, captureId, status, resolvedAction ?? null, objectId ?? null, createdAt);
  }

  writeAuditEntry(entry: AuditLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit_log
          (id, household_id, actor_id, action_type, object_ref, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.householdId,
        entry.actorId,
        entry.actionType,
        entry.objectRef,
        JSON.stringify(entry.payloadJson),
        entry.createdAt,
      );
  }

  close(): void {
    this.db.close();
  }
}
