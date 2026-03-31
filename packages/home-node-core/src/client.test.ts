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

function seedHomeAndZone(client: HomeNodeGraphClient): void {
  client.upsertHome({
    homeId: 'home-default',
    householdId: 'household-1',
    name: 'Family Home',
    timezone: 'UTC',
  });

  client.upsertZone({
    zoneId: 'zone-kitchen',
    homeId: 'home-default',
    name: 'Kitchen',
    type: 'kitchen',
  });
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

test('registerSurface persists and returns active surface details', () => {
  const { client, cleanup } = createClientHarness();
  try {
    seedHomeAndZone(client);

    const registered = client.registerSurface({
      surfaceId: 'surface-kitchen-1',
      homeId: 'home-default',
      zoneId: 'zone-kitchen',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read', 'quick-action'],
      registeredAt: '2026-03-31T10:00:00.000Z',
    });

    const surface = client.getSurface('surface-kitchen-1');
    const registeredLookup = client.getRegisteredSurface('surface-kitchen-1');
    assert.equal(registered.household_id, 'household-1');
    assert.ok(surface);
    assert.equal(registeredLookup?.household_id, 'household-1');
    assert.equal(surface?.active, true);
    assert.equal(surface?.kind, 'kitchen_display');
  } finally {
    cleanup();
  }
});

test('deregisterSurface performs soft deactivation', () => {
  const { client, cleanup } = createClientHarness();
  try {
    seedHomeAndZone(client);
    client.registerSurface({
      surfaceId: 'surface-kitchen-1',
      homeId: 'home-default',
      zoneId: 'zone-kitchen',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    const deregistered = client.deregisterSurface('surface-kitchen-1');
    const surface = client.getSurface('surface-kitchen-1');

    assert.ok(deregistered);
    assert.equal(surface?.active, false);
  } finally {
    cleanup();
  }
});

test('listSurfaces applies active and zone filters', () => {
  const { client, cleanup } = createClientHarness();
  try {
    seedHomeAndZone(client);
    client.registerSurface({
      surfaceId: 'surface-kitchen-1',
      homeId: 'home-default',
      zoneId: 'zone-kitchen',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    client.registerSurface({
      surfaceId: 'surface-kitchen-2',
      homeId: 'home-default',
      zoneId: 'zone-kitchen',
      kind: 'hallway_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });
    client.deregisterSurface('surface-kitchen-2');

    const active = client.listSurfaces({ active: true });
    const inactive = client.listSurfaces({ active: false, zoneId: 'zone-kitchen' });

    assert.equal(active.length, 1);
    assert.equal(inactive.length, 1);
    assert.equal(inactive[0]?.surface_id, 'surface-kitchen-2');
  } finally {
    cleanup();
  }
});

test('watchdog helpers find stale surfaces and heartbeat reactivates them', () => {
  const { client, cleanup } = createClientHarness();
  try {
    seedHomeAndZone(client);
    client.registerSurface({
      surfaceId: 'surface-kitchen-1',
      homeId: 'home-default',
      zoneId: 'zone-kitchen',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
      lastSeenAt: '2026-03-31T08:00:00.000Z',
    });

    const stale = client.listStaleActiveSurfaces('2026-03-31T09:00:00.000Z');
    assert.equal(stale.length, 1);
    assert.equal(stale[0]?.surface_id, 'surface-kitchen-1');

    assert.equal(client.markSurfaceInactive('surface-kitchen-1'), true);
    assert.equal(client.getSurface('surface-kitchen-1')?.active, false);

    const refreshed = client.recordSurfaceHeartbeat(
      'surface-kitchen-1',
      '2026-03-31T10:00:00.000Z',
    );
    assert.equal(refreshed?.active, true);
  } finally {
    cleanup();
  }
});

test('registerSurface rejects trust-level changes for existing surface_id', () => {
  const { client, cleanup } = createClientHarness();
  try {
    seedHomeAndZone(client);
    client.registerSurface({
      surfaceId: 'surface-kitchen-immutable',
      homeId: 'home-default',
      zoneId: 'zone-kitchen',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    assert.throws(() => {
      client.registerSurface({
        surfaceId: 'surface-kitchen-immutable',
        homeId: 'home-default',
        zoneId: 'zone-kitchen',
        kind: 'kitchen_display',
        trustLevel: 'personal',
        capabilities: ['read'],
      });
    }, /trust level is immutable once registered/);

    const surface = client.getSurface('surface-kitchen-immutable');
    assert.equal(surface?.trust_level, 'household');
  } finally {
    cleanup();
  }
});
