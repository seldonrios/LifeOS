export * from './types';

import fastify from 'fastify';

import { loadConfig, type ResolvedConfig } from '@lifeos/config';
import { HealthRegistry, livenessHandler, readinessHandler } from '@lifeos/health';
import {
  createObservabilityClient,
  type ObservabilityClient,
  type ObservabilityConfig,
} from '@lifeos/observability';
import { createPolicyClient } from '@lifeos/policy-engine';
import { applySecretPolicy, SecretsError } from '@lifeos/secrets';
import type { SecretStore } from '@lifeos/secrets';

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

/**
 * Validates and normalizes the service port.
 * @throws Error if port is invalid
 */
function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}. Must be between 1 and 65535.`);
  }
  return port;
}

/**
 * Validates and normalizes the binding host.
 * Prevents binding to all interfaces without explicit configuration.
 * @throws Error if host is invalid
 */
function validateHost(host: string | undefined): string {
  if (!host || host.trim().length === 0) {
    // Default to localhost in development, explicit in production
    const env = process.env.NODE_ENV ?? 'development';
    return env === 'production' ? 'localhost' : '127.0.0.1';
  }

  const normalized = host.trim();

  // Warn about 0.0.0.0 binding outside production
  if (normalized === '0.0.0.0' && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[service-runtime] WARNING: Binding to 0.0.0.0 outside production. Consider using localhost or an explicit IP.',
    );
  }

  // Only allow safe host patterns
  if (
    !/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9][a-z0-9-]*[a-z0-9](\.[a-z0-9][a-z0-9-]*[a-z0-9])*$|^localhost$|^::1$|^::.?$/i.test(
      normalized,
    )
  ) {
    throw new Error(`Invalid host: ${normalized}. Must be a valid IPv4, IPv6, or hostname.`);
  }

  return normalized;
}

function terminateBoot(error: unknown, message: string): never {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`${message}: ${detail}`);
  process.exit(1);
  throw error instanceof Error ? error : new Error(detail);
}

export async function startService(opts: InternalServiceRuntimeOptions): Promise<void> {
  // Validate input immediately
  if (!opts.serviceName || opts.serviceName.trim().length === 0) {
    terminateBoot(new Error('serviceName is required'), 'Service initialization failed');
  }

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
        featureEnabled = (resolvedConfig.features as Record<string, boolean> | undefined)?.[
          ref.featureGate ?? ''
        ];
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

  const app = fastify({ logger: true, requestTimeout: 30_000 });

  // Add security headers middleware
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('Content-Security-Policy', "default-src 'self'");
    // Do not expose server version
    reply.header('Server', 'LifeOS');
  });

  await markPhase('auth/policy');
  app.addHook('onRequest', async (request) => {
    request.log.info({ serviceName: opts.serviceName }, 'service identity');
  });

  createPolicyClient();
  try {
    await opts.onAuthPolicy?.(resolvedConfig);
  } catch (error) {
    terminateBoot(error, 'Failed to initialize auth/policy');
  }

  try {
    await opts.registerPlugins?.(app);
  } catch (error) {
    terminateBoot(error, 'Failed to register plugins');
  }

  await markPhase('routes');
  try {
    const registerRoutesHandler =
      opts.registerRoutes ??
      (async () => {
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
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Health check failed';
        return { status: 'unhealthy' as const, reason };
      } finally {
        readinessInProgress = false;
      }
    },
  });

  if (opts.enableLiveness !== false) {
    app.get('/health/live', async (_request, reply) => {
      try {
        const response = await livenessHandler(healthRegistry)();
        reply.code(response.status).send(response.body);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        reply.code(500).send({ error: `Liveness check failed: ${detail}` });
      }
    });
  }

  if (opts.enableReadiness !== false) {
    app.get('/health/ready', async (_request, reply) => {
      try {
        const response = await readinessHandler(healthRegistry)();
        reply.code(response.status).send(response.body);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        reply.code(500).send({ error: `Readiness check failed: ${detail}` });
      }
    });
  }

  await markPhase('listen');
  let validatedPort: number;
  let validatedHost: string;

  try {
    const rawPort = opts.port ?? Number(process.env.PORT ?? 3000);
    validatedPort = validatePort(rawPort);
  } catch (error) {
    terminateBoot(error, 'Invalid port configuration');
  }

  try {
    validatedHost = validateHost(process.env.HOST);
  } catch (error) {
    terminateBoot(error, 'Invalid host configuration');
  }

  try {
    await app.listen({ port: validatedPort, host: validatedHost });
  } catch (error) {
    terminateBoot(error, 'Failed to start listening');
  }

  observabilityClient.log('info', `${opts.serviceName} listening`, {
    serviceName: opts.serviceName,
    port: validatedPort,
    host: validatedHost,
  });

  // Graceful shutdown handling
  const gracefulShutdown = async () => {
    console.log(`[service-runtime] Shutting down ${opts.serviceName} gracefully...`);
    try {
      await app.close();
      console.log(`[service-runtime] ${opts.serviceName} shutdown complete.`);
    } catch (error) {
      console.error(
        `[service-runtime] Error during shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  process.on('SIGTERM', () => {
    void gracefulShutdown();
  });

  process.on('SIGINT', () => {
    void gracefulShutdown();
  });
}
