import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HomeNodeHomeSchema, HomeNodeSurfaceRegisteredSchema, HomeNodeSurfaceSchema, HomeNodeZoneSchema, HomeStateSnapshotSchema, } from '@lifeos/contracts';
const migration001Path = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '001_homes_zones.sql');
const migration001Sql = readFileSync(migration001Path, 'utf8');
const migration002Path = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '002_surfaces.sql');
const migration002Sql = readFileSync(migration002Path, 'utf8');
const migration003Path = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '003_home_state_snapshots.sql');
const migration003Sql = readFileSync(migration003Path, 'utf8');
const migration004Path = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '004_ambient_actions.sql');
const migration004Sql = readFileSync(migration004Path, 'utf8');
export function toBooleanHomeState(value) {
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
    return (normalized === 'true' ||
        normalized === '1' ||
        normalized === 'on' ||
        normalized === 'home' ||
        normalized === 'present' ||
        normalized === 'active');
}
function toSummaryString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
export function resolveHomeModeTransition(event, currentMode) {
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
export function buildNextSnapshot(current, event, now) {
    const homeMode = resolveHomeModeTransition(event, current.home_mode);
    let occupancySummary = current.occupancy_summary;
    if (event.stateKey === 'presence.anyone_home') {
        occupancySummary = toBooleanHomeState(event.newValue) ? 'occupied' : 'empty';
    }
    else if (event.stateKey.startsWith('presence.')) {
        occupancySummary = toSummaryString(event.newValue) || occupancySummary;
    }
    const activeRoutines = [...current.active_routines];
    if (event.stateKey === 'routine.morning') {
        const index = activeRoutines.indexOf('morning');
        if (toBooleanHomeState(event.newValue)) {
            if (index < 0) {
                activeRoutines.push('morning');
            }
        }
        else if (index >= 0) {
            activeRoutines.splice(index, 1);
        }
    }
    if (event.stateKey === 'routine.evening') {
        const index = activeRoutines.indexOf('evening');
        if (toBooleanHomeState(event.newValue)) {
            if (index < 0) {
                activeRoutines.push('evening');
            }
        }
        else if (index >= 0) {
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
function parseJson(value, fallback) {
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function ensureIsoDateTime(value) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        throw new Error('Expected a valid ISO datetime value');
    }
    return parsed.toISOString();
}
function toHomeNodeHome(row) {
    return HomeNodeHomeSchema.parse({
        home_id: row.home_id,
        household_id: row.household_id,
        name: row.name,
        timezone: row.timezone,
        quiet_hours_start: row.quiet_hours_start ?? undefined,
        quiet_hours_end: row.quiet_hours_end ?? undefined,
        routine_profile: row.routine_profile ?? undefined,
    });
}
function toHomeNodeZone(row) {
    return HomeNodeZoneSchema.parse({
        zone_id: row.zone_id,
        home_id: row.home_id,
        name: row.name,
        type: row.type,
    });
}
function toHomeNodeSurface(row) {
    return HomeNodeSurfaceSchema.parse({
        surface_id: row.surface_id,
        zone_id: row.zone_id,
        kind: row.kind,
        trust_level: row.trust_level,
        capabilities: parseJson(row.capabilities_json, []),
        active: row.active === 1,
        registered_at: row.registered_at,
    });
}
function toHomeNodeSurfaceRegistered(row) {
    return HomeNodeSurfaceRegisteredSchema.parse({
        surface_id: row.surface_id,
        zone_id: row.zone_id,
        home_id: row.home_id,
        household_id: row.household_id,
        kind: row.kind,
        trust_level: row.trust_level,
        capabilities: parseJson(row.capabilities_json, []),
        registered_at: row.registered_at,
    });
}
export class HomeNodeGraphClient {
    db;
    constructor(dbPath = process.env.LIFEOS_HOME_NODE_DB_PATH ?? '') {
        if (!dbPath || dbPath.trim().length === 0) {
            throw new Error('HomeNodeGraphClient requires a valid dbPath');
        }
        mkdirSync(dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }
    initializeSchema() {
        this.db.exec(migration001Sql);
        this.db.exec(migration002Sql);
        this.db.exec(migration003Sql);
        this.db.exec(migration004Sql);
        this.ensureFeatureSchema();
    }
    ensureFeatureSchema() {
        this.ensureColumn('home_state_snapshots', 'updated_at', "TEXT DEFAULT ''");
        this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_home_state_snapshots_household_id ON home_state_snapshots(household_id)');
    }
    ensureColumn(tableName, columnName, definition) {
        const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
        if (columns.some((column) => column.name === columnName)) {
            return;
        }
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
    upsertHome(input) {
        const createdAt = ensureIsoDateTime(input.createdAt ?? new Date().toISOString());
        this.db
            .prepare(`INSERT INTO homes (
          home_id,
          household_id,
          name,
          timezone,
          quiet_hours_start,
          quiet_hours_end,
          routine_profile,
          created_at
        ) VALUES (
          @home_id,
          @household_id,
          @name,
          @timezone,
          @quiet_hours_start,
          @quiet_hours_end,
          @routine_profile,
          @created_at
        )
        ON CONFLICT(home_id) DO UPDATE SET
          household_id = excluded.household_id,
          name = excluded.name,
          timezone = excluded.timezone,
          quiet_hours_start = excluded.quiet_hours_start,
          quiet_hours_end = excluded.quiet_hours_end,
          routine_profile = excluded.routine_profile`)
            .run({
            home_id: input.homeId,
            household_id: input.householdId,
            name: input.name,
            timezone: input.timezone,
            quiet_hours_start: input.quietHoursStart ?? null,
            quiet_hours_end: input.quietHoursEnd ?? null,
            routine_profile: input.routineProfile ?? null,
            created_at: createdAt,
        });
        const home = this.getHomeById(input.homeId);
        if (!home) {
            throw new Error(`Failed to upsert home ${input.homeId}`);
        }
        return home;
    }
    getHomeById(homeId) {
        const row = this.db.prepare('SELECT * FROM homes WHERE home_id = ? LIMIT 1').get(homeId);
        if (!row) {
            return null;
        }
        return toHomeNodeHome(row);
    }
    getHomeByHouseholdId(householdId) {
        const row = this.db
            .prepare('SELECT * FROM homes WHERE household_id = ? LIMIT 1')
            .get(householdId);
        if (!row) {
            return null;
        }
        return toHomeNodeHome(row);
    }
    upsertZone(input) {
        const createdAt = ensureIsoDateTime(input.createdAt ?? new Date().toISOString());
        this.db
            .prepare(`INSERT INTO zones (
          zone_id,
          home_id,
          name,
          type,
          created_at
        ) VALUES (
          @zone_id,
          @home_id,
          @name,
          @type,
          @created_at
        )
        ON CONFLICT(zone_id) DO UPDATE SET
          home_id = excluded.home_id,
          name = excluded.name,
          type = excluded.type`)
            .run({
            zone_id: input.zoneId,
            home_id: input.homeId,
            name: input.name,
            type: input.type,
            created_at: createdAt,
        });
        const zone = this.getZoneById(input.zoneId);
        if (!zone) {
            throw new Error(`Failed to upsert zone ${input.zoneId}`);
        }
        return zone;
    }
    getZoneById(zoneId) {
        const row = this.db
            .prepare('SELECT zone_id, home_id, name, type FROM zones WHERE zone_id = ? LIMIT 1')
            .get(zoneId);
        if (!row) {
            return null;
        }
        return toHomeNodeZone(row);
    }
    listZonesInHome(homeId) {
        const rows = this.db
            .prepare('SELECT zone_id, home_id, name, type FROM zones WHERE home_id = ? ORDER BY name ASC')
            .all(homeId);
        return rows.map((row) => toHomeNodeZone(row));
    }
    registerSurface(input) {
        const home = this.getHomeById(input.homeId);
        if (!home) {
            throw new Error(`Cannot register surface ${input.surfaceId}: home ${input.homeId} was not found`);
        }
        const zone = this.getZoneById(input.zoneId);
        if (!zone) {
            throw new Error(`Cannot register surface ${input.surfaceId}: zone ${input.zoneId} was not found`);
        }
        if (zone.home_id !== input.homeId) {
            throw new Error(`Cannot register surface ${input.surfaceId}: zone ${input.zoneId} does not belong to home ${input.homeId}`);
        }
        const existingSurface = this.db
            .prepare('SELECT trust_level FROM surfaces WHERE surface_id = ? LIMIT 1')
            .get(input.surfaceId);
        if (existingSurface && existingSurface.trust_level !== input.trustLevel) {
            throw new Error(`Cannot register surface ${input.surfaceId}: trust level is immutable once registered`);
        }
        const registeredAt = ensureIsoDateTime(input.registeredAt ?? new Date().toISOString());
        const lastSeenAt = ensureIsoDateTime(input.lastSeenAt ?? registeredAt);
        this.db
            .prepare(`INSERT INTO surfaces (
          surface_id,
          zone_id,
          home_id,
          kind,
          trust_level,
          capabilities_json,
          active,
          registered_at,
          last_seen_at
        ) VALUES (
          @surface_id,
          @zone_id,
          @home_id,
          @kind,
          @trust_level,
          @capabilities_json,
          1,
          @registered_at,
          @last_seen_at
        )
        ON CONFLICT(surface_id) DO UPDATE SET
          zone_id = excluded.zone_id,
          home_id = excluded.home_id,
          kind = excluded.kind,
          capabilities_json = excluded.capabilities_json,
          active = 1,
          registered_at = excluded.registered_at,
          last_seen_at = excluded.last_seen_at`)
            .run({
            surface_id: input.surfaceId,
            zone_id: input.zoneId,
            home_id: input.homeId,
            kind: input.kind,
            trust_level: input.trustLevel,
            capabilities_json: JSON.stringify(input.capabilities),
            registered_at: registeredAt,
            last_seen_at: lastSeenAt,
        });
        const row = this.getSurfaceRowWithHousehold(input.surfaceId);
        if (!row) {
            throw new Error(`Failed to register surface ${input.surfaceId}`);
        }
        return toHomeNodeSurfaceRegistered(row);
    }
    deregisterSurface(surfaceId) {
        const row = this.getSurfaceRowWithHousehold(surfaceId);
        if (!row) {
            return null;
        }
        this.db.prepare('UPDATE surfaces SET active = 0 WHERE surface_id = ?').run(surfaceId);
        return toHomeNodeSurfaceRegistered(row);
    }
    getSurface(surfaceId) {
        const row = this.db
            .prepare('SELECT * FROM surfaces WHERE surface_id = ? LIMIT 1')
            .get(surfaceId);
        if (!row) {
            return null;
        }
        return toHomeNodeSurface(row);
    }
    getRegisteredSurface(surfaceId) {
        const row = this.getSurfaceRowWithHousehold(surfaceId);
        if (!row) {
            return null;
        }
        return toHomeNodeSurfaceRegistered(row);
    }
    listSurfaces(filter = {}) {
        const clauses = [];
        const params = [];
        if (filter.householdId) {
            clauses.push('h.household_id = ?');
            params.push(filter.householdId);
        }
        if (filter.homeId) {
            clauses.push('s.home_id = ?');
            params.push(filter.homeId);
        }
        if (filter.zoneId) {
            clauses.push('s.zone_id = ?');
            params.push(filter.zoneId);
        }
        if (filter.active !== undefined) {
            clauses.push('s.active = ?');
            params.push(filter.active ? 1 : 0);
        }
        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = this.db
            .prepare(`SELECT s.*
         FROM surfaces s
         INNER JOIN homes h ON h.home_id = s.home_id
         ${whereClause}
         ORDER BY s.registered_at DESC`)
            .all(...params);
        return rows.map((row) => toHomeNodeSurface(row));
    }
    recordSurfaceHeartbeat(surfaceId, seenAt = new Date().toISOString()) {
        const heartbeatAt = ensureIsoDateTime(seenAt);
        const row = this.db
            .prepare('SELECT 1 as present FROM surfaces WHERE surface_id = ? LIMIT 1')
            .get(surfaceId);
        if (!row) {
            return null;
        }
        this.db
            .prepare('UPDATE surfaces SET active = 1, last_seen_at = ? WHERE surface_id = ?')
            .run(heartbeatAt, surfaceId);
        return this.getSurface(surfaceId);
    }
    listStaleActiveSurfaces(cutoff) {
        const cutoffIso = ensureIsoDateTime(cutoff);
        const rows = this.db
            .prepare(`SELECT s.*, h.household_id
         FROM surfaces s
         INNER JOIN homes h ON h.home_id = s.home_id
         WHERE s.active = 1
           AND COALESCE(s.last_seen_at, s.registered_at) < ?
         ORDER BY COALESCE(s.last_seen_at, s.registered_at) ASC`)
            .all(cutoffIso);
        return rows.map((row) => toHomeNodeSurfaceRegistered(row));
    }
    markSurfaceInactive(surfaceId) {
        const result = this.db
            .prepare('UPDATE surfaces SET active = 0 WHERE surface_id = ? AND active = 1')
            .run(surfaceId);
        return result.changes > 0;
    }
    getSurfaceRowWithHousehold(surfaceId) {
        const row = this.db
            .prepare(`SELECT s.*, h.household_id
         FROM surfaces s
         INNER JOIN homes h ON h.home_id = s.home_id
         WHERE s.surface_id = ?
         LIMIT 1`)
            .get(surfaceId);
        return row ?? null;
    }
    upsertHomeStateSnapshot(input) {
        const now = ensureIsoDateTime(input.snapshotAt ?? new Date().toISOString());
        const snapshot = HomeStateSnapshotSchema.parse({
            home_mode: input.homeMode,
            occupancy_summary: input.occupancySummary,
            active_routines: input.activeRoutines,
            adapter_health: input.adapterHealth,
            snapshot_at: now,
        });
        this.db
            .prepare(`INSERT INTO home_state_snapshots (
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
          updated_at = excluded.updated_at`)
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
    getHomeStateSnapshot(householdId) {
        const row = this.db
            .prepare('SELECT * FROM home_state_snapshots WHERE household_id = ? LIMIT 1')
            .get(householdId);
        if (!row) {
            return null;
        }
        const occupancySummary = parseJson(row.occupancy_summary_json, row.occupancy_summary_json);
        const activeRoutines = parseJson(row.active_routines_json, []);
        const adapterHealthRaw = parseJson(row.adapter_health_json, {});
        return HomeStateSnapshotSchema.parse({
            home_mode: row.home_mode,
            occupancy_summary: occupancySummary,
            active_routines: activeRoutines,
            adapter_health: adapterHealthRaw.status === 'healthy' ||
                adapterHealthRaw.status === 'degraded' ||
                adapterHealthRaw.status === 'unavailable'
                ? adapterHealthRaw.status
                : 'healthy',
            snapshot_at: row.snapshot_at,
        });
    }
    appendAmbientAction(input) {
        const actionId = randomUUID();
        const createdAt = ensureIsoDateTime(input.createdAt ?? new Date().toISOString());
        this.db
            .prepare(`INSERT INTO ambient_actions (
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
        )`)
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
    getSnapshotRowCount(householdId) {
        const row = this.db
            .prepare('SELECT COUNT(*) as count FROM home_state_snapshots WHERE household_id = ?')
            .get(householdId);
        return row.count;
    }
    isHealthy() {
        try {
            this.db.prepare('SELECT 1').get();
            return true;
        }
        catch {
            return false;
        }
    }
    close() {
        this.db.close();
    }
}
