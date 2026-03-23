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
