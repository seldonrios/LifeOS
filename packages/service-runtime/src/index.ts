export * from './types';

import { createServer } from 'node:http';

import { loadConfig } from '@lifeos/config';
import {
  HealthRegistry,
  livenessHandler,
  readinessHandler,
  type HealthStatus,
} from '@lifeos/health';
import {
  createObservabilityClient,
  type ObservabilityClient,
  type ObservabilityConfig,
} from '@lifeos/observability';
import { createPolicyClient } from '@lifeos/policy-engine';
import { applySecretPolicy, type DegradedMarker } from '@lifeos/secrets';

import type {
  RouteHandler,
  ServiceRuntime,
  ServiceRuntimeOptions,
  ServiceRuntimePhase,
} from './types';

function createNoopObservabilityClient(): ObservabilityClient {
  return {
    startSpan: () => ({
      traceId: 'noop-trace',
      spanId: 'noop-span',
    }),
    endSpan: () => {
      return;
    },
    recordMetric: () => {
      return;
    },
    log: () => {
      return;
    },
  };
}

function createMinimalServer(): {
  server: import('node:http').Server;
  adapter: import('./types').MinimalServer;
} {
  const routes = new Map<string, RouteHandler>();

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const method = req.method.toUpperCase();
    const routeKey = `${method} ${url.pathname}`;
    const handler = routes.get(routeKey);

    if (!handler) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const result = await handler();
      res.statusCode = result.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: message }));
    }
  });

  return {
    server,
    adapter: {
      route(method, path, handler) {
        routes.set(`${method} ${path}`, handler);
      },
      get(path, handler) {
        routes.set(`GET ${path}`, handler);
      },
      post(path, handler) {
        routes.set(`POST ${path}`, handler);
      },
      put(path, handler) {
        routes.set(`PUT ${path}`, handler);
      },
      patch(path, handler) {
        routes.set(`PATCH ${path}`, handler);
      },
      delete(path, handler) {
        routes.set(`DELETE ${path}`, handler);
      },
      listen(port) {
        return new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => {
            server.off('listening', onListening);
            reject(error);
          };
          const onListening = (): void => {
            server.off('error', onError);
            resolve();
          };

          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port);
        });
      },
      close() {
        return new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      },
    },
  };
}

async function resolveFeatureEnabled(
  opts: ServiceRuntimeOptions,
  resolvedConfig: Awaited<ReturnType<typeof loadConfig>>,
  featureGate: string | undefined,
): Promise<boolean | undefined> {
  if (!featureGate) {
    return false;
  }

  if (opts.isFeatureEnabled) {
    return opts.isFeatureEnabled(featureGate, resolvedConfig);
  }

  const features = resolvedConfig.features as Record<string, unknown>;
  return features[featureGate] === true;
}

export async function startService(opts: ServiceRuntimeOptions): Promise<ServiceRuntime> {
  const { adapter: serverAdapter } = createMinimalServer();
  const markPhase = async (phase: ServiceRuntimePhase): Promise<void> => {
    await opts.onPhase?.(phase);
  };

  await markPhase('config');
  const resolvedConfig = await loadConfig({ secretStore: opts.secretStore });

  await markPhase('secrets');
  const degradedSecrets: DegradedMarker[] = [];
  for (const secretRef of opts.secretRefs ?? []) {
    const value = (await opts.secretStore?.get(secretRef.name)) ?? null;
    const featureEnabled =
      secretRef.policy === 'required_if_feature_enabled'
        ? await resolveFeatureEnabled(opts, resolvedConfig, secretRef.featureGate)
        : undefined;
    const outcome = applySecretPolicy(secretRef, value, featureEnabled);
    if (typeof outcome !== 'string') {
      degradedSecrets.push(outcome);
    }
  }

  const observabilityConfig: ObservabilityConfig = opts.observabilityConfig ?? {
    serviceName: opts.serviceName,
    environment: resolvedConfig.profile ?? 'development',
  };

  await markPhase('observability');
  const createObservability =
    opts.observabilityFactory ??
    ((config: ObservabilityConfig): ObservabilityClient =>
      (createObservabilityClient as unknown as (cfg: ObservabilityConfig) => ObservabilityClient)(
        config,
      ));

  let observabilityClient: ObservabilityClient;
  try {
    observabilityClient = createObservability(observabilityConfig);
  } catch (error) {
    if (!opts.allowObservabilityInitFallback) {
      throw error;
    }
    observabilityClient = createNoopObservabilityClient();
  }

  for (const marker of degradedSecrets) {
    observabilityClient.log('warn', marker.reason, {
      serviceName: opts.serviceName,
      phase: 'secrets',
    });
  }

  await markPhase('auth/policy');
  createPolicyClient();
  await opts.onAuthPolicy?.(resolvedConfig);

  await markPhase('routes');
  await opts.onRegisterRoutes?.(serverAdapter);

  await markPhase('health/readiness');
  const healthRegistry = new HealthRegistry();
  for (const healthCheck of opts.healthChecks ?? []) {
    healthRegistry.register(healthCheck);
  }
  healthRegistry.register({
    name: 'liveness',
    check: async () => ({
      status: 'healthy',
    }),
  });
  let readinessInProgress = false;
  healthRegistry.register({
    name: 'readiness',
    check: async () => {
      if (readinessInProgress) {
        return { status: 'healthy' as const };
      }

      readinessInProgress = true;
      try {
        const aggregate = await healthRegistry.runAll();
        return { status: aggregate.status };
      } finally {
        readinessInProgress = false;
      }
    },
  });

  serverAdapter.get('/health/live', livenessHandler(healthRegistry));
  serverAdapter.get('/health/ready', readinessHandler(healthRegistry));

  await markPhase('listen');
  await serverAdapter.listen(opts.port);
  observabilityClient.log('info', `${opts.serviceName} listening`, {
    serviceName: opts.serviceName,
    port: opts.port,
  });

  return {
    async start() {
      return;
    },
    async stop() {
      await serverAdapter.close();
      observabilityClient.log('info', `${opts.serviceName} stopped`, {
        serviceName: opts.serviceName,
      });
    },
    async getHealth(): Promise<HealthStatus> {
      return healthRegistry.runAll();
    },
    healthRegistry,
  };
}
