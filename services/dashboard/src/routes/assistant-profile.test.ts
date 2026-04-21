import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import Fastify, { type FastifyInstance } from 'fastify';
import { HouseholdGraphClient } from '@lifeos/household-identity-module';
import { JwtService } from '@lifeos/security';

import { type AssistantProfileDatabase, registerAssistantProfileRoutes } from './assistant-profile';

before(() => {
  process.env.LIFEOS_JWT_SECRET = 'test-jwt-secret';
});

after(() => {
  delete process.env.LIFEOS_JWT_SECRET;
  jwtService = undefined;
});

let jwtService: JwtService | undefined;

function getJwtService(): JwtService {
  if (!jwtService) {
    jwtService = new JwtService();
  }
  return jwtService;
}

async function bearerFor(userId: string): Promise<string> {
  const token = await getJwtService().issue({
    sub: userId,
    service_id: 'dashboard-service',
    scopes: ['service.read'],
  });
  return `Bearer ${token.token}`;
}

function createHarness(): {
  app: FastifyInstance;
  db: AssistantProfileDatabase;
  householdClient: HouseholdGraphClient;
  cleanup: () => Promise<void>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-dashboard-assistant-profile-'));
  const dbPath = join(tempDir, 'assistant-profile.db');

  const householdClient = new HouseholdGraphClient(dbPath);
  householdClient.initializeSchema();

  const db = (householdClient as unknown as { db: AssistantProfileDatabase }).db;

  const app = Fastify();
  registerAssistantProfileRoutes(app, db);

  return {
    app,
    db,
    householdClient,
    cleanup: async () => {
      await app.close();
      householdClient.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

test('GET /api/assistant-profile without JWT returns 401', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/assistant-profile',
    });
    assert.equal(response.statusCode, 401, response.body);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile without JWT returns 401', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      payload: {
        assistantName: 'No Auth',
      },
    });
    assert.equal(response.statusCode, 401, response.body);
  } finally {
    await cleanup();
  }
});

test('GET /api/assistant-profile with valid JWT returns default profile when no row exists', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-defaults') },
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.userId, 'user-defaults');
    assert.equal(body.assistantName, 'LifeOS');
    assert.equal(body.wakePhrase, 'Hey LifeOS');
    assert.equal(body.assistantTone, 'concise');
    assert.deepEqual(body.useCases, []);
    assert.equal(body.avatarEmoji, '🤖');
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile with valid body returns saved profile', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-save') },
      payload: {
        assistantName: 'Aria',
        wakePhrase: 'Hey Aria',
        assistantTone: 'detailed',
        useCases: ['cooking', 'fitness'],
        avatarEmoji: '🌟',
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.userId, 'user-save');
    assert.equal(body.assistantName, 'Aria');
    assert.equal(body.wakePhrase, 'Hey Aria');
    assert.equal(body.assistantTone, 'detailed');
    assert.deepEqual(body.useCases, ['cooking', 'fitness']);
    assert.equal(body.avatarEmoji, '🌟');
    assert.ok(body.updatedAt);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile persists and GET returns saved profile', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const bearer = await bearerFor('user-roundtrip');
    await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: bearer },
      payload: {
        assistantName: 'Max',
        wakePhrase: 'Hello Max',
        assistantTone: 'conversational',
        useCases: ['planning'],
        avatarEmoji: '🚀',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/assistant-profile',
      headers: { authorization: bearer },
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.assistantName, 'Max');
    assert.equal(body.wakePhrase, 'Hello Max');
    assert.equal(body.assistantTone, 'conversational');
    assert.deepEqual(body.useCases, ['planning']);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile with empty assistantName returns 400', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-validation') },
      payload: {
        assistantName: '',
        wakePhrase: 'Hey LifeOS',
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile with whitespace-only assistantName returns 400', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-validation') },
      payload: {
        assistantName: '   ',
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile with whitespace-only wakePhrase returns 400', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-validation') },
      payload: {
        assistantName: 'Valid Name',
        wakePhrase: '   ',
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile with assistantName exceeding 32 chars returns 400', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-validation') },
      payload: {
        assistantName: 'A'.repeat(33),
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile ignores userId in body — uses JWT subject', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('jwt-subject') },
      payload: {
        userId: 'attacker-injected-id',
        assistantName: 'Legit',
        wakePhrase: 'Hey Legit',
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.userId, 'jwt-subject');
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile accepts empty avatarEmoji', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-avatar') },
      payload: {
        assistantName: 'Avatar User',
        wakePhrase: 'Hey Avatar',
        avatarEmoji: '',
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.avatarEmoji, '');
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile rejects multi-character avatarEmoji', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-avatar') },
      payload: {
        assistantName: 'Avatar User',
        wakePhrase: 'Hey Avatar',
        avatarEmoji: 'AB',
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});

test('PUT /api/assistant-profile rejects non-emoji single grapheme avatarEmoji', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/assistant-profile',
      headers: { authorization: await bearerFor('user-avatar') },
      payload: {
        assistantName: 'Avatar User',
        wakePhrase: 'Hey Avatar',
        avatarEmoji: 'a',
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  } finally {
    await cleanup();
  }
});

test('GET /api/assistant-profile?userId=... returns target profile for same-household active member', async () => {
  const { app, db, householdClient, cleanup } = createHarness();
  try {
    await app.ready();

    const { household } = householdClient.createHouseholdWithCreator('Family Home', 'caller-user', 'Admin');
    db.prepare(
      `INSERT INTO household_members
        (household_id, user_id, role, status, invited_by, joined_at, invite_token, invite_expires_at)
       VALUES (?, ?, 'Adult', 'active', ?, ?, NULL, NULL)`,
    ).run(household.id, 'target-user', 'caller-user', new Date().toISOString());

    db.prepare(
      `INSERT INTO assistant_profiles
        (user_id, assistant_name, wake_phrase, assistant_tone, use_cases_json, avatar_emoji, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'target-user',
      'Target Profile',
      'Hey Target',
      'detailed',
      JSON.stringify(['planning']),
      '🎯',
      new Date().toISOString(),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/assistant-profile?userId=target-user',
      headers: { authorization: await bearerFor('caller-user') },
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.userId, 'target-user');
    assert.equal(body.assistantName, 'Target Profile');
  } finally {
    await cleanup();
  }
});

test('GET /api/assistant-profile?userId=... rejects unauthorized cross-user access', async () => {
  const { app, cleanup } = createHarness();
  try {
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/assistant-profile?userId=some-other-user',
      headers: { authorization: await bearerFor('caller-user') },
    });

    assert.equal(response.statusCode, 403, response.body);
  } finally {
    await cleanup();
  }
});

test('GET /api/assistant-profile?userId=... rejects cross-household profile access', async () => {
  const { app, householdClient, cleanup } = createHarness();
  try {
    await app.ready();

    householdClient.createHouseholdWithCreator('Caller Household', 'caller-user', 'Admin');
    householdClient.createHouseholdWithCreator('Target Household', 'target-user', 'Admin');

    const response = await app.inject({
      method: 'GET',
      url: '/api/assistant-profile?userId=target-user',
      headers: { authorization: await bearerFor('caller-user') },
    });

    assert.equal(response.statusCode, 403, response.body);
  } finally {
    await cleanup();
  }
});
