import { createServer as createNetServer } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startService } from './index';

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
});
