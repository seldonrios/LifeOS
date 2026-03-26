import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  appendGoalPlan,
  appendGoalPlanRecord,
  getGraphSummary,
  loadGraph,
  loadLocalLifeGraph,
  saveGraphAtomic,
} from './store';

function samplePlan(title: string): Record<string, unknown> {
  return {
    title,
    description: 'Plan description',
    priority: 'high',
    deadline: '2026-03-26',
    subtasks: [
      {
        description: 'Draft board deck',
        dependsOn: [],
        estimatedHours: 2,
      },
    ],
    neededResources: [],
    relatedAreas: ['work'],
  };
}

test('loadGraph returns an empty versioned document when file is missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  const graph = await loadGraph(graphPath);
  assert.equal(graph.version, '0.1.0');
  assert.equal(graph.plans.length, 0);
  assert.match(graph.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('loadGraph migrates legacy versioned graph with goals[]', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  await writeFile(
    graphPath,
    JSON.stringify(
      {
        version: '0.1.0',
        updatedAt: new Date('2026-03-21T12:00:00.000Z').toISOString(),
        goals: [
          {
            id: 'goal_1',
            createdAt: new Date('2026-03-21T12:00:00.000Z').toISOString(),
            input: 'Legacy entry',
            plan: samplePlan('Legacy Plan'),
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const graph = await loadGraph(graphPath);
  assert.equal(graph.version, '0.1.0');
  assert.equal(graph.plans.length, 1);
  assert.equal(graph.plans[0]?.title, 'Legacy Plan');
});

test('loadGraph accepts UTF-8 BOM-prefixed JSON files', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  const json = JSON.stringify({
    version: '0.1.0',
    updatedAt: new Date('2026-03-21T12:00:00.000Z').toISOString(),
    plans: [],
  });
  await writeFile(graphPath, `\uFEFF${json}`, 'utf8');

  const graph = await loadGraph(graphPath);
  assert.equal(graph.version, '0.1.0');
  assert.equal(graph.plans.length, 0);
});

test('loadGraph rejects invalid graph shape/version', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  await writeFile(
    graphPath,
    JSON.stringify({
      version: '0.0.1',
      updatedAt: new Date('2026-03-21T12:00:00.000Z').toISOString(),
      goals: [],
    }),
    'utf8',
  );

  await assert.rejects(() => loadGraph(graphPath), /Invalid life graph format/);
});

test('appendGoalPlan preserves existing entries and increments plan count', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');

  const first = await appendGoalPlan(
    {
      input: 'First goal',
      plan: samplePlan('First Plan'),
    },
    graphPath,
  );

  const second = await appendGoalPlan(
    {
      input: 'Second goal',
      plan: samplePlan('Second Plan'),
    },
    graphPath,
  );

  const graph = await loadGraph(graphPath);
  assert.equal(graph.plans.length, 2);
  assert.equal(graph.plans[0]?.id, first.id);
  assert.equal(graph.plans[1]?.id, second.id);
  assert.equal(graph.plans[1]?.tasks.length, 1);
});

test('saveGraphAtomic creates directory and writes valid versioned graph', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'nested', 'life-graph.json');
  const dbPath = join(tempDir, '.lifeos', 'nested', 'life-graph.db');

  await saveGraphAtomic(
    {
      version: '0.1.0',
      updatedAt: new Date('2026-03-21T12:00:00.000Z').toISOString(),
      plans: [],
    },
    graphPath,
  );

  const loaded = await loadGraph(graphPath);
  assert.equal(loaded.version, '0.1.0');
  assert.equal(loaded.plans.length, 0);
  await access(dbPath);
});

test('compatibility wrappers still work with legacy signatures', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');

  await appendGoalPlanRecord(
    {
      input: 'Compatibility entry',
      plan: samplePlan('Compat Plan'),
    },
    graphPath,
  );

  const legacyView = await loadLocalLifeGraph(graphPath);
  const summary = await getGraphSummary(graphPath);
  assert.equal(legacyView.goals.length, 1);
  assert.equal(summary.totalPlans, 1);
  assert.equal(summary.totalGoals, 1);
  assert.equal(summary.recentPlanTitles[0], 'Compat Plan');
  assert.equal(summary.recentGoalTitles[0], 'Compat Plan');
  assert.equal(summary.activeGoals.length, 1);
  assert.equal(summary.activeGoals[0]?.title, 'Compat Plan');
});

test('legacy JSON migration does not overwrite existing SQLite graph', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');

  await saveGraphAtomic(
    {
      version: '0.1.0',
      updatedAt: '2026-03-21T12:00:00.000Z',
      plans: [
        {
          id: 'db-plan-1',
          title: 'SQLite plan',
          description: 'Persisted in sqlite',
          deadline: null,
          tasks: [],
          createdAt: '2026-03-21T12:00:00.000Z',
        },
      ],
    },
    graphPath,
  );

  await writeFile(
    graphPath,
    JSON.stringify(
      {
        version: '0.1.0',
        updatedAt: '2026-03-20T12:00:00.000Z',
        plans: [
          {
            id: 'json-plan-1',
            title: 'Legacy plan',
            description: 'Should not overwrite sqlite',
            deadline: null,
            tasks: [],
            createdAt: '2026-03-20T12:00:00.000Z',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const graph = await loadGraph(graphPath);
  assert.equal(graph.plans.length, 1);
  assert.equal(graph.plans[0]?.id, 'db-plan-1');
});
