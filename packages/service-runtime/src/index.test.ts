import { createServer as createNetServer } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSecurityClient } from '@lifeos/security';
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
  let previousJwtSecret: string | undefined;
  let previousPolicyStrict: string | undefined;

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

    if (previousJwtSecret === undefined) {
      delete process.env.LIFEOS_JWT_SECRET;
    } else {
      process.env.LIFEOS_JWT_SECRET = previousJwtSecret;
    }

    if (previousPolicyStrict === undefined) {
      delete process.env.LIFEOS_POLICY_STRICT;
    } else {
      process.env.LIFEOS_POLICY_STRICT = previousPolicyStrict;
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
      secretRefs: [
        { name: 'GATED_KEY', policy: 'required_if_feature_enabled', featureGate: 'myFeature' },
      ],
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
        secretRefs: [
          { name: 'GATED_KEY', policy: 'required_if_feature_enabled', featureGate: 'myFeature' },
        ],
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  it('rejects mutating routes without bearer token', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-auth-required',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.post('/mutate', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/mutate`, {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });

  it('allows mutating routes with valid bearer token when policy strict mode is disabled', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    previousPolicyStrict = process.env.LIFEOS_POLICY_STRICT;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';
    process.env.LIFEOS_POLICY_STRICT = 'false';

    const securityClient = createSecurityClient();
    const issued = await securityClient.issueServiceToken('dashboard');

    await startService({
      serviceName: 'service-runtime-test-auth-allowed',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.post('/mutate', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/mutate`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${issued.token}`,
      },
    });

    expect(response.status).toBe(200);
  });

  it("enforceRouteAuthMode: 'api-prefix' enforces auth for GET /api/anything", async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';

    await startService({
      serviceName: 'service-runtime-test-api-prefix-mode',
      allowObservabilityInitFallback: true,
      enforceRouteAuthMode: 'api-prefix',
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.get('/api/anything', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/anything`);
    expect(response.status).toBe(401);
  });

  it("enforceRouteAuthMode: 'mutating' allows GET /api/anything", async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';

    await startService({
      serviceName: 'service-runtime-test-mutating-mode',
      allowObservabilityInitFallback: true,
      enforceRouteAuthMode: 'mutating',
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.get('/api/anything', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/anything`);
    expect(response.status).toBe(200);
  });

  it("enforceRouteAuthMode: 'all' enforces auth for GET /non-api", async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';

    await startService({
      serviceName: 'service-runtime-test-all-mode',
      allowObservabilityInitFallback: true,
      enforceRouteAuthMode: 'all',
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.get('/non-api', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/non-api`);
    expect(response.status).toBe(401);
  });

  it('logs deprecation warning when enforceRouteAuthMode and legacy auth option are both set', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await startService({
      serviceName: 'service-runtime-test-auth-deprecation-warning',
      allowObservabilityInitFallback: true,
      enforceRouteAuthMode: 'all',
      enableAuth: false,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('service-runtime-test-auth-deprecation-warning'),
    );
  });

  it('enableAuth: false disables auth when enforceRouteAuthMode is not set', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';

    await startService({
      serviceName: 'service-runtime-test-enable-auth-false',
      allowObservabilityInitFallback: true,
      enableAuth: false,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.post('/mutate', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/mutate`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
  });

  it("returns canonical 401 body when token verification fails", async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);
    previousJwtSecret = process.env.LIFEOS_JWT_SECRET;
    process.env.LIFEOS_JWT_SECRET = 'service-runtime-test-secret';

    await startService({
      serviceName: 'service-runtime-test-invalid-token-response',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
        fastifyApp.post('/mutate', async () => ({ ok: true }));
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/mutate`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body).toEqual({ error: 'Invalid or expired token' });
  });

  it('does not send X-XSS-Protection header', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-no-xss-header',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/live`);
    expect(response.headers.get('x-xss-protection')).toBeNull();
  });

  it('sends Referrer-Policy: no-referrer header', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-referrer-policy-header',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/live`);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('sends Permissions-Policy header', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-permissions-policy-header',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/live`);
    expect(response.headers.get('permissions-policy')).not.toBeNull();
  });

  it('does not send Strict-Transport-Security when NODE_ENV is not production', async () => {
    const port = await getFreePort();
    previousPort = process.env.PORT;
    process.env.PORT = String(port);

    await startService({
      serviceName: 'service-runtime-test-no-hsts-non-prod',
      allowObservabilityInitFallback: true,
      registerRoutes: async (fastifyApp) => {
        app = fastifyApp;
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/health/live`);
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });
});
