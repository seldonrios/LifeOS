> **Status: current** — Binding for Phase 3 MVP contribution decisions.

# Repo Lanes

This document is the authoritative guide for deciding where new work belongs in the LifeOS monorepo.

## apps/

### What belongs here

- User-facing surface apps: `desktop` (Tauri), `mobile` (Expo), and `home-display`.
- Companion UI and presentation-layer integration only.

### What does NOT belong here

- Core runtime logic.
- Shared packages.
- Module implementations.
- Docker services.

## packages/

### What belongs here

- Shared TypeScript/Python libraries consumed by multiple consumers.
- Examples include `cli`, `life-graph`, `event-bus`, `module-loader`, `module-sdk`, `goal-engine`, `contracts`, `security`, and `service-runtime`.

### What does NOT belong here

- App-specific UI code.
- Module domain logic.
- Docker service entrypoints.

## modules/

### What belongs here

- Domain extension units implementing `LifeOSModule` from `@lifeos/module-sdk`.
- Units that include a `lifeos.json` manifest.
- Examples include `reminder`, `orchestrator`, `scheduler`, `email-summarizer`, and `habit-streak`.

### What does NOT belong here

- Shared library code.
- Service entrypoints.
- App UI.

## services/

### What belongs here

- Independently deployable Docker service entrypoints.
- Thin `src/index.ts` wrappers that use `packages/service-runtime`.
- Examples include `dashboard`, `home-node`, `auth`, `goal-engine`, and `reasoning`.

### What does NOT belong here

- Shared library logic (belongs in `packages/`).
- Module domain logic (belongs in `modules/`).

## scripts/

### What belongs here

- Developer tooling scripts invoked via `pnpm run <script>`.
- Examples include `scaffold.ts`, `build-modules.ts`, `test-runner.ts`, and `validate-first-party-modules.ts`.
- Non-production tooling and automation only.

### What does NOT belong here

- Production runtime code.
- Shared libraries.

## templates/

### What belongs here

- Canonical scaffold starting points for contributors.
- The `templates/module/` starter that includes the `lifeos.json` + `src/index.ts` template pattern.

### What does NOT belong here

- Implemented modules.
- Shared packages.

## Dependency Direction Rules

Contribution placement and dependency decisions follow the dependency-direction rules in `docs/architecture/current-system-boundary.md`:

1. Core packages depend inward and keep boundaries explicit.
2. Modules are extension units and should not absorb shared-core responsibilities.
3. App and service surfaces integrate through contracts rather than bypassing package boundaries.
4. Any boundary exception must be documented as debt.

## See Also

- `docs/architecture/current-system-boundary.md`
- `docs/CONTRIBUTING.md`
- `docs/community/module-authoring-guide.md`
