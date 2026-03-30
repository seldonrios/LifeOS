import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import Fastify, { type FastifyInstance } from 'fastify';

import { HouseholdGraphClient, generateInviteToken } from '@lifeos/household-identity-module';
import { JwtService } from '@lifeos/security';

import { registerHouseholdRoutes } from './household';

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
  cleanup: () => Promise<void>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-dashboard-household-'));
  const dbPath = join(tempDir, 'dashboard-household.db');
  const db = new HouseholdGraphClient(dbPath);
  db.initializeSchema();

  const app = Fastify();
  registerHouseholdRoutes(app, db);

  return {
    db,
    app,
    cleanup: async () => {
      await app.close();
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
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/shopping/items`,
      headers: { authorization: adminAuth },
      payload: { title: 'Milk', source: 'manual' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.title, 'Milk');
    assert.equal(body.status, 'added');
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
