# Phase 6 — Home-Node Architecture Decision Record

## Status

Accepted

## Context

Phase 5 delivered the household coordination layer (identity, chores, shopping, calendar, capture-router, home-state) as services and modules running alongside the existing `dashboard` service. All household compute was centralised in `dashboard` at port 3000.

Phase 6 ("Ambient Layer") extends the platform to shared physical surfaces — kitchen displays, hallway displays, room voice endpoints — that must operate reliably on the local network even when the broader LifeOS stack is unavailable. These surfaces have different trust assumptions (shared household device vs personal device), different content policies (no sensitive personal data), and different latency requirements (sub-second display refresh) than the existing dashboard or mobile surfaces.

A separable `home-node` service is required to own the surface registry, ambient state snapshot, and display feed without coupling those concerns to the dashboard HTTP API.

## Decision

### Service identity

Introduce a new always-on service `services/home-node/` using `startService()` from `@lifeos/service-runtime`. The home-node runs alongside the existing `dashboard` service on the same local network. It listens on a dedicated port, defaulting to **3010**, configurable via the environment variable `LIFEOS_HOME_NODE_PORT`.

### Database isolation

The home-node owns its own SQLite database (`home-node.db`) at a path configurable via `LIFEOS_HOME_NODE_DB_PATH` (default `./data/home-node.db`). The database uses the same `better-sqlite3` + WAL + migration pattern established by `HouseholdGraphClient` in Phase 5. It shares no tables with `household.db` or `life-graph.db`.

### Service boundaries

| Service | Owns | Port |
| --- | --- | --- |
| `dashboard` | household CRUD, capture routing, life-graph API | 3000 |
| `home-node` | surface registry, zone/room model, state snapshot, display feed | 3010 |

The home-node subscribes to household events from the event bus but does not call `dashboard` internal APIs directly.

### Event-bus integration

The home-node publishes and subscribes via the shared event bus (`@lifeos/event-bus`). The five Phase 6 ambient topics are:

| Topic key | Purpose |
| --- | --- |
| `homeNodeSurfaceRegistered` | A surface device has registered with the home-node |
| `homeNodeSurfaceDeregistered` | A surface device has left the home-node registry |
| `homeNodeStateSnapshotUpdated` | The aggregated ambient state snapshot has been refreshed |
| `homeNodeDisplayFeedUpdated` | The display feed content has changed (triggers polling clients to re-fetch) |
| `homeNodeHealthChanged` | The health status of the home-node or a connected surface adapter has changed |

All five topics are additive to the existing `Topics.lifeos` namespace. No existing topic keys are renamed or removed.

### Display feed protocol

The display feed is a **polling HTTP endpoint** in Phase 6 v1. Shared display web apps (`kitchen`, `hallway`) call `GET /feed` on the home-node at a configurable interval (default 10 seconds). This keeps the surface implementation stateless, offline-safe, and easy to test.

WebSocket or Server-Sent Events may be introduced in a later phase once the surface client model is better understood. They are explicitly out of scope for Phase 6 v1.

### Voice pipeline — two-tier model

The home-node inherits the two-tier voice model established in Phase 5:

1. **Constrained phrase tier** — a small, fixed vocabulary (wake words, quick commands) handled locally with no cloud dependency and no transcript retention beyond the immediate command lifecycle.
2. **Open capture tier** — general speech-to-text forwarded to the existing household voice capture pipeline via `HouseholdVoiceCaptureCreated` events. Subject to the consent gate in `modules/home-state` (`isStateKeyConsented()`).

The home-node does not introduce a third tier. All voice data handling must pass through one of these two paths.

### Surface trust model

Surfaces are assigned one of three trust levels at registration time. The full taxonomy is in [phase6-surface-taxonomy.md](./phase6-surface-taxonomy.md).

| Trust level | Description |
| --- | --- |
| `personal` | Authenticated user's own device; full content access |
| `household` | Shared household surface; content filtered by role and sensitivity policy |
| `guest` | Temporary access; read-only, no sensitive content, no mutations |

### Zone and room model

The home-node owns a zone/room model (`HomeNodeZone`, `HomeNodeHome`) that organises surfaces spatially. Zones map to physical spaces (kitchen, hallway, bedroom, office, entryway, living_room, other). Zones belong to a home, and homes belong to a household. This model is frozen in the shared `@lifeos/contracts` package.

## What this phase is not

- **Not a generic smart-home dashboard.** The home-node is not a broad "everything dashboard" for arbitrary home telemetry. It is a coordination layer for LifeOS ambient surfaces with a bounded content model.
- **Not a device control layer.** The home-node does not send commands to smart-home devices. It reads ambient state from Home Assistant via the existing `home-state` module's bridge. Home Assistant remains the authority for device actuation.
- **Not a Home Assistant replacement.** The home-node is a coordination and presentation layer. All Home Assistant integration routes through the existing `ha_bridge` path in `modules/home-state`.
- **Not a random pile of home automations.** Automation logic remains modular, policy-gated, and event-driven. The home-node does not become a catch-all automation runtime for ad-hoc scripts.
- **Not a consumer voice-assistant clone.** The goal is deterministic household coordination (capture, confirm, display), not an open-ended assistant persona with unconstrained conversational scope.
- **Not surveillance-heavy ambient tracking.** Presence and home-state signals remain consent-bounded and minimal. The architecture does not permit continuous personal surveillance, identity inference, or unrestricted location-history exposure.
- **Not WebSocket-first.** v1 uses polling HTTP. Upgrading to push transport is a later decision.
- **Not a personal data store.** The home-node database holds surface registrations, zone configuration, and ambient snapshots. Personal notes, health data, finance data, and sensitive reminders are never written to `home-node.db`.
- **Not authentication infrastructure.** Surface device authentication (mTLS, pre-shared tokens) is a Phase 6 v2 concern. v1 assumes the home-node is accessible only on the trusted local network.

## Consequences

- Phase 6 M1/M2 tickets (`home-node` service scaffold, surface registry, display feed service, shared display web app) build against the service contract, event topics, and Zod schemas frozen in this ADR.
- Community modules that wish to display content on household surfaces must publish events to the `homeNodeDisplayFeedUpdated` topic and must not require a surface trust level higher than `household`.
- Adding a new surface kind requires an additive update to `SurfaceKindSchema`; no existing surface kind definitions are removed once registered.
- Display feed content filtering is the responsibility of the home-node, not the surface client. Surface clients render what they receive.

## Alternatives Considered

### Embed home-node functionality in the existing `dashboard` service

Adding ambient state and surface registry to `dashboard` would have kept the service count lower, but the concerns are distinct (per-surface content policy, local-only polling endpoint, distinct database schema) and coupling them would make the surface client model harder to evolve independently.

### Use a WebSocket feed from day one

Simpler polling is more offline-safe and easier to test. A polling surface can trivially fall back to stale content; a WebSocket surface requires reconnect logic and state reconciliation.

### Register surface kinds in Home Assistant and proxy through `home-state`

Home Assistant does not have a concept of LifeOS display surfaces. Piggybacking on the HA model would couple the surface taxonomy to HA's entity model and make it harder to support non-HA deployments.

## Related Docs

- [phase6-surface-taxonomy.md](./phase6-surface-taxonomy.md)
- [phase6-voice-policy.md](./phase6-voice-policy.md)
- [phase6-privacy-defaults.md](./phase6-privacy-defaults.md)
- [voice-and-media.md](./voice-and-media.md)
- [user-interfaces.md](./user-interfaces.md)
- [security-and-privacy.md](./security-and-privacy.md)
- [Threat Model](../security/threat-model.md)
