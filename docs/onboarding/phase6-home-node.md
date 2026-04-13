# Home-Node Contributor Onboarding (Phase 6)

Use this checklist when contributing to the Phase 6 home-node runtime and ambient surface workflows.

## Checklist

- [ ] Review the three-layer model (Home Node Runtime / Core Platform / Ambient Surfaces) in the Phase 6 ADR before implementation.
- [ ] Do not add `home_id` emission to the `home-state` module — the home-node service is the sole publisher of `homeNodeStateSnapshotUpdated` with a DB-resolved `home_id` via `HomeNodeGraphClient.getHomeByHouseholdId()`.
- [ ] For voice features, explicitly document whether behavior uses the constrained phrase tier or the open capture tier, including storage/retention behavior and privacy constraints.
- [ ] Verify display sensitive-content filtering for `personal`, `household`, and `guest` trust levels, including the `guest_mode` override to effective `guest` content policy.
- [ ] Preserve ambient action traceability for home-state changes and voice captures through the `ambient_actions` audit log.
- [ ] Validate deterministic home-mode and routine override behavior for `presence.anyone_home`, `routine.morning`, `routine.evening`, and `quiet_hours`, with consent gating on every transition.
- [ ] Keep feed-policy enforcement in the home-node: shared surfaces render filtered content and must not re-apply content policy client-side.

## Required References

- Architectural decisions: [docs/adr/adr-005-phase6-home-node-architecture.md](../adr/adr-005-phase6-home-node-architecture.md)
- Household onboarding baseline: [docs/onboarding/household-phase.md](./household-phase.md)

## Local Development Commands

```bash
pnpm --filter @lifeos/home-node dev
pnpm --dir services/home-node test
```

Use `pnpm test` as the standard test entrypoint. It routes through `scripts/test-runner-entry.ts`, which sets `NODE_ENV=test` before delegating to `test-runner.ts`.

Targeted runs (for example `pnpm test:household-identity`) execute package scripts directly and do not automatically route through `scripts/test-runner-entry.ts`.

For direct targeted invocations (including bare `tsx --test`), ensure `NODE_ENV=test` is set explicitly.

## Key Code Paths

| Concept                                                   | File                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| Service bootstrap, watchdog, event subscriptions          | `services/home-node/src/app.ts`                |
| Display feed aggregation, content filtering               | `services/home-node/src/feed.ts`               |
| Home-state snapshot, surface registry, ambient action log | `packages/home-node-core/src/client.ts`        |
| Voice session lifecycle                                   | `packages/home-node-core/src/voice-session.ts` |
| Surface/display type taxonomy                             | `apps/home-display/src/types.ts`               |

## Reminder

This ticket is documentation-only. Do not add code changes as part of Phase 6 onboarding updates. Use the Phase 6 home-node ADR as the source of truth for all architectural decisions.
