import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  Topics,
  type BaseEvent,
  type EventBusConnectionHealth,
  type EventBusTransport,
  type ManagedEventBus,
} from '@lifeos/event-bus';
import { HomeNodeGraphClient } from '@lifeos/home-node-core';

import {
  handleHomeStateChangedEvent,
  handleVoiceCaptureEvent,
  publishDisplayFeedUpdatedEvent,
  publishSnapshotUpdatedEvent,
  publishSurfaceDeregisteredEvent,
  publishSurfaceRegisteredEvent,
  runSurfaceHealthWatchdog,
  runVoiceRuntimeHealthWatchdog,
} from './app';
import { DISPLAY_FEED_CACHE_TTL_MS, DisplayFeedAggregator, applyContentFilter } from './feed';
import { registerHomeNodeRoutes } from './routes';

const TEST_SURFACE_SECRET = 'test-surface-secret';

type RouteReply = {
  code: (statusCode: number) => {
    send: (payload: unknown) => { statusCode: number; payload: unknown };
  };
};

type SnapshotRouteHandler = (
  request: { params?: { householdId?: string } },
  reply: RouteReply,
) => Promise<{ statusCode: number; payload: unknown }>;

type RouteAppHarness = {
  get: (path: string, handler: SnapshotRouteHandler) => void;
  post: (path: string, handler: SnapshotRouteHandler) => void;
  delete: (path: string, handler: SnapshotRouteHandler) => void;
};

function createRouteHarness(): {
  app: RouteAppHarness;
  handlers: Map<string, SnapshotRouteHandler>;
} {
  const handlers = new Map<string, SnapshotRouteHandler>();
  const app: RouteAppHarness = {
    get: (path: string, handler: SnapshotRouteHandler) => {
      handlers.set(`GET ${path}`, handler);
    },
    post: (path: string, handler: SnapshotRouteHandler) => {
      handlers.set(`POST ${path}`, handler);
    },
    delete: (path: string, handler: SnapshotRouteHandler) => {
      handlers.set(`DELETE ${path}`, handler);
    },
  };

  return { app, handlers };
}

class FakeEventBus implements ManagedEventBus {
  public readonly published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];

  constructor(
    private readonly transport: EventBusTransport = 'nats',
    private readonly health: EventBusConnectionHealth = 'connected',
  ) {}

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    this.published.push({ topic, event: event as BaseEvent<unknown> });
  }

  async subscribe<T>(_topic: string, _handler: (event: BaseEvent<T>) => Promise<void>): Promise<void> {
    void _topic;
    void _handler;
    return;
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

function createClientHarness(): { client: HomeNodeGraphClient; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-home-node-service-'));
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

test('GET /api/home-node/snapshot/:householdId returns snapshot when present', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();
  const originalSurfaceSecret = process.env.LIFEOS_HOME_NODE_SURFACE_SECRET;

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;
    client.upsertHomeStateSnapshot({
      householdId: 'household-1',
      homeMode: 'away',
      occupancySummary: 'empty',
      activeRoutines: [],
      adapterHealth: 'healthy',
      snapshotAt: '2026-03-31T00:00:00.000Z',
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const routeHandler = handlers.get('GET /api/home-node/snapshot/:householdId');
    if (!routeHandler) {
      throw new Error('snapshot route was not registered');
    }

    const response = await routeHandler(
      {
        params: { householdId: 'household-1' },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const payload = response.payload as { home_mode: string };
    assert.equal(response.statusCode, 200);
    assert.equal(payload.home_mode, 'away');
  } finally {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = originalSurfaceSecret;
    cleanup();
  }
});

test('GET /api/home-node/snapshot/:householdId returns 404 when absent', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();
  const originalSurfaceSecret = process.env.LIFEOS_HOME_NODE_SURFACE_SECRET;

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;
    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const routeHandler = handlers.get('GET /api/home-node/snapshot/:householdId');
    if (!routeHandler) {
      throw new Error('snapshot route was not registered');
    }

    const response = await routeHandler(
      {
        params: { householdId: 'household-404' },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(response.statusCode, 404);
  } finally {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = originalSurfaceSecret;
    cleanup();
  }
});

test('GET /api/home-node/display-feed/:surfaceId returns 401 for missing or invalid secret', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-feed-1',
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const feedHandler = handlers.get('GET /api/home-node/display-feed/:surfaceId');
    if (!feedHandler) {
      throw new Error('display feed route was not registered');
    }

    const missingSecret = await feedHandler(
      {
        params: { surfaceId: 'surface-feed-1' },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const invalidSecret = await feedHandler(
      {
        params: { surfaceId: 'surface-feed-1' },
        headers: {
          'x-lifeos-surface-secret': 'wrong-secret',
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(missingSecret.statusCode, 401);
    assert.equal(invalidSecret.statusCode, 401);
  } finally {
    cleanup();
  }
});

test('GET /api/home-node/display-feed/:surfaceId returns ticket contract payload', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-feed-1',
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });
    client.upsertHomeStateSnapshot({
      householdId: 'household-1',
      homeMode: 'home',
      occupancySummary: 'occupied',
      activeRoutines: ['morning'],
      adapterHealth: 'healthy',
      snapshotAt: '2026-03-31T00:00:00.000Z',
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const feedHandler = handlers.get('GET /api/home-node/display-feed/:surfaceId');
    if (!feedHandler) {
      throw new Error('display feed route was not registered');
    }

    const response = await feedHandler(
      {
        params: { surfaceId: 'surface-feed-1' },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const payload = response.payload as {
      todayEvents: unknown[];
      choresDueToday: unknown[];
      shoppingItems: unknown[];
      topReminders: unknown[];
      householdNotices: unknown[];
      stale: boolean;
      generatedAt: string;
    };

    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(payload.todayEvents));
    assert.ok(Array.isArray(payload.choresDueToday));
    assert.ok(Array.isArray(payload.shoppingItems));
    assert.ok(Array.isArray(payload.topReminders));
    assert.ok(Array.isArray(payload.householdNotices));
    assert.equal(typeof payload.stale, 'boolean');
    assert.match(payload.generatedAt, /T/);
  } finally {
    cleanup();
  }
});

test('GET /api/home-node/display-feed-hints/:surfaceId returns signal version for authorized surfaces', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-feed-1',
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client, {
      getDisplayFeedSignalVersion: () => 3,
    });
    const hintHandler = handlers.get('GET /api/home-node/display-feed-hints/:surfaceId');
    if (!hintHandler) {
      throw new Error('display-feed hints route was not registered');
    }

    const unauthorized = await hintHandler(
      {
        params: { surfaceId: 'surface-feed-1' },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const authorized = await hintHandler(
      {
        params: { surfaceId: 'surface-feed-1' },
        query: { householdId: 'household-1', since: '1', timeoutMs: '1000' },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(unauthorized.statusCode, 401);
    assert.equal(authorized.statusCode, 200);
    assert.equal((authorized.payload as { signalVersion?: number }).signalVersion, 3);
  } finally {
    cleanup();
  }
});

test('applyContentFilter enforces trust-level visibility and sensitive reminder filtering', () => {
  const baseFeed = {
    todayEvents: [{ id: 'event-1', title: 'Family dinner' }],
    choresDueToday: [{ id: 'chore-1', title: 'Take out trash' }],
    shoppingItems: [{ id: 'shop-1', title: 'Milk', status: 'added' }],
    topReminders: [
      { id: 'reminder-1', title: 'Call pharmacy', sensitive: true },
      { id: 'reminder-2', title: 'Water plants', sensitive: false },
    ],
    householdNotices: [
      { id: 'notice-1', title: 'Heads up', severity: 'warning' as const },
      { id: 'notice-2', title: 'Info notice', severity: 'info' as const },
    ],
    stale: false,
    generatedAt: '2026-03-31T09:00:00.000Z',
  };

  const personal = applyContentFilter(baseFeed, 'personal');
  const household = applyContentFilter(baseFeed, 'household');
  const guest = applyContentFilter(baseFeed, 'guest');

  assert.equal(personal.topReminders.length, 2);
  assert.equal(household.topReminders.length, 1);
  assert.equal(household.topReminders[0]?.id, 'reminder-2');
  assert.equal(guest.todayEvents.length, 0);
  assert.equal(guest.choresDueToday.length, 0);
  assert.equal(guest.topReminders.length, 0);
  assert.equal(guest.shoppingItems.length, 1);
  assert.equal(guest.householdNotices.length, 1);
  assert.equal(guest.householdNotices[0]?.id, 'notice-2');
});

test('DisplayFeedAggregator supports cache hit, expiry, and stale fallback behavior', async () => {
  let nowMs = 0;
  let fetchCount = 0;
  let failFetch = false;
  const aggregator = new DisplayFeedAggregator(
    async () => {
      fetchCount += 1;
      if (failFetch) {
        throw new Error('dashboard unavailable');
      }

      return {
        todayEvents: [{ id: 'event-1', title: 'Family dinner' }],
        choresDueToday: [{ id: 'chore-1', title: 'Take out trash' }],
        shoppingItems: [{ id: 'shop-1', title: 'Milk' }],
        topReminders: [{ id: 'reminder-1', title: 'Water plants', sensitive: false }],
        householdNotices: [{ id: 'notice-1', title: 'Welcome', severity: 'info' }],
      };
    },
    () => nowMs,
  );

  const input = {
    surface: {
      surface_id: 'surface-cache-1',
      zone_id: 'zone-kitchen',
      home_id: 'home-default',
      household_id: 'household-1',
      kind: 'kitchen_display' as const,
      trust_level: 'household' as const,
      capabilities: ['read' as const],
      registered_at: '2026-03-31T09:00:00.000Z',
    },
    home: {
      home_id: 'home-default',
      household_id: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    },
    snapshot: {
      home_mode: 'home' as const,
      occupancy_summary: 'occupied',
      active_routines: [],
      adapter_health: 'healthy' as const,
      snapshot_at: '2026-03-31T09:00:00.000Z',
    },
  };

  const first = await aggregator.getDisplayFeed(input);
  assert.equal(first.feed.stale, false);
  assert.equal(first.fromCache, false);
  assert.equal(fetchCount, 1);

  nowMs += 1_000;
  const cacheHit = await aggregator.getDisplayFeed(input);
  assert.equal(cacheHit.feed.stale, false);
  assert.equal(cacheHit.fromCache, true);
  assert.equal(fetchCount, 1);

  nowMs += DISPLAY_FEED_CACHE_TTL_MS + 1;
  failFetch = true;
  const staleFromCache = await aggregator.getDisplayFeed(input);
  assert.equal(staleFromCache.feed.stale, true);
  assert.equal(staleFromCache.fromCache, true);

  const coldFailureAggregator = new DisplayFeedAggregator(
    async () => {
      throw new Error('dashboard unavailable');
    },
    () => nowMs,
  );
  const staleSnapshotOnly = await coldFailureAggregator.getDisplayFeed(input);
  assert.equal(staleSnapshotOnly.feed.stale, true);
  assert.equal(staleSnapshotOnly.feed.todayEvents.length, 0);
  assert.equal(staleSnapshotOnly.feed.choresDueToday.length, 0);
  assert.equal(staleSnapshotOnly.feed.shoppingItems.length, 0);
  assert.equal(staleSnapshotOnly.feed.topReminders.length, 0);
});

test('DisplayFeedAggregator uses configured dashboard URL and service token', async () => {
  const captured: { url: string | null; authToken: string | null } = {
    url: null,
    authToken: null,
  };
  const aggregator = new DisplayFeedAggregator(
    async (url, options) => {
      captured.url = url;
      captured.authToken = options?.authToken ?? null;
      return {
        todayEvents: [],
        choresDueToday: [],
        shoppingItems: [],
        topReminders: [],
      };
    },
    () => Date.now(),
    {
      dashboardBaseUrl: 'http://dashboard.internal:3100',
      dashboardServiceTokenProvider: async () => 'test-service-token',
    },
  );

  await aggregator.getDisplayFeed({
    surface: {
      surface_id: 'surface-config-1',
      zone_id: 'zone-kitchen',
      home_id: 'home-default',
      household_id: 'household-1',
      kind: 'kitchen_display',
      trust_level: 'household',
      capabilities: ['read'],
      registered_at: '2026-03-31T09:00:00.000Z',
    },
    home: {
      home_id: 'home-default',
      household_id: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    },
    snapshot: {
      home_mode: 'home',
      occupancy_summary: 'occupied',
      active_routines: [],
      adapter_health: 'healthy',
      snapshot_at: '2026-03-31T09:00:00.000Z',
    },
  });

  assert.equal(
    captured.url,
    'http://dashboard.internal:3100/api/households/household-1/display-feed',
  );
  assert.equal(captured.authToken, 'test-service-token');
});

test('handleHomeStateChangedEvent upserts snapshot and publishes update event', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });

    const event: BaseEvent<unknown> = {
      id: 'event-1',
      type: Topics.lifeos.householdHomeStateChanged,
      timestamp: new Date().toISOString(),
      source: 'test-suite',
      version: '1',
      data: {
        householdId: 'household-1',
        deviceId: 'sensor-1',
        stateKey: 'presence.anyone_home',
        previousValue: true,
        newValue: false,
        source: 'ha_bridge',
        consentVerified: true,
      },
    };

    await handleHomeStateChangedEvent(client, eventBus, event);

    const snapshot = client.getHomeStateSnapshot('household-1');
    assert.ok(snapshot);
    assert.equal(snapshot?.home_mode, 'away');
    assert.equal(eventBus.published.length, 2);
    assert.equal(eventBus.published[0]?.topic, Topics.lifeos.homeNodeStateSnapshotUpdated);
    assert.equal(eventBus.published[1]?.topic, Topics.lifeos.homeNodeDisplayFeedUpdated);
  } finally {
    cleanup();
  }
});

test('publishSnapshotUpdatedEvent publishes using resolved home_id for household', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
    client.upsertHome({
      homeId: 'home-custom-abc',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });

    const snapshot = client.upsertHomeStateSnapshot({
      householdId: 'household-1',
      homeMode: 'home',
      occupancySummary: 'occupied',
      activeRoutines: [],
      adapterHealth: 'healthy',
      snapshotAt: '2026-03-31T00:00:00.000Z',
    });

    await publishSnapshotUpdatedEvent(client, eventBus, 'household-1', snapshot);

    assert.equal(eventBus.published.length, 1);
    assert.equal(
      (eventBus.published[0]?.event.data as { home_id: string }).home_id,
      'home-custom-abc',
    );
  } finally {
    cleanup();
  }
});

test('publishSnapshotUpdatedEvent skips publish when household has no registered home', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
    const snapshot = {
      home_mode: 'home' as const,
      occupancy_summary: 'unknown',
      active_routines: [],
      adapter_health: 'healthy' as const,
      snapshot_at: '2026-03-31T00:00:00.000Z',
    };

    await publishSnapshotUpdatedEvent(client, eventBus, 'household-orphan', snapshot);

    assert.equal(eventBus.published.length, 0);
  } finally {
    cleanup();
  }
});

test('publishDisplayFeedUpdatedEvent publishes using resolved home_id for household', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
    client.upsertHome({
      homeId: 'home-custom-abc',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });

    await publishDisplayFeedUpdatedEvent(client, eventBus, 'household-1', 'home');

    assert.equal(eventBus.published.length, 1);
    assert.equal(
      (eventBus.published[0]?.event.data as { home_id: string }).home_id,
      'home-custom-abc',
    );
  } finally {
    cleanup();
  }
});

test('publishDisplayFeedUpdatedEvent skips publish when household has no registered home', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
    await publishDisplayFeedUpdatedEvent(client, eventBus, 'household-orphan', 'home');

    assert.equal(eventBus.published.length, 0);
  } finally {
    cleanup();
  }
});

test('handleHomeStateChangedEvent does not publish display feed update when mode is unchanged', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });

    client.upsertHomeStateSnapshot({
      householdId: 'household-1',
      homeMode: 'home',
      occupancySummary: 'occupied',
      activeRoutines: [],
      adapterHealth: 'healthy',
      snapshotAt: '2026-03-31T00:00:00.000Z',
    });

    const event: BaseEvent<unknown> = {
      id: 'event-unchanged-mode',
      type: Topics.lifeos.householdHomeStateChanged,
      timestamp: new Date().toISOString(),
      source: 'test-suite',
      version: '1',
      data: {
        householdId: 'household-1',
        deviceId: 'sensor-2',
        stateKey: 'presence.kitchen',
        previousValue: 'idle',
        newValue: 'occupied',
        source: 'ha_bridge',
        consentVerified: true,
      },
    };

    await handleHomeStateChangedEvent(client, eventBus, event);

    assert.equal(eventBus.published.length, 1);
    assert.equal(eventBus.published[0]?.topic, Topics.lifeos.homeNodeStateSnapshotUpdated);
  } finally {
    cleanup();
  }
});

test('handleVoiceCaptureEvent appends ambient action without throwing', () => {
  const { client, cleanup } = createClientHarness();
  try {
    const event: BaseEvent<unknown> = {
      id: 'event-voice-1',
      type: Topics.lifeos.householdVoiceCaptureCreated,
      timestamp: new Date().toISOString(),
      source: 'test-suite',
      version: '1',
      data: {
        captureId: 'capture-1',
        householdId: 'household-1',
        actorUserId: 'user-1',
        text: 'turn on hallway display',
        audioRef: null,
        source: 'ha_bridge',
        createdAt: new Date().toISOString(),
      },
    };

    assert.doesNotThrow(() => handleVoiceCaptureEvent(client, event));
  } finally {
    cleanup();
  }
});

test('POST /api/home-node/surfaces registers and lists surfaces', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const registerHandler = handlers.get('POST /api/home-node/surfaces/register');
    const listHandler = handlers.get('GET /api/home-node/surfaces');
    if (!registerHandler || !listHandler) {
      throw new Error('surface routes were not registered');
    }

    const registerResponse = await registerHandler(
      {
        body: {
          surface_id: 'surface-1',
          zone_id: 'zone-kitchen',
          home_id: 'home-default',
          kind: 'kitchen_display',
          trust_level: 'household',
          capabilities: ['read'],
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const listResponse = await listHandler(
      {
        query: {
          active: 'true',
          householdId: 'household-1',
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(registerResponse.statusCode, 201);
    assert.equal(
      typeof (registerResponse.payload as { surface_id?: unknown }).surface_id,
      'string',
    );
    assert.equal(listResponse.statusCode, 200);
    assert.equal((listResponse.payload as { count: number }).count, 1);
  } finally {
    cleanup();
  }
});

test('surface route hooks fire exactly once per register and deregister transition', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });

    let registeredCount = 0;
    let deregisteredCount = 0;
    registerHomeNodeRoutes(
      app as unknown as Parameters<typeof registerHomeNodeRoutes>[0],
      client,
      {
        onSurfaceRegistered: async () => {
          registeredCount += 1;
        },
        onSurfaceDeregistered: async () => {
          deregisteredCount += 1;
        },
      },
    );

    const registerHandler = handlers.get('POST /api/home-node/surfaces');
    const deregisterHandler = handlers.get('DELETE /api/home-node/surfaces/:surfaceId');
    if (!registerHandler || !deregisterHandler) {
      throw new Error('surface lifecycle routes were not registered');
    }

    const registerResponse = await registerHandler(
      {
        body: {
          surface_id: 'surface-1',
          zone_id: 'zone-kitchen',
          home_id: 'home-default',
          kind: 'kitchen_display',
          trust_level: 'household',
          capabilities: ['read'],
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const deregisterResponse = await deregisterHandler(
      {
        params: {
          surfaceId: 'surface-1',
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(registerResponse.statusCode, 201);
    assert.equal(deregisterResponse.statusCode, 200);
    assert.equal(registeredCount, 1);
    assert.equal(deregisteredCount, 1);
  } finally {
    cleanup();
  }
});

test('POST /api/home-node/homes and POST /api/home-node/zones satisfy contract behavior', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);

    const createHomeHandler = handlers.get('POST /api/home-node/homes');
    const createZoneHandler = handlers.get('POST /api/home-node/zones');
    if (!createHomeHandler || !createZoneHandler) {
      throw new Error('home or zone routes were not registered');
    }

    const homeResponse = await createHomeHandler(
      {
        body: {
          home_id: 'home-default',
          household_id: 'household-1',
          name: 'Home',
          timezone: 'UTC',
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const missingHomeZoneResponse = await createZoneHandler(
      {
        body: {
          zone_id: 'zone-missing-home',
          home_id: 'home-missing',
          name: 'Kitchen',
          type: 'kitchen',
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const zoneResponse = await createZoneHandler(
      {
        body: {
          zone_id: 'zone-kitchen',
          home_id: 'home-default',
          name: 'Kitchen',
          type: 'kitchen',
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(homeResponse.statusCode, 201);
    assert.equal(missingHomeZoneResponse.statusCode, 404);
    assert.equal(zoneResponse.statusCode, 201);
  } finally {
    cleanup();
  }
});

test('surface mutating endpoints return 401 for missing or invalid secret', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-401',
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const registerHandler = handlers.get('POST /api/home-node/surfaces/register');
    const heartbeatHandler = handlers.get('POST /api/home-node/surfaces/:surfaceId/heartbeat');
    const deregisterHandler = handlers.get('DELETE /api/home-node/surfaces/:surfaceId');
    if (!registerHandler || !heartbeatHandler || !deregisterHandler) {
      throw new Error('required surface routes were not registered');
    }

    const missingSecretRegisterResponse = await registerHandler(
      {
        body: {
          zone_id: 'zone-kitchen',
          home_id: 'home-default',
          kind: 'kitchen_display',
          trust_level: 'household',
          capabilities: ['read'],
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const invalidSecretHeartbeatResponse = await heartbeatHandler(
      {
        params: { surfaceId: 'surface-401' },
        headers: { 'x-lifeos-surface-secret': 'bad-secret' },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const invalidSecretDeregisterResponse = await deregisterHandler(
      {
        params: { surfaceId: 'surface-401' },
        headers: { 'x-lifeos-surface-secret': 'bad-secret' },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(missingSecretRegisterResponse.statusCode, 401);
    assert.equal(invalidSecretHeartbeatResponse.statusCode, 401);
    assert.equal(invalidSecretDeregisterResponse.statusCode, 401);
  } finally {
    cleanup();
  }
});

test('GET /api/home-node/surfaces requires householdId and filters by household', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    process.env.LIFEOS_HOME_NODE_SURFACE_SECRET = TEST_SURFACE_SECRET;

    client.upsertHome({
      homeId: 'home-1',
      householdId: 'household-1',
      name: 'Home 1',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-1',
      homeId: 'home-1',
      name: 'Kitchen',
      type: 'kitchen',
    });
    client.registerSurface({
      surfaceId: 'surface-household-1',
      zoneId: 'zone-1',
      homeId: 'home-1',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    client.upsertHome({
      homeId: 'home-2',
      householdId: 'household-2',
      name: 'Home 2',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-2',
      homeId: 'home-2',
      name: 'Hallway',
      type: 'hallway',
    });
    client.registerSurface({
      surfaceId: 'surface-household-2',
      zoneId: 'zone-2',
      homeId: 'home-2',
      kind: 'hallway_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });

    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const listHandler = handlers.get('GET /api/home-node/surfaces');
    if (!listHandler) {
      throw new Error('surfaces list route was not registered');
    }

    const missingHouseholdResponse = await listHandler(
      {
        query: {},
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const scopedResponse = await listHandler(
      {
        query: {
          householdId: 'household-1',
        },
        headers: {
          'x-lifeos-surface-secret': TEST_SURFACE_SECRET,
        },
      } as unknown as Parameters<SnapshotRouteHandler>[0],
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    const scopedPayload = scopedResponse.payload as {
      count: number;
      items: Array<{ surface_id: string }>;
    };

    assert.equal(missingHouseholdResponse.statusCode, 400);
    assert.equal(scopedResponse.statusCode, 200);
    assert.equal(scopedPayload.count, 1);
    assert.equal(scopedPayload.items[0]?.surface_id, 'surface-household-1');
  } finally {
    cleanup();
  }
});

test('surface lifecycle events publish on register and deregister', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();
  try {
    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });

    const surface = client.registerSurface({
      surfaceId: 'surface-1',
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
    });
    await publishSurfaceRegisteredEvent(eventBus, surface);
    await publishSurfaceDeregisteredEvent(eventBus, surface);

    assert.equal(eventBus.published.length, 2);
    assert.equal(eventBus.published[0]?.topic, Topics.lifeos.homeNodeSurfaceRegistered);
    assert.equal(eventBus.published[1]?.topic, Topics.lifeos.homeNodeSurfaceDeregistered);
  } finally {
    cleanup();
  }
});

test('runSurfaceHealthWatchdog marks stale surfaces inactive and publishes batch health event', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();
  try {
    client.upsertHome({
      homeId: 'home-default',
      householdId: 'household-1',
      name: 'Home',
      timezone: 'UTC',
    });
    client.upsertZone({
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      name: 'Kitchen',
      type: 'kitchen',
    });

    client.registerSurface({
      surfaceId: 'surface-1',
      zoneId: 'zone-kitchen',
      homeId: 'home-default',
      kind: 'kitchen_display',
      trustLevel: 'household',
      capabilities: ['read'],
      lastSeenAt: '2026-03-31T09:56:00.000Z',
    });

    const transitionedBeforeThreshold = await runSurfaceHealthWatchdog(
      client,
      eventBus,
      new Date('2026-03-31T10:00:00.000Z'),
    );
    assert.deepEqual(transitionedBeforeThreshold, []);
    assert.equal(client.getSurface('surface-1')?.active, true);

    const transitionedAfterThreshold = await runSurfaceHealthWatchdog(
      client,
      eventBus,
      new Date('2026-03-31T10:02:00.000Z'),
    );

    assert.deepEqual(transitionedAfterThreshold, ['surface-1']);
    assert.equal(client.getSurface('surface-1')?.active, false);
    assert.equal(eventBus.published.length, 1);
    assert.equal(eventBus.published[0]?.topic, Topics.lifeos.homeNodeHealthChanged);
  } finally {
    cleanup();
  }
});

test('runVoiceRuntimeHealthWatchdog publishes transitions once runtime status changes', async () => {
  const eventBus = new FakeEventBus();
  const runtimeClient = {
    isConfigured: () => true,
    checkHealth: async () => ({
      status: 'degraded' as const,
      configured: true,
      checkedAt: '2026-03-31T10:00:00.000Z',
      reason: 'runtime timeout',
      latencyMs: 1200,
    }),
  };

  const firstStatus = await runVoiceRuntimeHealthWatchdog(runtimeClient, eventBus, null);
  const secondStatus = await runVoiceRuntimeHealthWatchdog(runtimeClient, eventBus, 'healthy');

  assert.equal(firstStatus, 'degraded');
  assert.equal(secondStatus, 'degraded');
  assert.equal(eventBus.published.length, 1);
  assert.equal(eventBus.published[0]?.topic, Topics.lifeos.homeNodeHealthChanged);
  assert.equal((eventBus.published[0]?.event.data as { reason?: string }).reason, 'runtime timeout');
});

test('runVoiceRuntimeHealthWatchdog skips publishing when runtime is not configured', async () => {
  const eventBus = new FakeEventBus();
  const runtimeClient = {
    isConfigured: () => false,
    checkHealth: async () => ({
      status: 'unavailable' as const,
      configured: false,
      checkedAt: '2026-03-31T10:00:00.000Z',
      reason: 'voice runtime is not configured',
    }),
  };

  const status = await runVoiceRuntimeHealthWatchdog(runtimeClient, eventBus, null);

  assert.equal(status, null);
  assert.equal(eventBus.published.length, 0);
});
