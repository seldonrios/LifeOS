import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import test from 'node:test';

import { SecretsError } from '@lifeos/secrets';

import { startService } from './index';

const testObservabilityFactory = () => ({
  startSpan() {
    return {
      traceId: 'test-trace',
      spanId: 'test-span',
    };
  },
  endSpan() {
    return;
  },
  recordMetric() {
    return;
  },
  log() {
    return;
  },
});

async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve ephemeral port.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function httpGet(port: number, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('startService boots successfully with no hooks', async () => {
  const port = await getFreePort();
  const runtime = await startService({
    serviceName: 'service-runtime-test',
    port,
    observabilityFactory: testObservabilityFactory,
  });

  assert.equal(typeof runtime.stop, 'function');
  assert.equal(typeof runtime.getHealth, 'function');

  await runtime.stop();
});

test('startService invokes onRegisterRoutes hook', async () => {
  const port = await getFreePort();
  let called = false;

  const runtime = await startService({
    serviceName: 'service-runtime-test-routes',
    port,
    observabilityFactory: testObservabilityFactory,
    onRegisterRoutes: async () => {
      called = true;
    },
  });

  assert.equal(called, true);
  await runtime.stop();
});

test('startService invokes onAuthPolicy after config', async () => {
  const port = await getFreePort();
  let captured: unknown;

  const runtime = await startService({
    serviceName: 'service-runtime-test-auth-policy',
    port,
    observabilityFactory: testObservabilityFactory,
    onAuthPolicy: async (config) => {
      captured = config;
    },
  });

  assert.equal(!!captured, true);
  assert.equal(typeof (captured as { profile?: unknown }).profile, 'string');

  await runtime.stop();
});

test('required secret miss aborts boot', async () => {
  const port = await getFreePort();

  await assert.rejects(
    async () =>
      startService({
        serviceName: 'service-runtime-test-required-secret',
        port,
        secretRefs: [
          {
            name: 'db_password',
            policy: 'required',
          },
        ],
      }),
    (error: unknown) => error instanceof SecretsError,
  );
});

test('required_if_feature_enabled secret miss aborts boot when feature is enabled', async () => {
  const port = await getFreePort();

  await assert.rejects(
    async () =>
      startService({
        serviceName: 'service-runtime-feature-secret-enabled',
        port,
        secretStore: {
          async get() {
            return null;
          },
          async set() {
            return;
          },
        },
        secretRefs: [
          {
            name: 'vision_api_key',
            policy: 'required_if_feature_enabled',
            featureGate: 'vision',
          },
        ],
        isFeatureEnabled: async () => true,
      }),
    (error: unknown) => error instanceof SecretsError,
  );
});

test('required_if_feature_enabled secret miss degrades when feature is disabled', async () => {
  const port = await getFreePort();

  const runtime = await startService({
    serviceName: 'service-runtime-feature-secret-disabled',
    port,
    observabilityFactory: testObservabilityFactory,
    secretStore: {
      async get() {
        return null;
      },
      async set() {
        return;
      },
    },
    secretRefs: [
      {
        name: 'vision_api_key',
        policy: 'required_if_feature_enabled',
        featureGate: 'vision',
      },
    ],
    isFeatureEnabled: async () => false,
  });

  await runtime.stop();
});

test('observability initialization failure fails startup by default', async () => {
  const port = await getFreePort();

  await assert.rejects(
    async () =>
      startService({
        serviceName: 'service-runtime-observability-strict',
        port,
        observabilityFactory: () => {
          throw new Error('observability failed');
        },
      }),
    /observability failed/,
  );
});

test('observability initialization fallback is opt-in', async () => {
  const port = await getFreePort();

  const runtime = await startService({
    serviceName: 'service-runtime-observability-fallback',
    port,
    allowObservabilityInitFallback: true,
    observabilityFactory: () => {
      throw new Error('observability failed');
    },
  });

  await runtime.stop();
});

test('stop closes server and no longer accepts connections', async () => {
  const port = await getFreePort();

  const runtime = await startService({
    serviceName: 'service-runtime-test-stop',
    port,
    observabilityFactory: testObservabilityFactory,
  });

  const beforeStop = await httpGet(port, '/health/live');
  assert.equal(beforeStop.status, 200);

  await runtime.stop();

  await assert.rejects(async () => {
    await fetch(`http://127.0.0.1:${port}/health/live`);
  });
});

test('getHealth reflects registered checks including failures', async () => {
  const port = await getFreePort();

  const runtime = await startService({
    serviceName: 'service-runtime-test-health',
    port,
    observabilityFactory: testObservabilityFactory,
    healthChecks: [
      {
        name: 'failing-check',
        check: async () => ({
          status: 'unhealthy',
          reason: 'simulated failure',
        }),
      },
    ],
  });

  const health = await runtime.getHealth();
  assert.equal(health.status, 'unhealthy');
  assert.equal(health.checks['failing-check']?.status, 'unhealthy');

  await runtime.stop();
});

test('onRegisterRoutes can register non-GET routes', async () => {
  const port = await getFreePort();

  const runtime = await startService({
    serviceName: 'service-runtime-test-post-route',
    port,
    observabilityFactory: testObservabilityFactory,
    onRegisterRoutes: async (server) => {
      server.post('/jobs', async () => ({
        status: 201,
        body: {
          accepted: true,
        },
      }));
    },
  });

  const response = await fetch(`http://127.0.0.1:${port}/jobs`, {
    method: 'POST',
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { accepted: true });

  await runtime.stop();
});

test('startService runs deterministic boot phase order', async () => {
  const port = await getFreePort();
  const phases: string[] = [];

  const runtime = await startService({
    serviceName: 'service-runtime-test-phase-order',
    port,
    observabilityFactory: testObservabilityFactory,
    onPhase: async (phase) => {
      phases.push(phase);
    },
    onAuthPolicy: async () => {
      phases.push('auth-hook');
    },
    onRegisterRoutes: async () => {
      phases.push('routes-hook');
    },
  });

  assert.deepEqual(phases, [
    'config',
    'secrets',
    'observability',
    'auth/policy',
    'auth-hook',
    'routes',
    'routes-hook',
    'health/readiness',
    'listen',
  ]);

  await runtime.stop();
});

test('startService does not enter later phases after earlier phase failure', async () => {
  const port = await getFreePort();
  const phases: string[] = [];

  await assert.rejects(
    async () =>
      startService({
        serviceName: 'service-runtime-test-phase-failure-short-circuit',
        port,
        secretRefs: [
          {
            name: 'missing_required_secret',
            policy: 'required',
          },
        ],
        onPhase: async (phase) => {
          phases.push(phase);
        },
      }),
    (error: unknown) => error instanceof SecretsError,
  );

  assert.deepEqual(phases, ['config', 'secrets']);
});
