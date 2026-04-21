import type { FastifyInstance } from 'fastify';
import type { HealthCheck } from '@lifeos/health';
import type { ObservabilityClient, ObservabilityConfig } from '@lifeos/observability';
import type { SecretRef, SecretStore } from '@lifeos/secrets';
export type ServiceRuntimePhase = 'config' | 'secrets' | 'observability' | 'auth/policy' | 'routes' | 'health/readiness' | 'listen';
export type RouteAuthMode = 'mutating' | 'api-prefix' | 'all';
/**
 * Per-route authentication mode. Controls how the service-runtime auth middleware
 * handles incoming requests for a given route.
 *
 * - `'inherit'` — Uses the service-level `enforceRouteAuthMode` policy; no per-route
 *   override. This is the default when `RouteConfig.accessMode` is omitted.
 * - `'bearer'` — Route requires a valid JWT bearer token in the `Authorization` header.
 * - `'surface-secret'` — Route requires the `x-lifeos-surface-secret` header (or body
 *   field) matching `LIFEOS_HOME_NODE_SURFACE_SECRET`; used by home-node display
 *   lifecycle routes.
 * - `'public'` — Route is unauthenticated; no token or secret required
 *   (e.g., `/health/*` endpoints).
 *
 * `RouteConfig.accessMode` defaults to `'inherit'` when omitted.
 */
export type RouteAccessMode = 'inherit' | 'bearer' | 'surface-secret' | 'public';
export interface RouteConfig {
    accessMode?: RouteAccessMode;
}
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
    onBeforeListen?: (app: FastifyInstance) => void | Promise<void>;
    skipListen?: boolean;
}
export type ServiceRuntime = void;
