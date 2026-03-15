# @lifeos/service-runtime

Shared service runtime contracts for standardized service bootstrap.

Boot is deterministic and always runs these phases in order:

1. Config: resolves configuration through `loadConfig`, including secret-backed values when a secret store is provided.
2. Secrets: applies each declared `secretRefs` policy with `applySecretPolicy` and fails fast on required misses.
3. Observability: initializes observability for structured startup and shutdown logging.
4. Auth and Policy: initializes policy client and invokes optional `onAuthPolicy` startup validation hook.
5. Routes: invokes optional `onRegisterRoutes` hook for service-specific route registration.
6. Health and Readiness: creates a `HealthRegistry`, registers custom checks plus built-in liveness and readiness behavior, and mounts health endpoints.
7. Listen: binds the HTTP server to the configured port and marks the service as running.

## Hooks

- `onAuthPolicy(config)`: startup-time auth and policy checks after config resolution.
- `onRegisterRoutes(server)`: route registration using the runtime's minimal server adapter (`route(method, path, handler)` plus `get`/`post`/`put`/`patch`/`delete` helpers).
- `healthChecks`: additional checks registered before health endpoints are served.

## Failure Behavior

- Fail-fast by default: config parsing/validation errors, required secret misses, policy startup failures, route setup failures, observability initialization failures, and listen failures abort startup.
- Optional fallback: set `allowObservabilityInitFallback: true` to continue startup with a noop observability client if observability initialization fails.
- Degraded: optional and feature-gated secrets can resolve as degraded markers and are logged through observability, but startup continues.

## Spec References

- [Tech Plan Operational Service Build Contexts](../../docs/phase-1/reference-architecture.md)
