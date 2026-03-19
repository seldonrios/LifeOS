import { createServer as createNetServer } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SecretStore } from '@lifeos/secrets';

import { startService } from './index';

function makeNullSecretStore(): SecretStore {
  return {
    get: async () => null,
    set: async () => undefined,
  };
}

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

describe('startService', () => {
  let app: FastifyInstance | null = null;
  let previousPort: string | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }

    if (previousPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }

    vi.restoreAllMocks();
  });

  it('starts a server and responds to /health/live', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-health-live',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/live`);
    expect(response.status).toBe(200);
  });

  it('calls registerRoutes during boot', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    const registerRoutes = vi.fn(async (fastifyApp: FastifyInstance) => {
      app = fastifyApp;
    });

    await startService({
      serviceName: 'service-runtime-test-routes-called',
      allowObservabilityInitFallback: true,
      registerRoutes,
    });

    expect(registerRoutes).toHaveBeenCalledTimes(1);
  });

  it('fails and exits when route registration throws', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    await expect(
      startService({
        serviceName: 'service-runtime-test-route-registration-error',
        allowObservabilityInitFallback: true,
        registerRoutes: async () => {
          throw new Error('route registration failed');
        },
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('responds to /health/ready endpoint', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-health-ready',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(body.status).toBeDefined();
  });

  it('emits phases in the correct order during boot', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    const phases: string[] = [];

    await startService({
      serviceName: 'service-runtime-test-phase-order',
      allowObservabilityInitFallback: true,
      onPhase: (phase) => {
        phases.push(phase);
      },
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    expect(phases).toEqual([
      'config',
      'secrets',
      'observability',
      'auth/policy',
      'routes',
      'health/readiness',
      'listen',
    ]);
  });

  it('isCorService deprecated alias is accepted; fail-fast is driven by SecretRef policy: required', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    await expect(
      startService({
        serviceName: 'service-runtime-test-alias-fail-fast',
        allowObservabilityInitFallback: true,
        isCorService: true,
        secretStore: makeNullSecretStore(),
        secretRefs: [{ name: 'MY_SECRET', policy: 'required' }],
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('SecretRef policy: required causes fail-fast boot abort (isCoreService flag present)', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    await expect(
      startService({
        serviceName: 'service-runtime-test-core-fail-fast',
        allowObservabilityInitFallback: true,
        isCoreService: true,
        secretStore: makeNullSecretStore(),
        secretRefs: [{ name: 'MY_SECRET', policy: 'required' }],
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('optional missing secret marks service degraded, not fatal', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-optional-degraded',
      allowObservabilityInitFallback: true,
      secretStore: makeNullSecretStore(),
      secretRefs: [{ name: 'SOME_OPT', policy: 'optional' }],
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { status?: string; checks?: Record<string, unknown> };
    expect(body.status).toBe('degraded');
  });

  it('required_if_feature_enabled with feature disabled → degraded, not fail', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-gated-disabled',
      allowObservabilityInitFallback: true,
      isFeatureEnabled: () => false,
      secretStore: makeNullSecretStore(),
      secretRefs: [{ name: 'GATED_KEY', policy: 'required_if_feature_enabled', featureGate: 'myFeature' }],
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { status?: string };
    expect(body.status).toBe('degraded');
  });

  it('required_if_feature_enabled with feature enabled → fail-fast', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    await expect(
      startService({
        serviceName: 'service-runtime-test-gated-enabled-fail',
        allowObservabilityInitFallback: true,
        isFeatureEnabled: () => true,
        secretStore: makeNullSecretStore(),
        secretRefs: [{ name: 'GATED_KEY', policy: 'required_if_feature_enabled', featureGate: 'myFeature' }],
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
