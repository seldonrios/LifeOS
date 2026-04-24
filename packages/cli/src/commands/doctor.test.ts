import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { LifeGraphStorageInspection } from '@lifeos/life-graph';

import { runDoctorCommand } from './doctor';

const CLI_VERSION = '0.0.0-test';

async function makeTempEnv() {
  const dir = await mkdtemp(join(tmpdir(), 'lifeos-doctor-'));
  const graphPath = join(dir, 'life-graph.json');
  await writeFile(graphPath, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
  return {
    env: {
      HOME: dir,
      LIFEOS_GRAPH_PATH: graphPath,
      LIFEOS_DISABLE_NATS: '1',
    } as NodeJS.ProcessEnv,
    cwd: () => dir,
  };
}

function toDbPath(graphPath: string): string {
  if (graphPath.toLowerCase().endsWith('.json')) {
    return `${graphPath.slice(0, -5)}.db`;
  }
  return `${graphPath}.db`;
}

function makeInspection(
  graphPath: string,
  overrides: Partial<LifeGraphStorageInspection> = {},
): LifeGraphStorageInspection {
  return {
    backendCandidate: 'sqlite',
    graphPath,
    dbPath: toDbPath(graphPath),
    sqliteExists: true,
    sqliteOpenable: true,
    sqliteProbeUnavailable: false,
    sqliteSchemaInitialized: true,
    sqliteVersionPresent: true,
    jsonExists: false,
    jsonReadable: false,
    jsonParseable: false,
    jsonVersionPresent: false,
    migrationBackupPath: null,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

const healthyInspectLifeGraphStorage = async (graphPath?: string): Promise<LifeGraphStorageInspection> =>
  makeInspection(graphPath ?? join(tmpdir(), 'life-graph.json'));

test('doctor --json: Ollama down produces WARN reachability and FAIL planning-readiness', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  const exitCode = await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
      },
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as { checks: Array<{ id: string; status: string }>; failCount: number };

  const reachability = output.checks.find((c) => c.id === 'ollama-reachability');
  const planning = output.checks.find((c) => c.id === 'ollama-planning-readiness');

  assert.ok(reachability, 'ollama-reachability check should be present');
  assert.equal(reachability!.status, 'WARN');

  assert.ok(planning, 'ollama-planning-readiness check should be present');
  assert.equal(planning!.status, 'FAIL');

  assert.ok(output.failCount >= 1, 'failCount should be at least 1 when planning-readiness is FAIL');
  assert.equal(exitCode, 1);
});

test('doctor --json: Ollama healthy produces PASS reachability and PASS planning-readiness', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  const exitCode = await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
          } as Response;
        }

        return { ok: true, status: 200 } as Response;
      },
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as { checks: Array<{ id: string; status: string }>; failCount: number };

  const reachability = output.checks.find((c) => c.id === 'ollama-reachability');
  const planning = output.checks.find((c) => c.id === 'ollama-planning-readiness');

  assert.ok(reachability, 'ollama-reachability check should be present');
  assert.equal(reachability!.status, 'PASS');

  assert.ok(planning, 'ollama-planning-readiness check should be present');
  assert.equal(planning!.status, 'PASS');

  assert.equal(output.failCount, 0);
  assert.equal(exitCode, 0);
});

test('doctor --json: Ollama reachable without models produces PASS reachability and FAIL planning-readiness', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  const exitCode = await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [] }),
          } as Response;
        }

        return { ok: true, status: 200 } as Response;
      },
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as { checks: Array<{ id: string; status: string }>; failCount: number };

  const reachability = output.checks.find((c) => c.id === 'ollama-reachability');
  const planning = output.checks.find((c) => c.id === 'ollama-planning-readiness');

  assert.ok(reachability, 'ollama-reachability check should be present');
  assert.equal(reachability!.status, 'PASS');

  assert.ok(planning, 'ollama-planning-readiness check should be present');
  assert.equal(planning!.status, 'FAIL');

  assert.ok(output.failCount >= 1, 'failCount should be at least 1 when planning-readiness is FAIL');
  assert.equal(exitCode, 1);
});

test('doctor --json: configured goal model missing produces FAIL planning-readiness', async () => {
  const { env, cwd } = await makeTempEnv();
  env.LIFEOS_GOAL_MODEL = 'qwen2.5:7b';
  const stdout: string[] = [];

  const exitCode = await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'llama3.1:8b' }] }),
          } as Response;
        }

        return { ok: true, status: 200 } as Response;
      },
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{ id: string; status: string; details?: string }>;
    failCount: number;
  };

  const reachability = output.checks.find((c) => c.id === 'ollama-reachability');
  const planning = output.checks.find((c) => c.id === 'ollama-planning-readiness');

  assert.ok(reachability, 'ollama-reachability check should be present');
  assert.equal(reachability!.status, 'PASS');

  assert.ok(planning, 'ollama-planning-readiness check should be present');
  assert.equal(planning!.status, 'FAIL');
  assert.ok(planning!.details?.includes('qwen2.5:7b'));

  assert.ok(output.failCount >= 1, 'failCount should be at least 1 when planning-readiness is FAIL');
  assert.equal(exitCode, 1);
});

test('doctor --json: configured goal model present produces PASS planning-readiness', async () => {
  const { env, cwd } = await makeTempEnv();
  env.LIFEOS_GOAL_MODEL = 'llama3.1:8b';
  const stdout: string[] = [];

  const exitCode = await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }],
            }),
          } as Response;
        }

        return { ok: true, status: 200 } as Response;
      },
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{ id: string; status: string; details?: string }>;
    failCount: number;
  };

  const planning = output.checks.find((c) => c.id === 'ollama-planning-readiness');

  assert.ok(planning, 'ollama-planning-readiness check should be present');
  assert.equal(planning!.status, 'PASS');
  assert.ok(planning!.details?.includes('llama3.1:8b'));

  assert.equal(output.failCount, 0);
  assert.equal(exitCode, 0);
});

test('doctor --json: Ollama degraded (503) produces PASS reachability and FAIL planning-readiness', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async () => ({ ok: false, status: 503 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as { checks: Array<{ id: string; status: string; details?: string }>; failCount: number };

  const reachability = output.checks.find((c) => c.id === 'ollama-reachability');
  const planning = output.checks.find((c) => c.id === 'ollama-planning-readiness');

  assert.ok(reachability, 'ollama-reachability check should be present');
  assert.equal(reachability!.status, 'PASS');
  assert.ok(reachability!.details?.includes('HTTP 503'), 'reachability details should include HTTP status');

  assert.ok(planning, 'ollama-planning-readiness check should be present');
  assert.equal(planning!.status, 'FAIL');
});

test('doctor --json: output includes expected static check ids', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as { checks: Array<{ id: string }> };
  const ids = output.checks.map((c) => c.id);

  for (const expected of [
    'node-version',
    'nats',
    'life-graph',
    'module-state',
    'module-manifests',
    'sync-auth',
    'ollama-reachability',
    'ollama-planning-readiness',
  ]) {
    assert.ok(ids.includes(expected), `check id '${expected}' should be present in output`);
  }
});

test('doctor --json: life-graph SQLite healthy is PASS with structured fields', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: async (graphPath) =>
        makeInspection(graphPath ?? join(tmpdir(), 'life-graph.json'), {
          backendCandidate: 'sqlite',
          sqliteExists: true,
          sqliteOpenable: true,
          sqliteVersionPresent: true,
        }),
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{
      id: string;
      status: string;
      details?: {
        backend?: string;
        dbPath?: string;
        sqliteVersionPresent?: boolean;
      };
    }>;
  };
  const lifeGraph = output.checks.find((check) => check.id === 'life-graph');

  assert.ok(lifeGraph, 'life-graph check should be present');
  assert.equal(lifeGraph?.status, 'PASS');
  assert.equal(lifeGraph?.details?.backend, 'sqlite');
  assert.ok(typeof lifeGraph?.details?.dbPath === 'string' && lifeGraph.details.dbPath.length > 0);
  assert.equal(lifeGraph?.details?.sqliteVersionPresent, true);
});

test('doctor --json: life-graph SQLite probe unavailable is WARN with structured fields', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: async (graphPath) =>
        makeInspection(graphPath ?? join(tmpdir(), 'life-graph.json'), {
          backendCandidate: 'sqlite',
          sqliteExists: true,
          sqliteProbeUnavailable: true,
          sqliteOpenable: false,
          sqliteVersionPresent: false,
        }),
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{
      id: string;
      status: string;
      details?: {
        backend?: string;
        dbPath?: string;
        sqliteVersionPresent?: boolean;
      };
    }>;
  };
  const lifeGraph = output.checks.find((check) => check.id === 'life-graph');

  assert.ok(lifeGraph, 'life-graph check should be present');
  assert.equal(lifeGraph?.status, 'WARN');
  assert.equal(lifeGraph?.details?.backend, 'sqlite');
  assert.ok(typeof lifeGraph?.details?.dbPath === 'string' && lifeGraph.details.dbPath.length > 0);
  assert.equal(lifeGraph?.details?.sqliteVersionPresent, false);
});

test('doctor --json: life-graph JSON fallback healthy is WARN with structured fields', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: async (graphPath) =>
        makeInspection(graphPath ?? join(tmpdir(), 'life-graph.json'), {
          backendCandidate: 'json-file',
          sqliteExists: false,
          sqliteOpenable: false,
          sqliteVersionPresent: false,
          jsonExists: true,
          jsonReadable: true,
          jsonParseable: true,
        }),
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{
      id: string;
      status: string;
      details?: {
        backend?: string;
        dbPath?: string;
        sqliteVersionPresent?: boolean;
      };
    }>;
  };
  const lifeGraph = output.checks.find((check) => check.id === 'life-graph');

  assert.ok(lifeGraph, 'life-graph check should be present');
  assert.equal(lifeGraph?.status, 'WARN');
  assert.equal(lifeGraph?.details?.backend, 'json-file');
  assert.ok(typeof lifeGraph?.details?.dbPath === 'string' && lifeGraph.details.dbPath.length > 0);
  assert.equal(lifeGraph?.details?.sqliteVersionPresent, false);
});

test('doctor --json: life-graph SQLite corrupt is FAIL with structured fields', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: async (graphPath) =>
        makeInspection(graphPath ?? join(tmpdir(), 'life-graph.json'), {
          backendCandidate: 'sqlite',
          sqliteExists: true,
          sqliteOpenable: false,
          sqliteVersionPresent: false,
          errors: ['database disk image is malformed'],
        }),
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{
      id: string;
      status: string;
      details?: {
        backend?: string;
        dbPath?: string;
        sqliteVersionPresent?: boolean;
      };
    }>;
  };
  const lifeGraph = output.checks.find((check) => check.id === 'life-graph');

  assert.ok(lifeGraph, 'life-graph check should be present');
  assert.equal(lifeGraph?.status, 'FAIL');
  assert.equal(lifeGraph?.details?.backend, 'sqlite');
  assert.ok(typeof lifeGraph?.details?.dbPath === 'string' && lifeGraph.details.dbPath.length > 0);
  assert.equal(lifeGraph?.details?.sqliteVersionPresent, false);
});

test('doctor --json: life-graph missing storage is FAIL with init suggestion and structured fields', async () => {
  const { env, cwd } = await makeTempEnv();
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: async (graphPath) =>
        makeInspection(graphPath ?? join(tmpdir(), 'life-graph.json'), {
          backendCandidate: 'missing',
          sqliteExists: false,
          sqliteOpenable: false,
          sqliteVersionPresent: false,
          jsonExists: false,
          jsonReadable: false,
          jsonParseable: false,
        }),
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{
      id: string;
      status: string;
      suggestion?: string;
      details?: {
        backend?: string;
        dbPath?: string;
        sqliteVersionPresent?: boolean;
      };
    }>;
  };
  const lifeGraph = output.checks.find((check) => check.id === 'life-graph');

  assert.ok(lifeGraph, 'life-graph check should be present');
  assert.equal(lifeGraph?.status, 'FAIL');
  assert.match(lifeGraph?.suggestion ?? '', /lifeos init/i);
  assert.equal(lifeGraph?.details?.backend, 'missing');
  assert.ok(typeof lifeGraph?.details?.dbPath === 'string' && lifeGraph.details.dbPath.length > 0);
  assert.equal(lifeGraph?.details?.sqliteVersionPresent, false);
});

test('doctor --json: sync-auth check is WARN when LIFEOS_SYNC_REQUIRE_AUTH=0', async () => {
  const { env, cwd } = await makeTempEnv();
  env.LIFEOS_SYNC_REQUIRE_AUTH = '0';
  const stdout: string[] = [];

  await runDoctorCommand(
    { outputJson: true, verbose: false },
    {
      env,
      cwd,
      stdout: (msg) => stdout.push(msg),
      stderr: () => {},
      inspectLifeGraphStorageFn: healthyInspectLifeGraphStorage,
      fetchFn: async () => ({ ok: true, status: 200 }) as Response,
    },
    CLI_VERSION,
  );

  const output = JSON.parse(stdout.join('')) as {
    checks: Array<{ id: string; status: string; details?: string }>;
  };
  const syncAuth = output.checks.find((check) => check.id === 'sync-auth');

  assert.ok(syncAuth, 'sync-auth check should be present');
  assert.equal(syncAuth?.status, 'WARN');
  assert.match(syncAuth?.details ?? '', /LIFEOS_SYNC_REQUIRE_AUTH=0/i);
});
