# Phase 6 — Surface Taxonomy

## Purpose

Define the canonical set of surface kinds, trust levels, and capability matrix for the Phase 6 ambient layer. All Phase 6 services and modules must reference this taxonomy. The surface kind and trust-level enumerations are frozen in `SurfaceKindSchema` and `SurfaceTrustLevelSchema` in `@lifeos/contracts`.

## Surface Kinds

A **surface** is any physical or virtual display or voice endpoint registered with the home-node. Each surface has a kind that describes its physical role in the home.

| Surface kind          | Description                                                                             |
| --------------------- | --------------------------------------------------------------------------------------- |
| `kitchen_display`     | Wall-mounted or countertop screen in a kitchen; always-visible, interaction at a glance |
| `hallway_display`     | Entry or corridor screen; brief contextual info (who's home, weather, next reminder)    |
| `living_room_display` | Shared living space screen; ambient / passive information only, no actions              |
| `desk_display`        | Personal workspace screen; owner's own content plus household context                   |
| `voice_endpoint`      | Microphone + speaker device in a room; capture and confirm interactions only            |
| `mobile_app`          | LifeOS mobile companion app; full personal + household access                           |

Adding a new surface kind requires an additive update to `SurfaceKindSchema`. No existing kind is removed or renamed once it has been registered in production.

## Trust Levels

Every registered surface is assigned exactly one trust level. Trust level is set at registration and can be updated by a household Admin.

| Trust level | Who holds it                                                                                | Summary                                                               |
| ----------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `personal`  | The authenticated user's own device (e.g., `mobile_app`, `desk_display`)                    | Full content access — personal data, household data, sensitive fields |
| `household` | Any shared household surface (e.g., `kitchen_display`, `hallway_display`, `voice_endpoint`) | Household-shared content only; sensitive content is filtered out      |
| `guest`     | A temporary visitor surface                                                                 | Read-only, no sensitive content, no mutations                         |

## Capability Matrix

Each surface kind declares a fixed capability set. A surface instance can have fewer capabilities than its kind allows (e.g., a display-only voice endpoint that has had listening disabled), but may never have more.

| Surface kind          | read | quick-action | full-action | voice-capture | voice-confirm | Trust level |
| --------------------- | ---- | ------------ | ----------- | ------------- | ------------- | ----------- |
| `kitchen_display`     | ✓    | ✓            | —           | —             | —             | `household` |
| `hallway_display`     | ✓    | ✓            | —           | —             | —             | `household` |
| `living_room_display` | ✓    | —            | —           | —             | —             | `household` |
| `desk_display`        | ✓    | ✓            | ✓           | —             | —             | `personal`  |
| `voice_endpoint`      | —    | —            | —           | ✓             | ✓             | `household` |
| `mobile_app`          | ✓    | ✓            | ✓           | ✓             | ✓             | `personal`  |

**Capability definitions:**

- `read` — surface can display feed content sent by the home-node
- `quick-action` — surface can trigger pre-defined actions (mark chore done, dismiss reminder) that do not require full context
- `full-action` — surface can initiate arbitrary actions that create, update, or delete objects in the life-graph or household
- `voice-capture` — surface can submit voice transcripts into the household voice pipeline
- `voice-confirm` — surface can confirm or reject a pending action proposed by a prior voice capture

## Zone Binding

Every surface belongs to exactly one zone. Zones correspond to physical spaces in the home. The canonical zone types are: `kitchen`, `hallway`, `bedroom`, `office`, `entryway`, `living_room`, and `other`.

A zone belongs to exactly one home. A home belongs to exactly one household. This hierarchy is encoded in `HomeNodeHomeSchema` and `HomeNodeZoneSchema` in `@lifeos/contracts`.

## Surface Registration Lifecycle

```
register → active
active   → deregistered  (graceful removal)
active   → inactive      (health watchdog marks surface unhealthy after missed heartbeats)
inactive → active        (surface reconnects and re-registers)
```

A deregistered surface cannot reactivate without a new registration. An inactive surface is retained in the database for audit purposes.

## Content Filtering Contract

The home-node is responsible for filtering display feed content before sending it to a surface. Surface clients render what they receive and must not re-apply policy locally.

Content filtering rules are defined in [phase6-privacy-defaults.md](./phase6-privacy-defaults.md).

## Related Docs

- [phase6-home-node-adr.md](./phase6-home-node-adr.md)
- [phase6-voice-policy.md](./phase6-voice-policy.md)
- [phase6-privacy-defaults.md](./phase6-privacy-defaults.md)
- [user-interfaces.md](./user-interfaces.md)
