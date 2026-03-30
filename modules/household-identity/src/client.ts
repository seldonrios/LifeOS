import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AuditLogEntry } from '@lifeos/contracts';
import { HouseholdRoleSchema } from '@lifeos/module-sdk';

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
}

export interface ChoreRow {
  id: string;
  household_id: string;
  title: string;
  assigned_to_user_id: string;
  due_at: string;
  status: 'pending' | 'completed';
  recurrence_rule: string | null;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ReminderRow {
  id: string;
  household_id: string;
  object_type: string;
  object_id: string;
  target_user_ids_json: string;
  remind_at: string;
  created_at: string;
}

export interface NoteRow {
  id: string;
  household_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

export class InvalidShoppingItemTransitionError extends Error {
  readonly code = 'INVALID_SHOPPING_ITEM_TRANSITION';

  constructor(currentStatus: string, nextStatus: string) {
    super(`Cannot transition shopping item from ${currentStatus} to ${nextStatus}`);
    this.name = 'InvalidShoppingItemTransitionError';
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
    this.ensureFeatureSchema();
  }

  private ensureFeatureSchema(): void {
    this.ensureColumn('shopping_items', 'household_id', "TEXT DEFAULT ''");
    this.ensureColumn('shopping_items', 'added_by_user_id', "TEXT DEFAULT ''");
    this.ensureColumn('shopping_items', 'source', "TEXT DEFAULT 'manual'");
    this.ensureColumn('shopping_items', 'created_at', "TEXT DEFAULT ''");

    this.ensureColumn('chores', 'assigned_to_user_id', "TEXT DEFAULT ''");
    this.ensureColumn('chores', 'due_at', "TEXT DEFAULT ''");
    this.ensureColumn('chores', 'status', "TEXT DEFAULT 'pending'");
    this.ensureColumn('chores', 'completed_by_user_id', 'TEXT');
    this.ensureColumn('chores', 'completed_at', 'TEXT');
    this.ensureColumn('chores', 'created_at', "TEXT DEFAULT ''");

    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_shopping_items_household_id ON shopping_items(household_id)',
    );
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_chores_household_id ON chores(household_id)');
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

  updateMemberRole(householdId: string, userId: string, newRole: HouseholdRole): HouseholdMemberRow {
    const parsedRole = HouseholdRoleSchema.parse(newRole) as HouseholdRole;

    const transaction = this.db.transaction((validatedRole: HouseholdRole) => {
      this.db
        .prepare(
          'UPDATE household_members SET role = ? WHERE household_id = ? AND user_id = ?',
        )
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

  acceptInviteForUser(token: string, expectedHouseholdId: string, expectedUserId: string): HouseholdMemberRow {
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

  addShoppingItem(
    householdId: string,
    title: string,
    addedByUserId: string,
    source: 'manual' | 'voice' | 'routine',
  ): ShoppingItemRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      const listId = this.getOrCreateDefaultShoppingListId(householdId);
      this.db
        .prepare(
          `INSERT INTO shopping_items
            (id, list_id, household_id, title, added_by, added_by_user_id, status, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'added', ?, ?)`,
        )
        .run(id, listId, householdId, title, addedByUserId, addedByUserId, source, createdAt);

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
      added: ['in_cart'],
      in_cart: ['purchased'],
      purchased: [],
    };

    if (!allowedTransitions[item.status].includes(newStatus)) {
      throw new InvalidShoppingItemTransitionError(item.status, newStatus);
    }

    this.db
      .prepare('UPDATE shopping_items SET status = ? WHERE id = ? AND household_id = ?')
      .run(newStatus, itemId, householdId);

    return this.getShoppingItem(householdId, itemId) as ShoppingItemRow;
  }

  getShoppingItem(householdId: string, itemId: string): ShoppingItemRow | null {
    const row = this.db
      .prepare(
        `SELECT id, list_id, household_id, title, status, added_by_user_id, source, created_at
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
  ): ChoreRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO chores
          (id, household_id, title, assigned_to_user_id, due_at, status, recurrence_rule, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, householdId, title, assignedToUserId, dueAt, recurrenceRule ?? null, createdAt);

    return this.getChore(householdId, id) as ChoreRow;
  }

  completeChore(householdId: string, choreId: string, completedByUserId: string): ChoreRow {
    const completedAt = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE chores
         SET status = 'completed', completed_by_user_id = ?, completed_at = ?
         WHERE household_id = ? AND id = ?`,
      )
      .run(completedByUserId, completedAt, householdId, choreId);

    return this.getChore(householdId, choreId) as ChoreRow;
  }

  getChore(householdId: string, choreId: string): ChoreRow | null {
    const row = this.db
      .prepare(
        `SELECT id, household_id, title, assigned_to_user_id, due_at, status, recurrence_rule,
                completed_by_user_id, completed_at, created_at
         FROM chores
         WHERE household_id = ? AND id = ?`,
      )
      .get(householdId, choreId) as ChoreRow | undefined;
    return row ?? null;
  }

  createReminder(
    householdId: string,
    objectType: string,
    objectId: string,
    targetUserIds: string[],
    remindAt: string,
  ): ReminderRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO reminders
          (id, household_id, object_type, object_id, target_user_ids_json, remind_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, householdId, objectType, objectId, JSON.stringify(targetUserIds), remindAt, createdAt);

    return this.db
      .prepare(
        `SELECT id, household_id, object_type, object_id, target_user_ids_json, remind_at, created_at
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
