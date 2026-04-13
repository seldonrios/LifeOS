import type { FastifyInstance } from 'fastify';
import type { HealthCheck } from '@lifeos/health';
import type { ObservabilityClient, ObservabilityConfig } from '@lifeos/observability';
import type { SecretRef, SecretStore } from '@lifeos/secrets';
export type ServiceRuntimePhase = 'config' | 'secrets' | 'observability' | 'auth/policy' | 'routes' | 'health/readiness' | 'listen';
export type RouteAuthMode = 'mutating' | 'api-prefix' | 'all';
export interface ServiceRuntimeOptions {
    serviceName: string;
    registerRoutes?: (app: FastifyInstance) => Promise<void>;
    registerPlugins?: (app: FastifyInstance) => Promise<void>;
    configSchema?: object;
    port?: number;
    /** Legacy metadata hint for service classification. Secret enforcement is determined by SecretRef.policy (e.g., 'required' triggers fail-fast via applySecretPolicy), not by this flag. */
    isCoreService?: boolean;
    /** @deprecated Use `isCoreService` instead. Will be removed in a future release. Neither this flag nor `isCoreService` governs secret enforcement; use `SecretRef.policy` instead. */
    isCorService?: boolean;
    /** @deprecated Use `enforceRouteAuthMode` instead. Ignored when `enforceRouteAuthMode` is set. Will be removed in a future release. */
    enableAuth?: boolean;
    /** @deprecated Use `enforceRouteAuthMode` instead. Ignored when `enforceRouteAuthMode` is set. Will be removed in a future release. */
    enforceMutatingRouteAuth?: boolean;
    enforceRouteAuthMode?: RouteAuthMode;
    enableMetrics?: boolean;
    enableReadiness?: boolean;
    enableLiveness?: boolean;
    failClosed?: boolean;
    secretRefs?: SecretRef[];
    secretStore?: SecretStore;
    observabilityConfig?: ObservabilityConfig;
    observabilityFactory?: (config: ObservabilityConfig) => ObservabilityClient;
    allowObservabilityInitFallback?: boolean;
    isFeatureEnabled?: (featureGate: string) => boolean | Promise<boolean>;
    healthChecks?: HealthCheck[];
}
export type ServiceRuntime = void;
