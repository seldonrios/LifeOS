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
import { applySecretPolicy, SecretsError } from '@lifeos/secrets';
import type { SecretRef, SecretStore } from '@lifeos/secrets';

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

export function createEnvSecretStore(): SecretStore {
  return {
    get: async (name: string) => process.env[name] ?? null,
    set: async () => undefined,
  };
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
    for (const marker of loaded.degraded) {
      allDegradedSecrets.push({ reason: marker.reason });
    }
  } catch (error) {
    terminateBoot(error, 'Failed to load configuration');
  }

  await markPhase('secrets');
  for (const ref of opts.secretRefs ?? []) {
    const value = (await opts.secretStore?.get(ref.name)) ?? null;
    let featureEnabled: boolean | undefined;
    if (ref.policy === 'required_if_feature_enabled') {
      if (opts.isFeatureEnabled) {
        featureEnabled = await opts.isFeatureEnabled(ref.featureGate ?? '');
      } else {
        featureEnabled =
          (resolvedConfig.features as Record<string, boolean> | undefined)?.[ref.featureGate ?? ''];
      }
    }
    try {
      const outcome = applySecretPolicy(ref, value, featureEnabled);
      if (typeof outcome !== 'string') {
        allDegradedSecrets.push({ reason: outcome.reason });
      }
    } catch (error) {
      if (error instanceof SecretsError) {
        terminateBoot(error, '[service-runtime] boot aborted');
      }
      throw error;
    }
  }
  if (allDegradedSecrets.length > 0) {
    console.warn(
      JSON.stringify({
        message: 'service starting with degraded secrets',
        serviceName: opts.serviceName,
        degradedSecrets: allDegradedSecrets.map((m) => m.reason),
      }),
    );
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
