import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  googleBridgeModule,
  parseGoogleBridgeSubFeatures,
  setEnabledGoogleBridgeSubFeatures,
  getEnabledGoogleBridgeSubFeatures,
} from './index';

test('google bridge module exports stable id', async () => {
  assert.equal(googleBridgeModule.id, 'google-bridge');
});

test('parseGoogleBridgeSubFeatures normalizes and filters values', async () => {
  const parsed = parseGoogleBridgeSubFeatures('calendar,tasks,unknown,CALENDAR');
  assert.deepEqual(parsed, ['calendar', 'tasks']);
});

test('google bridge sub-feature config round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifeos-google-bridge-config-'));
  const path = join(dir, 'config.json');
  await setEnabledGoogleBridgeSubFeatures(['tasks', 'calendar'], {
    configPath: path,
  });
  const enabled = await getEnabledGoogleBridgeSubFeatures({
    configPath: path,
  });
  assert.deepEqual(enabled, ['calendar', 'tasks']);
});
