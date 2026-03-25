import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeErrorMessage, toFriendlyCliError } from './errors';

test('normalizeErrorMessage falls back for non-Error values', () => {
  assert.equal(normalizeErrorMessage({ message: 'ignored' }), 'Unknown error.');
});

test('toFriendlyCliError maps missing graph files to recovery guidance', () => {
  const friendly = toFriendlyCliError(new Error('ENOENT: no such file or directory'), {
    command: 'status',
    graphPath: '/tmp/lifeos.json',
  });

  assert.equal(friendly.message, 'Life graph not found at "/tmp/lifeos.json".');
  assert.match(friendly.guidance ?? '', /lifeos goal "Plan my week"/);
});

test('toFriendlyCliError maps incompatible graph schema errors', () => {
  const friendly = toFriendlyCliError(new Error('invalid life graph schema version'), {
    graphPath: '/tmp/lifeos.json',
  });

  assert.equal(friendly.message, 'Life graph file is corrupted or has an incompatible schema.');
  assert.match(friendly.guidance ?? '', /\/tmp\/lifeos.json/);
});

test('toFriendlyCliError does not mislabel generic schema errors as graph corruption', () => {
  const friendly = toFriendlyCliError(new Error('schema validation failed for model output'), {
    command: 'goal',
    graphPath: '/tmp/lifeos.json',
    model: 'llama3.1:8b',
  });

  assert.equal(friendly.message, 'schema validation failed for model output');
  assert.equal(friendly.guidance, undefined);
});

test('toFriendlyCliError maps tick connectivity failures to NATS guidance', () => {
  const friendly = toFriendlyCliError(new Error('connect ECONNREFUSED 127.0.0.1:4222'), {
    command: 'tick',
  });

  assert.equal(friendly.message, 'NATS is not reachable. Event streaming is unavailable.');
  assert.match(friendly.guidance ?? '', /docker compose up -d nats/);
});
