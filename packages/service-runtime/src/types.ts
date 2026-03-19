import type { FastifyInstance } from 'fastify';

import type { HealthCheck } from '@lifeos/health';
import type { ObservabilityClient, ObservabilityConfig } from '@lifeos/observability';
import type { SecretRef, SecretStore } from '@lifeos/secrets';

export type ServiceRuntimePhase =
  | 'config'
  | 'secrets'
  | 'observability'
  | 'auth/policy'
  | 'routes'
  | 'health/readiness'
  | 'listen';

export interface ServiceRuntimeOptions {
  serviceName: string;
  registerRoutes?: (app: FastifyInstance) => Promise<void>;
  registerPlugins?: (app: FastifyInstance) => Promise<void>;
  configSchema?: object;
  port?: number;
  /** Controls core fail-fast behavior: missing required secrets will terminate boot immediately. */
  isCoreService?: boolean;
  /** @deprecated Use `isCoreService` instead. Will be removed in a future release. */
  isCorService?: boolean;
  enableAuth?: boolean;
  enableMetrics?: boolean;
  enableReadiness?: boolean;
  enableLiveness?: boolean;
  secretRefs?: SecretRef[];
  secretStore?: SecretStore;
  observabilityConfig?: ObservabilityConfig;
  observabilityFactory?: (config: ObservabilityConfig) => ObservabilityClient;
  allowObservabilityInitFallback?: boolean;
  isFeatureEnabled?: (featureGate: string) => boolean | Promise<boolean>;
  healthChecks?: HealthCheck[];
}

export type ServiceRuntime = void;
