import type { ResolvedConfig } from '@lifeos/config';
import type { HealthCheck, HealthRegistry, HealthStatus } from '@lifeos/health';
import type { ObservabilityClient, ObservabilityConfig } from '@lifeos/observability';
import type { SecretRef, SecretStore } from '@lifeos/secrets';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

export type RouteHandler = () => Promise<RouteResponse>;

export interface MinimalServer {
  route(method: HttpMethod, path: string, handler: RouteHandler): void;
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  patch(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}

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
  port: number;
  configPath?: string;
  healthCheckPath?: string;
  secretRefs?: SecretRef[];
  secretStore?: SecretStore;
  observabilityConfig?: ObservabilityConfig;
  observabilityFactory?: (config: ObservabilityConfig) => ObservabilityClient;
  allowObservabilityInitFallback?: boolean;
  isFeatureEnabled?: (featureGate: string, config: ResolvedConfig) => boolean | Promise<boolean>;
  onRegisterRoutes?: (server: MinimalServer) => Promise<void>;
  onAuthPolicy?: (config: ResolvedConfig) => Promise<void>;
  onPhase?: (phase: ServiceRuntimePhase) => void | Promise<void>;
  healthChecks?: HealthCheck[];
}

export interface ServiceRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): Promise<HealthStatus>;
  readonly healthRegistry: HealthRegistry;
}
