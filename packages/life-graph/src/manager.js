import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GoalPlanSchema, LegacyLocalLifeGraphSchema, LegacyVersionedLifeGraphDocumentSchema, LIFE_GRAPH_VERSION, LifeGraphDocumentSchema, } from './schema';
import { resolveLifeGraphPath } from './path';
class JsonFileAdapterStore {
    tables = new Map();
    dirty = false;
    getTable(name) {
        return this.tables.get(name.toLowerCase()) ?? new Map();
    }
    getOrCreateTable(name) {
        const lower = name.toLowerCase();
        if (!this.tables.has(lower)) {
            this.tables.set(lower, new Map());
        }
        return this.tables.get(lower);
    }
    clearTable(name) {
        this.tables.set(name.toLowerCase(), new Map());
        this.dirty = true;
    }
    serialize() {
        const out = {};
        for (const [name, rows] of this.tables) {
            out[name] = [...rows.values()];
        }
        return out;
    }
    static deserialize(data) {
        const store = new JsonFileAdapterStore();
        for (const [name, rows] of Object.entries(data)) {
            const table = store.getOrCreateTable(name);
            for (const row of rows) {
                const pk = Object.keys(row)[0];
                if (pk !== undefined) {
                    table.set(row[pk], row);
                }
            }
        }
        return store;
    }
}
class JsonFileAdapterStatement {
    sql;
    store;
    constructor(sql, store) {
        this.sql = sql;
        this.store = store;
    }
    get(...params) {
        const sql = this.sql.trim();
        // SELECT COUNT(*) as count FROM {table}
        const countMatch = /^SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+(\w+)/i.exec(sql);
        if (countMatch) {
            return { count: this.store.getTable(countMatch[1]).size };
        }
        // SELECT value FROM meta WHERE key = ?
        if (/^SELECT\s+value\s+FROM\s+meta\s+WHERE\s+key\s*=\s*\?/i.test(sql)) {
            const key = params[0];
            const row = this.store.getTable('meta').get(key);
            return row !== undefined ? { value: row['value'] } : undefined;
        }
        return undefined;
    }
    all(..._params) {
        const sql = this.sql.trim();
        // SELECT key, value FROM meta WHERE key IN ('a', 'b', ...)
        const metaKeyIn = /^SELECT\s+key,\s*value\s+FROM\s+meta\s+WHERE\s+key\s+IN\s*\(([^)]+)\)/i.exec(sql);
        if (metaKeyIn) {
            const keys = metaKeyIn[1].split(',').map((k) => k.trim().replace(/^'|'$/g, ''));
            const table = this.store.getTable('meta');
            return keys.flatMap((k) => {
                const row = table.get(k);
                return row !== undefined ? [{ key: k, value: row['value'] }] : [];
            });
        }
        // SELECT ... FROM {table} [ORDER BY rowid ASC]
        const selectFrom = /^SELECT\s+.+?\s+FROM\s+(\w+)(?:\s+ORDER\s+BY\s+rowid\s+ASC)?/i.exec(sql);
        if (selectFrom) {
            return [...this.store.getTable(selectFrom[1].toLowerCase()).values()];
        }
        return [];
    }
    run(...params) {
        const sql = this.sql.trim();
        // INSERT OR REPLACE INTO {table} ({cols}) VALUES (...)
        const insertMatch = /^INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i.exec(sql);
        if (insertMatch) {
            const tableName = insertMatch[1].toLowerCase();
            const cols = insertMatch[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
            const row = {};
            cols.forEach((col, i) => {
                row[col] = params[i];
            });
            const pkCol = cols[0];
            if (pkCol === undefined)
                return;
            const table = this.store.getOrCreateTable(tableName);
            table.set(row[pkCol], row);
            this.store.dirty = true;
        }
    }
}
class JsonFileAdapter {
    store;
    persistPath;
    constructor(store, persistPath) {
        this.store = store;
        this.persistPath = persistPath;
    }
    pragma(_sql) {
        return undefined;
    }
    exec(sql) {
        for (const raw of sql.split(';')) {
            const stmt = raw.trim();
            if (!stmt)
                continue;
            const deleteMatch = /^DELETE\s+FROM\s+(\w+)/i.exec(stmt);
            if (deleteMatch) {
                this.store.clearTable(deleteMatch[1]);
                continue;
            }
            const createMatch = /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(stmt);
            if (createMatch) {
                this.store.getOrCreateTable(createMatch[1]);
            }
        }
        return this;
    }
    prepare(sql) {
        return new JsonFileAdapterStatement(sql.trim(), this.store);
    }
    transaction(fn) {
        return (...args) => {
            fn(...args);
            if (this.store.dirty) {
                writeFileSync(this.persistPath, JSON.stringify(this.store.serialize(), null, 2), 'utf8');
                this.store.dirty = false;
            }
        };
    }
}
async function loadJsonStore(persistPath) {
    try {
        const raw = await readFile(persistPath, 'utf8');
        const data = JSON.parse(raw);
        return JsonFileAdapterStore.deserialize(data);
    }
    catch {
        return new JsonFileAdapterStore();
    }
}
function isBetterSqliteUnavailableError(error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code ?? '')
        : '';
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
        return true;
    }
    const lower = message.toLowerCase();
    if (!lower.includes('better-sqlite3')) {
        return false;
    }
    return (lower.includes('could not locate the bindings file') ||
        lower.includes('cannot find module') ||
        lower.includes('dlopen') ||
        lower.includes('invalid elf header') ||
        lower.includes('shared object file') ||
        lower.includes('was compiled against a different node.js version') ||
        lower.includes('is not a valid win32 application'));
}
function stripUtf8Bom(content) {
    if (content.charCodeAt(0) === 0xfeff) {
        return content.slice(1);
    }
    return content;
}
function sanitizeString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function toTaskStatus(value) {
    if (value === 'todo' || value === 'in-progress' || value === 'done') {
        return value;
    }
    return 'todo';
}
function toTaskPriority(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Math.trunc(value);
        if (rounded >= 1 && rounded <= 5) {
            return rounded;
        }
    }
    return 3;
}
function toDateOnlyOrUndefined(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
function toIsoDateTimeOrUndefined(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }
    return parsed.toISOString();
}
function toBooleanOrUndefined(value) {
    return typeof value === 'boolean' ? value : undefined;
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function normalizeTaskArray(plan) {
    const fromTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    const fromSubtasks = Array.isArray(plan.subtasks) ? plan.subtasks : [];
    const taskCandidates = fromTasks.length > 0 ? fromTasks : fromSubtasks;
    return taskCandidates.map((candidate, index) => {
        const taskData = isPlainObject(candidate) ? candidate : {};
        const taskTitle = sanitizeString(taskData.title) ?? sanitizeString(taskData.description) ?? `Task ${index + 1}`;
        const dueDate = toDateOnlyOrUndefined(taskData.dueDate);
        const normalizedTask = {
            id: sanitizeString(taskData.id) ?? `task_${randomUUID()}`,
            title: taskTitle,
            status: toTaskStatus(taskData.status),
            priority: toTaskPriority(taskData.priority),
        };
        if (dueDate) {
            normalizedTask.dueDate = dueDate;
        }
        const voiceTriggered = toBooleanOrUndefined(taskData.voiceTriggered);
        if (voiceTriggered !== undefined) {
            normalizedTask.voiceTriggered = voiceTriggered;
        }
        const suggestedReschedule = toIsoDateTimeOrUndefined(taskData.suggestedReschedule);
        if (suggestedReschedule) {
            normalizedTask.suggestedReschedule = suggestedReschedule;
        }
        return normalizedTask;
    });
}
function toGoalPlan(source) {
    const plan = isPlainObject(source.plan) ? source.plan : {};
    const candidate = {
        id: sanitizeString(plan.id) ?? source.fallbackId,
        title: sanitizeString(plan.title) ?? source.input,
        description: sanitizeString(plan.description) ?? source.input,
        deadline: toDateOnlyOrUndefined(plan.deadline) ?? null,
        tasks: normalizeTaskArray(plan),
        createdAt: sanitizeString(plan.createdAt) ?? source.fallbackCreatedAt,
    };
    return GoalPlanSchema.parse(candidate);
}
function migrateLegacyGoals(legacyGoals) {
    return legacyGoals.map((legacy) => toGoalPlan({
        input: legacy.input,
        plan: legacy.plan ?? {},
        fallbackId: legacy.id || `goal_${randomUUID()}`,
        fallbackCreatedAt: legacy.createdAt,
    }));
}
function normalizeDocument(value, now) {
    const versionedPlans = LifeGraphDocumentSchema.safeParse(value);
    if (versionedPlans.success) {
        return versionedPlans.data;
    }
    const versionedGoals = LegacyVersionedLifeGraphDocumentSchema.safeParse(value);
    if (versionedGoals.success) {
        return {
            version: LIFE_GRAPH_VERSION,
            updatedAt: versionedGoals.data.updatedAt,
            plans: migrateLegacyGoals(versionedGoals.data.goals),
            calendarEvents: [],
            notes: [],
            researchResults: [],
            weatherSnapshots: [],
            newsDigests: [],
            emailDigests: [],
            healthMetricEntries: [],
            healthDailyStreaks: [],
            memory: [],
            captureEntries: [],
            plannedActions: [],
            reminderEvents: [],
            system: { meta: {} },
        };
    }
    const legacyGoals = LegacyLocalLifeGraphSchema.safeParse(value);
    if (legacyGoals.success) {
        return {
            version: LIFE_GRAPH_VERSION,
            updatedAt: now.toISOString(),
            plans: migrateLegacyGoals(legacyGoals.data.goals),
            calendarEvents: [],
            notes: [],
            researchResults: [],
            weatherSnapshots: [],
            newsDigests: [],
            emailDigests: [],
            healthMetricEntries: [],
            healthDailyStreaks: [],
            memory: [],
            captureEntries: [],
            plannedActions: [],
            reminderEvents: [],
            system: { meta: {} },
        };
    }
    throw new Error(`Invalid life graph format: ${JSON.stringify(versionedPlans.error.issues, null, 2)}`);
}
function parseJson(value, fallback) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function toDbPath(graphPath) {
    if (graphPath.toLowerCase().endsWith('.json')) {
        return `${graphPath.slice(0, -5)}.db`;
    }
    return `${graphPath}.db`;
}
function toSerializableGraph(graph) {
    return {
        version: LIFE_GRAPH_VERSION,
        updatedAt: graph.updatedAt,
        plans: graph.plans,
        calendarEvents: graph.calendarEvents ?? [],
        notes: graph.notes ?? [],
        researchResults: graph.researchResults ?? [],
        weatherSnapshots: graph.weatherSnapshots ?? [],
        newsDigests: graph.newsDigests ?? [],
        emailDigests: graph.emailDigests ?? [],
        healthMetricEntries: graph.healthMetricEntries ?? [],
        healthDailyStreaks: graph.healthDailyStreaks ?? [],
        memory: graph.memory ?? [],
        captureEntries: graph.captureEntries ?? [],
        plannedActions: graph.plannedActions ?? [],
        reminderEvents: graph.reminderEvents ?? [],
        system: graph.system ?? { meta: {} },
    };
}
function hasExistingGraphData(db) {
    const metaCount = db.prepare('SELECT COUNT(*) as count FROM meta').get();
    if (metaCount.count > 0) {
        return true;
    }
    const plansCount = db.prepare('SELECT COUNT(*) as count FROM plans').get();
    return plansCount.count > 0;
}
export class LifeGraphManager {
    options;
    dbByPath = new Map();
    dbCreationByPath = new Map();
    jsonAdapterPaths = new Set();
    initializationByPath = new Map();
    constructor(options = {}) {
        this.options = options;
    }
    resolvePath(graphPath) {
        const resolvedPath = resolveLifeGraphPath(graphPath, this.options);
        if (!resolvedPath || resolvedPath.trim().length === 0) {
            throw new Error('Invalid graph path: path cannot be empty');
        }
        return resolvedPath;
    }
    getOrCreateDb(dbPath) {
        const existing = this.dbByPath.get(dbPath);
        if (existing)
            return Promise.resolve(existing);
        const pending = this.dbCreationByPath.get(dbPath);
        if (pending)
            return pending;
        const creation = (async () => {
            let db;
            if (!this.options.forceJsonAdapter) {
                let BetterSqlite3;
                try {
                    ({ default: BetterSqlite3 } = await import('better-sqlite3'));
                }
                catch (error) {
                    if (!isBetterSqliteUnavailableError(error)) {
                        throw error;
                    }
                    const persistPath = `${dbPath}.json`;
                    const store = await loadJsonStore(persistPath);
                    db = new JsonFileAdapter(store, persistPath);
                    this.jsonAdapterPaths.add(dbPath);
                    this.dbByPath.set(dbPath, db);
                    return db;
                }
                try {
                    const sqliteDb = new BetterSqlite3(dbPath);
                    sqliteDb.pragma('journal_mode = WAL');
                    sqliteDb.pragma('foreign_keys = ON');
                    db = sqliteDb;
                }
                catch (error) {
                    if (!isBetterSqliteUnavailableError(error)) {
                        throw error;
                    }
                    const persistPath = `${dbPath}.json`;
                    const store = await loadJsonStore(persistPath);
                    db = new JsonFileAdapter(store, persistPath);
                    this.jsonAdapterPaths.add(dbPath);
                }
            }
            else {
                const persistPath = `${dbPath}.json`;
                const store = await loadJsonStore(persistPath);
                db = new JsonFileAdapter(store, persistPath);
                this.jsonAdapterPaths.add(dbPath);
            }
            this.dbByPath.set(dbPath, db);
            return db;
        })();
        this.dbCreationByPath.set(dbPath, creation);
        void creation.finally(() => this.dbCreationByPath.delete(dbPath));
        return creation;
    }
    initializeSchema(db) {
        db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        deadline TEXT,
        createdAt TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        start TEXT,
        "end" TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        createdAt TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS research_results (
        id TEXT PRIMARY KEY,
        threadId TEXT,
        savedAt TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS weather_snapshots (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS news_digests (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_digests (
        id TEXT PRIMARY KEY,
        receivedAt TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS health_metric_entries (
        id TEXT PRIMARY KEY,
        loggedAt TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS health_daily_streaks (
        id TEXT PRIMARY KEY,
        lastLoggedDate TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp TEXT,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(createdAt);
      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(createdAt);
      CREATE INDEX IF NOT EXISTS idx_research_saved_at ON research_results(savedAt);
      CREATE INDEX IF NOT EXISTS idx_weather_timestamp ON weather_snapshots(timestamp);
      CREATE INDEX IF NOT EXISTS idx_email_received_at ON email_digests(receivedAt);
      CREATE INDEX IF NOT EXISTS idx_health_metric_logged_at ON health_metric_entries(loggedAt);
      CREATE INDEX IF NOT EXISTS idx_health_streak_last_logged_date ON health_daily_streaks(lastLoggedDate);
      CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
    `);
    }
    writeGraphToDb(db, graph) {
        const document = toSerializableGraph(graph);
        const transaction = db.transaction((doc) => {
            db.exec(`
        DELETE FROM plans;
        DELETE FROM calendar_events;
        DELETE FROM notes;
        DELETE FROM research_results;
        DELETE FROM weather_snapshots;
        DELETE FROM news_digests;
        DELETE FROM email_digests;
        DELETE FROM health_metric_entries;
        DELETE FROM health_daily_streaks;
        DELETE FROM memory_entries;
      `);
            const upsertMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
            upsertMeta.run('version', doc.version);
            upsertMeta.run('updatedAt', doc.updatedAt);
            upsertMeta.run('system', JSON.stringify(doc.system ?? { meta: {} }));
            upsertMeta.run('captureEntries', JSON.stringify(doc.captureEntries ?? []));
            upsertMeta.run('plannedActions', JSON.stringify(doc.plannedActions ?? []));
            upsertMeta.run('reminderEvents', JSON.stringify(doc.reminderEvents ?? []));
            const insertPlan = db.prepare('INSERT OR REPLACE INTO plans (id, title, description, deadline, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)');
            const insertCalendarEvent = db.prepare('INSERT OR REPLACE INTO calendar_events (id, start, "end", data) VALUES (?, ?, ?, ?)');
            const insertNote = db.prepare('INSERT OR REPLACE INTO notes (id, createdAt, data) VALUES (?, ?, ?)');
            const insertResearch = db.prepare('INSERT OR REPLACE INTO research_results (id, threadId, savedAt, data) VALUES (?, ?, ?, ?)');
            const insertWeather = db.prepare('INSERT OR REPLACE INTO weather_snapshots (id, timestamp, data) VALUES (?, ?, ?)');
            const insertNews = db.prepare('INSERT OR REPLACE INTO news_digests (id, data) VALUES (?, ?)');
            const insertEmail = db.prepare('INSERT OR REPLACE INTO email_digests (id, receivedAt, data) VALUES (?, ?, ?)');
            const insertHealthMetric = db.prepare('INSERT OR REPLACE INTO health_metric_entries (id, loggedAt, data) VALUES (?, ?, ?)');
            const insertHealthStreak = db.prepare('INSERT OR REPLACE INTO health_daily_streaks (id, lastLoggedDate, data) VALUES (?, ?, ?)');
            const insertMemory = db.prepare('INSERT OR REPLACE INTO memory_entries (id, type, timestamp, data) VALUES (?, ?, ?, ?)');
            for (const plan of doc.plans) {
                insertPlan.run(plan.id, plan.title, plan.description, plan.deadline, plan.createdAt, JSON.stringify(plan));
            }
            for (const event of doc.calendarEvents ?? []) {
                insertCalendarEvent.run(event.id, event.start, event.end, JSON.stringify(event));
            }
            for (const note of doc.notes ?? []) {
                insertNote.run(note.id, note.createdAt, JSON.stringify(note));
            }
            for (const result of doc.researchResults ?? []) {
                insertResearch.run(result.id, result.threadId, result.savedAt, JSON.stringify(result));
            }
            for (const snapshot of doc.weatherSnapshots ?? []) {
                insertWeather.run(snapshot.id, snapshot.timestamp, JSON.stringify(snapshot));
            }
            for (const digest of doc.newsDigests ?? []) {
                insertNews.run(digest.id, JSON.stringify(digest));
            }
            for (const digest of doc.emailDigests ?? []) {
                insertEmail.run(digest.id, digest.receivedAt, JSON.stringify(digest));
            }
            for (const entry of doc.healthMetricEntries ?? []) {
                insertHealthMetric.run(entry.id, entry.loggedAt, JSON.stringify(entry));
            }
            for (const streak of doc.healthDailyStreaks ?? []) {
                insertHealthStreak.run(streak.id, streak.lastLoggedDate, JSON.stringify(streak));
            }
            for (const entry of doc.memory ?? []) {
                insertMemory.run(entry.id, entry.type, entry.timestamp, JSON.stringify(entry));
            }
        });
        transaction(document);
    }
    readGraphFromDb(db) {
        const metaRows = db
            .prepare("SELECT key, value FROM meta WHERE key IN ('version', 'updatedAt', 'system', 'captureEntries', 'plannedActions', 'reminderEvents')")
            .all();
        const meta = new Map(metaRows.map((row) => [row.key, row.value]));
        const plans = db
            .prepare('SELECT id, title, description, deadline, createdAt, data FROM plans ORDER BY rowid ASC')
            .all().map((row) => {
            const fromJson = parseJson(row.data, null);
            if (fromJson) {
                return fromJson;
            }
            return {
                id: row.id,
                title: row.title,
                description: row.description,
                deadline: row.deadline,
                tasks: [],
                createdAt: row.createdAt,
            };
        });
        const calendarEvents = db.prepare('SELECT data FROM calendar_events ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const notes = db.prepare('SELECT data FROM notes ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const researchResults = db.prepare('SELECT data FROM research_results ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const weatherSnapshots = db.prepare('SELECT data FROM weather_snapshots ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const newsDigests = db.prepare('SELECT data FROM news_digests ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const emailDigests = db.prepare('SELECT data FROM email_digests ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const healthMetricEntries = db.prepare('SELECT data FROM health_metric_entries ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const healthDailyStreaks = db.prepare('SELECT data FROM health_daily_streaks ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const memory = db.prepare('SELECT data FROM memory_entries ORDER BY rowid ASC').all().map((row) => parseJson(row.data, {}));
        const system = parseJson(meta.get('system') ?? null, { meta: {} });
        const captureEntries = parseJson(meta.get('captureEntries') ?? null, []);
        const plannedActions = parseJson(meta.get('plannedActions') ?? null, []);
        const reminderEvents = parseJson(meta.get('reminderEvents') ?? null, []);
        const candidate = {
            version: meta.get('version') ?? LIFE_GRAPH_VERSION,
            updatedAt: meta.get('updatedAt') ?? new Date().toISOString(),
            plans,
            calendarEvents,
            notes,
            researchResults,
            weatherSnapshots,
            newsDigests,
            emailDigests,
            healthMetricEntries,
            healthDailyStreaks,
            memory,
            captureEntries,
            plannedActions,
            reminderEvents,
            system,
        };
        return LifeGraphDocumentSchema.parse(candidate);
    }
    async migrateFromJsonIfNeeded(db, graphPath) {
        let raw;
        try {
            raw = await readFile(graphPath, 'utf8');
        }
        catch {
            return;
        }
        // Never let legacy JSON clobber a graph that already exists in SQLite.
        if (hasExistingGraphData(db)) {
            return;
        }
        const parsed = JSON.parse(stripUtf8Bom(raw));
        const graph = normalizeDocument(parsed, new Date());
        this.writeGraphToDb(db, graph);
        const backupPath = `${graphPath}.backup-${Date.now()}`;
        await rename(graphPath, backupPath);
        db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('migrationBackupPath', backupPath);
    }
    async getContext(graphPath) {
        const resolvedGraphPath = this.resolvePath(graphPath);
        const dbPath = toDbPath(resolvedGraphPath);
        await mkdir(dirname(dbPath), { recursive: true });
        const db = await this.getOrCreateDb(dbPath);
        const inFlight = this.initializationByPath.get(dbPath);
        if (inFlight) {
            await inFlight;
        }
        else {
            const initializePromise = (async () => {
                this.initializeSchema(db);
                await this.migrateFromJsonIfNeeded(db, resolvedGraphPath);
            })();
            this.initializationByPath.set(dbPath, initializePromise);
            try {
                await initializePromise;
            }
            catch (error) {
                this.initializationByPath.delete(dbPath);
                throw error;
            }
        }
        return {
            graphPath: resolvedGraphPath,
            dbPath,
            db,
        };
    }
    async load(graphPath) {
        const context = await this.getContext(graphPath);
        return this.readGraphFromDb(context.db);
    }
    async save(graph, graphPath) {
        const context = await this.getContext(graphPath);
        const parsed = LifeGraphDocumentSchema.parse(graph);
        this.writeGraphToDb(context.db, parsed);
    }
    async getStorageInfo(graphPath) {
        const context = await this.getContext(graphPath);
        if (this.jsonAdapterPaths.has(context.dbPath)) {
            return {
                backend: 'json-file',
                graphPath: context.graphPath,
                dbPath: `${context.dbPath}.json`,
                migrationBackupPath: null,
            };
        }
        const row = context.db
            .prepare('SELECT value FROM meta WHERE key = ?')
            .get('migrationBackupPath');
        const migrationBackupPath = typeof row?.value === 'string' ? row.value : null;
        return {
            backend: 'sqlite',
            graphPath: context.graphPath,
            dbPath: context.dbPath,
            migrationBackupPath,
        };
    }
    async appendPlan(input, graphPath) {
        const context = await this.getContext(graphPath);
        const nowIso = new Date().toISOString();
        const normalizedPlan = toGoalPlan({
            input: input.input,
            plan: input.plan,
            fallbackId: input.id ?? `goal_${randomUUID()}`,
            fallbackCreatedAt: input.createdAt ?? nowIso,
        });
        const transaction = context.db.transaction(() => {
            context.db
                .prepare('INSERT OR REPLACE INTO plans (id, title, description, deadline, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)')
                .run(normalizedPlan.id, normalizedPlan.title, normalizedPlan.description, normalizedPlan.deadline, normalizedPlan.createdAt, JSON.stringify(normalizedPlan));
            context.db
                .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
                .run('version', LIFE_GRAPH_VERSION);
            context.db
                .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
                .run('updatedAt', nowIso);
        });
        transaction();
        const graph = await this.load(graphPath);
        return {
            record: {
                id: normalizedPlan.id,
                createdAt: normalizedPlan.createdAt,
                input: input.input,
                plan: input.plan,
            },
            graph,
        };
    }
}
export const graphManager = new LifeGraphManager();
