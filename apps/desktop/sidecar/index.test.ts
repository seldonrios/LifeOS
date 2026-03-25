import assert from 'node:assert/strict';
import test from 'node:test';

import { parseJsonOutput, processRequest } from './index.ts';

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