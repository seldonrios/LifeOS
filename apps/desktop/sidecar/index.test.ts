import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { mapGraphSummaryToGoalSummaries, parseJsonOutput, processRequest } from './index.ts';

test('parseJsonOutput accepts logs before JSON payload', () => {
  const parsed = parseJsonOutput<{ ok: boolean }>('debug line\n{"ok":true}');
  assert.equal(parsed.ok, true);
});

test('processRequest rejects invalid JSON', async () => {
  const response = await processRequest('{');
  assert.equal(response.id, 'unknown');
  assert.equal(response.error, 'Invalid JSON request');
});

test('processRequest rejects oversized payloads', async () => {
  const response = await processRequest('x'.repeat(33_000));
  assert.equal(response.id, 'unknown');
  assert.equal(response.error, 'Request exceeds size limit.');
});

test('processRequest executes supported command and returns result', async () => {
  const response = await processRequest(JSON.stringify({ id: 'settings-1', command: 'settings_read' }));
  assert.equal(response.id, 'settings-1');
  assert.equal(typeof response.result, 'object');
  assert.equal(response.error, undefined);
});

test('processRequest executes goal_list and returns goal summaries', async () => {
  const response = await processRequest(JSON.stringify({ id: 'goals-1', command: 'goal_list' }));
  assert.equal(response.id, 'goals-1');
  assert.equal(response.error, undefined);
  const result = response.result as Array<{ id: string; title: string; totalTasks: number; completedTasks: number }>;
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length > 0, true);
  assert.equal(typeof result[0].id, 'string');
  assert.equal(typeof result[0].title, 'string');
  assert.equal(typeof result[0].totalTasks, 'number');
  assert.equal(typeof result[0].completedTasks, 'number');
});

test('mapGraphSummaryToGoalSummaries rejects missing activeGoals', () => {
  assert.throws(
    () => mapGraphSummaryToGoalSummaries({}),
    /goal_list failed: graph summary did not include active goals\./,
  );
});

test('processRequest executes capture_create and returns capture payload', async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-sidecar-capture-'));

  try {
    process.chdir(tempDir);
    const response = await processRequest(
      JSON.stringify({
        id: 'capture-1',
        command: 'capture_create',
        args: { text: 'Remember the dentist appointment' },
      }),
    );

    assert.equal(response.id, 'capture-1');
    assert.equal(response.error, undefined);
    const result = response.result as { id?: string; content?: string; status?: string };
    assert.equal(typeof result.id, 'string');
    assert.equal(result.content, 'Remember the dentist appointment');
    assert.equal(result.status, 'pending');
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('processRequest executes trust_status and returns structured trust payload', async () => {
  const response = await processRequest(JSON.stringify({ id: 'trust-1', command: 'trust_status' }));
  assert.equal(response.id, 'trust-1');
  assert.equal(response.error, undefined);
  const result = response.result as { ownership?: unknown; runtime?: unknown };
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.ownership, 'object');
  assert.equal(typeof result.runtime, 'object');
});

test('processRequest returns Ollama model names for settings_models', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    assert.equal(String(input), 'http://127.0.0.1:11434/api/tags');
    return new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'library/qwen3:8b' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const response = await processRequest(JSON.stringify({ id: 'models-1', command: 'settings_models' }));
    assert.equal(response.error, undefined);
    assert.deepEqual(response.result, { models: ['llama3.1:8b', 'library/qwen3:8b'] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('processRequest returns empty settings_models result when Ollama is unreachable', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error('connect ECONNREFUSED');
  }) as typeof fetch;

  try {
    const response = await processRequest(JSON.stringify({ id: 'models-2', command: 'settings_models' }));
    assert.equal(response.error, undefined);
    assert.deepEqual(response.result, { models: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('processRequest rejects oversized settings_models responses', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response('{"models":[]}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(3 * 1024 * 1024),
      },
    })) as typeof fetch;

  try {
    const response = await processRequest(JSON.stringify({ id: 'models-3', command: 'settings_models' }));
    assert.equal(response.error, undefined);
    assert.deepEqual(response.result, { models: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('processRequest truncates settings_models responses with too many models', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        models: Array.from({ length: 101 }, (_, index) => ({ name: `model-${index}` })),
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )) as typeof fetch;

  try {
    const response = await processRequest(JSON.stringify({ id: 'models-4', command: 'settings_models' }));
    assert.equal(response.error, undefined);
    const result = response.result as { models: string[] };
    assert.equal(Array.isArray(result.models), true);
    assert.equal(result.models.length, 100);
    assert.equal(result.models[0], 'model-0');
    assert.equal(result.models.at(-1), 'model-99');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
