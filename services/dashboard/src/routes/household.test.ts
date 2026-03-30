import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import Fastify, { type FastifyInstance } from 'fastify';

import { createEventBusClient, type ManagedEventBus } from '@lifeos/event-bus';
import {
  HouseholdGraphClient,
  generateInviteToken,
  registerAuditInterceptor,
} from '@lifeos/household-identity-module';
import { JwtService } from '@lifeos/security';

import { registerHouseholdRoutes } from './household';

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
  cleanup: () => Promise<void>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-dashboard-household-'));
  const dbPath = join(tempDir, 'dashboard-household.db');
  const db = new HouseholdGraphClient(dbPath);
  db.initializeSchema();

  const eventBus = createEventBusClient({
    servers: 'nats://127.0.0.1:1',
    timeoutMs: 25,
    maxReconnectAttempts: 0,
  });

  const app = Fastify();
  registerHouseholdRoutes(app, db, eventBus);

  return {
    db,
    app,
    eventBus,
    cleanup: async () => {
      await app.close();
      await eventBus.close();
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function createStrictOutageHarness(): {
  db: HouseholdGraphClient;
  app: FastifyInstance;
  eventBus: ManagedEventBus;
  cleanup: () => Promise<void>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-dashboard-household-strict-'));
  const dbPath = join(tempDir, 'dashboard-household.db');
  const db = new HouseholdGraphClient(dbPath);
  db.initializeSchema();

  const eventBus = createEventBusClient({
    servers: 'nats://127.0.0.1:1',
    timeoutMs: 25,
    maxReconnectAttempts: 0,
    allowInMemoryFallback: false,
  });

  const app = Fastify();
  registerHouseholdRoutes(app, db, eventBus);

  return {
    db,
    app,
    eventBus,
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

async function seedHouseholdWithAdmin(db: HouseholdGraphClient): Promise<{
  householdId: string;
  adminAuth: string;
}> {
  const household = db.createHousehold('Seed Home');
  activateMember(db, household.id, 'admin-1', 'Admin', 'admin-1');
  return {
    householdId: household.id,
    adminAuth: await bearerFor('admin-1'),
  };
}

async function seedHouseholdWithRole(
  db: HouseholdGraphClient,
  userId: string,
  role: 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest',
): Promise<{ householdId: string; auth: string }> {
  const household = db.createHousehold('Role Seed');
  activateMember(db, household.id, userId, role, 'admin-1');
  return {
    householdId: household.id,
    auth: await bearerFor(userId),
  };
}

test('POST /api/households happy path returns 201', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: await bearerFor('creator-1') },
      payload: { name: 'Home Base' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.name, 'Home Base');
    assert.ok(body.id);
  } finally {
    await cleanup();
  }
});

test('POST /api/households auth failure returns 401', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/households',
      payload: { name: 'Home Base' },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households role-failure equivalent remains allowed for any authenticated caller', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: await bearerFor('guest-like-user') },
      payload: { name: 'Another Home' },
    });

    assert.equal(response.statusCode, 201);
  } finally {
    await cleanup();
  }
});

test('POST /api/households creator can immediately call protected invite endpoint', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const creatorAuth = await bearerFor('creator-2');
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: creatorAuth },
      payload: { name: 'Creator Home' },
    });

    assert.equal(createResponse.statusCode, 201);
    const householdId = createResponse.json().id as string;

    const inviteResponse = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/members/invite`,
      headers: { authorization: creatorAuth },
      payload: { invitedUserId: 'adult-9', role: 'Adult' },
    });

    assert.equal(inviteResponse.statusCode, 201);
  } finally {
    await cleanup();
  }
});

test('POST /api/households malformed payload returns 400', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: await bearerFor('creator-3') },
      payload: { name: '' },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/members/invite happy path returns 201', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/members/invite`,
      headers: { authorization: adminAuth },
      payload: { invitedUserId: 'adult-2', role: 'Adult' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.user_id, 'adult-2');
    assert.ok(body.invite_token);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/members/invite auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/members/invite`,
      headers: { authorization: 'Bearer invalid-token' },
      payload: { invitedUserId: 'adult-2', role: 'Adult' },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/members/invite role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/members/invite`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: { invitedUserId: 'adult-2', role: 'Adult' },
    });

    assert.equal(response.statusCode, 403, response.body);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/members/join happy path returns 200', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Join Home');
    db.addMember(household.id, 'joiner-1', 'Adult', 'admin-1');
    const inviteToken = generateInviteToken();
    db.storeInviteToken(
      household.id,
      'joiner-1',
      inviteToken,
      new Date(Date.now() + 60_000).toISOString(),
    );

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/members/join`,
      headers: { authorization: await bearerFor('joiner-1') },
      payload: { inviteToken },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.user_id, 'joiner-1');
    assert.equal(body.status, 'active');
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/members/join auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Join Home');
    db.addMember(household.id, 'joiner-1', 'Adult', 'admin-1');
    const inviteToken = generateInviteToken();
    db.storeInviteToken(
      household.id,
      'joiner-1',
      inviteToken,
      new Date(Date.now() + 60_000).toISOString(),
    );

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/members/join`,
      payload: { inviteToken },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/members/join role failure returns 403 for token owned by another user', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Join Home');
    db.addMember(household.id, 'joiner-1', 'Adult', 'admin-1');
    const inviteToken = generateInviteToken();
    const invitedMember = db.storeInviteToken(
      household.id,
      'joiner-1',
      inviteToken,
      new Date(Date.now() + 60_000).toISOString(),
    );

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/members/join`,
      headers: { authorization: await bearerFor('other-user') },
      payload: { inviteToken },
    });

    assert.equal(response.statusCode, 403);
    const memberAfter = db.getMember(household.id, 'joiner-1');
    assert.ok(memberAfter);
    assert.equal(memberAfter?.status, 'invited');
    assert.equal(memberAfter?.invite_token, invitedMember.invite_token);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/members/:userId/role happy path returns 200', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    activateMember(db, householdId, 'teen-1', 'Teen', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/members/teen-1/role`,
      headers: { authorization: adminAuth },
      payload: { role: 'Adult' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().role, 'Adult');
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/members/:userId/role auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/members/teen-1/role`,
      payload: { role: 'Adult' },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/members/:userId/role role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    activateMember(db, household.id, 'teen-1', 'Teen', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${household.id}/members/teen-1/role`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: { role: 'Adult' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/shopping/items happy path returns 201', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const rawDb = (db as unknown as {
      db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } };
    }).db;
    const listId = 'shopping-list-explicit';
    rawDb
      .prepare('INSERT INTO shopping_lists (id, household_id, name) VALUES (?, ?, ?)')
      .run(listId, householdId, 'Weekly');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      headers: { authorization: adminAuth },
      payload: { listId, title: 'Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.title, 'Milk');
    assert.equal(body.status, 'added');
    assert.equal(body.list_id, listId);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/shopping/items responds within the fast-add budget', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const startedAt = performance.now();
    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      headers: { authorization: adminAuth },
      payload: { title: 'Fast Milk', source: 'manual' },
    });
    const durationMs = performance.now() - startedAt;

    assert.equal(response.statusCode, 201);
    assert.ok(durationMs < 200, `Expected shopping add to complete in under 200ms, received ${durationMs.toFixed(2)}ms`);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/shopping/items auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      payload: { title: 'Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/shopping/items role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/shopping/items`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: { title: 'Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/shopping/items child role returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, auth } = await seedHouseholdWithRole(db, 'child-1', 'Child');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      headers: { authorization: auth },
      payload: { title: 'Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/shopping/items/:itemId/status happy path returns 200', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const item = db.addShoppingItem(householdId, 'Eggs', 'admin-1', 'manual');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/shopping/items/${item.id}/status`,
      headers: { authorization: adminAuth },
      payload: { status: 'in_cart' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'in_cart');
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/shopping/items/:itemId/status auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    const item = db.addShoppingItem(householdId, 'Eggs', 'admin-1', 'manual');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/shopping/items/${item.id}/status`,
      payload: { status: 'in_cart' },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/shopping/items/:itemId/status role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    const item = db.addShoppingItem(household.id, 'Eggs', 'guest-1', 'manual');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${household.id}/shopping/items/${item.id}/status`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: { status: 'in_cart' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/shopping/items/:itemId/status rejects invalid transitions with 400', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const item = db.addShoppingItem(householdId, 'Eggs', 'admin-1', 'manual');
    db.updateShoppingItemStatus(householdId, item.id, 'purchased');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/shopping/items/${item.id}/status`,
      headers: { authorization: adminAuth },
      payload: { status: 'added' },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().error as string, /Cannot transition shopping item from purchased to added/i);
  } finally {
    await cleanup();
  }
});

test('GET /api/households/:id/shopping/lists returns household lists', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    db.addShoppingItem(householdId, 'Milk', 'admin-1', 'manual');
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/shopping/lists`,
      headers: { authorization: adminAuth },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0]?.household_id, householdId);
  } finally {
    await cleanup();
  }
});

test('GET /api/households/:id/shopping/lists/:listId/items returns active items before purchased items', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const addedItem = db.addShoppingItem(householdId, 'Bread', 'admin-1', 'manual');
    const purchasedItem = db.addShoppingItem(householdId, 'Milk', 'admin-1', 'manual');
    db.updateShoppingItemStatus(householdId, purchasedItem.id, 'purchased');
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/shopping/lists/${addedItem.list_id}/items`,
      headers: { authorization: adminAuth },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(Array.isArray(body));
    assert.equal(body[0]?.id, addedItem.id);
    assert.equal(body[0]?.addedBy, 'admin-1');
    assert.equal(body[0]?.addedAt, addedItem.created_at);
    assert.equal(body[1]?.id, purchasedItem.id);
    assert.ok(body[1]?.purchasedAt);
  } finally {
    await cleanup();
  }
});

test('DELETE /api/households/:id/shopping/lists/:listId/items/purchased archives purchased rows', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const purchasedItem = db.addShoppingItem(householdId, 'Milk', 'admin-1', 'manual');
    const activeItem = db.addShoppingItem(householdId, 'Bread', 'admin-1', 'manual');
    db.updateShoppingItemStatus(householdId, purchasedItem.id, 'purchased');
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/households/${householdId}/shopping/lists/${purchasedItem.list_id}/items/purchased`,
      headers: { authorization: adminAuth },
    });

    assert.equal(response.statusCode, 204);
    const rows = db.listShoppingItems(householdId, purchasedItem.list_id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, activeItem.id);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores happy path returns 201', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores`,
      headers: { authorization: adminAuth },
      payload: {
        title: 'Take out trash',
        assignedToUserId: 'admin-1',
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().status, 'pending');
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores`,
      payload: {
        title: 'Take out trash',
        assignedToUserId: 'admin-1',
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/chores`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: {
        title: 'Take out trash',
        assignedToUserId: 'guest-1',
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores child role returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, auth } = await seedHouseholdWithRole(db, 'child-2', 'Child');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores`,
      headers: { authorization: auth },
      payload: {
        title: 'Take out trash',
        assignedToUserId: 'child-2',
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores invalid datetime payload returns 400', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores`,
      headers: { authorization: adminAuth },
      payload: {
        title: 'Take out trash',
        assignedToUserId: 'admin-1',
        dueAt: 'not-an-iso-date',
      },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/chores/:choreId/complete happy path returns 200', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const chore = db.createChore(
      householdId,
      'Take out trash',
      'admin-1',
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/chores/${chore.id}/complete`,
      headers: { authorization: adminAuth },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'completed');
    assert.equal(response.json().streakCount, 1);

    const runs = db.getChoreHistory(householdId, chore.id);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.completed_by, 'admin-1');
  } finally {
    await cleanup();
  }
});

test('GET /api/households/:id/chores returns list with expected detail shape', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    db.createChore(
      householdId,
      'Wipe counters',
      'admin-1',
      new Date(Date.now() + 3_600_000).toISOString(),
      'FREQ=DAILY',
    );
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/chores`,
      headers: { authorization: adminAuth },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
    assert.equal(typeof body[0]?.title, 'string');
    assert.equal(typeof body[0]?.dueAt, 'string');
    assert.equal(typeof body[0]?.streakCount, 'number');
    assert.equal(typeof body[0]?.isOverdue, 'boolean');
    assert.equal(typeof body[0]?.assignedTo?.userId, 'string');
    assert.equal(typeof body[0]?.assignedTo?.displayName, 'string');
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores/:choreId/assign creates assignment row', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    activateMember(db, householdId, 'adult-2', 'Adult', 'admin-1');
    const chore = db.createChore(
      householdId,
      'Take out trash',
      'admin-1',
      new Date(Date.now() + 3_600_000).toISOString(),
      'FREQ=DAILY',
    );
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores/${chore.id}/assign`,
      headers: { authorization: adminAuth },
      payload: { userId: 'adult-2' },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.chore_id, chore.id);
    assert.equal(body.assigned_to, 'adult-2');
    assert.equal(body.status, 'pending');
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores/:choreId/assign child role returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    activateMember(db, householdId, 'child-chores', 'Child', 'admin-1');
    const chore = db.createChore(
      householdId,
      'Clean table',
      'admin-1',
      new Date(Date.now() + 3_600_000).toISOString(),
      'FREQ=DAILY',
    );
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores/${chore.id}/assign`,
      headers: { authorization: await bearerFor('child-chores') },
      payload: { userId: 'admin-1' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/chores/:choreId/assign rejects non-member assignee', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    const chore = db.createChore(
      householdId,
      'Laundry',
      'admin-1',
      new Date(Date.now() + 3_600_000).toISOString(),
      'FREQ=DAILY',
    );
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/chores/${chore.id}/assign`,
      headers: { authorization: adminAuth },
      payload: { userId: 'missing-member' },
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/chores/:choreId/complete rejects non-assigned non-admin member', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Complete Ownership Home');
    activateMember(db, household.id, 'adult-owner', 'Adult', 'admin-1');
    activateMember(db, household.id, 'adult-other', 'Adult', 'admin-1');
    const chore = db.createChore(
      household.id,
      'Take out trash',
      'adult-owner',
      new Date(Date.now() + 3_600_000).toISOString(),
      'FREQ=DAILY',
    );
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${household.id}/chores/${chore.id}/complete`,
      headers: { authorization: await bearerFor('adult-other') },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/chores/:choreId/complete succeeds for assigned Teen with round-robin', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Teen Rotation Home');
    activateMember(db, household.id, 'teen-rotate', 'Teen', 'admin-1');
    activateMember(db, household.id, 'adult-rotate', 'Adult', 'admin-1');

    const chore = db.createChore(
      household.id,
      'Wash dishes',
      'teen-rotate',
      new Date(Date.now() + 3_600_000).toISOString(),
      'FREQ=DAILY',
    );

    const rawDb = (db as unknown as {
      db: {
        prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
      };
    }).db;
    rawDb
      .prepare('UPDATE chores SET rotation_policy = ?, assigned_to_json = ? WHERE household_id = ? AND id = ?')
      .run('round-robin', JSON.stringify(['teen-rotate', 'adult-rotate']), household.id, chore.id);

    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${household.id}/chores/${chore.id}/complete`,
      headers: { authorization: await bearerFor('teen-rotate') },
    });

    assert.equal(response.statusCode, 200, response.body);
    const updated = db.getChore(household.id, chore.id);
    assert.ok(updated);
    assert.equal(updated?.assigned_to_user_id, 'adult-rotate');

    const runs = db.getChoreHistory(household.id, chore.id);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.completed_by, 'teen-rotate');
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/chores/:choreId/complete auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    const chore = db.createChore(
      householdId,
      'Take out trash',
      'admin-1',
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/chores/${chore.id}/complete`,
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('PATCH /api/households/:id/chores/:choreId/complete role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    const chore = db.createChore(
      household.id,
      'Take out trash',
      'guest-1',
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${household.id}/chores/${chore.id}/complete`,
      headers: { authorization: await bearerFor('guest-1') },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/reminders happy path returns 201', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/reminders`,
      headers: { authorization: adminAuth },
      payload: {
        objectType: 'chore',
        objectId: 'chore-1',
        targetUserIds: ['admin-1'],
        remindAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().object_type, 'chore');
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/reminders auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/reminders`,
      payload: {
        objectType: 'chore',
        objectId: 'chore-1',
        targetUserIds: ['admin-1'],
        remindAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/reminders role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/reminders`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: {
        objectType: 'chore',
        objectId: 'chore-1',
        targetUserIds: ['guest-1'],
        remindAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/reminders child role returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, auth } = await seedHouseholdWithRole(db, 'child-3', 'Child');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/reminders`,
      headers: { authorization: auth },
      payload: {
        objectType: 'chore',
        objectId: 'chore-1',
        targetUserIds: ['child-3'],
        remindAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/reminders invalid datetime payload returns 400', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/reminders`,
      headers: { authorization: adminAuth },
      payload: {
        objectType: 'chore',
        objectId: 'chore-1',
        targetUserIds: ['admin-1'],
        remindAt: 'not-an-iso-date',
      },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/notes happy path returns 201', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/notes`,
      headers: { authorization: adminAuth },
      payload: { body: 'Buy milk and eggs.' },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().body, 'Buy milk and eggs.');
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/notes auth failure returns 401', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/notes`,
      payload: { body: 'Buy milk and eggs.' },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/notes role failure returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const household = db.createHousehold('Role Home');
    activateMember(db, household.id, 'guest-1', 'Guest', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${household.id}/notes`,
      headers: { authorization: await bearerFor('guest-1') },
      payload: { body: 'Buy milk and eggs.' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('POST /api/households/:id/notes child role returns 403', async () => {
  const { db, app, cleanup } = createHarness();
  try {
    const { householdId, auth } = await seedHouseholdWithRole(db, 'child-4', 'Child');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/notes`,
      headers: { authorization: auth },
      payload: { body: 'Buy milk and eggs.' },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('household mutation writes both domain row and audit_log row when interceptor is registered', async () => {
  const { db, app, eventBus, cleanup } = createHarness();
  try {
    await registerAuditInterceptor(eventBus, db);

    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      headers: { authorization: adminAuth },
      payload: { title: 'Audit Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 201);
    const item = response.json();
    assert.equal(item.title, 'Audit Milk');

    const savedItem = db.getShoppingItem(householdId, item.id as string);
    assert.ok(savedItem);

    const rows = (db as unknown as { db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } } }).db
      .prepare('SELECT * FROM audit_log WHERE household_id = ?')
      .all(householdId);
    await waitFor(() => {
      const pendingRows = (db as unknown as {
        db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } };
      }).db
        .prepare('SELECT * FROM audit_log WHERE household_id = ?')
        .all(householdId);
      return pendingRows.length === 1;
    });

    const settledRows = (db as unknown as {
      db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } };
    }).db
      .prepare('SELECT * FROM audit_log WHERE household_id = ?')
      .all(householdId);
    assert.equal(settledRows.length, 1);
    assert.equal(settledRows[0]?.action_type, 'lifeos.household.shopping.item.added');
  } finally {
    await cleanup();
  }
});

test('strict event bus outage still returns 201 for shopping POST after async publish handoff', async () => {
  const { db, app, cleanup } = createStrictOutageHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      headers: { authorization: adminAuth },
      payload: { title: 'Outage Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 201);
  } finally {
    await cleanup();
  }
});

test('strict event bus outage returns 500 for PATCH household mutation endpoint', async () => {
  const { db, app, cleanup } = createStrictOutageHarness();
  try {
    const { householdId, adminAuth } = await seedHouseholdWithAdmin(db);
    activateMember(db, householdId, 'teen-strict', 'Teen', 'admin-1');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/households/${householdId}/members/teen-strict/role`,
      headers: { authorization: adminAuth },
      payload: { role: 'Adult' },
    });

    assert.equal(response.statusCode, 500);
  } finally {
    await cleanup();
  }
});
