import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HomeStateSnapshotSchema, type HomeMode, type HomeStateSnapshot } from '@lifeos/contracts';

const migration001Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '001_homes_zones.sql',
);
const migration001Sql = readFileSync(migration001Path, 'utf8');
const migration002Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '002_surfaces.sql',
);
const migration002Sql = readFileSync(migration002Path, 'utf8');
const migration003Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '003_home_state_snapshots.sql',
);
const migration003Sql = readFileSync(migration003Path, 'utf8');
const migration004Path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '004_ambient_actions.sql',
);
const migration004Sql = readFileSync(migration004Path, 'utf8');

export interface HomeStateSnapshotRow {
  id: string;
  household_id: string;
  home_mode: HomeMode;
  occupancy_summary_json: string;
  active_routines_json: string;
  adapter_health_json: string;
  snapshot_at: string;
  updated_at: string;
}

export interface AmbientActionWrite {
  householdId: string;
  triggerType: string;
  triggerRef?: string;
  decisionSource: string;
  affectedUserIds?: string[];
  outputSurfaceId?: string;
  result: string;
  auditRef?: string;
  createdAt?: string;
}

export interface HomeStateSnapshotWrite {
  householdId: string;
  homeMode: HomeMode;
  occupancySummary: string;
  activeRoutines: string[];
  adapterHealth: 'healthy' | 'degraded' | 'unavailable';
  snapshotAt?: string;
}

export interface HouseholdHomeStateChangedLike {
  householdId: string;
  stateKey: string;
  newValue: unknown;
  consentVerified: boolean;
}

export function toBooleanHomeState(value: unknown): boolean {
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

function toSummaryString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function resolveHomeModeTransition(
  event: HouseholdHomeStateChangedLike,
  currentMode: HomeMode,
): HomeMode {
  if (!event.consentVerified) {
    return currentMode;
  }

  if (event.stateKey === 'presence.anyone_home') {
    return toBooleanHomeState(event.newValue) ? 'home' : 'away';
  }

  if (event.stateKey === 'routine.morning' && toBooleanHomeState(event.newValue)) {
    return 'morning_routine';
  }

  if (event.stateKey === 'routine.evening' && toBooleanHomeState(event.newValue)) {
    return 'evening_routine';
  }

  if (event.stateKey === 'quiet_hours') {
    return toBooleanHomeState(event.newValue) ? 'quiet_hours' : 'home';
  }

  return currentMode;
}

export function buildNextSnapshot(
  current: HomeStateSnapshot,
  event: HouseholdHomeStateChangedLike,
  now: string,
): HomeStateSnapshot {
  const homeMode = resolveHomeModeTransition(event, current.home_mode);

  let occupancySummary = current.occupancy_summary;
  if (event.stateKey === 'presence.anyone_home') {
    occupancySummary = toBooleanHomeState(event.newValue) ? 'occupied' : 'empty';
  } else if (event.stateKey.startsWith('presence.')) {
    occupancySummary = toSummaryString(event.newValue) || occupancySummary;
  }

  const activeRoutines = [...current.active_routines];
  if (event.stateKey === 'routine.morning') {
    const index = activeRoutines.indexOf('morning');
    if (toBooleanHomeState(event.newValue)) {
      if (index < 0) {
        activeRoutines.push('morning');
      }
    } else if (index >= 0) {
      activeRoutines.splice(index, 1);
    }
  }

  if (event.stateKey === 'routine.evening') {
    const index = activeRoutines.indexOf('evening');
    if (toBooleanHomeState(event.newValue)) {
      if (index < 0) {
        activeRoutines.push('evening');
      }
    } else if (index >= 0) {
      activeRoutines.splice(index, 1);
    }
  }

  let adapterHealth = current.adapter_health;
  if (event.stateKey === 'adapter.health') {
    const normalized = String(event.newValue).trim().toLowerCase();
    if (normalized === 'healthy' || normalized === 'degraded' || normalized === 'unavailable') {
      adapterHealth = normalized;
    }
  }

  return HomeStateSnapshotSchema.parse({
    home_mode: homeMode,
    occupancy_summary: occupancySummary,
    active_routines: activeRoutines,
    adapter_health: adapterHealth,
    snapshot_at: now,
  });
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function ensureIsoDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Expected a valid ISO datetime value');
  }

  return parsed.toISOString();
}

export class HomeNodeGraphClient {
  private readonly db: Database.Database;

  constructor(dbPath: string = process.env.LIFEOS_HOME_NODE_DB_PATH ?? '') {
    if (!dbPath || dbPath.trim().length === 0) {
      throw new Error('HomeNodeGraphClient requires a valid dbPath');
    }

    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initializeSchema(): void {
    this.db.exec(migration001Sql);
    this.db.exec(migration002Sql);
    this.db.exec(migration003Sql);
    this.db.exec(migration004Sql);
    this.ensureFeatureSchema();
  }

  private ensureFeatureSchema(): void {
    this.ensureColumn('home_state_snapshots', 'updated_at', "TEXT DEFAULT ''");
    this.db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_home_state_snapshots_household_id ON home_state_snapshots(household_id)',
    );
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  upsertHomeStateSnapshot(input: HomeStateSnapshotWrite): HomeStateSnapshot {
    const now = ensureIsoDateTime(input.snapshotAt ?? new Date().toISOString());
    const snapshot = HomeStateSnapshotSchema.parse({
      home_mode: input.homeMode,
      occupancy_summary: input.occupancySummary,
      active_routines: input.activeRoutines,
      adapter_health: input.adapterHealth,
      snapshot_at: now,
    });

    this.db
      .prepare(
        `INSERT INTO home_state_snapshots (
          id,
          household_id,
          home_mode,
          occupancy_summary_json,
          active_routines_json,
          adapter_health_json,
          snapshot_at,
          updated_at
        ) VALUES (
          @id,
          @household_id,
          @home_mode,
          @occupancy_summary_json,
          @active_routines_json,
          @adapter_health_json,
          @snapshot_at,
          @updated_at
        )
        ON CONFLICT(household_id) DO UPDATE SET
          home_mode = excluded.home_mode,
          occupancy_summary_json = excluded.occupancy_summary_json,
          active_routines_json = excluded.active_routines_json,
          adapter_health_json = excluded.adapter_health_json,
          snapshot_at = excluded.snapshot_at,
          updated_at = excluded.updated_at`,
      )
      .run({
        id: randomUUID(),
        household_id: input.householdId,
        home_mode: snapshot.home_mode,
        occupancy_summary_json: JSON.stringify(snapshot.occupancy_summary),
        active_routines_json: JSON.stringify(snapshot.active_routines),
        adapter_health_json: JSON.stringify({ status: snapshot.adapter_health }),
        snapshot_at: snapshot.snapshot_at,
        updated_at: now,
      });

    return snapshot;
  }

  getHomeStateSnapshot(householdId: string): HomeStateSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM home_state_snapshots WHERE household_id = ? LIMIT 1')
      .get(householdId) as HomeStateSnapshotRow | undefined;

    if (!row) {
      return null;
    }

    const occupancySummary = parseJson<string>(
      row.occupancy_summary_json,
      row.occupancy_summary_json,
    );
    const activeRoutines = parseJson<string[]>(row.active_routines_json, []);
    const adapterHealthRaw = parseJson<{ status?: string }>(row.adapter_health_json, {});

    return HomeStateSnapshotSchema.parse({
      home_mode: row.home_mode,
      occupancy_summary: occupancySummary,
      active_routines: activeRoutines,
      adapter_health:
        adapterHealthRaw.status === 'healthy' ||
        adapterHealthRaw.status === 'degraded' ||
        adapterHealthRaw.status === 'unavailable'
          ? adapterHealthRaw.status
          : 'healthy',
      snapshot_at: row.snapshot_at,
    });
  }

  appendAmbientAction(input: AmbientActionWrite): string {
    const actionId = randomUUID();
    const createdAt = ensureIsoDateTime(input.createdAt ?? new Date().toISOString());

    this.db
      .prepare(
        `INSERT INTO ambient_actions (
          action_id,
          household_id,
          trigger_type,
          trigger_ref,
          decision_source,
          affected_user_ids_json,
          output_surface_id,
          result,
          audit_ref,
          created_at
        ) VALUES (
          @action_id,
          @household_id,
          @trigger_type,
          @trigger_ref,
          @decision_source,
          @affected_user_ids_json,
          @output_surface_id,
          @result,
          @audit_ref,
          @created_at
        )`,
      )
      .run({
        action_id: actionId,
        household_id: input.householdId,
        trigger_type: input.triggerType,
        trigger_ref: input.triggerRef ?? null,
        decision_source: input.decisionSource,
        affected_user_ids_json: JSON.stringify(input.affectedUserIds ?? []),
        output_surface_id: input.outputSurfaceId ?? null,
        result: input.result,
        audit_ref: input.auditRef ?? null,
        created_at: createdAt,
      });

    return actionId;
  }

  getSnapshotRowCount(householdId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM home_state_snapshots WHERE household_id = ?')
      .get(householdId) as { count: number };

    return row.count;
  }

  isHealthy(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}
