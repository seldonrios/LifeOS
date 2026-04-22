# LifeOS Module Authoring Guide

A LifeOS module extends the platform with bounded runtime behavior, events, and graph-aware capabilities. This guide is for community contributors authoring modules against the current MVP contract, not for platform maintainers working on loader internals.

## What is a LifeOS module?

A LifeOS module implements the `LifeOSModule` interface from `@lifeos/module-sdk`.

- Required: `id: string`
- Required: `init(context: ModuleRuntimeContext): Promise<void>`
- Optional: `dispose(): Promise<void>`

`ModuleRuntimeContext` provides the runtime services a module can use:

- `env`
- `eventBus`
- `createLifeGraphClient`
- `subscribe`
- `publish`
- `log`

Import both `LifeOSModule` and `ModuleRuntimeContext` from `@lifeos/module-sdk`, never directly from `@lifeos/module-loader`.

## The `lifeos.json` manifest

The current manifest contract is the shape validated by `validateLifeOSManifest()` in `packages/module-loader/src/manifest.ts`.

| Field | Required | Format / constraints |
|---|---|---|
| `name` | ✅ | kebab-case, 2–63 chars |
| `version` | ✅ | semver (e.g. `0.1.0`) |
| `author` | ✅ | non-empty string, max 200 chars |
| `category` | ✅ | kebab-case, 2–41 chars |
| `permissions` | ✅ | object with `graph`, `network`, `voice`, `events` arrays; at least one entry required |
| `resources` | ✅ | object with `cpu` (`low`/`medium`/`high`) and `memory` (`low`/`medium`) |
| `tags` | ✅ | array of kebab-case strings, max 20 |
| `description` | ❌ optional | string, max 2000 chars |
| `subFeatures` | ❌ optional | array of kebab-case strings, max 10 |
| `requires` | ❌ optional | array of `@lifeos/<pkg>[@<range>]` entries, max 15 |

> **`graphVersion` is not a manifest field.** It is not validated by `validateLifeOSManifest()` and must not appear in your `lifeos.json`. The template in `templates/module/` does not include it.

## Module taxonomy

The current module tiers are defined in `packages/core/src/modules.ts`.

| Tier | Description | Examples | Community-authorable? |
|---|---|---|---|
| **Baseline** | Always loaded; core user-facing modules | `scheduler`, `notes`, `calendar`, `personality`/`briefing` | No — maintained by the platform team |
| **Optional** | User-enabled; community modules live here | `email-summarizer`, `habit-streak`, `health`, `research` | ✅ Yes |
| **System** | Always-on infrastructure; not user-toggleable | `reminder`, `sync-core`, `household-capture-router`, `household-chores`, `household-shopping` | No — platform infrastructure |

`personality` and `briefing` share one implementation in the current MVP and both appear in the baseline tier.

## `ModuleManifest` in `types.ts` — not for module authors

`ModuleManifest` exported from `packages/module-loader/src/types.ts` is a **future/internal** type marked `@future`.

- It is not the current authoring contract.
- It is not validated at runtime.
- Module authors must use `LifeOSModuleManifest` (from `@lifeos/module-loader`) as the type reference for their `lifeos.json`, or simply follow the field table above.

## Getting started

- Start from `templates/module/`, which is the canonical scaffold starting point.
- Run `pnpm lifeos module validate <module-id>` for local manifest validation.

## See also

- [Current product contract](../product/current-product-contract.md)
- [Community glossary](./glossary.md)
- [Module template](../../templates/module/)
