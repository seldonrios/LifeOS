export * from './types';

import fastify from 'fastify';

import { loadConfig, type ResolvedConfig } from '@lifeos/config';
import {
  HealthRegistry,
  livenessHandler,
  readinessHandler,
} from '@lifeos/health';
import {
  createObservabilityClient,
  type ObservabilityClient,
  type ObservabilityConfig,
} from '@lifeos/observability';
import { createPolicyClient } from '@lifeos/policy-engine';
import type { SecretRef } from '@lifeos/secrets';

import type { ServiceRuntimeOptions, ServiceRuntimePhase } from './types';

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

interface InternalServiceRuntimeOptions extends ServiceRuntimeOptions {
  onAuthPolicy?: (config: ResolvedConfig) => Promise<void>;
  onPhase?: (phase: ServiceRuntimePhase) => void | Promise<void>;
}

function isRequiredMissingSecret(secretRef: SecretRef, value: string | null): boolean {
  return secretRef.policy === 'required' && value === null;
}

function terminateBoot(error: unknown, message: string): never {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`${message}: ${detail}`);
  process.exit(1);
  throw error instanceof Error ? error : new Error(detail);
}

export async function startService(opts: InternalServiceRuntimeOptions): Promise<void> {
  const markPhase = async (phase: ServiceRuntimePhase): Promise<void> => {
    await opts.onPhase?.(phase);
  };

  // Track degraded secrets for health checks
  const allDegradedSecrets: Array<{ reason: string }> = [];

  let resolvedConfig: ResolvedConfig;
  await markPhase('config');
  try {
    const loaded = await loadConfig({
      secretStore: opts.secretStore,
      secretRefs: opts.secretRefs,
      isFeatureEnabled: opts.isFeatureEnabled,
    });
    resolvedConfig = loaded.config;
  } catch (error) {
    terminateBoot(error, 'Failed to load configuration');
  }

  await markPhase('secrets');
  if (opts.isCorService) {
    for (const secretRef of opts.secretRefs ?? []) {
      const value = (await opts.secretStore?.get(secretRef.name)) ?? null;
      if (isRequiredMissingSecret(secretRef, value)) {
        console.warn(
          `[service-runtime] required secret missing for core service: ${secretRef.name}`,
        );
      }
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
    if (opts.allowObservabilityInitFallback === false) {
      terminateBoot(error, 'Failed to initialize observability');
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `[service-runtime] observability initialization failed, falling back to noop: ${detail}`,
    );
    observabilityClient = createNoopObservabilityClient();
  }

  const app = fastify({ logger: true });

  await markPhase('auth/policy');
  app.addHook('onRequest', async (request) => {
    request.log.info({ serviceName: opts.serviceName }, 'service identity');
  });

  createPolicyClient();
  await opts.onAuthPolicy?.(resolvedConfig);

  await opts.registerPlugins?.(app);

  await markPhase('routes');
  try {
    const registerRoutesHandler = opts.registerRoutes ?? (async () => {
      return;
    });
    await registerRoutesHandler(app);
  } catch (error) {
    terminateBoot(error, 'Failed to register routes');
  }

  await markPhase('health/readiness');
  const healthRegistry = new HealthRegistry();
  for (const healthCheck of opts.healthChecks ?? []) {
    healthRegistry.register(healthCheck);
  }
  healthRegistry.register({
    name: 'secrets',
    check: async () => {
      if (allDegradedSecrets.length === 0) {
        return { status: 'healthy' as const };
      }

      return {
        status: 'degraded' as const,
        reason: allDegradedSecrets.map((marker) => marker.reason).join('; '),
      };
    },
  });
  healthRegistry.register({
    name: 'liveness',
    check: async () => ({
      status: 'healthy' as const,
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
        return { status: aggregate.status as 'healthy' | 'degraded' | 'unhealthy' };
      } finally {
        readinessInProgress = false;
      }
    },
  });

  if (opts.enableLiveness !== false) {
    app.get('/health/live', async (_request, reply) => {
      const response = await livenessHandler(healthRegistry)();
      reply.code(response.status).send(response.body);
    });
  }

  if (opts.enableReadiness !== false) {
    app.get('/health/ready', async (_request, reply) => {
      const response = await readinessHandler(healthRegistry)();
      reply.code(response.status).send(response.body);
    });
  }

  await markPhase('listen');
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    terminateBoot(error, 'Failed to start listening');
  }

  observabilityClient.log('info', `${opts.serviceName} listening`, {
    serviceName: opts.serviceName,
    port,
  });
}
