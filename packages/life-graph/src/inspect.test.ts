import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { inspectLifeGraphStorage } from './inspect';
import { LifeGraphManager } from './manager';
import type { LifeGraphDocument } from './types';

function toDbPath(graphPath: string): string {
  if (graphPath.toLowerCase().endsWith('.json')) {
    return `${graphPath.slice(0, -5)}.db`;
  }
  return `${graphPath}.db`;
}

function sampleGraph(): LifeGraphDocument {
  return {
    version: '0.1.0',
    updatedAt: new Date('2026-04-24T12:00:00.000Z').toISOString(),
    plans: [
      {
        id: 'goal_1',
        title: 'Sample Goal',
        description: 'Sample Description',
        deadline: null,
        createdAt: new Date('2026-04-24T12:00:00.000Z').toISOString(),
        tasks: [],
      },
    ],
    captureEntries: [],
    plannedActions: [],
    reminderEvents: [],
  };
}

async function listBackupFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.filter((entry) => entry.includes('.backup-'));
}

test('inspect: SQLite exists, probe succeeds, version present', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  const manager = new LifeGraphManager();
  await manager.save(sampleGraph(), graphPath);

  const inspection = await inspectLifeGraphStorage(graphPath);

  assert.equal(inspection.backendCandidate, 'sqlite');
  assert.equal(inspection.sqliteExists, true);
  assert.equal(inspection.sqliteOpenable, true);
  assert.equal(inspection.sqliteVersionPresent, true);
  assert.equal(inspection.errors.length, 0);
});

test('inspect: SQLite exists, addon unavailable', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  const manager = new LifeGraphManager();
  await manager.save(sampleGraph(), graphPath);

  const inspection = await inspectLifeGraphStorage(graphPath, async () => {
    throw Object.assign(new Error("Cannot find module 'better-sqlite3'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
  });

  assert.equal(inspection.sqliteProbeUnavailable, true);
  assert.equal(inspection.sqliteOpenable, false);
  assert.doesNotThrow(() => inspection);
});

test('inspect: SQLite missing, JSON fallback healthy', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  await writeFile(
    graphPath,
    JSON.stringify(
      {
        version: '0.1.0',
        updatedAt: new Date('2026-04-24T12:00:00.000Z').toISOString(),
        plans: [],
        captureEntries: [],
        plannedActions: [],
        reminderEvents: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  const inspection = await inspectLifeGraphStorage(graphPath);

  assert.equal(inspection.backendCandidate, 'json-file');
  assert.equal(inspection.jsonExists, true);
  assert.equal(inspection.jsonReadable, true);
  assert.equal(inspection.jsonParseable, true);
  assert.equal(inspection.jsonVersionPresent, true);
});

test('inspect: SQLite missing, JSON missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const graphPath = join(tempDir, '.lifeos', 'life-graph.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  const inspection = await inspectLifeGraphStorage(graphPath);

  assert.equal(inspection.backendCandidate, 'missing');
  assert.equal(inspection.sqliteExists, false);
  assert.equal(inspection.jsonExists, false);
});

test('inspect: SQLite missing, JSON malformed treated as missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const graphPath = join(tempDir, '.lifeos', 'malformed.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  await writeFile(graphPath, '{"version": "0.1.0",', 'utf8');

  const inspection = await inspectLifeGraphStorage(graphPath);
  assert.equal(inspection.backendCandidate, 'missing');
  assert.equal(inspection.jsonExists, true);
  assert.equal(inspection.jsonReadable, true);
  assert.equal(inspection.jsonParseable, false);
});

test(
  'inspect: SQLite missing, JSON unreadable treated as missing',
  { skip: process.platform === 'win32' },
  async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
    const graphPath = join(tempDir, '.lifeos', 'unreadable.json');
    await mkdir(join(tempDir, '.lifeos'), { recursive: true });

    await writeFile(
      graphPath,
      JSON.stringify({
        version: '0.1.0',
        updatedAt: new Date('2026-04-24T12:00:00.000Z').toISOString(),
        plans: [],
        captureEntries: [],
        plannedActions: [],
        reminderEvents: [],
      }),
      'utf8',
    );
    await chmod(graphPath, 0o000);

    const inspection = await inspectLifeGraphStorage(graphPath);
    assert.equal(inspection.backendCandidate, 'missing');
    assert.equal(inspection.jsonExists, true);
    assert.equal(inspection.jsonReadable, false);
  },
);

test('inspect: SQLite missing, JSON adapter file healthy', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const graphPath = join(tempDir, '.lifeos', 'json-adapter.json');
  await mkdir(join(tempDir, '.lifeos'), { recursive: true });

  const manager = new LifeGraphManager({ forceJsonAdapter: true });
  await manager.save(sampleGraph(), graphPath);

  const inspection = await inspectLifeGraphStorage(graphPath);
  assert.equal(inspection.backendCandidate, 'json-file');
  assert.equal(inspection.sqliteExists, false);
  assert.equal(inspection.jsonExists, true);
  assert.equal(inspection.jsonReadable, true);
  assert.equal(inspection.jsonParseable, true);
  assert.equal(inspection.jsonVersionPresent, true);
});

test('inspect: no file created during any call', async () => {
  const sqliteDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const sqliteGraphPath = join(sqliteDir, '.lifeos', 'sqlite.json');
  await mkdir(join(sqliteDir, '.lifeos'), { recursive: true });
  const sqliteManager = new LifeGraphManager();
  await sqliteManager.save(sampleGraph(), sqliteGraphPath);
  await inspectLifeGraphStorage(sqliteGraphPath);
  assert.deepEqual(await listBackupFiles(sqliteDir), []);

  const unavailableDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const unavailableGraphPath = join(unavailableDir, '.lifeos', 'unavailable.json');
  await mkdir(join(unavailableDir, '.lifeos'), { recursive: true });
  const unavailableManager = new LifeGraphManager();
  await unavailableManager.save(sampleGraph(), unavailableGraphPath);
  await inspectLifeGraphStorage(unavailableGraphPath, async () => {
    throw Object.assign(new Error("Cannot find module 'better-sqlite3'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
  });
  assert.deepEqual(await listBackupFiles(unavailableDir), []);

  const jsonDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const jsonGraphPath = join(jsonDir, '.lifeos', 'json-only.json');
  await mkdir(join(jsonDir, '.lifeos'), { recursive: true });
  await writeFile(
    jsonGraphPath,
    JSON.stringify(
      {
        version: '0.1.0',
        updatedAt: new Date('2026-04-24T12:00:00.000Z').toISOString(),
        plans: [],
        captureEntries: [],
        plannedActions: [],
        reminderEvents: [],
      },
      null,
      2,
    ),
    'utf8',
  );
  const jsonDbPath = toDbPath(jsonGraphPath);
  await inspectLifeGraphStorage(jsonGraphPath);
  await assert.rejects(() => access(jsonDbPath));
  assert.deepEqual(await listBackupFiles(jsonDir), []);

  const missingDir = await mkdtemp(join(tmpdir(), 'lifeos-inspect-'));
  const missingGraphPath = join(missingDir, '.lifeos', 'missing.json');
  await mkdir(join(missingDir, '.lifeos'), { recursive: true });
  const missingDbPath = toDbPath(missingGraphPath);
  await inspectLifeGraphStorage(missingGraphPath);
  await assert.rejects(() => access(missingDbPath));
  assert.deepEqual(await listBackupFiles(missingDir), []);
});