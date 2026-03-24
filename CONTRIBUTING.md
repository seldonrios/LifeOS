# Contributing to LifeOS

This guide is the quick start for contributors shipping modules and core improvements for `v0.2.0`.

For deeper architecture and repository conventions, also see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Local Setup

```bash
pnpm install
pnpm run typecheck
pnpm run test
```

Optional local services for full flows:

```bash
ollama serve
docker compose up -d nats
```

## How to create a new module (recommended way)

```bash
pnpm lifeos module create my-new-module
```

Validate before submission:

```bash
pnpm lifeos module validate my-new-module
```

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

Full spec: [docs/module-spec/lifeos-manifest.md](docs/module-spec/lifeos-manifest.md)
Marketplace catalog: `community-modules.json` (root).

## Build a New Module

Use `packages/calendar-module` as the reference template.

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
