import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import Fastify, { type FastifyInstance } from 'fastify';
import type { CreateEventBusClientOptions, ManagedEventBus } from '@lifeos/event-bus';

import { HealthCheckResultSchema, type HealthCheckResult } from '@lifeos/contracts';

import { probeAuth, probeEventBus, registerUxRoutes } from './ux';

const originalFetch = globalThis.fetch;
const originalEnv = {
  OLLAMA_HOST: process.env.OLLAMA_HOST,
  LIFEOS_JWT_SECRET: process.env.LIFEOS_JWT_SECRET,
  LIFEOS_MASTER_KEY: process.env.LIFEOS_MASTER_KEY,
  LIFEOS_NATS_URL: process.env.LIFEOS_NATS_URL,
  LIFEOS_NOTIFICATIONS_ENABLED: process.env.LIFEOS_NOTIFICATIONS_ENABLED,
};

before(() => {
  process.env.LIFEOS_JWT_SECRET = 'test-jwt-secret';
});

after(() => {
  globalThis.fetch = originalFetch;

  process.env.OLLAMA_HOST = originalEnv.OLLAMA_HOST;
  process.env.LIFEOS_JWT_SECRET = originalEnv.LIFEOS_JWT_SECRET;
  process.env.LIFEOS_MASTER_KEY = originalEnv.LIFEOS_MASTER_KEY;
  process.env.LIFEOS_NATS_URL = originalEnv.LIFEOS_NATS_URL;
  process.env.LIFEOS_NOTIFICATIONS_ENABLED = originalEnv.LIFEOS_NOTIFICATIONS_ENABLED;
});

function createResult(
  key: HealthCheckResult['key'],
  status: HealthCheckResult['status'],
): HealthCheckResult {
  return {
    key,
    status,
    title: `${key} ${status}`,
    detail: `${key} probe ${status}`,
    repairAction:
      status === 'pass'
        ? null
        : {
            label: `repair ${key}`,
            action: `repair-${key}`,
          },
  };
}

function createHarness(overrides: Partial<{
  storage: HealthCheckResult;
  model: HealthCheckResult;
  eventBus: HealthCheckResult;
  notifications: HealthCheckResult;
  sync: HealthCheckResult;
  auth: HealthCheckResult;
}> = {}): FastifyInstance {
  const app = Fastify();
  registerUxRoutes(app, {
    probeStorage: async () => overrides.storage ?? createResult('storage', 'pass'),
    probeModel: async () => overrides.model ?? createResult('model', 'pass'),
    probeEventBus: async () => overrides.eventBus ?? createResult('eventBus', 'pass'),
    probeNotifications: async () =>
      overrides.notifications ?? createResult('notifications', 'pass'),
    probeSync: async () => overrides.sync ?? createResult('sync', 'warn'),
    probeAuth: async () => overrides.auth ?? createResult('auth', 'pass'),
  });
  return app;
}

function createEventBusFactory(transport: ManagedEventBus['getTransport']): (
  options?: CreateEventBusClientOptions,
) => ManagedEventBus {
  return (options?: CreateEventBusClientOptions) => {
    void options;
    return {
      publish: async () => undefined,
      subscribe: async () => undefined,
      close: async () => undefined,
      getTransport: transport,
    };
  };
}

test('GET /api/ux/health all probes pass', async () => {
  process.env.OLLAMA_HOST = 'http://127.0.0.1:11434';
  process.env.LIFEOS_JWT_SECRET = 'test-jwt-secret';
  process.env.LIFEOS_NATS_URL = 'nats://127.0.0.1:4222';
  process.env.LIFEOS_NOTIFICATIONS_ENABLED = 'true';
  globalThis.fetch = async (input) => {
    const href = typeof input === 'string' ? input : input.toString();
    if (href.endsWith('/api/tags')) {
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const app = createHarness();
  try {
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/ux/health',
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 6);

    for (const item of body) {
      if (item.key === 'sync') {
        assert.equal(item.status, 'warn');
      } else {
        assert.equal(item.status, 'pass');
      }
    }
  } finally {
    await app.close();
  }
});

test('GET /api/ux/health model probe fails gracefully', async () => {
  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  const app = createHarness({
    model: createResult('model', 'fail'),
  });

  try {
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/ux/health',
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as HealthCheckResult[];
    assert.equal(body.length, 6);

    const model = body.find((result) => result.key === 'model');
    assert.ok(model);
    assert.equal(model.status, 'fail');
  } finally {
    await app.close();
  }
});

test('GET /api/ux/health auth probe fails when secret absent', async () => {
  delete process.env.LIFEOS_JWT_SECRET;
  delete process.env.LIFEOS_MASTER_KEY;

  const app = createHarness({
    auth: createResult('auth', 'fail'),
  });

  try {
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/ux/health',
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as HealthCheckResult[];

    const auth = body.find((result) => result.key === 'auth');
    assert.ok(auth);
    assert.equal(auth.status, 'fail');
  } finally {
    await app.close();
  }
});

test('GET /api/ux/health response matches HealthCheckResultSchema', async () => {
  const app = createHarness();

  try {
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/ux/health',
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as unknown[];

    for (const item of body) {
      const parsed = HealthCheckResultSchema.parse(item);
      assert.ok(parsed.key);
    }
  } finally {
    await app.close();
  }
});

test('probeEventBus passes when transport is connected', async () => {
  delete process.env.LIFEOS_NATS_URL;

  const result = await probeEventBus(createEventBusFactory(() => 'nats'));

  assert.equal(result.key, 'eventBus');
  assert.equal(result.status, 'pass');
});

test('probeEventBus passes when nats env is configured', async () => {
  process.env.LIFEOS_NATS_URL = 'nats://127.0.0.1:4222';

  const result = await probeEventBus(createEventBusFactory(() => 'unknown'));

  assert.equal(result.key, 'eventBus');
  assert.equal(result.status, 'pass');
});

test('probeEventBus fails when unavailable and env missing', async () => {
  delete process.env.LIFEOS_NATS_URL;

  const result = await probeEventBus(createEventBusFactory(() => 'unknown'));

  assert.equal(result.key, 'eventBus');
  assert.equal(result.status, 'fail');
});

test('probeAuth fails for default placeholder secret', async () => {
  process.env.LIFEOS_JWT_SECRET = 'lifeos-dev-secret-change-me';
  delete process.env.LIFEOS_MASTER_KEY;

  const result = await probeAuth();
  assert.equal(result.key, 'auth');
  assert.equal(result.status, 'fail');
});
