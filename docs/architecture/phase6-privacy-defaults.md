# Phase 6 — Privacy Defaults for Shared Surfaces

## Purpose

Define per-role content visibility rules and the sensitive content blocklist for household (`household`-trust) and guest (`guest`-trust) surfaces. These defaults are applied by the home-node display feed service before content is delivered to any shared surface.

Personal-trust surfaces (`mobile_app`, `desk_display`) receive unfiltered content and are not governed by this document.

## Core Principle

Shared surfaces are **household-scoped by design**. They exist in physical spaces where any household member — including children, guests, and people passing through — may see them. The content shown must never require the viewer to know anything personal about any single household member.

## Sensitive Content Blocklist

The following content categories are **never shown** on `household`-trust or `guest`-trust surfaces, regardless of the requesting user's role:

| Category | Examples |
| --- | --- |
| Private notes | Notes tagged `private`, notes in personal namespaces, diary-style entries |
| Sensitive reminders | Reminders containing health, finance, relationship, or medical keywords; reminders explicitly marked `personal` |
| Health data | Any `HealthMetricEntry`, medication logs, biometric readings, mental-health journal entries |
| Finance data | Account balances, transaction details, budget summaries, income or salary fields |
| Identity credentials | Passwords, tokens, API keys, account numbers, PINs |
| Adult-only content | Content tagged `adult` or requiring age verification |
| Personal messages | Direct messages, SMS, email body content |
| Location history | Past or real-time location trails for any individual household member |

This blocklist is the minimum. Individual households may extend it via the home-state consent configuration.

## Per-Role Visibility Rules

The household role hierarchy (from `HouseholdRoleSchema`) governs what content a surface can display when a household member is designated as the active context.

| Content class | Admin | Adult | Teen | Child | Guest |
| --- | --- | --- | --- | --- | --- |
| Shared household reminders | ✓ | ✓ | ✓ | ✓ | — |
| Household chore status | ✓ | ✓ | ✓ | ✓ | — |
| Shared shopping list | ✓ | ✓ | ✓ | ✓ | ✓ (read-only) |
| Shared household calendar events | ✓ | ✓ | ✓ | ✓ | — |
| Home state summary (who's home, mode) | ✓ | ✓ | ✓ | — | — |
| Household announcements | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sensitive content (see blocklist) | — | — | — | — | — |

The `Guest` role gains no persistent identity. Guest surfaces (`guest`-trust) see only household announcements and the shared shopping list (read-only). Guest-trust surfaces cannot initiate actions.

## Home-State Consent Boundary

The `home-state` module enforces explicit per-key consent for all Home Assistant state data flowing into LifeOS. This boundary is preserved and extended in Phase 6:

- The home-node display feed service must call the same `isStateKeyConsented()` check before including any HA-derived state in feed content
- Home-state keys that have not been consented are excluded from the `HomeStateSnapshotSchema` sent to shared surfaces
- The consent registry lives in `household.db` (Phase 5). The home-node reads it via the `home-state` module's API or event stream; it does not duplicate the consent registry in `home-node.db`

## Quiet Hours

During quiet hours (configurable `quiet_hours_start` / `quiet_hours_end` on `HomeNodeHomeSchema`):

- All shared surface displays transition to a reduced ambient mode (clock, home mode only)
- Voice captures are still accepted but responses are text-only (no TTS on shared speakers)
- Reminder deliveries are suppressed with `delivery_status = quiet_hours_suppressed` (existing Phase 5 behaviour preserved)
- Push-to-talk voice endpoint surfaces remain active for emergency use; the constrained phrase tier is never silenced

## Guest Mode

When `home_mode = guest_mode` (from `HomeStateSnapshotSchema`):

- All surfaces automatically downgrade to `guest`-trust content policy regardless of their registered trust level
- Sensitive content blocklist is applied without exception
- Voice captures from `voice_endpoint` surfaces are disabled during guest mode unless the household Admin has explicitly enabled them
- Guest mode is exited by the household Admin only

## What these defaults do not cover

- Content rating or parental controls for streamed media (that is a media-player concern)
- Per-surface custom blocklists beyond the household-level consent config (planned for a later phase)
- Cross-household data sharing policies (no cross-household data flow exists in Phase 6)

## Related Docs

- [phase6-home-node-adr.md](./phase6-home-node-adr.md)
- [phase6-surface-taxonomy.md](./phase6-surface-taxonomy.md)
- [phase6-voice-policy.md](./phase6-voice-policy.md)
- [security-and-privacy.md](./security-and-privacy.md)
- [Threat Model](../security/threat-model.md)
