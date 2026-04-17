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

test('processRequest executes new inbox/review/plan commands', async () => {
  const cases: Array<{ command: string; args: Record<string, unknown>; assertResult: (value: unknown) => void }> = [
    {
      command: 'plan_from_capture',
      args: { captureId: 'capture-1', title: 'Garage cleanup plan' },
      assertResult: (value) => {
        const result = value as { id?: string };
        assert.equal(result.id, 'mock-plan-capture-1');
      },
    },
    {
      command: 'note_create',
      args: { captureId: 'capture-2', title: 'Follow-up notes' },
      assertResult: (value) => {
        const result = value as { id?: string };
        assert.equal(result.id, 'mock-note-capture-2');
      },
    },
    {
      command: 'inbox_defer',
      args: { captureId: 'capture-3' },
      assertResult: (value) => {
        const result = value as { id?: string; deferred?: boolean };
        assert.equal(result.id, 'capture-3');
        assert.equal(result.deferred, true);
      },
    },
    {
      command: 'inbox_delete',
      args: { captureId: 'capture-4' },
      assertResult: (value) => {
        const result = value as { id?: string; deleted?: boolean };
        assert.equal(result.id, 'capture-4');
        assert.equal(result.deleted, true);
      },
    },
    {
      command: 'review_close_day',
      args: { tomorrowNote: 'Start with invoice follow-up' },
      assertResult: (value) => {
        const result = value as { closedAt?: string; tomorrowNote?: string | null };
        assert.equal(typeof result.closedAt, 'string');
        assert.equal(result.tomorrowNote, 'Start with invoice follow-up');
      },
    },
    {
      command: 'review_move_open',
      args: {},
      assertResult: (value) => {
        const result = value as { movedCount?: number };
        assert.equal(result.movedCount, 2);
      },
    },
    {
      command: 'review_archive',
      args: {},
      assertResult: (value) => {
        const result = value as { archivedCount?: number };
        assert.equal(result.archivedCount, 2);
      },
    },
    {
      command: 'plan_block',
      args: { planId: 'plan-1', reason: 'Waiting on dependency' },
      assertResult: (value) => {
        const result = value as { id?: string; blocked?: boolean };
        assert.equal(result.id, 'plan-1');
        assert.equal(result.blocked, true);
      },
    },
    {
      command: 'plan_alternatives',
      args: { planId: 'plan-2' },
      assertResult: (value) => {
        const result = value as { alternatives?: string[] };
        assert.deepEqual(result.alternatives, ['Alt A', 'Alt B']);
      },
    },
    {
      command: 'plan_split',
      args: { planId: 'plan-3' },
      assertResult: (value) => {
        const result = value as { subPlans?: Array<{ id: string; title: string }> };
        assert.deepEqual(result.subPlans, [
          { id: 'mock-sub-1', title: 'Part 1' },
          { id: 'mock-sub-2', title: 'Part 2' },
        ]);
      },
    },
  ];

  for (const item of cases) {
    const response = await processRequest(
      JSON.stringify({ id: `${item.command}-1`, command: item.command, args: item.args }),
    );

    assert.equal(response.id, `${item.command}-1`);
    assert.equal(response.error, undefined);
    item.assertResult(response.result);
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
