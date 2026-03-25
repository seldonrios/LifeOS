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