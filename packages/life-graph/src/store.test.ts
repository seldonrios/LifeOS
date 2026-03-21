import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { appendGoalPlanRecord, loadLocalLifeGraph } from './store';

test('loadLocalLifeGraph returns empty graph when file does not exist', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');

  const graph = await loadLocalLifeGraph(graphPath);
  assert.deepEqual(graph, { goals: [] });
});

test('appendGoalPlanRecord creates file and appends records', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');

  await appendGoalPlanRecord(
    {
      input: 'Help me prep for board meeting',
      plan: {
        title: 'Board Meeting Prep',
      },
    },
    graphPath,
  );

  await appendGoalPlanRecord(
    {
      input: 'Follow-up action items',
      plan: {
        title: 'Board Meeting Follow-up',
      },
    },
    graphPath,
  );

  const saved = JSON.parse(await readFile(graphPath, 'utf8')) as {
    goals: Array<{ input: string; plan: { title: string } }>;
  };
  assert.equal(saved.goals.length, 2);
  assert.equal(saved.goals[0]?.input, 'Help me prep for board meeting');
  assert.equal(saved.goals[1]?.plan.title, 'Board Meeting Follow-up');
});

test('appendGoalPlanRecord preserves existing entries', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-life-graph-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');

  const first = await appendGoalPlanRecord(
    {
      input: 'First goal',
      plan: { title: 'First plan' },
    },
    graphPath,
  );

  const second = await appendGoalPlanRecord(
    {
      input: 'Second goal',
      plan: { title: 'Second plan' },
    },
    graphPath,
  );

  const graph = await loadLocalLifeGraph<{ title: string }>(graphPath);
  assert.equal(graph.goals.length, 2);
  assert.equal(graph.goals[0]?.id, first.id);
  assert.equal(graph.goals[1]?.id, second.id);
});
