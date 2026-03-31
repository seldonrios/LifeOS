import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import Fastify, { type FastifyInstance } from 'fastify';

import { HouseholdVoiceCaptureCreatedSchema } from '@lifeos/contracts';
import { type BaseEvent, createEventBusClient, type ManagedEventBus, Topics } from '@lifeos/event-bus';
import { HouseholdGraphClient, generateInviteToken } from '@lifeos/household-identity-module';
import { JwtService } from '@lifeos/security';

import { registerCaptureRoutes } from './capture';

type TestCaptureEntry = {
  id: string;
  content: string;
  type: 'text' | 'voice';
  capturedAt: string;
  source: string;
  tags: string[];
  status: 'pending' | 'triaged';
  metadata?: {
    scope?: 'household';
    householdId?: string;
    source?: 'mobile' | 'ha_satellite' | 'ha_bridge';
    sourceDeviceId?: string;
    targetHint?: 'shopping' | 'chore' | 'reminder' | 'note' | 'unknown';
  };
};

function createInMemoryLifeGraphClient() {
  const captureEntries = new Map<string, TestCaptureEntry>();
  return {
    async appendCaptureEntry(entry: TestCaptureEntry): Promise<void> {
      captureEntries.set(entry.id, entry);
    },
    async getCaptureEntry(id: string): Promise<TestCaptureEntry | undefined> {
      return captureEntries.get(id);
    },
    async loadGraph(): Promise<{ captureEntries: TestCaptureEntry[] }> {
      return { captureEntries: [...captureEntries.values()] };
    },
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.ok(condition());
}

const jwtService = new JwtService();

async function bearerFor(userId: string): Promise<string> {
  const token = await jwtService.issue({
    sub: userId,
    service_id: 'dashboard-service',
    scopes: ['service.read'],
  });
  return `Bearer ${token.token}`;
}

function createHarness(): {
  db: HouseholdGraphClient;
  app: FastifyInstance;
  eventBus: ManagedEventBus;
  lifeGraph: ReturnType<typeof createInMemoryLifeGraphClient>;
  cleanup: () => Promise<void>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-dashboard-capture-'));
  const dbPath = join(tempDir, 'dashboard-household.db');

  const db = new HouseholdGraphClient(dbPath);
  db.initializeSchema();

  const eventBus = createEventBusClient({
    servers: 'nats://127.0.0.1:1',
    timeoutMs: 25,
    maxReconnectAttempts: 0,
  });

  const lifeGraph = createInMemoryLifeGraphClient();

  const app = Fastify();
  registerCaptureRoutes(app, db, eventBus, lifeGraph);

  return {
    db,
    app,
    eventBus,
    lifeGraph,
    cleanup: async () => {
      await app.close();
      await eventBus.close();
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function activateMember(
  db: HouseholdGraphClient,
  householdId: string,
  userId: string,
  role: 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest',
  invitedBy: string,
): void {
  db.addMember(householdId, userId, role, invitedBy);
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  db.storeInviteToken(householdId, userId, token, expiresAt);
  db.acceptInvite(token, householdId);
}

test('POST /api/capture personal capture returns 201 and publishes no household event', async () => {
  const { app, eventBus, lifeGraph, cleanup } = createHarness();
  const events: Array<BaseEvent<unknown>> = [];

  try {
    await eventBus.subscribe(Topics.lifeos.householdVoiceCaptureCreated, async (event) => {
      events.push(event);
    });

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      headers: { authorization: await bearerFor('user-1') },
      payload: {
        type: 'text',
        content: 'remember milk',
        tags: ['shopping'],
      },
    });

    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.type, 'text');
    assert.equal(body.content, 'remember milk');
    assert.equal(body.status, 'success');

    const persisted = await lifeGraph.getCaptureEntry(body.id as string);
    assert.ok(persisted);
    assert.equal(persisted.metadata, undefined);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(events.length, 0);
  } finally {
    await cleanup();
  }
});

test('POST /api/capture household capture returns 201 and publishes household event', async () => {
  const { db, app, eventBus, lifeGraph, cleanup } = createHarness();
  const events: Array<BaseEvent<unknown>> = [];

  try {
    const household = db.createHousehold('Household Capture Home');
    activateMember(db, household.id, 'user-2', 'Adult', 'admin-1');

    await eventBus.subscribe(Topics.lifeos.householdVoiceCaptureCreated, async (event) => {
      events.push(event);
    });

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      headers: { authorization: await bearerFor('user-2') },
      payload: {
        type: 'voice',
        content: 'buy apples and dish soap',
        metadata: {
          scope: 'household',
          householdId: household.id,
          source: 'ha_bridge',
          sourceDeviceId: 'kitchen-speaker',
          targetHint: 'shopping',
        },
      },
    });

    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();

    const persisted = await lifeGraph.getCaptureEntry(body.id as string);
    assert.ok(persisted);
    assert.equal(persisted.metadata?.scope, 'household');
    assert.equal(persisted.metadata?.householdId, household.id);
    assert.equal(persisted.metadata?.source, 'ha_bridge');
    assert.equal(persisted.metadata?.sourceDeviceId, 'kitchen-speaker');
    assert.equal(persisted.metadata?.targetHint, 'shopping');

    await waitFor(() => events.length === 1, 800);
    const event = events[0];
    assert.equal(event.type, Topics.lifeos.householdVoiceCaptureCreated);
    const payload = HouseholdVoiceCaptureCreatedSchema.parse(event.data);
    assert.equal(payload.captureId, body.id);
    assert.equal(payload.householdId, household.id);
    assert.equal(payload.actorUserId, 'user-2');
    assert.equal(payload.text, 'buy apples and dish soap');
    assert.equal(payload.audioRef, null);
    assert.equal(payload.source, 'ha_bridge');
    assert.equal(payload.sourceDeviceId, 'kitchen-speaker');
    assert.equal(payload.targetHint, 'shopping');
  } finally {
    await cleanup();
  }
});

test('POST /api/capture household capture for non-member returns 403 and does not persist or publish', async () => {
  const { db, app, eventBus, lifeGraph, cleanup } = createHarness();
  const events: Array<BaseEvent<unknown>> = [];

  try {
    const household = db.createHousehold('Forbidden Household');
    activateMember(db, household.id, 'member-1', 'Adult', 'admin-1');

    await eventBus.subscribe(Topics.lifeos.householdVoiceCaptureCreated, async (event) => {
      events.push(event);
    });

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      headers: { authorization: await bearerFor('outsider-1') },
      payload: {
        type: 'text',
        content: 'this should not be accepted',
        metadata: {
          scope: 'household',
          householdId: household.id,
          source: 'mobile',
        },
      },
    });

    assert.equal(response.statusCode, 403, response.body);

    const graph = await lifeGraph.loadGraph();
    assert.equal((graph.captureEntries ?? []).length, 0);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(events.length, 0);
  } finally {
    await cleanup();
  }
});

test('POST /api/capture household scope without householdId returns 400', async () => {
  const { app, cleanup } = createHarness();

  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      headers: { authorization: await bearerFor('user-3') },
      payload: {
        type: 'text',
        content: 'forgot household id',
        metadata: {
          scope: 'household',
          source: 'mobile',
        },
      },
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error, 'householdId is required for household scope');
  } finally {
    await cleanup();
  }
});

test('POST /api/capture household scope with invalid householdId returns 400', async () => {
  const { app, cleanup } = createHarness();

  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      headers: { authorization: await bearerFor('user-3b') },
      payload: {
        type: 'text',
        content: 'unknown household',
        metadata: {
          scope: 'household',
          householdId: 'household-does-not-exist',
          source: 'mobile',
        },
      },
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error, 'Invalid householdId');
  } finally {
    await cleanup();
  }
});

test('POST /api/capture without auth returns 401', async () => {
  const { app, cleanup } = createHarness();

  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      payload: {
        type: 'text',
        content: 'unauthorized',
      },
    });

    assert.equal(response.statusCode, 401, response.body);
  } finally {
    await cleanup();
  }
});

test('POST /api/capture malformed body returns 400', async () => {
  const { app, cleanup } = createHarness();

  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/capture',
      headers: { authorization: await bearerFor('user-4') },
      payload: {
        type: 'text',
        content: '',
      },
    });

    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});
