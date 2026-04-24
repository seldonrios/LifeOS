import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

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
