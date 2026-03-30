import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HouseholdRoleSchema } from '@lifeos/module-sdk';

type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '001_household_schema.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

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

  acceptInvite(token: string): HouseholdMemberRow {
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

  close(): void {
    this.db.close();
  }
}
