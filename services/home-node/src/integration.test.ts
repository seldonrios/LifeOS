import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';

import {
  Topics,
  type BaseEvent,
  type EventBusConnectionHealth,
  type EventBusTransport,
  type ManagedEventBus,
} from '@lifeos/event-bus';
import { HomeNodeDisplayFeedEventSchema } from '@lifeos/contracts';
import { HomeNodeGraphClient } from '@lifeos/home-node-core';

import { handleHomeStateChangedEvent, runGuardedWatchdogTick } from './app';
import { DISPLAY_FEED_CACHE_TTL_MS, DisplayFeedAggregator, applyContentFilter } from './feed';
import { registerHomeNodeRoutes } from './routes';

const TEST_SURFACE_SECRET = 'test-surface-secret';

type DisplayFeedSignalWaiter = {
  resolve: (signalVersion: number) => void;
  timeout: NodeJS.Timeout;
};

type AmbientActionRow = {
  action_id: string;
  household_id: string;
  trigger_type: string;
  result: string;
};

class FakeEventBus implements ManagedEventBus {
  public readonly published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];
  private readonly subscriptions = new Map<
    string,
    Set<(event: BaseEvent<unknown>) => Promise<void>>
  >();

  constructor(
    private readonly transport: EventBusTransport = 'nats',
    private readonly health: EventBusConnectionHealth = 'connected',
  ) {}

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    this.published.push({ topic, event: event as BaseEvent<unknown> });

    const handlers = this.subscriptions.get(topic);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      await handler(event as BaseEvent<unknown>);
    }
  }

  async subscribe<T>(topic: string, handler: (event: BaseEvent<T>) => Promise<void>): Promise<void> {
    const existing = this.subscriptions.get(topic) ?? new Set<(event: BaseEvent<unknown>) => Promise<void>>();
    existing.add(handler as unknown as (event: BaseEvent<unknown>) => Promise<void>);
    this.subscriptions.set(topic, existing);
  }

  async close(): Promise<void> {
    return;
  }

  getTransport(): EventBusTransport {
    return this.transport;
  }

  getConnectionHealth(): EventBusConnectionHealth {
    return this.health;
  }
}

function listAmbientActionsFromDb(dbPath: string, householdId: string): AmbientActionRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .prepare(
        `SELECT action_id, household_id, trigger_type, result
         FROM ambient_actions
         WHERE household_id = ?
         ORDER BY created_at ASC`,
      )
      .all(householdId) as AmbientActionRow[];
  } finally {
    db.close();
  }
}

async function createServiceHarness(): Promise<{
  client: HomeNodeGraphClient;
  eventBus: FakeEventBus;
  app: ReturnType<typeof Fastify>;
  dbPath: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-home-node-service-integration-'));
  const dbPath = join(tempDir, 'home-node.db');
  const client = new HomeNodeGraphClient(dbPath);
  const eventBus = new FakeEventBus();
  const app = Fastify();
  client.initializeSchema();

  const displayFeedSignalVersions = new Map<string, number>();
  const displayFeedSignalWaiters = new Map<string, Set<DisplayFeedSignalWaiter>>();

  const getDisplayFeedSignalVersion = (householdId: string): number => {
    return displayFeedSignalVersions.get(householdId) ?? 0;
  };

  const signalDisplayFeedUpdated = (householdId: string): number => {
    const next = getDisplayFeedSignalVersion(householdId) + 1;
    displayFeedSignalVersions.set(householdId, next);

    const waiters = displayFeedSignalWaiters.get(householdId);
    if (waiters) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve(next);
      }
      displayFeedSignalWaiters.delete(householdId);
    }

    return next;
  };

  const waitForDisplayFeedSignal = (
    householdId: string,
    since: number,
    timeoutMs: number,
  ): Promise<number> => {
    const current = getDisplayFeedSignalVersion(householdId);
    if (current > since) {
      return Promise.resolve(current);
    }

    return new Promise((resolve) => {
      const waiters = displayFeedSignalWaiters.get(householdId) ?? new Set<DisplayFeedSignalWaiter>();
      const waiter: DisplayFeedSignalWaiter = {
        resolve,
        timeout: setTimeout(() => {
          waiters.delete(waiter);
          if (waiters.size === 0) {
            displayFeedSignalWaiters.delete(householdId);
          }

          resolve(getDisplayFeedSignalVersion(householdId));
        }, timeoutMs),
      };

      waiters.add(waiter);
      displayFeedSignalWaiters.set(householdId, waiters);
    });
  };

  await eventBus.subscribe(Topics.lifeos.householdHomeStateChanged, async (event) => {
    await handleHomeStateChangedEvent(client, eventBus, event as BaseEvent<unknown>);
  });

  await eventBus.subscribe(Topics.lifeos.homeNodeDisplayFeedUpdated, async (event) => {
    const payload = HomeNodeDisplayFeedEventSchema.parse(event.data);
    signalDisplayFeedUpdated(payload.household_id);
  });

  registerHomeNodeRoutes(app, client, {
    getDisplayFeedSignalVersion,
    waitForDisplayFeedSignal,
  });

  await app.ready();

  return {
    client,
    eventBus,
    app,
    dbPath,
    cleanup: async () => {
      for (const waiters of displayFeedSignalWaiters.values()) {
        for (const waiter of waiters) {
          clearTimeout(waiter.timeout);
        }
      }
      displayFeedSignalWaiters.clear();
      displayFeedSignalVersions.clear();
      await app.close();
      client.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function createClientHarness(): { client: HomeNodeGraphClient; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-home-node-service-integration-'));
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

test('[integration] householdHomeStateChanged -> snapshot update -> signal increment -> filtered feed fetch', async () => {
  const originalSurfaceSecret = process.env.LIFEOS_HOME_NODE_SURFACE_SECRET;
  const originalFetch = globalThis.fetch;
  let cleanup: (() => Promise<void>) | null = null;

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;
    const harness = await createServiceHarness();
    cleanup = harness.cleanup;
    const { client, eventBus, app, dbPath } = harness;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          topReminders: [
            { id: 'r1', title: 'Private health note', sensitive: true },
            { id: 'r2', title: 'Water plants', sensitive: false },
          ],
          todayEvents: [],
          choresDueToday: [],
          shoppingItems: [],
          householdNotices: [],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    };

    client.upsertHome({
      homeId: 'home-integration-1',
      householdId: 'household-integration-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen-1',
      homeId: 'home-integration-1',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-kitchen-1',
      zoneId: 'zone-kitchen-1',
      homeId: 'home-integration-1',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    const event: BaseEvent<unknown> = {
      id: 'event-integration-1',
      type: Topics.lifeos.householdHomeStateChanged,
      timestamp: new Date().toISOString(),
      source: 'integration-test',
      version: '1',
      data: {
        householdId: 'household-integration-1',
        deviceId: 'sensor-integration-1',
        stateKey: 'presence.anyone_home',
        previousValue: true,
        newValue: false,
        source: 'ha_bridge',
        consentVerified: true,
      },
    };

    await eventBus.publish(Topics.lifeos.householdHomeStateChanged, event);

    const snapshot = client.getHomeStateSnapshot('household-integration-1');
    assert.ok(snapshot);
    assert.equal(snapshot?.home_mode, 'away');

    assert.ok(eventBus.published.some((entry) => entry.topic === Topics.lifeos.homeNodeStateSnapshotUpdated));
    assert.ok(eventBus.published.some((entry) => entry.topic === Topics.lifeos.homeNodeDisplayFeedUpdated));

    const hintsResponse = await app.inject({
      method: 'GET',
      url: '/api/home-node/display-feed-hints/surface-kitchen-1?since=0&timeoutMs=1000',
      headers: {
        'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
      },
    });
    assert.equal(hintsResponse.statusCode, 200);
    const hintsPayload = hintsResponse.json() as { signalVersion: number };
    assert.ok(hintsPayload.signalVersion >= 1);

    const noAdvanceResponse = await app.inject({
      method: 'GET',
      url: `/api/home-node/display-feed-hints/surface-kitchen-1?since=${hintsPayload.signalVersion}&timeoutMs=0`,
      headers: {
        'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
      },
    });
    assert.equal(noAdvanceResponse.statusCode, 200);
    const noAdvancePayload = noAdvanceResponse.json() as { signalVersion: number };
    assert.equal(noAdvancePayload.signalVersion, hintsPayload.signalVersion);

    const feedResponse = await app.inject({
      method: 'GET',
      url: '/api/home-node/display-feed/surface-kitchen-1',
      headers: {
        'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
      },
    });
    assert.equal(feedResponse.statusCode, 200);
    const feedPayload = feedResponse.json() as {
      topReminders: Array<{ id: string; sensitive?: boolean }>;
    };
    assert.equal(feedPayload.topReminders.length, 1);
    assert.equal(feedPayload.topReminders[0]?.id, 'r2');

    const actions = listAmbientActionsFromDb(dbPath, 'household-integration-1');
    assert.ok(actions.length >= 1);
    assert.equal(actions[0]?.trigger_type, 'home_state_changed');
    assert.equal(actions[0]?.result, 'accepted');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = originalSurfaceSecret;
    if (cleanup) {
      await cleanup();
    }
  }
});

test('[integration] display feed fetch applies content filter for household trust level', async () => {
  const { client, cleanup } = createClientHarness();

  try {
    client.upsertHome({
      homeId: 'home-integration-2',
      householdId: 'household-integration-2',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-integration-2',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-kitchen-1',
      zoneId: 'zone-kitchen',
      homeId: 'home-integration-2',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });
    const snapshot = client.upsertHomeStateSnapshot({
      householdId: 'household-integration-2',
      homeMode: 'home',
      occupancySummary: 'occupied',
      activeRoutines: [],
      adapterHealth: 'healthy',
    });

    const home = client.getHomeById('home-integration-2');
    const surface = client.getRegisteredSurface('surface-kitchen-1');
    assert.ok(home);
    assert.ok(surface);

    const aggregator = new DisplayFeedAggregator(async () => ({
      topReminders: [
        { id: 'r1', title: 'Private health note', sensitive: true },
        { id: 'r2', title: 'Water plants', sensitive: false },
      ],
      todayEvents: [],
      choresDueToday: [],
      shoppingItems: [],
      householdNotices: [],
    }));

    const { feed } = await aggregator.getDisplayFeed({
      surface: surface!,
      home: home!,
      snapshot,
    });

    assert.equal(feed.topReminders.length, 1);
    assert.equal(feed.topReminders[0]?.id, 'r2');
    assert.equal(feed.stale, false);

    const filteredAgain = applyContentFilter(feed, 'household');
    assert.deepEqual(filteredAgain.topReminders, feed.topReminders);
  } finally {
    cleanup();
  }
});

test('[integration] dashboard fetch failure returns stale fallback feed', async () => {
  let nowMs = 0;
  let shouldFail = false;

  const aggregator = new DisplayFeedAggregator(
    async () => {
      if (shouldFail) {
        throw new Error('dashboard unavailable');
      }

      return {
        todayEvents: [{ id: 'event-1', title: 'Family dinner' }],
        choresDueToday: [{ id: 'chore-1', title: 'Take out trash' }],
        shoppingItems: [{ id: 'shop-1', title: 'Milk' }],
        topReminders: [{ id: 'reminder-1', title: 'Water plants', sensitive: false }],
      };
    },
    () => nowMs,
  );

  const input = {
    surface: {
      surface_id: 'surface-cache-1',
      zone_id: 'zone-kitchen',
      home_id: 'home-default',
      household_id: 'household-cache',
      kind: 'kitchen_display' as const,
      trust_level: 'household' as const,
      capabilities: ['read' as const],
      registered_at: '2026-03-31T09:00:00.000Z',
    },
    home: {
      home_id: 'home-default',
      household_id: 'household-cache',
      name: 'Home',
      timezone: 'UTC',
    },
    snapshot: {
      home_mode: 'quiet_hours' as const,
      occupancy_summary: 'occupied',
      active_routines: [],
      adapter_health: 'healthy' as const,
      snapshot_at: '2026-03-31T09:00:00.000Z',
    },
  };

  const first = await aggregator.getDisplayFeed(input);
  assert.equal(first.feed.stale, false);
  assert.equal(first.fromCache, false);

  nowMs += DISPLAY_FEED_CACHE_TTL_MS + 1;
  shouldFail = true;

  const staleFromCache = await aggregator.getDisplayFeed(input);
  assert.equal(staleFromCache.feed.stale, true);
  assert.equal(staleFromCache.fromCache, true);
  assert.ok(staleFromCache.feed.householdNotices.some((notice) => notice.id === 'quiet-hours'));
});

test('[integration] cold-start dashboard failure returns snapshot-only stale feed', async () => {
  const aggregator = new DisplayFeedAggregator(async () => {
    throw new Error('dashboard unavailable');
  });

  const input = {
    surface: {
      surface_id: 'surface-cold-start-1',
      zone_id: 'zone-kitchen',
      home_id: 'home-default',
      household_id: 'household-cold',
      kind: 'kitchen_display' as const,
      trust_level: 'household' as const,
      capabilities: ['read' as const],
      registered_at: '2026-03-31T09:00:00.000Z',
    },
    home: {
      home_id: 'home-default',
      household_id: 'household-cold',
      name: 'Home',
      timezone: 'UTC',
    },
    snapshot: {
      home_mode: 'quiet_hours' as const,
      occupancy_summary: 'occupied',
      active_routines: [],
      adapter_health: 'healthy' as const,
      snapshot_at: '2026-03-31T09:00:00.000Z',
    },
  };

  const { feed } = await aggregator.getDisplayFeed(input);

  assert.equal(feed.stale, true);
  assert.equal(feed.todayEvents.length, 0);
  assert.equal(feed.choresDueToday.length, 0);
  assert.equal(feed.shoppingItems.length, 0);
  assert.equal(feed.householdNotices.some((notice) => notice.id === 'quiet-hours'), true);
});

test('[integration] consent gate blocks state mutation and publishes consent_skip ambient action', async () => {
  let cleanup: (() => Promise<void>) | null = null;

  try {
    const harness = await createServiceHarness();
    cleanup = harness.cleanup;
    const { client, eventBus, dbPath } = harness;

    client.upsertHome({
      homeId: 'home-consent-gate-1',
      householdId: 'household-consent-gate-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-consent-gate-1',
      homeId: 'home-consent-gate-1',
      name: 'Living Room',
      type: 'living_room',
    });
    client.registerSurface({
      surfaceId: 'surface-consent-gate-1',
      zoneId: 'zone-consent-gate-1',
      homeId: 'home-consent-gate-1',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    const event: BaseEvent<unknown> = {
      id: 'event-consent-gate-1',
      type: Topics.lifeos.householdHomeStateChanged,
      timestamp: new Date().toISOString(),
      source: 'integration-test',
      version: '1',
      data: {
        householdId: 'household-consent-gate-1',
        deviceId: 'sensor-consent-gate-1',
        stateKey: 'presence.anyone_home',
        previousValue: true,
        newValue: false,
        source: 'ha_bridge',
        consentVerified: false,
      },
    };

    await eventBus.publish(Topics.lifeos.householdHomeStateChanged, event);

    // No snapshot should have been upserted
    const snapshot = client.getHomeStateSnapshot('household-consent-gate-1');
    assert.equal(snapshot, null);

    // No snapshot-updated or display-feed-updated events should have been published
    assert.ok(
      !eventBus.published.some((e) => e.topic === Topics.lifeos.homeNodeStateSnapshotUpdated),
    );
    assert.ok(
      !eventBus.published.some((e) => e.topic === Topics.lifeos.homeNodeDisplayFeedUpdated),
    );

    // Exactly one ambient action with result 'consent_skip'
    const actions = listAmbientActionsFromDb(dbPath, 'household-consent-gate-1');
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.result, 'consent_skip');
    assert.equal(actions[0]?.trigger_type, 'home_state_changed');
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
});

test('[integration] watchdog overlap guard skips second invocation while first is in-flight', async () => {
  let resolveFirstBody!: () => void;
  const firstBodyDone = new Promise<void>((resolve) => {
    resolveFirstBody = resolve;
  });

  // Start a slow first tick — it will hold watchdogRunning = true until resolveFirstBody() is called.
  const firstTickPromise = runGuardedWatchdogTick(async () => {
    await firstBodyDone;
  });

  // Second tick while first is in-flight: should be skipped immediately.
  let secondBodyRan = false;
  const skipped = await runGuardedWatchdogTick(async () => {
    secondBodyRan = true;
  });

  assert.equal(skipped, false, 'second tick must be skipped while first is in-flight');
  assert.equal(secondBodyRan, false, 'second tick body must not have executed');

  // Release the first tick and wait for it to complete.
  resolveFirstBody();
  const firstResult = await firstTickPromise;
  assert.equal(firstResult, true, 'first tick must report it ran');

  // Guard must be released — a subsequent tick must now execute.
  let afterBodyRan = false;
  const afterResult = await runGuardedWatchdogTick(async () => {
    afterBodyRan = true;
  });
  assert.equal(afterResult, true, 'tick after guard release must run');
  assert.equal(afterBodyRan, true, 'post-release tick body must have executed');
});

test('[integration] watchdog finally block releases guard even when body throws', async () => {
  let firstBodyRan = false;
  // Body throws: the finally clause must still reset watchdogRunning.
  const errorResult = await runGuardedWatchdogTick(async () => {
    firstBodyRan = true;
    throw new Error('simulated watchdog error');
  });

  assert.equal(firstBodyRan, true, 'throwing body must have run');
  assert.equal(errorResult, true, 'tick must report it ran even though the body threw');

  // Subsequent tick must not be skipped — guard was released by finally.
  let recoveryBodyRan = false;
  const recoveryResult = await runGuardedWatchdogTick(async () => {
    recoveryBodyRan = true;
  });
  assert.equal(recoveryResult, true, 'tick after error must not be skipped');
  assert.equal(recoveryBodyRan, true, 'recovery tick body must have executed');
});
