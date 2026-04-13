import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CaptureEntrySchema, PlannedActionSchema, ReminderEventSchema, } from '@lifeos/contracts';
import { LifeGraphManager } from './manager';
import { cosineSimilarity, createDeterministicEmbedding } from './memory';
import { resolveLifeGraphPath } from './path';
import { parseGoalPlan } from './schema';
import { getGraphStorageInfo, getGraphSummary } from './store';
export class UnsupportedQueryError extends Error {
    query;
    constructor(query) {
        super(`Unsupported life graph query for MVP client: ${query}`);
        this.query = query;
        this.name = 'UnsupportedQueryError';
    }
}
export class UnsupportedLabelError extends Error {
    label;
    constructor(label) {
        super(`Unsupported node label for MVP client: ${label}`);
        this.label = label;
        this.name = 'UnsupportedLabelError';
    }
}
export class UnsupportedOperationError extends Error {
    constructor(operation) {
        super(`Unsupported operation for file-backed MVP life graph client: ${operation}`);
        this.name = 'UnsupportedOperationError';
    }
}
const MAX_NOTES = 4000;
const MAX_RESEARCH_RESULTS = 1500;
const MAX_WEATHER_SNAPSHOTS = 500;
const MAX_NEWS_DIGESTS = 1200;
const MAX_EMAIL_DIGESTS = 2500;
const MAX_HEALTH_METRIC_ENTRIES = 20_000;
const MAX_HEALTH_DAILY_STREAKS = 2000;
const MAX_MEMORY_ENTRIES = 10_000;
const MAX_MEMORY_CONTENT_CHARS = 6000;
const MAX_MEMORY_RELATED = 24;
const MEMORY_EMBEDDING_DIM = 384;
const MAX_MEMORY_KEY_CHARS = 80;
const MAX_MEMORY_VALUE_CHARS = 300;
const MAX_CALENDAR_EVENTS = 4000;
const MAX_CALENDAR_TITLE_CHARS = 220;
const MAX_CALENDAR_LOCATION_CHARS = 180;
const MAX_NOTE_TITLE_CHARS = 200;
const MAX_NOTE_CONTENT_CHARS = 8000;
const MAX_NOTE_TAGS = 20;
const MAX_NOTE_TAG_CHARS = 40;
const MAX_RESEARCH_QUERY_CHARS = 400;
const MAX_RESEARCH_SUMMARY_CHARS = 8000;
const MAX_RESEARCH_CONTEXT_ITEMS = 8;
const MAX_RESEARCH_CONTEXT_CHARS = 500;
const MAX_WEATHER_LOCATION_CHARS = 120;
const MAX_WEATHER_FORECAST_CHARS = 1000;
const MAX_NEWS_TITLE_CHARS = 220;
const MAX_NEWS_SUMMARY_CHARS = 5000;
const MAX_NEWS_SOURCES = 20;
const MAX_NEWS_SOURCE_CHARS = 240;
const MAX_EMAIL_SUBJECT_CHARS = 240;
const MAX_EMAIL_FROM_CHARS = 240;
const MAX_EMAIL_SUMMARY_CHARS = 5000;
const MAX_EMAIL_MESSAGE_ID_CHARS = 320;
const MAX_EMAIL_ACCOUNT_LABEL_CHARS = 80;
const MAX_NOTE_SEARCH_RESULTS = 50;
function getString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function getNullableString(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return getString(value);
}
function clampText(value, maxLength) {
    return value.trim().slice(0, maxLength);
}
function normalizeStringField(value, fallback, maxLength) {
    const candidate = getString(value) ?? fallback;
    return clampText(candidate, maxLength);
}
function normalizeStringArray(value, maxItems, maxItemLength) {
    if (!Array.isArray(value)) {
        return [];
    }
    const normalized = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
        .map((entry) => clampText(entry, maxItemLength));
    if (normalized.length === 0) {
        return [];
    }
    return normalized.slice(0, maxItems);
}
function normalizeIsoTimestamp(value, fallbackIso) {
    if (typeof value !== 'string') {
        return fallbackIso;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallbackIso;
    }
    return parsed.toISOString();
}
function getOptionalNumber(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return null;
    }
    return value;
}
function parsePositiveIntegerOption(value, fallback, max) {
    const parsed = parsePositiveInteger(value) ?? fallback;
    return Math.min(parsed, max);
}
function parseLimit(params) {
    const limit = getOptionalNumber(params?.limit);
    if (limit === null) {
        return null;
    }
    const normalized = Math.trunc(limit);
    if (normalized <= 0) {
        return null;
    }
    return normalized;
}
function parsePlanId(params) {
    return getString(params?.planId);
}
function parseMetricFilter(params) {
    const metric = getString(params?.metric);
    return metric ? metric.toLowerCase().replace(/\s+/g, '_') : null;
}
function parseSinceDays(params) {
    const sinceDays = getOptionalNumber(params?.sinceDays ?? params?.period);
    if (sinceDays === null) {
        return null;
    }
    const normalized = Math.trunc(sinceDays);
    return normalized > 0 ? normalized : null;
}
function parsePositiveInteger(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    const normalized = Math.trunc(value);
    if (normalized <= 0) {
        return null;
    }
    return normalized;
}
function resolveMemorySearchLimit(value) {
    const parsed = parsePositiveInteger(value) ?? 5;
    return Math.min(parsed, 100);
}
function normalizeQuery(query) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
        throw new UnsupportedQueryError(query);
    }
    return normalized;
}
function toTaskNode(plan) {
    return plan.tasks.map((task) => ({
        ...task,
        planId: plan.id,
    }));
}
function applyLimit(items, limit) {
    if (limit === null) {
        return items;
    }
    return items.slice(-limit);
}
function toPlanCreateInput(data) {
    const title = getString(data.title);
    const description = getString(data.description);
    if (!title) {
        throw new Error('createNode(plan): "title" is required.');
    }
    if (!description) {
        throw new Error('createNode(plan): "description" is required.');
    }
    const rawTasks = data.tasks;
    const tasks = Array.isArray(rawTasks) ? rawTasks : [];
    const input = {
        title,
        description,
        deadline: getNullableString(data.deadline),
        tasks,
    };
    const id = getString(data.id);
    if (id) {
        input.id = id;
    }
    const createdAt = getString(data.createdAt);
    if (createdAt) {
        input.createdAt = createdAt;
    }
    return input;
}
function normalizeNoteInput(note, nowIso) {
    return {
        id: getString(note.id) ?? randomUUID(),
        title: normalizeStringField(note.title, 'Voice note', MAX_NOTE_TITLE_CHARS),
        content: normalizeStringField(note.content, 'Untitled note', MAX_NOTE_CONTENT_CHARS),
        tags: normalizeStringArray(note.tags, MAX_NOTE_TAGS, MAX_NOTE_TAG_CHARS),
        voiceTriggered: typeof note.voiceTriggered === 'boolean' ? note.voiceTriggered : true,
        createdAt: normalizeIsoTimestamp(note.createdAt, nowIso),
    };
}
function normalizeCalendarEventInput(event, nowIso) {
    const start = normalizeIsoTimestamp(event.start, nowIso);
    const end = normalizeIsoTimestamp(event.end, start);
    const statusValue = getString(event.status);
    const status = statusValue === 'tentative' || statusValue === 'cancelled' || statusValue === 'confirmed'
        ? statusValue
        : 'confirmed';
    const attendees = normalizeStringArray(event.attendees, MAX_NOTE_TAGS, MAX_NOTE_TAG_CHARS);
    const locationValue = getString(event.location);
    return {
        id: getString(event.id) ?? randomUUID(),
        title: normalizeStringField(event.title, 'Untitled event', MAX_CALENDAR_TITLE_CHARS),
        start,
        end,
        ...(attendees.length > 0 ? { attendees } : {}),
        ...(locationValue
            ? {
                location: normalizeStringField(locationValue, locationValue, MAX_CALENDAR_LOCATION_CHARS),
            }
            : {}),
        status,
    };
}
function normalizeResearchInput(result, nowIso) {
    const sources = normalizeStringArray(result.sources, MAX_NEWS_SOURCES, MAX_NEWS_SOURCE_CHARS);
    const conversationContext = normalizeStringArray(result.conversationContext, MAX_RESEARCH_CONTEXT_ITEMS, MAX_RESEARCH_CONTEXT_CHARS);
    return {
        id: getString(result.id) ?? randomUUID(),
        threadId: getString(result.threadId) ?? randomUUID(),
        query: normalizeStringField(result.query, 'General research', MAX_RESEARCH_QUERY_CHARS),
        summary: normalizeStringField(result.summary, 'No summary available.', MAX_RESEARCH_SUMMARY_CHARS),
        ...(conversationContext.length > 0 ? { conversationContext } : {}),
        ...(sources.length > 0 ? { sources } : {}),
        savedAt: normalizeIsoTimestamp(result.savedAt, nowIso),
    };
}
function normalizeWeatherInput(snapshot, nowIso) {
    return {
        id: getString(snapshot.id) ?? randomUUID(),
        location: normalizeStringField(snapshot.location, 'current', MAX_WEATHER_LOCATION_CHARS),
        forecast: normalizeStringField(snapshot.forecast, 'No forecast available.', MAX_WEATHER_FORECAST_CHARS),
        timestamp: normalizeIsoTimestamp(snapshot.timestamp, nowIso),
    };
}
function normalizeNewsInput(digest) {
    const sources = normalizeStringArray(digest.sources, MAX_NEWS_SOURCES, MAX_NEWS_SOURCE_CHARS);
    return {
        id: getString(digest.id) ?? randomUUID(),
        title: normalizeStringField(digest.title, 'News digest', MAX_NEWS_TITLE_CHARS),
        summary: normalizeStringField(digest.summary, 'No summary available.', MAX_NEWS_SUMMARY_CHARS),
        sources: sources.length > 0 ? sources : ['local-cache'],
        read: typeof digest.read === 'boolean' ? digest.read : false,
    };
}
function normalizeEmailDigestInput(digest, nowIso) {
    return {
        id: getString(digest.id) ?? randomUUID(),
        subject: normalizeStringField(digest.subject, 'Email digest', MAX_EMAIL_SUBJECT_CHARS),
        from: normalizeStringField(digest.from, 'Unknown sender', MAX_EMAIL_FROM_CHARS),
        summary: normalizeStringField(digest.summary, 'No summary available.', MAX_EMAIL_SUMMARY_CHARS),
        messageId: normalizeStringField(digest.messageId, randomUUID(), MAX_EMAIL_MESSAGE_ID_CHARS),
        receivedAt: normalizeIsoTimestamp(digest.receivedAt, nowIso),
        read: typeof digest.read === 'boolean' ? digest.read : false,
        accountLabel: normalizeStringField(digest.accountLabel, 'default', MAX_EMAIL_ACCOUNT_LABEL_CHARS),
    };
}
function normalizeDateOnly(value, fallbackIso) {
    const candidate = getString(value);
    if (candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
        return candidate;
    }
    return fallbackIso.slice(0, 10);
}
function normalizeHealthMetricInput(entry, nowIso) {
    return {
        id: getString(entry.id) ?? getString(entry.entryId) ?? randomUUID(),
        metric: normalizeStringField(entry.metric, 'metric', 80).toLowerCase().replace(/\s+/g, '_'),
        value: getOptionalNumber(entry.value) ?? 0,
        unit: normalizeStringField(entry.unit, 'count', 40).toLowerCase().replace(/\s+/g, '_'),
        ...(getString(entry.note) ? { note: clampText(getString(entry.note) ?? '', 300) } : {}),
        loggedAt: normalizeIsoTimestamp(entry.loggedAt, nowIso),
    };
}
function normalizeHealthDailyStreakInput(streak, nowIso) {
    const currentStreak = Math.max(0, Math.trunc(getOptionalNumber(streak.currentStreak) ?? 0));
    const longestStreak = Math.max(currentStreak, Math.max(0, Math.trunc(getOptionalNumber(streak.longestStreak) ?? currentStreak)));
    return {
        id: getString(streak.id) ??
            `health_streak_${normalizeStringField(streak.metric, 'metric', 80)
                .toLowerCase()
                .replace(/\s+/g, '_')}`,
        metric: normalizeStringField(streak.metric, 'metric', 80).toLowerCase().replace(/\s+/g, '_'),
        currentStreak,
        longestStreak,
        lastLoggedDate: normalizeDateOnly(streak.lastLoggedDate ?? streak.date, nowIso),
    };
}
function normalizeEmbedding(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return [];
    }
    const vector = [];
    for (let index = 0; index < value.length && index < MEMORY_EMBEDDING_DIM; index += 1) {
        const candidate = value[index];
        const numeric = typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
        vector.push(numeric);
    }
    while (vector.length < MEMORY_EMBEDDING_DIM) {
        vector.push(0);
    }
    const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
        return vector;
    }
    return vector.map((item) => item / magnitude);
}
function toUuidOrUndefined(value) {
    const candidate = getString(value);
    if (!candidate) {
        return undefined;
    }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(candidate) ? candidate : undefined;
}
function normalizeMemoryInput(entry, nowIso, options = {}) {
    const type = entry.type === 'conversation' ||
        entry.type === 'research' ||
        entry.type === 'note' ||
        entry.type === 'insight' ||
        entry.type === 'preference'
        ? entry.type
        : 'insight';
    const content = normalizeStringField(entry.content, 'Untitled memory', MAX_MEMORY_CONTENT_CHARS);
    const relatedTo = normalizeStringArray(entry.relatedTo, MAX_MEMORY_RELATED, 120);
    const seedEmbedding = options.forceLocalEmbedding || !Array.isArray(entry.embedding) || entry.embedding.length === 0
        ? createDeterministicEmbedding(content)
        : normalizeEmbedding(entry.embedding);
    const threadId = toUuidOrUndefined(entry.threadId);
    const summaryOfThreadId = toUuidOrUndefined(entry.summaryOfThreadId);
    return {
        id: getString(entry.id) ?? randomUUID(),
        type,
        content,
        embedding: seedEmbedding,
        timestamp: normalizeIsoTimestamp(entry.timestamp, nowIso),
        relatedTo,
        ...(threadId ? { threadId } : {}),
        ...(entry.role === 'user' || entry.role === 'assistant' || entry.role === 'system'
            ? { role: entry.role }
            : {}),
        ...(getString(entry.key)
            ? { key: normalizeStringField(entry.key, 'preference', MAX_MEMORY_KEY_CHARS) }
            : {}),
        ...(getString(entry.value)
            ? { value: normalizeStringField(entry.value, '', MAX_MEMORY_VALUE_CHARS) }
            : {}),
        ...(summaryOfThreadId ? { summaryOfThreadId } : {}),
    };
}
function parseIsoOrZero(value) {
    if (!value) {
        return 0;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function toArrayOfRecords(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => isRecord(entry));
}
function mergeByIdLastWriteWins(existingItems, incomingItems, collection, getTimestamp, getTimestampIso) {
    const byId = new Map();
    const conflicts = [];
    for (const item of existingItems) {
        const id = item.id.trim();
        if (!id) {
            continue;
        }
        byId.set(id, item);
    }
    for (const incoming of incomingItems) {
        const id = incoming.id.trim();
        if (!id) {
            conflicts.push({
                collection,
                id: 'unknown',
                reason: 'incoming_invalid',
            });
            continue;
        }
        const existing = byId.get(id);
        if (!existing) {
            byId.set(id, incoming);
            continue;
        }
        const incomingTs = getTimestamp(incoming);
        const existingTs = getTimestamp(existing);
        if (incomingTs >= existingTs) {
            byId.set(id, incoming);
        }
        else {
            const existingTimestamp = getTimestampIso?.(existing);
            const incomingTimestamp = getTimestampIso?.(incoming);
            conflicts.push({
                collection,
                id,
                reason: 'incoming_older',
                ...(existingTimestamp ? { existingTimestamp } : {}),
                ...(incomingTimestamp ? { incomingTimestamp } : {}),
            });
        }
    }
    return {
        items: Array.from(byId.values()),
        conflicts,
    };
}
function toTopicQuery(topic) {
    const value = getString(topic);
    return value ? value.toLowerCase() : null;
}
function toNoteQueryTokens(query) {
    return query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
function noteMatchesQuery(note, queryTokens) {
    if (queryTokens.length === 0) {
        return true;
    }
    const haystack = [note.title, note.content, ...(note.tags ?? [])].join(' ').toLowerCase();
    return queryTokens.every((token) => haystack.includes(token));
}
function normalizeLabel(label) {
    const normalized = label.trim().toLowerCase();
    if (normalized.length === 0) {
        throw new UnsupportedLabelError(label);
    }
    return normalized;
}
function normalizeReviewPeriod(period) {
    return period === 'daily' ? 'daily' : 'weekly';
}
function extractReviewJson(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
    }
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
        return fenced;
    }
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < trimmed.length; index += 1) {
        const char = trimmed[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (char === '{') {
            if (depth === 0) {
                start = index;
            }
            depth += 1;
            continue;
        }
        if (char === '}') {
            if (depth === 0) {
                continue;
            }
            depth -= 1;
            if (depth === 0 && start >= 0) {
                return trimmed.slice(start, index + 1);
            }
        }
    }
    throw new Error('Review response did not contain valid JSON');
}
function parseInsightsOutput(raw) {
    const parsed = JSON.parse(extractReviewJson(raw));
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Review JSON must be an object');
    }
    const candidate = parsed;
    const wins = Array.isArray(candidate.wins)
        ? candidate.wins.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : [];
    const nextActions = Array.isArray(candidate.nextActions)
        ? candidate.nextActions.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : [];
    if (wins.length === 0 && nextActions.length === 0) {
        throw new Error('Review JSON did not include wins or nextActions');
    }
    return {
        wins: wins.slice(0, 5),
        nextActions: nextActions.slice(0, 5),
    };
}
function deriveHeuristicInsights(plans, plannedActions, period) {
    const completedTaskTitles = plans.flatMap((plan) => plan.tasks
        .filter((task) => task.status === 'done')
        .map((task) => `${plan.title}: ${task.title} (${task.id})`));
    const todoTaskTitles = plans.flatMap((plan) => plan.tasks
        .filter((task) => task.status !== 'done')
        .sort((left, right) => right.priority - left.priority)
        .map((task) => `${plan.title}: ${task.title}`));
    const completedPlannedActions = plannedActions
        .filter((action) => action.status === 'done')
        .map((action) => `Planned action completed: ${action.title} (${action.id})`);
    const pendingPlannedActions = plannedActions
        .filter((action) => action.status !== 'done')
        .map((action) => `Planned action: ${action.title}`);
    const winsCandidates = [...completedPlannedActions, ...completedTaskTitles];
    const nextActionCandidates = [...pendingPlannedActions, ...todoTaskTitles];
    const wins = winsCandidates.slice(0, 3).length > 0
        ? winsCandidates.slice(0, 3)
        : [`No completed tasks recorded in the ${period} window yet.`];
    const nextActions = nextActionCandidates.slice(0, 3).length > 0
        ? nextActionCandidates.slice(0, 3)
        : ['Capture one next concrete task for your highest-priority goal.'];
    const history = [...completedPlannedActions, ...completedTaskTitles].slice(0, 10);
    return { wins, nextActions, history };
}
function deriveLoopSummary(graph, period, now) {
    const toDateOnly = (value) => value.toISOString().slice(0, 10);
    const buildPeriodWindow = (currentPeriod) => {
        const end = toDateOnly(now);
        const startDate = new Date(now);
        startDate.setUTCDate(startDate.getUTCDate() - (currentPeriod === 'weekly' ? 6 : 0));
        return {
            start: toDateOnly(startDate),
            end,
        };
    };
    const isDateInWindow = (dateOnly, window) => {
        if (!dateOnly) {
            return false;
        }
        return dateOnly >= window.start && dateOnly <= window.end;
    };
    const today = toDateOnly(now);
    const window = buildPeriodWindow(period);
    const captureEntries = graph.captureEntries ?? [];
    const plannedActions = graph.plannedActions ?? [];
    const reminderEvents = graph.reminderEvents ?? [];
    const pendingCaptures = captureEntries.filter((entry) => entry.status === 'pending' && isDateInWindow(entry.capturedAt.slice(0, 10), window)).length;
    const actionsDueToday = plannedActions.filter((action) => action.status !== 'done' && isDateInWindow(action.dueDate, window)).length;
    const unacknowledgedReminders = reminderEvents.filter((event) => event.status === 'fired' && isDateInWindow(event.scheduledFor.slice(0, 10), window)).length;
    const completedActions = plannedActions
        .filter((action) => action.status === 'done' && isDateInWindow(action.completedAt?.slice(0, 10), window))
        .map((action) => `${action.title} (${action.id})`);
    if (period === 'weekly') {
        const suggestedNextActions = plannedActions
            .filter((action) => action.status !== 'done' && Boolean(action.dueDate) && action.dueDate < today)
            .map((action) => action.title)
            .slice(0, 5);
        return {
            pendingCaptures,
            actionsDueToday,
            unacknowledgedReminders,
            completedActions,
            ...(suggestedNextActions.length > 0 ? { suggestedNextActions } : {}),
        };
    }
    return {
        pendingCaptures,
        actionsDueToday,
        unacknowledgedReminders,
        completedActions,
    };
}
function createReviewChatClient(host) {
    const normalizedHost = host?.trim() || 'http://127.0.0.1:11434';
    const endpoint = `${normalizedHost.replace(/\/+$/, '')}/api/chat`;
    return {
        async chat(request) {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    format: request.format,
                    options: request.options,
                    stream: false,
                }),
            });
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Ollama request failed (${response.status}): ${body}`);
            }
            const data = (await response.json());
            const content = data.message?.content;
            if (typeof content !== 'string') {
                throw new Error('Ollama response missing message.content');
            }
            return {
                message: {
                    content,
                },
            };
        },
    };
}
async function readModuleSchemaDocument(sidecarPath) {
    try {
        const content = await readFile(sidecarPath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed &&
            typeof parsed === 'object' &&
            'schemas' in parsed &&
            Array.isArray(parsed.schemas)) {
            return { schemas: parsed.schemas };
        }
        return { schemas: [] };
    }
    catch (error) {
        if (error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT') {
            return { schemas: [] };
        }
        throw error;
    }
}
async function writeModuleSchemaDocument(sidecarPath, document) {
    await mkdir(dirname(sidecarPath), { recursive: true });
    const tempPath = `${sidecarPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(tempPath, sidecarPath);
}
export function createLifeGraphClient(options = {}) {
    const manager = new LifeGraphManager(options);
    const resolvedGraphPath = resolveLifeGraphPath(options.graphPath, options);
    const moduleSchemaPath = join(dirname(resolvedGraphPath), 'module-schemas.json');
    return {
        async loadGraph() {
            return manager.load(resolvedGraphPath);
        },
        async saveGraph(graph) {
            await manager.save(graph, resolvedGraphPath);
        },
        async appendNote(note) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const normalized = normalizeNoteInput(note, nowIso);
            const notes = [...(graph.notes ?? []), normalized].slice(-MAX_NOTES);
            await manager.save({
                ...graph,
                updatedAt: nowIso,
                notes,
                calendarEvents: graph.calendarEvents ?? [],
                researchResults: graph.researchResults ?? [],
                weatherSnapshots: graph.weatherSnapshots ?? [],
                newsDigests: graph.newsDigests ?? [],
                emailDigests: graph.emailDigests ?? [],
                memory: graph.memory ?? [],
            }, resolvedGraphPath);
            return normalized;
        },
        async appendResearchResult(result) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const normalized = normalizeResearchInput(result, nowIso);
            const researchResults = [...(graph.researchResults ?? []), normalized].slice(-MAX_RESEARCH_RESULTS);
            await manager.save({
                ...graph,
                updatedAt: nowIso,
                researchResults,
                calendarEvents: graph.calendarEvents ?? [],
                notes: graph.notes ?? [],
                weatherSnapshots: graph.weatherSnapshots ?? [],
                newsDigests: graph.newsDigests ?? [],
                emailDigests: graph.emailDigests ?? [],
                memory: graph.memory ?? [],
            }, resolvedGraphPath);
            return normalized;
        },
        async saveResearchResult(result) {
            return this.appendResearchResult(result);
        },
        async getResearchThread(threadId) {
            const normalizedThreadId = getString(threadId);
            if (!normalizedThreadId) {
                return null;
            }
            const graph = await manager.load(resolvedGraphPath);
            const matches = (graph.researchResults ?? [])
                .filter((entry) => entry.threadId === normalizedThreadId)
                .sort((left, right) => parseIsoOrZero(right.savedAt) - parseIsoOrZero(left.savedAt));
            return matches[0] ?? null;
        },
        async appendWeatherSnapshot(snapshot) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const normalized = normalizeWeatherInput(snapshot, nowIso);
            const weatherSnapshots = [...(graph.weatherSnapshots ?? []), normalized].slice(-MAX_WEATHER_SNAPSHOTS);
            await manager.save({
                ...graph,
                updatedAt: nowIso,
                weatherSnapshots,
                calendarEvents: graph.calendarEvents ?? [],
                notes: graph.notes ?? [],
                researchResults: graph.researchResults ?? [],
                newsDigests: graph.newsDigests ?? [],
                emailDigests: graph.emailDigests ?? [],
                memory: graph.memory ?? [],
            }, resolvedGraphPath);
            return normalized;
        },
        async getLatestWeatherSnapshot(location) {
            const graph = await manager.load(resolvedGraphPath);
            const locationQuery = toTopicQuery(location);
            const matches = (graph.weatherSnapshots ?? [])
                .filter((entry) => locationQuery ? entry.location.toLowerCase().includes(locationQuery) : true)
                .sort((left, right) => parseIsoOrZero(right.timestamp) - parseIsoOrZero(left.timestamp));
            return matches[0] ?? null;
        },
        async appendNewsDigest(digest) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const normalized = normalizeNewsInput(digest);
            const newsDigests = [...(graph.newsDigests ?? []), normalized].slice(-MAX_NEWS_DIGESTS);
            await manager.save({
                ...graph,
                updatedAt: nowIso,
                newsDigests,
                calendarEvents: graph.calendarEvents ?? [],
                notes: graph.notes ?? [],
                researchResults: graph.researchResults ?? [],
                weatherSnapshots: graph.weatherSnapshots ?? [],
                emailDigests: graph.emailDigests ?? [],
                memory: graph.memory ?? [],
            }, resolvedGraphPath);
            return normalized;
        },
        async getLatestNewsDigest(topic) {
            const graph = await manager.load(resolvedGraphPath);
            const topicQuery = toTopicQuery(topic);
            const matches = [...(graph.newsDigests ?? [])]
                .reverse()
                .filter((entry) => topicQuery ? `${entry.title} ${entry.summary}`.toLowerCase().includes(topicQuery) : true);
            return matches[0] ?? null;
        },
        async appendEmailDigest(digest) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const normalized = normalizeEmailDigestInput(digest, nowIso);
            const emailDigests = [...(graph.emailDigests ?? []), normalized].slice(-MAX_EMAIL_DIGESTS);
            await manager.save({
                ...graph,
                updatedAt: nowIso,
                emailDigests,
                calendarEvents: graph.calendarEvents ?? [],
                notes: graph.notes ?? [],
                researchResults: graph.researchResults ?? [],
                weatherSnapshots: graph.weatherSnapshots ?? [],
                newsDigests: graph.newsDigests ?? [],
                memory: graph.memory ?? [],
            }, resolvedGraphPath);
            return normalized;
        },
        async searchNotes(query, options = {}) {
            const normalizedQuery = getString(query);
            if (!normalizedQuery) {
                return [];
            }
            const graph = await manager.load(resolvedGraphPath);
            const tokens = toNoteQueryTokens(normalizedQuery);
            const sinceDays = parsePositiveInteger(options.sinceDays) ?? 0;
            const limit = Math.min(parsePositiveInteger(options.limit) ?? 10, MAX_NOTE_SEARCH_RESULTS) ||
                MAX_NOTE_SEARCH_RESULTS;
            const thresholdMs = sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;
            return (graph.notes ?? [])
                .filter((note) => parseIsoOrZero(note.createdAt) >= thresholdMs)
                .filter((note) => noteMatchesQuery(note, tokens))
                .sort((left, right) => parseIsoOrZero(right.createdAt) - parseIsoOrZero(left.createdAt))
                .slice(0, limit);
        },
        async appendMemoryEntry(entry) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const normalized = normalizeMemoryInput(entry, nowIso);
            const memory = [...(graph.memory ?? []), normalized].slice(-MAX_MEMORY_ENTRIES);
            await manager.save({
                ...graph,
                updatedAt: nowIso,
                memory,
                calendarEvents: graph.calendarEvents ?? [],
                notes: graph.notes ?? [],
                researchResults: graph.researchResults ?? [],
                weatherSnapshots: graph.weatherSnapshots ?? [],
                newsDigests: graph.newsDigests ?? [],
                emailDigests: graph.emailDigests ?? [],
            }, resolvedGraphPath);
            return normalized;
        },
        async searchMemory(query, options = {}) {
            const normalizedQuery = getString(query);
            if (!normalizedQuery) {
                return [];
            }
            const graph = await manager.load(resolvedGraphPath);
            const queryEmbedding = createDeterministicEmbedding(normalizedQuery);
            const limit = resolveMemorySearchLimit(options.limit);
            const minScore = typeof options.minScore === 'number' ? options.minScore : -1;
            const type = options.type;
            const filtered = (graph.memory ?? []).filter((entry) => (type ? entry.type === type : true));
            const scored = filtered
                .map((entry) => ({
                ...entry,
                score: cosineSimilarity(queryEmbedding, normalizeEmbedding(entry.embedding)),
            }))
                .filter((entry) => entry.score >= minScore)
                .sort((left, right) => right.score - left.score)
                .slice(0, limit);
            return scored;
        },
        async getMemoryThread(threadId, options = {}) {
            const normalizedThreadId = toUuidOrUndefined(threadId);
            if (!normalizedThreadId) {
                return [];
            }
            const graph = await manager.load(resolvedGraphPath);
            const limit = parsePositiveIntegerOption(options.limit, 100, 2000);
            const sinceDays = parsePositiveInteger(options.sinceDays) ?? 0;
            const thresholdMs = sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;
            return (graph.memory ?? [])
                .filter((entry) => entry.threadId === normalizedThreadId)
                .filter((entry) => parseIsoOrZero(entry.timestamp) >= thresholdMs)
                .sort((left, right) => parseIsoOrZero(left.timestamp) - parseIsoOrZero(right.timestamp))
                .slice(-limit);
        },
        async mergeDelta(deltaPayload) {
            const nowIso = new Date().toISOString();
            const graph = await manager.load(resolvedGraphPath);
            const payload = isRecord(deltaPayload) ? deltaPayload : {};
            const conflicts = [];
            let plans = [...graph.plans];
            let calendarEvents = [...(graph.calendarEvents ?? [])];
            let notes = [...(graph.notes ?? [])];
            let researchResults = [...(graph.researchResults ?? [])];
            let weatherSnapshots = [...(graph.weatherSnapshots ?? [])];
            let newsDigests = [...(graph.newsDigests ?? [])];
            let emailDigests = [...(graph.emailDigests ?? [])];
            let healthMetricEntries = [...(graph.healthMetricEntries ?? [])];
            let healthDailyStreaks = [...(graph.healthDailyStreaks ?? [])];
            let memory = [...(graph.memory ?? [])];
            const incomingPlanRecords = toArrayOfRecords(payload.goals ?? payload.plans);
            const incomingPlans = [];
            for (const entry of incomingPlanRecords) {
                try {
                    incomingPlans.push(parseGoalPlan(entry));
                }
                catch {
                    conflicts.push({
                        collection: 'plans',
                        id: getString(entry.id) ?? 'unknown',
                        reason: 'incoming_invalid',
                    });
                }
            }
            const mergedPlans = mergeByIdLastWriteWins(plans, incomingPlans, 'plans', (item) => parseIsoOrZero(item.createdAt), (item) => item.createdAt);
            plans = mergedPlans.items;
            conflicts.push(...mergedPlans.conflicts);
            const incomingCalendarEvents = toArrayOfRecords(payload.calendarEvents).map((entry) => normalizeCalendarEventInput(entry, nowIso));
            const mergedCalendarEvents = mergeByIdLastWriteWins(calendarEvents, incomingCalendarEvents, 'calendarEvents', (item) => Math.max(parseIsoOrZero(item.start), parseIsoOrZero(item.end)), (item) => item.end);
            calendarEvents = mergedCalendarEvents.items.slice(-MAX_CALENDAR_EVENTS);
            conflicts.push(...mergedCalendarEvents.conflicts);
            const incomingNotes = toArrayOfRecords(payload.notes).map((entry) => normalizeNoteInput(entry, nowIso));
            const mergedNotes = mergeByIdLastWriteWins(notes, incomingNotes, 'notes', (item) => parseIsoOrZero(item.createdAt), (item) => item.createdAt);
            notes = mergedNotes.items.slice(-MAX_NOTES);
            conflicts.push(...mergedNotes.conflicts);
            const incomingResearch = toArrayOfRecords(payload.researchResults).map((entry) => normalizeResearchInput(entry, nowIso));
            const mergedResearch = mergeByIdLastWriteWins(researchResults, incomingResearch, 'researchResults', (item) => parseIsoOrZero(item.savedAt), (item) => item.savedAt);
            researchResults = mergedResearch.items.slice(-MAX_RESEARCH_RESULTS);
            conflicts.push(...mergedResearch.conflicts);
            const incomingWeather = toArrayOfRecords(payload.weatherSnapshots).map((entry) => normalizeWeatherInput(entry, nowIso));
            const mergedWeather = mergeByIdLastWriteWins(weatherSnapshots, incomingWeather, 'weatherSnapshots', (item) => parseIsoOrZero(item.timestamp), (item) => item.timestamp);
            weatherSnapshots = mergedWeather.items.slice(-MAX_WEATHER_SNAPSHOTS);
            conflicts.push(...mergedWeather.conflicts);
            const incomingNews = toArrayOfRecords(payload.newsDigests).map((entry) => normalizeNewsInput(entry));
            const mergedNews = mergeByIdLastWriteWins(newsDigests, incomingNews, 'newsDigests', () => 0);
            newsDigests = mergedNews.items.slice(-MAX_NEWS_DIGESTS);
            conflicts.push(...mergedNews.conflicts);
            const incomingEmail = toArrayOfRecords(payload.emailDigests).map((entry) => normalizeEmailDigestInput(entry, nowIso));
            const mergedEmail = mergeByIdLastWriteWins(emailDigests, incomingEmail, 'emailDigests', (item) => parseIsoOrZero(item.receivedAt), (item) => item.receivedAt);
            emailDigests = mergedEmail.items.slice(-MAX_EMAIL_DIGESTS);
            conflicts.push(...mergedEmail.conflicts);
            const incomingHealthMetrics = toArrayOfRecords(payload.healthMetricEntries).map((entry) => normalizeHealthMetricInput(entry, nowIso));
            const mergedHealthMetrics = mergeByIdLastWriteWins(healthMetricEntries, incomingHealthMetrics, 'healthMetricEntries', (item) => parseIsoOrZero(item.loggedAt), (item) => item.loggedAt);
            healthMetricEntries = mergedHealthMetrics.items.slice(-MAX_HEALTH_METRIC_ENTRIES);
            conflicts.push(...mergedHealthMetrics.conflicts);
            const incomingHealthStreaks = toArrayOfRecords(payload.healthDailyStreaks).map((entry) => normalizeHealthDailyStreakInput(entry, nowIso));
            const mergedHealthStreaks = mergeByIdLastWriteWins(healthDailyStreaks, incomingHealthStreaks, 'healthDailyStreaks', (item) => parseIsoOrZero(`${item.lastLoggedDate}T00:00:00.000Z`), (item) => `${item.lastLoggedDate}T00:00:00.000Z`);
            healthDailyStreaks = mergedHealthStreaks.items.slice(-MAX_HEALTH_DAILY_STREAKS);
            conflicts.push(...mergedHealthStreaks.conflicts);
            const incomingMemory = toArrayOfRecords(payload.memory).map((entry) => normalizeMemoryInput(entry, nowIso, {
                forceLocalEmbedding: true,
            }));
            const mergedMemory = mergeByIdLastWriteWins(memory, incomingMemory, 'memory', (item) => parseIsoOrZero(item.timestamp), (item) => item.timestamp);
            memory = mergedMemory.items.slice(-MAX_MEMORY_ENTRIES);
            conflicts.push(...mergedMemory.conflicts);
            const eventType = getString(payload.type);
            const eventData = isRecord(payload.data) ? payload.data : null;
            if (eventType && eventData) {
                if (eventType === 'lifeos.calendar.event.added' ||
                    eventType === 'lifeos.voice.intent.calendar.add') {
                    const singleCalendarMerge = mergeByIdLastWriteWins(calendarEvents, [normalizeCalendarEventInput(eventData, nowIso)], 'calendarEvents', (item) => Math.max(parseIsoOrZero(item.start), parseIsoOrZero(item.end)), (item) => item.end);
                    calendarEvents = singleCalendarMerge.items.slice(-MAX_CALENDAR_EVENTS);
                    conflicts.push(...singleCalendarMerge.conflicts);
                }
                else if (eventType === 'lifeos.note.added' ||
                    eventType === 'lifeos.voice.intent.note.add') {
                    const singleNoteMerge = mergeByIdLastWriteWins(notes, [normalizeNoteInput(eventData, nowIso)], 'notes', (item) => parseIsoOrZero(item.createdAt), (item) => item.createdAt);
                    notes = singleNoteMerge.items.slice(-MAX_NOTES);
                    conflicts.push(...singleNoteMerge.conflicts);
                }
                else if (eventType === 'lifeos.research.completed' ||
                    eventType === 'lifeos.voice.intent.research') {
                    const singleResearchMerge = mergeByIdLastWriteWins(researchResults, [normalizeResearchInput(eventData, nowIso)], 'researchResults', (item) => parseIsoOrZero(item.savedAt), (item) => item.savedAt);
                    researchResults = singleResearchMerge.items.slice(-MAX_RESEARCH_RESULTS);
                    conflicts.push(...singleResearchMerge.conflicts);
                }
                else if (eventType === 'lifeos.weather.snapshot.captured' ||
                    eventType === 'lifeos.voice.intent.weather') {
                    const singleWeatherMerge = mergeByIdLastWriteWins(weatherSnapshots, [normalizeWeatherInput(eventData, nowIso)], 'weatherSnapshots', (item) => parseIsoOrZero(item.timestamp), (item) => item.timestamp);
                    weatherSnapshots = singleWeatherMerge.items.slice(-MAX_WEATHER_SNAPSHOTS);
                    conflicts.push(...singleWeatherMerge.conflicts);
                }
                else if (eventType === 'lifeos.news.digest.ready' ||
                    eventType === 'lifeos.voice.intent.news') {
                    const singleNewsMerge = mergeByIdLastWriteWins(newsDigests, [normalizeNewsInput(eventData)], 'newsDigests', () => 0);
                    newsDigests = singleNewsMerge.items.slice(-MAX_NEWS_DIGESTS);
                    conflicts.push(...singleNewsMerge.conflicts);
                }
                else if (eventType === 'lifeos.health.metric.logged' ||
                    eventType === 'lifeos.voice.intent.health.log') {
                    const singleHealthMetricMerge = mergeByIdLastWriteWins(healthMetricEntries, [normalizeHealthMetricInput(eventData, nowIso)], 'healthMetricEntries', (item) => parseIsoOrZero(item.loggedAt), (item) => item.loggedAt);
                    healthMetricEntries = singleHealthMetricMerge.items.slice(-MAX_HEALTH_METRIC_ENTRIES);
                    conflicts.push(...singleHealthMetricMerge.conflicts);
                }
                else if (eventType === 'lifeos.health.streak.updated') {
                    const singleHealthStreakMerge = mergeByIdLastWriteWins(healthDailyStreaks, [normalizeHealthDailyStreakInput(eventData, nowIso)], 'healthDailyStreaks', (item) => parseIsoOrZero(`${item.lastLoggedDate}T00:00:00.000Z`), (item) => `${item.lastLoggedDate}T00:00:00.000Z`);
                    healthDailyStreaks = singleHealthStreakMerge.items.slice(-MAX_HEALTH_DAILY_STREAKS);
                    conflicts.push(...singleHealthStreakMerge.conflicts);
                }
                else if (eventType === 'lifeos.email.digest.ready') {
                    // Metadata-only notification event: {count, accountLabel, digestIds, summarizedAt}
                    // Email digests are already persisted by email-summarizer module via persistEmailDigests().
                    // Skip node creation for this event type to avoid malformed digest records.
                }
            }
            await manager.save({
                ...graph,
                updatedAt: nowIso,
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
            }, resolvedGraphPath);
            return {
                merged: true,
                conflicts,
            };
        },
        async applyUpdates(updates) {
            if (!Array.isArray(updates) || updates.length === 0) {
                return;
            }
            for (const update of updates) {
                if (!update || typeof update !== 'object') {
                    continue;
                }
                if (update.op === 'append_memory') {
                    await this.appendMemoryEntry(update.entry);
                }
            }
        },
        async query(query, params) {
            const normalizedQuery = normalizeQuery(query);
            const graph = await manager.load(resolvedGraphPath);
            if (normalizedQuery === 'plans') {
                const limit = parseLimit(params);
                return applyLimit([...graph.plans], limit);
            }
            if (normalizedQuery === 'tasks') {
                const planId = parsePlanId(params);
                const plans = planId ? graph.plans.filter((plan) => plan.id === planId) : graph.plans;
                const tasks = plans.flatMap((plan) => toTaskNode(plan));
                const limit = parseLimit(params);
                return applyLimit(tasks, limit);
            }
            if (normalizedQuery === 'health.metricentry') {
                const metric = parseMetricFilter(params);
                const sinceDays = parseSinceDays(params);
                const thresholdMs = sinceDays === null
                    ? Number.NEGATIVE_INFINITY
                    : Date.now() - sinceDays * 24 * 60 * 60 * 1000;
                const filtered = [...(graph.healthMetricEntries ?? [])]
                    .filter((entry) => (metric ? entry.metric === metric : true))
                    .filter((entry) => parseIsoOrZero(entry.loggedAt) >= thresholdMs)
                    .sort((left, right) => parseIsoOrZero(right.loggedAt) - parseIsoOrZero(left.loggedAt));
                const limit = parseLimit(params);
                return applyLimit(filtered, limit);
            }
            if (normalizedQuery === 'health.dailystreak') {
                const metric = parseMetricFilter(params);
                const filtered = [...(graph.healthDailyStreaks ?? [])]
                    .filter((entry) => (metric ? entry.metric === metric : true))
                    .sort((left, right) => parseIsoOrZero(`${right.lastLoggedDate}T00:00:00.000Z`) -
                    parseIsoOrZero(`${left.lastLoggedDate}T00:00:00.000Z`));
                const limit = parseLimit(params);
                return applyLimit(filtered, limit);
            }
            throw new UnsupportedQueryError(query);
        },
        async getNode(id) {
            const nodeId = id.trim();
            if (!nodeId) {
                return null;
            }
            const graph = await manager.load(resolvedGraphPath);
            const plan = graph.plans.find((candidate) => candidate.id === nodeId);
            if (plan) {
                return plan;
            }
            for (const candidatePlan of graph.plans) {
                const task = candidatePlan.tasks.find((candidateTask) => candidateTask.id === nodeId);
                if (task) {
                    return {
                        ...task,
                        planId: candidatePlan.id,
                    };
                }
            }
            return null;
        },
        async createNode(label, data) {
            const normalizedLabel = normalizeLabel(label);
            if (normalizedLabel === 'plan') {
                const input = toPlanCreateInput(data);
                const appendInput = {
                    input: input.title,
                    plan: {
                        title: input.title,
                        description: input.description,
                        deadline: input.deadline ?? null,
                        tasks: input.tasks ?? [],
                    },
                };
                if (input.id) {
                    appendInput.id = input.id;
                }
                if (input.createdAt) {
                    appendInput.createdAt = input.createdAt;
                }
                const { record } = await manager.appendPlan(appendInput, resolvedGraphPath);
                return record.id;
            }
            if (normalizedLabel === 'health.metricentry') {
                const nowIso = new Date().toISOString();
                const graph = await manager.load(resolvedGraphPath);
                const normalized = normalizeHealthMetricInput(data, nowIso);
                const healthMetricEntries = [...(graph.healthMetricEntries ?? []), normalized].slice(-MAX_HEALTH_METRIC_ENTRIES);
                await manager.save({
                    ...graph,
                    updatedAt: nowIso,
                    healthMetricEntries,
                }, resolvedGraphPath);
                return normalized.id;
            }
            if (normalizedLabel === 'health.dailystreak') {
                const nowIso = new Date().toISOString();
                const graph = await manager.load(resolvedGraphPath);
                const normalized = normalizeHealthDailyStreakInput(data, nowIso);
                const withoutCurrent = (graph.healthDailyStreaks ?? []).filter((entry) => entry.id !== normalized.id);
                const healthDailyStreaks = [...withoutCurrent, normalized].slice(-MAX_HEALTH_DAILY_STREAKS);
                await manager.save({
                    ...graph,
                    updatedAt: nowIso,
                    healthDailyStreaks,
                }, resolvedGraphPath);
                return normalized.id;
            }
            throw new UnsupportedLabelError(label);
        },
        async createRelationship() {
            throw new UnsupportedOperationError('createRelationship');
        },
        async registerModuleSchema(schema) {
            const document = await readModuleSchemaDocument(moduleSchemaPath);
            const deduped = document.schemas.filter((existing) => !(existing.meta.id === schema.meta.id && existing.meta.version === schema.meta.version));
            deduped.push(schema);
            await writeModuleSchemaDocument(moduleSchemaPath, { schemas: deduped });
        },
        async getSummary() {
            return getGraphSummary(resolvedGraphPath);
        },
        async getStorageInfo() {
            return getGraphStorageInfo(resolvedGraphPath);
        },
        async generateReview(period = 'weekly') {
            const normalizedPeriod = normalizeReviewPeriod(period);
            const graph = await manager.load(resolvedGraphPath);
            const loopSummary = deriveLoopSummary(graph, normalizedPeriod, new Date());
            const generatedAt = new Date().toISOString();
            const model = options.env?.LIFEOS_GOAL_MODEL?.trim() || 'llama3.1:8b';
            const host = options.env?.OLLAMA_HOST;
            const heuristic = deriveHeuristicInsights(graph.plans, graph.plannedActions ?? [], normalizedPeriod);
            const reviewPrompt = JSON.stringify({
                period: normalizedPeriod,
                updatedAt: graph.updatedAt,
                plans: graph.plans.map((plan) => ({
                    title: plan.title,
                    deadline: plan.deadline,
                    tasks: plan.tasks.map((task) => ({
                        title: task.title,
                        status: task.status,
                        priority: task.priority,
                        dueDate: task.dueDate ?? null,
                    })),
                })),
                plannedActions: (graph.plannedActions ?? []).map((action) => ({
                    id: action.id,
                    title: action.title,
                    status: action.status,
                    dueDate: action.dueDate ?? null,
                })),
            }, null, 2);
            try {
                const reviewClient = options.reviewClient ?? createReviewChatClient(host);
                const response = await reviewClient.chat({
                    model,
                    format: 'json',
                    options: {
                        temperature: 0.2,
                        num_ctx: 8192,
                    },
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a practical LifeOS review assistant. Return only JSON with {"wins": string[], "nextActions": string[]}. Keep each item concise and actionable.',
                        },
                        {
                            role: 'user',
                            content: `Generate a ${normalizedPeriod} review from this life graph snapshot:\n\n${reviewPrompt}`,
                        },
                    ],
                });
                const parsed = parseInsightsOutput(response.message.content);
                return {
                    period: normalizedPeriod,
                    wins: parsed.wins,
                    nextActions: parsed.nextActions,
                    ...(heuristic.history.length > 0 ? { history: heuristic.history } : {}),
                    loopSummary,
                    generatedAt,
                    source: 'llm',
                };
            }
            catch {
                return {
                    period: normalizedPeriod,
                    wins: heuristic.wins,
                    nextActions: heuristic.nextActions,
                    ...(heuristic.history.length > 0 ? { history: heuristic.history } : {}),
                    loopSummary,
                    generatedAt,
                    source: 'heuristic',
                };
            }
        },
        async appendCaptureEntry(entry) {
            CaptureEntrySchema.parse(entry);
            const graph = await manager.load(resolvedGraphPath);
            const existing = graph.captureEntries ?? [];
            const updated = existing.filter((e) => e.id !== entry.id);
            updated.push(entry);
            await manager.save({ ...graph, captureEntries: updated }, resolvedGraphPath);
        },
        async updateCaptureEntry(id, patch) {
            const graph = await manager.load(resolvedGraphPath);
            const existing = graph.captureEntries ?? [];
            const index = existing.findIndex((e) => e.id === id);
            if (index === -1) {
                throw new Error(`CaptureEntry "${id}" not found.`);
            }
            const merged = { ...existing[index], ...patch };
            CaptureEntrySchema.parse(merged);
            existing[index] = merged;
            await manager.save({ ...graph, captureEntries: existing }, resolvedGraphPath);
        },
        async appendPlannedAction(action) {
            const normalizedAction = { ...action };
            if (normalizedAction.status === 'done' && !normalizedAction.completedAt) {
                normalizedAction.completedAt = new Date().toISOString();
            }
            PlannedActionSchema.parse(normalizedAction);
            const graph = await manager.load(resolvedGraphPath);
            const existing = graph.plannedActions ?? [];
            const updated = existing.filter((a) => a.id !== normalizedAction.id);
            updated.push(normalizedAction);
            await manager.save({ ...graph, plannedActions: updated }, resolvedGraphPath);
        },
        async updatePlannedAction(id, patch) {
            const graph = await manager.load(resolvedGraphPath);
            const existing = graph.plannedActions ?? [];
            const index = existing.findIndex((a) => a.id === id);
            if (index === -1) {
                throw new Error(`PlannedAction "${id}" not found.`);
            }
            const merged = { ...existing[index], ...patch };
            if (merged.status === 'done' && !merged.completedAt) {
                merged.completedAt = new Date().toISOString();
            }
            PlannedActionSchema.parse(merged);
            existing[index] = merged;
            await manager.save({ ...graph, plannedActions: existing }, resolvedGraphPath);
        },
        async appendReminderEvent(event) {
            ReminderEventSchema.parse(event);
            const graph = await manager.load(resolvedGraphPath);
            const existing = graph.reminderEvents ?? [];
            const updated = existing.filter((r) => r.id !== event.id);
            updated.push(event);
            await manager.save({ ...graph, reminderEvents: updated }, resolvedGraphPath);
        },
        async getCaptureEntry(id) {
            const graph = await manager.load(resolvedGraphPath);
            return (graph.captureEntries ?? []).find((e) => e.id === id);
        },
        async getPlannedAction(id) {
            const graph = await manager.load(resolvedGraphPath);
            return (graph.plannedActions ?? []).find((a) => a.id === id);
        },
    };
}
