# Platform Stability Map

This map is the human-readable view of platform contract stability.

| Surface | Category | Notes |
| --- | --- | --- |
| CLI command names and documented flags | stable | Keep backward-compatible within minor releases |
| `Topics.lifeos.*` topic names | stable | Event renames are breaking changes |
| `BaseEvent` envelope fields (`id`, `type`, `timestamp`, `source`, `version`, `data`) | stable | Additive metadata is allowed |
| `LifeGraphDocument` top-level shape | stable | Schema migrations required for breaking changes |
| Module manifest (`lifeos.json`) required fields | stable | JSON Schema + runtime validator must remain aligned |
| `LifeOSModule` and `ModuleRuntimeContext` | stable | External author contract |
| Internal diagnostics helpers and runtime internals | internal | No external guarantees |
| Future preview APIs explicitly labeled preview/experimental | experimental | No stability promise until promoted |
