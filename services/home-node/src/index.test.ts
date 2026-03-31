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
  publishSurfaceDeregisteredEvent,
  publishSurfaceRegisteredEvent,
  runSurfaceHealthWatchdog,
} from './app';
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

  try {
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
      },
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
    cleanup();
  }
});

test('GET /api/home-node/snapshot/:householdId returns 404 when absent', async () => {
  const { client, cleanup } = createClientHarness();
  const { app, handlers } = createRouteHarness();

  try {
    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    const routeHandler = handlers.get('GET /api/home-node/snapshot/:householdId');
    if (!routeHandler) {
      throw new Error('snapshot route was not registered');
    }

    const response = await routeHandler(
      {
        params: { householdId: 'household-404' },
      },
      {
        code: (statusCode: number) => ({
          send: (payload: unknown) => ({ statusCode, payload }),
        }),
      },
    );

    assert.equal(response.statusCode, 404);
  } finally {
    cleanup();
  }
});

test('handleHomeStateChangedEvent upserts snapshot and publishes update event', async () => {
  const { client, cleanup } = createClientHarness();
  const eventBus = new FakeEventBus();

  try {
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
      { query: {} } as unknown as Parameters<SnapshotRouteHandler>[0],
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
