> Status: current
>
> This is the authoritative egress reference for the Phase 3 MVP.

## Purpose

This document is the single reference for all network egress paths in the current MVP, including what triggers each path, how authentication works, whether the path is enabled by default, and where related credentials are stored.

## Egress Path Inventory

| Egress path | Trigger | Auth method | Default state | Credential location |
|---|---|---|---|---|
| Ollama HTTP API | `lifeos goal`, `lifeos init`, orchestrator | None (local) | Required for planning | `OLLAMA_HOST` env |
| NATS transport | Event bus when configured | NKey credentials | Optional | `~/.nats/` |
| Google APIs (12 scopes) | Google Bridge module | OAuth2 tokens | Optional (user-enabled) | `~/.lifeos/secrets/google.json` |
| IMAP email servers | Email summarizer module | IMAP credentials | Optional (user-enabled) | `~/.lifeos/secrets/email-accounts.json` |
| Marketplace catalog | `lifeos marketplace` commands | Trust mode | Optional | None stored |
| Whisper API (voice) | Voice commands when configured | API key | Optional | `LIFEOS_WHISPER_API_KEY` env |
| Mesh peer nodes | Mesh runtime when enabled | Ed25519 + JWT | Optional | `~/.lifeos/mesh-trust.json` |
| Weather/news APIs | Weather/news modules | API keys | Optional (user-enabled) | Env vars |
| Home Assistant | home-state module | Token | Optional | `LIFEOS_HA_TOKEN` env |

## Credential File Notes

`~/.lifeos/secrets/google.json` and `~/.lifeos/secrets/email-accounts.json` are written with `0o600` permissions on Linux/macOS; `~/.lifeos/mesh-trust.json` contains the local Ed25519 private key and is also written with `0o600` on non-Windows (as of P9-B). Windows does not receive equivalent file permission hardening, which remains a known limitation.

## Trust Surface Note

`lifeos trust status` and `lifeos trust report` surface the active trust posture; completeness of the trust CLI surface is tracked as a follow-on item (P9-06).

## Post-MVP Hardening Note

OS keystore integration (P9-10) and trust CLI completeness (P9-06) are deferred to a follow-on hardening wave.
