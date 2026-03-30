# Contributing to LifeOS

This guide is the quick start for contributors shipping modules and core improvements for `v0.3.0`.

For deeper architecture and repository conventions, also see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).
Release/versioning behavior is documented in [docs/community/release-policy.md](docs/community/release-policy.md).
Platform stability categories are documented in [docs/platform/stability-map.md](docs/platform/stability-map.md).
Test expectations are documented in [docs/testing/test-taxonomy.md](docs/testing/test-taxonomy.md).
Module compatibility requirements are documented in [docs/community/works-with-lifeos-checklist.md](docs/community/works-with-lifeos-checklist.md).

## Local Setup

```bash
pnpm install
pnpm run validate
```

Optional local services for full flows:

```bash
ollama serve
docker compose up -d nats
```

Targeted package checks used by CI for runtime hardening:

```bash
pnpm --filter @lifeos/mesh test
pnpm --filter @lifeos/cli exec tsx --test src/index.test.ts
```

## Loop-stage impact

Which loop stage does your change improve?

Every issue and PR should name one primary loop stage or `Cross-cutting / Infrastructure`.
If the work is cross-cutting, explain which daily user workflow becomes more dependable because of the change.

Phase 3 accepts work that improves one of these stages:

| Stage                              | What gets better for the user                                 | Typical change areas                                              |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Capture**                        | Getting ideas/tasks into LifeOS is faster and more reliable   | `lifeos capture`, voice capture, deduplication, capture contracts |
| **Inbox / Triage**                 | Incoming items are easier to classify and route correctly     | `lifeos inbox list`, `lifeos inbox triage`, approvals, queue UX   |
| **Plan / Schedule**                | Next actions become clearer and easier to schedule            | action creation, due dates, `PlannedAction`, scheduler behavior   |
| **Reminders**                      | Users can trust reminders to fire and recover cleanly         | `lifeos remind`, idempotency, reminder events, overdue handling   |
| **Review**                         | Daily/weekly summaries are more useful and accurate           | `lifeos review`, `loopSummary`, history aggregation, insights     |
| **Cross-cutting / Infrastructure** | One or more stages become more dependable without new breadth | contracts, tests, docs, shared runtime, CI, observability         |

Changes that add breadth without improving loop reliability will be deferred to Phase 4.

When you open a PR, include:

- the primary loop stage affected
- the user-visible workflow or command that gets better
- the test or validation evidence for that stage
- any docs or contracts updated alongside the behavior change

Good first issues usually stay within one loop stage, one surface area, and one clear acceptance path.

## How to create a new module (recommended way)

```bash
pnpm lifeos module create my-new-module
```

Validate before submission:

```bash
pnpm lifeos module validate my-new-module
```

## How to publish a module to the Marketplace

1. Use `pnpm lifeos module create my-module`
2. Fill in `lifeos.json`
3. Add your module metadata to `community-modules.json`
4. Submit a PR to the main repo
5. Maintainers review and certify with `pnpm lifeos module certify owner/repo`

## Certification Tiers

- Tier 0: Community modules (auto-scanned)
- Tier 1: LifeOS Certified (manual review + signed manifest)
- Tier 2: Community Verified

## Rules for submission

- Must include `lifeos.json` manifest
- Must declare permissions
- Must declare resource hints (`resources.cpu`, `resources.memory`)
- Must pass sandbox tests
- Must use the official template

Mesh/runtime changes must also satisfy:

- Delegation paths are fail-safe (local fallback remains available when remote delegation fails).
- Mesh RPC auth checks pass for missing token, bad signature, wrong scope, and expired token.
- Delegation transparency topics remain emitted (`requested`, `accepted`, `completed`, `failed`, `fallback_local`).
- Leader election remains deterministic (`primary` > `heavy-compute` > `fallback`, freshest heartbeat, lexical node id).
- Leader events remain emitted (`lifeos.mesh.leader.elected`, `changed`, `lost`) and `mesh status` keeps leader fields accurate.
- Control-plane actions that need single authority must require healthy leader state.

Marketplace trust requirements:

- Multi-source catalogs must remain merge-deterministic (`verified > unverified`, then newest `lastUpdated`, then source priority).
- Production trust mode is fail-closed (`LIFEOS_MARKETPLACE_TRUST_MODE=strict`).
- Development trust mode can warn (`warn`) but must surface source verification status in CLI output.

Resource enforcement requirements:

- Resource tier must be derived from manifest `resources.cpu`/`resources.memory`.
- `LIFEOS_MODULE_RESOURCE_ENFORCEMENT` supports `strict|warn|off` with defaults `strict` in production and `warn` in development.
- Deny/warn paths must emit policy/security events with module id, tier, pressure, threshold, and enforcement mode.

## Modularity Risk Checklist

Every new module or core PR must pass the Risk Radar with `pnpm lifeos status --risks`. Required items:

- [ ] `requires` uses bounded semver ranges in `lifeos.json` (example: `"@lifeos/life-graph@>=0.3.0 <0.4.0"`)
- [ ] Includes empty `migrations/` folder (for future schema changes)
- [ ] Emits `module.{id}.success` / `module.{id}.error` events
- [ ] Passes `pnpm lifeos module validate`
- [ ] Tested against latest compatibility matrix
- [ ] Resources (`cpu`, `memory`) declared in manifest

Full spec: [docs/module-spec/lifeos-manifest.md](docs/module-spec/lifeos-manifest.md)
Marketplace catalog: `community-modules.json` (root).

## Platform work

PRs that change platform contracts must include the following:

- Stability category update (`stable`, `experimental`, `internal`) in `docs/platform/stability-map.md` where relevant.
- RFC link for breaking contract changes (see `docs/platform/rfc-process.md`).
- Migration note for breaking or deprecating changes.
- Compatibility check summary in PR description (manifest/event/graph/interface impact).

Catalog contributions should include a current `lastUpdated` value so CLI freshness reporting remains accurate.

## Build a New Module

Use `packages/calendar-module` as the reference template.

For contributor-friendly community modules, `modules/habit-streak` is the recommended reference implementation: zero external dependencies, no LLM calls, and pure graph-based local logic.

1. Create `packages/<your-module>/` with `package.json`, `tsconfig.json`, and `src/index.ts`.
2. Implement `LifeOSModule` from `@lifeos/module-loader`.
3. Subscribe to one or more `eventBus` topics.
4. Perform module work and persist outputs through `createLifeGraphClient()`.
5. Publish completion/failure events so other modules can react.
6. Add tests in `src/index.test.ts`.
7. Wire your module into CLI/module boot where appropriate.

Minimal template:

```ts
import { Topics } from '@lifeos/event-bus';
import type { LifeOSModule } from '@lifeos/module-loader';

export const myModule: LifeOSModule = {
  id: 'my-module',
  async init(context) {
    const client = context.createLifeGraphClient({
      env: context.env,
      graphPath: context.graphPath,
    });

    await context.subscribe<Record<string, unknown>>(
      Topics.lifeos.voiceCommandProcessed,
      async (event) => {
        await client.appendMemoryEntry({
          type: 'insight',
          content: `my-module handled ${event.type}`,
          relatedTo: [event.type],
        });
        await context.publish('lifeos.my-module.completed', { ok: true }, 'my-module');
      },
    );
  },
};
```

## Module Checklist

- Implements `LifeOSModule` with a unique `id`.
- Handles malformed payloads without crashing the process.
- Subscribes/publishes using canonical event topics.
- Writes durable state to Life Graph when behavior is stateful.
- Includes tests for success path and degraded/failure path.
- Keeps data local-first and privacy-preserving.

## Works with LifeOS Badge Eligibility

To use the `Works with LifeOS` badge (`docs/badges/works-with-lifeos.svg`), a module PR must:

- Pass `pnpm run validate`.
- Include a clear README with setup, events used, and sample commands.
- Follow local-first behavior by default (no cloud dependency unless explicitly opt-in).
- Include at least one integration test that proves event bus + life graph interoperability.

## Development Flow

1. Create a feature branch.
2. Commit with Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, etc.).
3. Run:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm run test`
4. Open PR with:
   - problem statement
   - implementation summary
   - test evidence
   - before/after behavior notes

## North Star Issue

Track roadmap and high-priority module opportunities in:

- [LifeOS v0.2.0 Ecosystem North Star Issue Draft](docs/community/v0.2.0-ecosystem-north-star-issue.md)

Priority community modules:

- Smart Home bridge
- Email assistant
- Fitness tracker integration
