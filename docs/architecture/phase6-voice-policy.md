# Phase 6 — Voice Policy

## Purpose

Define the voice data retention defaults, local-vs-cloud routing decision tree, confidence thresholds, review-queue policy, and the two-tier voice model for Phase 6 ambient surfaces. This document applies to all voice-capable surfaces registered with the home-node (`voice_endpoint`, `mobile_app`).

## Two-Tier Voice Model

Phase 6 inherits the two-tier model established in Phase 5. Both tiers are in scope for ambient surfaces:

### Tier 1 — Constrained phrase set (fast, local)

A small fixed vocabulary of wake words and quick commands is handled entirely on-device or on the local home-node. No cloud call, no persistent transcript, no raw-audio retention.

- **Scope:** Wake-word detection, presence confirmation, mode switches (e.g., "quiet hours on"), quick-action triggers (e.g., "mark kitchen chores done")
- **Latency target:** < 500 ms end-to-end
- **Data retention:** None. The matched phrase and action outcome are logged transiently (in-memory only) for the duration of the interaction lifecycle. Nothing is persisted to disk or sent off-device.
- **Cloud dependency:** None

### Tier 2 — Open capture (general STT)

Anything outside the constrained phrase set is forwarded to the household voice pipeline via the `HouseholdVoiceCaptureCreated` event. The open capture tier uses speech-to-text (STT) processing and emits a transcript for downstream routing.

- **Scope:** Free-form voice captures, notes, reminders, shopping items, chore assignments
- **Latency target:** Best-effort; user receives "received" confirmation within 2 seconds
- **Data retention:** Transcript-only by default (see [Retention Defaults](#retention-defaults))
- **Cloud dependency:** Configurable (see [Local vs Cloud Routing](#local-vs-cloud-routing))

Consent checks for `isStateKeyConsented()` remain scoped to HA-derived home-state signals in `modules/home-state`; they are not a gate on generic open voice captures under the current `HouseholdVoiceCaptureCreated` contract.

No third tier exists in Phase 6. Any capability requiring a richer interaction model (e.g., multi-turn dialogue, confirmation flows) must be built on top of one of these two tiers.

## Retention Defaults

| Data type | Default | Configurable | Notes |
| --- | --- | --- | --- |
| Raw audio | **Off** | Yes, per household | Raw audio is discarded immediately after STT transcription unless explicitly enabled |
| Transcript | **Retained** (transcript-only) | Yes, per household | Stored in `HouseholdVoiceCaptureCreated` event; routed to household DB |
| Wake-word audio | **Off** | No | Wake-word detection produces no retainable artifact |
| Constrained-phrase match | **Not retained** | No | Only the resulting action is recorded |

Enabling raw audio retention requires explicit household Admin consent via the household config API. When enabled, raw audio is stored with the same retention policy as the transcript for that capture. There is no silent audio exfiltration path.

## Local vs Cloud Routing

The home-node applies the following decision tree for each Tier 2 open capture:

```
Voice input received
│
├─ Is voice feature enabled?  (config.features.voice)
│   └─ No → drop; emit householdAutomationFailed
│
├─ Is a local STT model available?  (Whisper-class, running on local node)
│   ├─ Yes → route to local STT → emit HouseholdVoiceCaptureCreated (source = ha_satellite | mobile)
│   └─ No
│       ├─ Is cloudLlm enabled?  (config.features.cloudLlm)
│       │   ├─ Yes → route to cloud STT provider → emit HouseholdVoiceCaptureCreated (source = mobile)
│       │   └─ No → queue for deferred local processing; surface receives "queued" confirmation
```

Cloud STT routing is always opt-in (requires `config.features.cloudLlm = true`). Cloud STT providers are constrained to transcript-only output: raw audio must not be retained by the provider beyond the scope of the transcription request.

## Confidence Thresholds

Voice actions taken automatically (without an explicit confirmation step) require high confidence. The following defaults apply to the household voice router (`household-capture-router` module):

| Action class | Minimum confidence | On low confidence |
| --- | --- | --- |
| Quick-action (constrained tier) | 0.90 | Prompt for verbal confirmation |
| Household shopping / chore add | 0.80 | Route to inbox as pending approval |
| Reminder create | 0.75 | Route to inbox as pending approval |
| Note add | 0.70 | Create note with `needs_review` tag |
| Ambiguous / unrecognised intent | — | Emit `householdCaptureUnresolved` |

These thresholds are defaults. Household Admin can tighten but not loosen the confidence floor below 0.60 for any auto-execute action. A threshold below 0.60 requires a mandatory confirmation step regardless of household config.

## Review Queue Policy

Captures routed to the approval inbox follow the standard `ApprovalMode` model from `@lifeos/approval-workflow`:

- Items expire after **48 hours** if not acted on (default TTL)
- Expired items emit a `householdCaptureUnresolved` event and are marked `expired`
- The household Admin may bulk-dismiss expired items from the mobile app
- Voice captures in the review queue are surfaced as `notification` or `approval` inbox items depending on their action class; they do not block new captures from the same source

## What this policy does not cover

- Inter-device voice handoff (Phase 6 v2 concern)
- Simultaneous multi-speaker disambiguation
- Voice biometric identification (not planned; would require explicit consent architecture beyond current scope)
- Push-to-talk physical button hardware protocol (that is a surface hardware concern, not a voice policy concern)

## Related Docs

- [phase6-home-node-adr.md](./phase6-home-node-adr.md)
- [phase6-surface-taxonomy.md](./phase6-surface-taxonomy.md)
- [phase6-privacy-defaults.md](./phase6-privacy-defaults.md)
- [voice-and-media.md](./voice-and-media.md)
- [Threat Model](../security/threat-model.md)
