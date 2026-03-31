import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { HomeStateSnapshotSchema } from '@lifeos/contracts';

import {
  HomeNodeGraphClient,
  buildNextSnapshot,
  resolveHomeModeTransition,
  type HouseholdHomeStateChangedLike,
} from './client';

function createClientHarness(): { client: HomeNodeGraphClient; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-home-node-core-'));
  const dbPath = join(tempDir, 'home-node.db');
  const client = new HomeNodeGraphClient(dbPath);
  client.initializeSchema();

  return {
    client,
    cleanup: () => {
      client.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

const baseSnapshot = HomeStateSnapshotSchema.parse({
  home_mode: 'home',
  occupancy_summary: 'occupied',
  active_routines: [],
  adapter_health: 'healthy',
  snapshot_at: '2026-03-31T00:00:00.000Z',
});

function event(
  stateKey: string,
  newValue: unknown,
  consentVerified = true,
): HouseholdHomeStateChangedLike {
  return {
    householdId: 'household-1',
    stateKey,
    newValue,
    consentVerified,
  };
}

test('resolveHomeModeTransition applies all deterministic rules', () => {
  assert.equal(resolveHomeModeTransition(event('presence.anyone_home', false), 'home'), 'away');
  assert.equal(resolveHomeModeTransition(event('presence.anyone_home', true), 'away'), 'home');
  assert.equal(
    resolveHomeModeTransition(event('routine.morning', 'active'), 'home'),
    'morning_routine',
  );
  assert.equal(
    resolveHomeModeTransition(event('routine.evening', 'active'), 'home'),
    'evening_routine',
  );
  assert.equal(resolveHomeModeTransition(event('quiet_hours', true), 'home'), 'quiet_hours');
  assert.equal(resolveHomeModeTransition(event('quiet_hours', false), 'quiet_hours'), 'home');
});

test('resolveHomeModeTransition skips transition when consent is false', () => {
  assert.equal(
    resolveHomeModeTransition(event('presence.anyone_home', false, false), 'home'),
    'home',
  );
});

test('buildNextSnapshot updates occupancy and routines', () => {
  const afterPresence = buildNextSnapshot(
    baseSnapshot,
    event('presence.anyone_home', false),
    '2026-03-31T01:00:00.000Z',
  );
  assert.equal(afterPresence.occupancy_summary, 'empty');

  const afterMorningOn = buildNextSnapshot(
    afterPresence,
    event('routine.morning', true),
    '2026-03-31T02:00:00.000Z',
  );
  assert.deepEqual(afterMorningOn.active_routines, ['morning']);

  const afterMorningOff = buildNextSnapshot(
    afterMorningOn,
    event('routine.morning', false),
    '2026-03-31T03:00:00.000Z',
  );
  assert.deepEqual(afterMorningOff.active_routines, []);
});

test('upsertHomeStateSnapshot is idempotent by household_id', () => {
  const { client, cleanup } = createClientHarness();
  try {
    client.upsertHomeStateSnapshot({
      householdId: 'household-1',
      homeMode: 'away',
      occupancySummary: 'empty',
      activeRoutines: [],
      adapterHealth: 'healthy',
      snapshotAt: '2026-03-31T01:00:00.000Z',
    });

    client.upsertHomeStateSnapshot({
      householdId: 'household-1',
      homeMode: 'away',
      occupancySummary: 'empty',
      activeRoutines: [],
      adapterHealth: 'healthy',
      snapshotAt: '2026-03-31T01:00:00.000Z',
    });

    assert.equal(client.getSnapshotRowCount('household-1'), 1);
  } finally {
    cleanup();
  }
});

test('initializeSchema is idempotent across restarts', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-home-node-core-restart-'));
  const dbPath = join(tempDir, 'home-node.db');

  const clientA = new HomeNodeGraphClient(dbPath);
  clientA.initializeSchema();
  clientA.close();

  const clientB = new HomeNodeGraphClient(dbPath);
  try {
    assert.doesNotThrow(() => clientB.initializeSchema());
  } finally {
    clientB.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
