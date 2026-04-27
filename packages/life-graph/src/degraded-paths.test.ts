import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { LifeGraphManager } from './manager';

test('json-adapter: save and load survive a new manager instance (restart recovery)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-degraded-'));

  try {
    const graphPath = join(tempDir, 'life-graph.json');

    const manager1 = new LifeGraphManager({ forceJsonAdapter: true });
    const base = await manager1.load(graphPath);
    const graph = {
      ...base,
      captureEntries: [
        {
          id: randomUUID(),
          content: 'test capture',
          type: 'text' as const,
          capturedAt: new Date('2026-04-01T10:00:00.000Z').toISOString(),
          source: 'degraded-paths-test',
          tags: [],
          status: 'pending' as const,
        },
      ],
    };
    await manager1.save(graph, graphPath);

    const manager2 = new LifeGraphManager({ forceJsonAdapter: true });
    const loaded = await manager2.load(graphPath);

    assert.equal(loaded.captureEntries.length, 1);
    assert.equal(loaded.captureEntries[0]?.content, 'test capture');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('json-adapter: corrupted JSON file falls back to empty store without throwing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-degraded-'));

  try {
    const graphPath = join(tempDir, 'life-graph.json');
    const dbPath = graphPath.toLowerCase().endsWith('.json')
      ? `${graphPath.slice(0, -5)}.db`
      : `${graphPath}.db`;
    const persistPath = `${dbPath}.json`;

    await mkdir(tempDir, { recursive: true });
    await writeFile(persistPath, '{not valid json', 'utf8');

    const manager = new LifeGraphManager({ forceJsonAdapter: true });
    const graph = await manager.load(graphPath);

    assert.equal(graph.captureEntries.length, 0);
    assert.equal(graph.plannedActions.length, 0);
    assert.equal(graph.reminderEvents.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
