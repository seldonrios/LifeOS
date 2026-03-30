import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  UnsupportedLabelError,
  UnsupportedOperationError,
  UnsupportedQueryError,
  createLifeGraphClient,
} from './client';
import { createDeterministicEmbedding } from './memory';
import { loadGraph } from './store';
import type { ModuleSchema } from './types';

function sampleModuleSchema(version: string): ModuleSchema {
  return {
    meta: {
      id: 'lifeos.test.module',
      version,
      module: 'test-module',
    },
    entities: [],
    relationships: [],
    properties: [],
    rules: [],
  };
}

test('createLifeGraphClient returns usable client and empty plans query works', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const plans = await client.query('plans');
  assert.deepEqual(plans, []);
});

test('createNode(plan) persists and is visible through loadGraph', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const createdId = await client.createNode('plan', {
    title: 'Board Meeting Prep',
    description: 'Prepare board deck and supporting notes.',
    deadline: '2026-04-01',
    tasks: [
      {
        title: 'Draft deck',
        priority: 4,
        status: 'todo',
      },
    ],
  });

  const graph = await loadGraph(graphPath);
  assert.equal(graph.plans.length, 1);
  assert.equal(graph.plans[0]?.id, createdId);
  assert.equal(graph.plans[0]?.tasks.length, 1);
});

test('createNode(plan) preserves optional task metadata fields', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  await client.createNode('plan', {
    title: 'Voice Task Plan',
    description: 'Created from voice',
    tasks: [
      {
        id: 'task_meta_1',
        title: 'Finish taxes',
        status: 'todo',
        priority: 4,
        dueDate: '2026-04-15',
        voiceTriggered: true,
        suggestedReschedule: '2026-04-16T09:00:00.000Z',
      },
    ],
  });

  const graph = await loadGraph(graphPath);
  const task = graph.plans[0]?.tasks[0];
  assert.equal(task?.voiceTriggered, true);
  assert.equal(task?.suggestedReschedule, '2026-04-16T09:00:00.000Z');
});

test('append note/research/weather/news/email methods persist normalized records', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const note = await client.appendNote({
    title: 'Team preference',
    content: 'Team prefers async updates.',
    tags: ['team', 'process'],
    voiceTriggered: true,
  });
  const research = await client.appendResearchResult({
    query: 'quantum computing breakthroughs',
    summary: 'Recent progress includes improved error correction schemes.',
    sources: ['local-notes'],
    conversationContext: ['Initial query'],
  });
  const weather = await client.appendWeatherSnapshot({
    location: 'Boston',
    forecast: 'Saturday: cool, light rain.',
  });
  const news = await client.appendNewsDigest({
    title: 'Top Tech Headlines',
    summary: 'A concise daily briefing.',
    sources: ['https://example.com/rss'],
  });
  const email = await client.appendEmailDigest({
    subject: 'Quarterly planning update',
    from: 'Ada Lovelace <ada@example.com>',
    summary: 'Draft agenda and budget review attached.',
    messageId: '<msg-1@example.com>',
    receivedAt: '2026-03-25T08:15:00.000Z',
    read: false,
    accountLabel: 'work',
  });
  const memory = await client.appendMemoryEntry({
    type: 'insight',
    content: 'Board deck draft due tomorrow',
    relatedTo: ['goal:board'],
  });

  assert.ok(note.id);
  assert.ok(note.createdAt);
  assert.ok(research.id);
  assert.ok(research.threadId);
  assert.ok(research.savedAt);
  assert.ok(weather.id);
  assert.ok(weather.timestamp);
  assert.ok(news.id);
  assert.equal(news.read, false);
  assert.ok(email.id);
  assert.equal(email.accountLabel, 'work');
  assert.ok(memory.id);
  assert.equal(memory.type, 'insight');

  const graph = await loadGraph(graphPath);
  assert.equal(graph.notes?.length, 1);
  assert.equal(graph.researchResults?.length, 1);
  assert.equal(graph.researchResults?.[0]?.conversationContext?.[0], 'Initial query');
  assert.equal(graph.weatherSnapshots?.length, 1);
  assert.equal(graph.newsDigests?.length, 1);
  assert.equal(graph.emailDigests?.length, 1);
  assert.equal(graph.memory?.length, 1);
});

test('research thread lookup and notes/weather/news helper queries work', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const threadId = '3f6d4a15-1175-4dda-a56a-3cafb63c4f53';
  await client.saveResearchResult({
    threadId,
    query: 'quantum update',
    summary: 'First summary',
    conversationContext: ['q1'],
  });
  await client.saveResearchResult({
    threadId,
    query: 'tell me more',
    summary: 'Second summary',
    conversationContext: ['q1', 'q2'],
  });
  const latestThread = await client.getResearchThread(threadId);
  assert.equal(latestThread?.summary, 'Second summary');

  await client.appendNote({
    title: 'Team note',
    content: 'Team prefers async updates on Fridays',
    tags: ['team', 'process'],
    voiceTriggered: true,
  });
  const matchingNotes = await client.searchNotes('team async', { sinceDays: 7, limit: 5 });
  assert.equal(matchingNotes.length, 1);

  await client.appendWeatherSnapshot({
    location: 'Boston',
    forecast: 'Cool and cloudy',
  });
  await client.appendNewsDigest({
    title: 'Top tech news',
    summary: 'Headline summary',
    sources: ['https://example.com/1'],
  });

  const latestWeather = await client.getLatestWeatherSnapshot('boston');
  const latestNews = await client.getLatestNewsDigest('tech');
  assert.equal(latestWeather?.location, 'Boston');
  assert.equal(latestNews?.title, 'Top tech news');
});

test('searchMemory ranks related entries and applyUpdates appends memory', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  await client.appendMemoryEntry({
    type: 'research',
    content: 'Grok 4 roadmap includes faster multimodal planning.',
    relatedTo: ['research:grok4'],
  });
  await client.applyUpdates([
    {
      op: 'append_memory',
      entry: {
        type: 'insight',
        content: 'Tomorrow meeting needs Grok preparation notes.',
        relatedTo: ['calendar:meeting'],
      },
    },
  ]);

  const matches = await client.searchMemory('grok meeting prep', { limit: 2 });
  assert.equal(matches.length, 2);
  assert.ok((matches[0]?.score ?? Number.NEGATIVE_INFINITY) >= (matches[1]?.score ?? 0));
  assert.ok(matches.every((entry) => Number.isFinite(entry.score)));
});

test('mergeDelta performs last-write-wins merge for plans and notes', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  await client.createNode('plan', {
    id: 'goal_merge_1',
    title: 'Plan Alpha',
    description: 'Initial',
    deadline: '2026-03-30',
    createdAt: '2026-03-20T08:00:00.000Z',
    tasks: [{ id: 'task_merge_1', title: 'Task A', status: 'todo', priority: 3 }],
  });
  await client.appendNote({
    id: '7bfe792c-8054-441f-87fd-95f9f3f5f8bd',
    title: 'Initial note',
    content: 'Old content',
    tags: ['sync'],
    createdAt: '2026-03-20T08:00:00.000Z',
    voiceTriggered: true,
  });

  const mergeResult = await client.mergeDelta({
    plans: [
      {
        id: 'goal_merge_1',
        title: 'Plan Alpha',
        description: 'Updated from remote',
        deadline: '2026-03-30',
        createdAt: '2026-03-22T08:00:00.000Z',
        tasks: [{ id: 'task_merge_1', title: 'Task A remote', status: 'todo', priority: 4 }],
      },
      {
        id: 'goal_merge_2',
        title: 'Plan Beta',
        description: 'Remote new plan',
        deadline: null,
        createdAt: '2026-03-22T10:00:00.000Z',
        tasks: [{ id: 'task_merge_2', title: 'Task B', status: 'todo', priority: 3 }],
      },
    ],
    notes: [
      {
        id: '7bfe792c-8054-441f-87fd-95f9f3f5f8bd',
        title: 'Initial note',
        content: 'New content from remote',
        tags: ['sync', 'remote'],
        voiceTriggered: true,
        createdAt: '2026-03-22T09:00:00.000Z',
      },
    ],
  });

  assert.equal(mergeResult.merged, true);
  assert.equal(mergeResult.conflicts.length, 0);

  const graph = await loadGraph(graphPath);
  assert.equal(graph.plans.length, 2);
  const mergedPlan = graph.plans.find((entry) => entry.id === 'goal_merge_1');
  assert.equal(mergedPlan?.description, 'Updated from remote');
  assert.equal(mergedPlan?.tasks[0]?.title, 'Task A remote');
  const mergedNote = graph.notes?.find(
    (entry) => entry.id === '7bfe792c-8054-441f-87fd-95f9f3f5f8bd',
  );
  assert.equal(mergedNote?.content, 'New content from remote');
});

test('mergeDelta reports conflicts for older records and keeps local value', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  await client.appendNote({
    id: 'f63f5d2f-b666-4956-a3c1-8e3124b6fcb9',
    title: 'Fresh note',
    content: 'Keep this content',
    tags: ['sync'],
    createdAt: '2026-03-23T08:00:00.000Z',
    voiceTriggered: true,
  });

  const mergeResult = await client.mergeDelta({
    notes: [
      {
        id: 'f63f5d2f-b666-4956-a3c1-8e3124b6fcb9',
        title: 'Fresh note',
        content: 'Older remote content',
        tags: ['sync', 'remote'],
        createdAt: '2026-03-22T08:00:00.000Z',
        voiceTriggered: true,
      },
    ],
  });

  assert.equal(mergeResult.conflicts.length, 1);
  assert.equal(mergeResult.conflicts[0]?.collection, 'notes');
  assert.equal(mergeResult.conflicts[0]?.reason, 'incoming_older');
  const graph = await loadGraph(graphPath);
  const note = graph.notes?.find((entry) => entry.id === 'f63f5d2f-b666-4956-a3c1-8e3124b6fcb9');
  assert.equal(note?.content, 'Keep this content');
});

test('mergeDelta recomputes memory embeddings locally while preserving thread metadata', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const memoryId = 'b7df3f7a-147f-45f1-aef0-cb4ef7118a2d';
  const threadId = '02b11c41-78e7-497a-89b3-14bc34ec4b4f';
  const content = 'Follow up on Grok 4 prep notes before tomorrow meeting.';
  const expectedEmbedding = createDeterministicEmbedding(content);

  await client.mergeDelta({
    memory: [
      {
        id: memoryId,
        type: 'conversation',
        content,
        embedding: Array.from({ length: 384 }, () => 0.25),
        timestamp: '2026-03-23T10:00:00.000Z',
        relatedTo: ['lifeos.voice.intent.research'],
        threadId,
        role: 'user',
      },
    ],
  });

  const graph = await loadGraph(graphPath);
  const merged = graph.memory?.find((entry) => entry.id === memoryId);
  assert.ok(merged);
  assert.equal(merged?.threadId, threadId);
  assert.equal(merged?.role, 'user');
  assert.deepEqual(merged?.embedding.slice(0, 8), expectedEmbedding.slice(0, 8));
});

test('memory thread retrieval keeps role and preference metadata with date filtering', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });
  const threadId = '6dc43712-5709-41de-a4ca-6589f19a8159';
  const now = Date.now();
  const olderTimestamp = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
  const recentTimestamp = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  await client.appendMemoryEntry({
    type: 'conversation',
    content: 'I prefer short answers.',
    role: 'user',
    threadId,
    timestamp: olderTimestamp,
    relatedTo: ['voice'],
  });
  await client.appendMemoryEntry({
    type: 'preference',
    content: 'communicationStyle: concise',
    key: 'communicationStyle',
    value: 'concise',
    role: 'system',
    threadId,
    timestamp: recentTimestamp,
    relatedTo: ['profile'],
  });

  const fullThread = await client.getMemoryThread(threadId, { limit: 10 });
  assert.equal(fullThread.length, 2);
  assert.equal(fullThread[0]?.role, 'user');
  assert.equal(fullThread[1]?.type, 'preference');
  assert.equal(fullThread[1]?.key, 'communicationStyle');
  assert.equal(fullThread[1]?.value, 'concise');

  const recent = await client.getMemoryThread(threadId, { sinceDays: 2, limit: 10 });
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.type, 'preference');
});

test('query supports plans/tasks with filters and limits', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const planAId = await client.createNode('plan', {
    title: 'Plan A',
    description: 'desc A',
    tasks: [{ title: 'Task A1' }],
  });

  await client.createNode('plan', {
    title: 'Plan B',
    description: 'desc B',
    tasks: [{ title: 'Task B1' }, { title: 'Task B2' }],
  });

  const limitedPlans = await client.query<{ id: string }>('plans', { limit: 1 });
  assert.equal(limitedPlans.length, 1);

  const tasksForPlanA = await client.query<{ planId: string; title: string }>('tasks', {
    planId: planAId,
  });
  assert.equal(tasksForPlanA.length, 1);
  assert.equal(tasksForPlanA[0]?.planId, planAId);

  const limitedTasks = await client.query<{ title: string }>('tasks', { limit: 2 });
  assert.equal(limitedTasks.length, 2);
});

test('query and createNode support health metric entries and streaks', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const metricId = await client.createNode('health.MetricEntry', {
    metric: 'steps',
    value: 9000,
    unit: 'count',
    loggedAt: '2026-03-25T08:00:00.000Z',
  });
  const streakId = await client.createNode('health.DailyStreak', {
    id: 'health_streak_steps',
    metric: 'steps',
    currentStreak: 3,
    longestStreak: 5,
    lastLoggedDate: '2026-03-25',
  });

  assert.equal(metricId.length > 0, true);
  assert.equal(streakId, 'health_streak_steps');

  const metrics = await client.query<{ metric: string; value: number }>('health.MetricEntry', {
    metric: 'steps',
    sinceDays: 365,
    limit: 5,
  });
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0]?.metric, 'steps');
  assert.equal(metrics[0]?.value, 9000);

  const streaks = await client.query<{ metric: string; currentStreak: number }>(
    'health.DailyStreak',
    {
      metric: 'steps',
      limit: 1,
    },
  );
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0]?.metric, 'steps');
  assert.equal(streaks[0]?.currentStreak, 3);
});

test('mergeDelta normalizes health metric events with entryId alias for id', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'lifeos-life-graph-merge-metric-');
  const client = createLifeGraphClient({ graphPath });

  // Simulate published metric event from health-tracker using entryId instead of id
  const mergeResult = await client.mergeDelta({
    healthMetricEntries: [
      {
        entryId: 'metric-entry-123',
        metric: 'steps',
        value: 8500,
        unit: 'count',
        loggedAt: '2026-03-25T10:00:00.000Z',
      },
    ],
  });

  assert.equal(mergeResult.merged, true);
  assert.equal(mergeResult.conflicts.length, 0);

  const graph = await loadGraph(graphPath);
  assert.equal(graph.healthMetricEntries?.length, 1);
  const metric = graph.healthMetricEntries?.[0];
  assert.equal(metric?.id, 'metric-entry-123');
  assert.equal(metric?.metric, 'steps');
  assert.equal(metric?.value, 8500);
});

test('mergeDelta normalizes health streak events with date alias for lastLoggedDate', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'lifeos-life-graph-merge-streak-');
  const client = createLifeGraphClient({ graphPath });

  // Simulate published streak event from health-tracker using date instead of lastLoggedDate
  const mergeResult = await client.mergeDelta({
    healthDailyStreaks: [
      {
        metric: 'sleep',
        currentStreak: 5,
        longestStreak: 12,
        date: '2026-03-25',
      },
    ],
  });

  assert.equal(mergeResult.merged, true);
  assert.equal(mergeResult.conflicts.length, 0);

  const graph = await loadGraph(graphPath);
  assert.equal(graph.healthDailyStreaks?.length, 1);
  const streak = graph.healthDailyStreaks?.[0];
  assert.equal(streak?.metric, 'sleep');
  assert.equal(streak?.currentStreak, 5);
  assert.equal(streak?.lastLoggedDate, '2026-03-25');
});

test('getNode resolves plan first, then task, otherwise null', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  const planId = await client.createNode('plan', {
    title: 'Plan Node',
    description: 'desc',
    tasks: [{ id: 'task_fixed', title: 'Task Node', status: 'todo', priority: 3 }],
  });

  const planNode = await client.getNode<{ id: string; title: string }>(planId);
  assert.equal(planNode?.id, planId);

  const taskNode = await client.getNode<{ id: string; planId: string }>('task_fixed');
  assert.equal(taskNode?.id, 'task_fixed');
  assert.equal(taskNode?.planId, planId);

  const missing = await client.getNode('missing');
  assert.equal(missing, null);
});

test('unsupported query/label/relationship throw typed errors', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  await assert.rejects(
    () => client.query('goals'),
    (error: unknown) => {
      return error instanceof UnsupportedQueryError;
    },
  );

  await assert.rejects(
    () => client.createNode('task', { title: 'Nope', description: 'Nope' }),
    (error: unknown) => {
      return error instanceof UnsupportedLabelError;
    },
  );

  await assert.rejects(
    () => client.createRelationship('a', 'b', 'rel'),
    (error: unknown) => error instanceof UnsupportedOperationError,
  );
});

test('registerModuleSchema writes sidecar file and dedupes by id+version', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });
  const sidecarPath = join(dirname(graphPath), 'module-schemas.json');

  await client.registerModuleSchema(sampleModuleSchema('1.0.0'));
  await client.registerModuleSchema(sampleModuleSchema('1.0.0'));
  await client.registerModuleSchema(sampleModuleSchema('1.1.0'));

  const raw = JSON.parse(await readFile(sidecarPath, 'utf8')) as {
    schemas: Array<{ meta: { id: string; version: string } }>;
  };

  assert.equal(raw.schemas.length, 2);
  assert.equal(raw.schemas[0]?.meta.version, '1.0.0');
  assert.equal(raw.schemas[1]?.meta.version, '1.1.0');
});

test('getSummary returns active goals with task counts', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({ graphPath });

  await client.createNode('plan', {
    title: 'Board Prep',
    description: 'Prepare for board meeting',
    tasks: [
      { title: 'Draft deck', status: 'done', priority: 5 },
      { title: 'Rehearse', status: 'todo', priority: 4 },
    ],
  });

  const summary = await client.getSummary();
  assert.equal(summary.totalGoals, 1);
  assert.equal(summary.activeGoals.length, 1);
  assert.equal(summary.activeGoals[0]?.completedTasks, 1);
  assert.equal(summary.activeGoals[0]?.totalTasks, 2);
});

test('generateReview returns llm insights when review client returns valid json', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({
    graphPath,
    reviewClient: {
      async chat() {
        return {
          message: {
            content: JSON.stringify({
              wins: ['Closed sprint commitments'],
              nextActions: ['Prepare Monday sprint plan'],
            }),
          },
        };
      },
    },
  });

  await client.createNode('plan', {
    title: 'Sprint Ops',
    description: 'Track sprint work',
    tasks: [{ title: 'Close sprint', status: 'done', priority: 4 }],
  });

  const insights = await client.generateReview('weekly');
  assert.equal(insights.source, 'llm');
  assert.equal(insights.wins[0], 'Closed sprint commitments');
});

test('generateReview falls back to heuristic insights on invalid llm output', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({
    graphPath,
    reviewClient: {
      async chat() {
        return {
          message: {
            content: 'not-json',
          },
        };
      },
    },
  });

  await client.createNode('plan', {
    title: 'Planning',
    description: 'Keep planning on track',
    tasks: [{ title: 'Define next actions', status: 'todo', priority: 5 }],
  });

  const insights = await client.generateReview('daily');
  assert.equal(insights.source, 'heuristic');
  assert.equal(insights.period, 'daily');
  assert.ok(insights.nextActions.length >= 1);
});

test('generateReview daily loopSummary counts only items in the active day window', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({
    graphPath,
    reviewClient: {
      async chat() {
        return {
          message: {
            content: 'not-json',
          },
        };
      },
    },
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  await client.appendCaptureEntry({
    id: 'capture_today',
    content: 'Close review loop',
    capturedAt: now.toISOString(),
    status: 'pending',
  });
  await client.appendCaptureEntry({
    id: 'capture_yesterday',
    content: 'Old capture',
    capturedAt: yesterday.toISOString(),
    status: 'pending',
  });

  await client.appendPlannedAction({
    id: 'action_today_done',
    title: 'Send update',
    status: 'done',
    dueDate: today,
    completedAt: now.toISOString(),
  });
  await client.appendPlannedAction({
    id: 'action_yesterday_done',
    title: 'Archive old note',
    status: 'done',
    dueDate: yesterday.toISOString().slice(0, 10),
    completedAt: yesterday.toISOString(),
  });
  await client.appendPlannedAction({
    id: 'action_today_todo',
    title: 'Draft agenda',
    status: 'todo',
    dueDate: today,
  });

  await client.appendReminderEvent({
    id: 'reminder_today',
    plannedActionId: 'action_today_todo',
    scheduledFor: now.toISOString(),
    status: 'fired',
  });
  await client.appendReminderEvent({
    id: 'reminder_yesterday',
    plannedActionId: 'action_today_todo',
    scheduledFor: yesterday.toISOString(),
    status: 'fired',
  });

  const insights = await client.generateReview('daily');

  assert.equal(insights.loopSummary.pendingCaptures, 1);
  assert.equal(insights.loopSummary.actionsDueToday, 1);
  assert.equal(insights.loopSummary.unacknowledgedReminders, 1);
  assert.deepEqual(insights.loopSummary.completedActions, ['Send update (action_today_done)']);
});

test('generateReview weekly loopSummary aggregates across the trailing seven-day window', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-client-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const client = createLifeGraphClient({
    graphPath,
    reviewClient: {
      async chat() {
        return {
          message: {
            content: 'not-json',
          },
        };
      },
    },
  });

  const now = new Date();
  const withinWindow = new Date(now);
  withinWindow.setUTCDate(withinWindow.getUTCDate() - 3);
  const outsideWindow = new Date(now);
  outsideWindow.setUTCDate(outsideWindow.getUTCDate() - 8);
  const overdueDate = new Date(now);
  overdueDate.setUTCDate(overdueDate.getUTCDate() - 10);

  await client.appendCaptureEntry({
    id: 'capture_weekly_in',
    content: 'Follow up on budget',
    capturedAt: withinWindow.toISOString(),
    status: 'pending',
  });
  await client.appendCaptureEntry({
    id: 'capture_weekly_out',
    content: 'Too old',
    capturedAt: outsideWindow.toISOString(),
    status: 'pending',
  });

  await client.appendPlannedAction({
    id: 'action_weekly_done_in',
    title: 'Plan retrospective',
    status: 'done',
    dueDate: withinWindow.toISOString().slice(0, 10),
    completedAt: withinWindow.toISOString(),
  });
  await client.appendPlannedAction({
    id: 'action_weekly_done_out',
    title: 'Old completion',
    status: 'done',
    dueDate: outsideWindow.toISOString().slice(0, 10),
    completedAt: outsideWindow.toISOString(),
  });
  await client.appendPlannedAction({
    id: 'action_weekly_due_in',
    title: 'Review sprint notes',
    status: 'todo',
    dueDate: withinWindow.toISOString().slice(0, 10),
  });
  await client.appendPlannedAction({
    id: 'action_weekly_overdue',
    title: 'Follow up on overdue budget review',
    status: 'todo',
    dueDate: overdueDate.toISOString().slice(0, 10),
  });

  await client.appendReminderEvent({
    id: 'reminder_weekly_in',
    plannedActionId: 'action_weekly_due_in',
    scheduledFor: withinWindow.toISOString(),
    status: 'fired',
  });
  await client.appendReminderEvent({
    id: 'reminder_weekly_out',
    plannedActionId: 'action_weekly_due_in',
    scheduledFor: outsideWindow.toISOString(),
    status: 'fired',
  });

  const insights = await client.generateReview('weekly');

  assert.equal(insights.loopSummary.pendingCaptures, 1);
  assert.equal(insights.loopSummary.actionsDueToday, 1);
  assert.equal(insights.loopSummary.unacknowledgedReminders, 1);
  assert.deepEqual(insights.loopSummary.completedActions, [
    'Plan retrospective (action_weekly_done_in)',
  ]);
  assert.deepEqual(insights.loopSummary.suggestedNextActions, [
    'Follow up on overdue budget review',
  ]);
});
