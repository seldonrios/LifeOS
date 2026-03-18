# @lifeos/service-runtime

Shared bootstrap runtime for LifeOS services built on Fastify.

## Boot Order

| Phase | Description |
| --- | --- |
| config | Loads runtime config through `loadConfig()` from `@lifeos/config`. |
| secrets | Resolves declared secrets and warns for required secret misses when `isCorService` is enabled (Phase 1 behavior). |
| observability | Initializes observability via `createObservabilityClient()`. On failure, falls back to noop (Phase 1 default) and logs a warning; use `allowObservabilityInitFallback: false` to enforce strict fail-fast. |
| auth/policy | Registers auth and policy startup behavior, including request-time identity logging. |
| routes | Invokes service route registration hook (optional; defaults to noop). |
| health/readiness | Registers health checks and mounts `/health/live` and `/health/ready`. |
| listen | Starts Fastify on `0.0.0.0` with `PORT` (default `3000`), or `port` option if provided. |

## ServiceRuntimeOptions

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| serviceName | `string` | yes | Service identity used in logs and observability metadata. |
| registerRoutes | `(app: FastifyInstance) => Promise<void>` | no | Registers service routes; defaults to noop for Phase 1 stub services. |
| registerPlugins | `(app: FastifyInstance) => Promise<void>` | no | Registers optional Fastify plugins before routes. |
| configSchema | `object` | no | Optional config schema for service-level config validation. |
| port | `number` | no | Override service listen port; defaults to `PORT` env var or `3000`. |
| isCorService | `boolean` | no | Core-service mode for Phase 1 secret warning behavior. |
| enableAuth | `boolean` | no | Enables auth boot behavior for runtime-controlled auth wiring. |
| enableMetrics | `boolean` | no | Enables metrics behavior for runtime-controlled observability wiring. |
| enableReadiness | `boolean` | no | Enables `/health/ready` endpoint; defaults to enabled. |
| enableLiveness | `boolean` | no | Enables `/health/live` endpoint; defaults to enabled. |
| secretRefs | `SecretRef[]` | no | Secret references used during boot. |
| secretStore | `SecretStore` | no | Secret provider used to resolve declared references. |
| observabilityConfig | `ObservabilityConfig` | no | Explicit observability config override. |
| observabilityFactory | `(config: ObservabilityConfig) => ObservabilityClient` | no | Custom observability client factory. |
| allowObservabilityInitFallback | `boolean` | no | Controls observability init failure behavior. Phase 1 default: falls back to noop. Set to `false` for strict fail-fast. |
| isFeatureEnabled | `(featureGate: string) => boolean \| Promise<boolean>` | no | Optional feature gate resolver. |
| healthChecks | `HealthCheck[]` | no | Additional health checks added to the runtime registry. |

## Minimal Usage

```ts
import { startService } from '@lifeos/service-runtime';

// Phase 1 stub (no routes)
await startService({
  serviceName: 'goal-engine',
});

// With route registration
await startService({
  serviceName: 'goal-engine',
  registerRoutes: async (app) => {
    app.get('/goals', async () => ({ goals: [] }));
  },
});
```

## Phase 1 Notes

- Missing required secrets for core services (`isCorService: true`) emit warnings during startup in Phase 1.
- Fail-fast enforcement for those cases is planned for B5.
- Runtime listen port is controlled by `PORT` env var (default `3000`), or overridden via `port` option.
- **Observability fallback**: When `createObservabilityClient()` fails, the runtime automatically falls back to a noop observability client and logs a warning. This is the Phase 1 default to keep the bootstrap chain operational. Set `allowObservabilityInitFallback: false` to enforce strict fail-fast behavior.
- **Route registration**: `registerRoutes` is optional and defaults to a noop for Phase 1 stub services. Services do not need to define routes to boot successfully.
