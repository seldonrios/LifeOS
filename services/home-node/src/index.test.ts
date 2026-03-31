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

import { handleHomeStateChangedEvent, handleVoiceCaptureEvent } from './app';
import { registerHomeNodeRoutes } from './routes';

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
};

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
  let routeRegistered = false;
  let routeHandler: SnapshotRouteHandler = async () => ({
    statusCode: 500,
    payload: { error: 'route not registered' },
  });

  const app: RouteAppHarness = {
    get: (_path: string, handler: SnapshotRouteHandler) => {
      routeRegistered = true;
      routeHandler = handler;
    },
  };

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
    if (!routeRegistered) {
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
  let routeRegistered = false;
  let routeHandler: SnapshotRouteHandler = async () => ({
    statusCode: 500,
    payload: { error: 'route not registered' },
  });

  const app: RouteAppHarness = {
    get: (_path: string, handler: SnapshotRouteHandler) => {
      routeRegistered = true;
      routeHandler = handler;
    },
  };

  try {
    registerHomeNodeRoutes(app as unknown as Parameters<typeof registerHomeNodeRoutes>[0], client);
    if (!routeRegistered) {
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
