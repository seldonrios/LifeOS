# @lifeos/service-runtime

Shared bootstrap runtime for LifeOS services built on Fastify.

## Boot Order

| Phase            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| config           | Loads runtime config through `loadConfig()` from `@lifeos/config`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| secrets          | Resolves declared `secretRefs` against the `secretStore`. Enforcement is determined by each ref's `policy` field: `required` -> missing secret terminates boot immediately (`terminateBoot`); `optional` -> missing secret records a degraded marker; `required_if_feature_enabled` -> behaves as `required` when the controlling feature gate is active, otherwise records a degraded marker. All degraded markers are surfaced via the `secrets` health check at `/health/ready`. |
| observability    | Initializes observability via `createObservabilityClient()`. On failure, falls back to noop (Phase 1 default) and logs a warning; use `allowObservabilityInitFallback: false` to enforce strict fail-fast.                                                                                                                                                                                                                                                                          |
| auth/policy      | Registers auth and policy startup behavior, including request-time identity logging and fail-closed auth/policy checks for mutating routes (`POST`, `PUT`, `PATCH`, `DELETE`) except health endpoints.                                                                                                                                                                                                                                                                              |
| routes           | Invokes service route registration hook (optional; defaults to noop).                                                                                                                                                                                                                                                                                                                                                                                                               |
| health/readiness | Registers health checks and mounts `/health/live` and `/health/ready`.                                                                                                                                                                                                                                                                                                                                                                                                              |
| listen           | Starts Fastify on `0.0.0.0` with `PORT` (default `3000`), or `port` option if provided.                                                                                                                                                                                                                                                                                                                                                                                             |

## ServiceRuntimeOptions

| Field                          | Type                                                   | Required | Description                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| serviceName                    | `string`                                               | yes      | Service identity used in logs and observability metadata.                                                                                                                                   |
| registerRoutes                 | `(app: FastifyInstance) => Promise<void>`              | no       | Registers service routes; defaults to noop for Phase 1 stub services.                                                                                                                       |
| registerPlugins                | `(app: FastifyInstance) => Promise<void>`              | no       | Registers optional Fastify plugins before routes.                                                                                                                                           |
| configSchema                   | `object`                                               | no       | Optional config schema for service-level config validation.                                                                                                                                 |
| port                           | `number`                                               | no       | Override service listen port; defaults to `PORT` env var or `3000`.                                                                                                                         |
| isCoreService                  | `boolean`                                              | no       | Canonical core-service flag retained for compatibility. Secret enforcement is policy-driven per `SecretRef.policy`; this flag does not control fail-fast secret behavior in the boot chain. |
| isCorService                   | `boolean`                                              | no       | **Deprecated.** Backward-compatibility alias for `isCoreService`. Carries the same non-operative status for secret enforcement.                                                             |
| enableAuth                     | `boolean`                                              | no       | Enables auth boot behavior for runtime-controlled auth wiring.                                                                                                                              |
| enforceMutatingRouteAuth       | `boolean`                                              | no       | Enforces Bearer token + policy checks on mutating routes. Defaults to enabled.                                                                                                              |
| enableMetrics                  | `boolean`                                              | no       | Enables metrics behavior for runtime-controlled observability wiring.                                                                                                                       |
| enableReadiness                | `boolean`                                              | no       | Enables `/health/ready` endpoint; defaults to enabled.                                                                                                                                      |
| enableLiveness                 | `boolean`                                              | no       | Enables `/health/live` endpoint; defaults to enabled.                                                                                                                                       |
| failClosed                     | `boolean`                                              | no       | When true, auth/policy verification errors for mutating routes are treated as blocking failures. Defaults to true.                                                                          |
| secretRefs                     | `SecretRef[]`                                          | no       | Secret references used during boot.                                                                                                                                                         |
| secretStore                    | `SecretStore`                                          | no       | Secret provider used to resolve declared references.                                                                                                                                        |
| observabilityConfig            | `ObservabilityConfig`                                  | no       | Explicit observability config override.                                                                                                                                                     |
| observabilityFactory           | `(config: ObservabilityConfig) => ObservabilityClient` | no       | Custom observability client factory.                                                                                                                                                        |
| allowObservabilityInitFallback | `boolean`                                              | no       | Controls observability init failure behavior. Phase 1 default: falls back to noop. Set to `false` for strict fail-fast.                                                                     |
| isFeatureEnabled               | `(featureGate: string) => boolean \| Promise<boolean>` | no       | Optional feature gate resolver.                                                                                                                                                             |
| healthChecks                   | `HealthCheck[]`                                        | no       | Additional health checks added to the runtime registry.                                                                                                                                     |

## Secret Policy Outcomes

| `SecretRef.policy`            | Secret present | Secret missing              | Feature gate inactive    |
| ----------------------------- | -------------- | --------------------------- | ------------------------ |
| `required`                    | Boot continues | Boot terminates (fail-fast) | N/A                      |
| `optional`                    | Boot continues | Degraded marker recorded    | N/A                      |
| `required_if_feature_enabled` | Boot continues | Boot terminates (fail-fast) | Degraded marker recorded |

Degraded markers are aggregated and reported via the `secrets` health check registered at the `health/readiness` phase, visible at `/health/ready`.

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

// Example showing policy-driven secret refs
await startService({
  serviceName: 'my-service',
  secretStore: createEnvSecretStore(),
  isFeatureEnabled: (gate) => featureFlags.isEnabled(gate),
  secretRefs: [
    { name: 'DB_PASSWORD', policy: 'required' },
    { name: 'ANALYTICS_KEY', policy: 'optional' },
    { name: 'VISION_API_KEY', policy: 'required_if_feature_enabled', featureGate: 'vision' },
  ],
});
```

## Phase 1 Notes

- Secret enforcement is policy-driven per `SecretRef`, not per service class. The `policy` field on each `SecretRef` determines the outcome independently of `isCoreService`.
- `required` -> boot terminates immediately if the secret is absent.
- `optional` -> boot continues; the missing secret is recorded as a degraded marker.
- `required_if_feature_enabled` -> boot terminates if the feature gate is active; otherwise records a degraded marker.
- All degraded markers are logged as a structured JSON warning at boot time and surfaced via the `secrets` health check at `/health/ready` (HTTP 503 with `status: "degraded"`).
- `isCorService` is a **deprecated alias** for `isCoreService`. Use `isCoreService` for forward compatibility. Neither flag controls secret enforcement; use `SecretRef.policy` instead.
- Runtime listen port is controlled by `PORT` env var (default `3000`), or overridden via `port` option.
- **Observability fallback**: When `createObservabilityClient()` fails, the runtime automatically falls back to a noop observability client and logs a warning. This is the Phase 1 default to keep the bootstrap chain operational. Set `allowObservabilityInitFallback: false` to enforce strict fail-fast behavior.
- **Route registration**: `registerRoutes` is optional and defaults to a noop for Phase 1 stub services. Services do not need to define routes to boot successfully.
- **Mutating route auth**: by default, mutating routes require `Authorization: Bearer <token>` and policy approval; missing/invalid token returns `401`, policy deny returns `403`.
