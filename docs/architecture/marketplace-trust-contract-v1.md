# Marketplace Trust Contract v1

Status: active contract for Phase 3 foundation.

## Purpose

Define verifiable, deterministic behavior for multi-source module catalog trust.

## Sources and Trust Modes

- Catalog sources come from local defaults plus `LIFEOS_MARKETPLACE_SOURCES`.
- Trust mode:
  - `strict`: reject unverified remote catalogs (fail-closed)
  - `warn`: include unverified remote catalogs with warnings
  - `off`: include remote catalogs without signature checks
- Trust keys are configured via `LIFEOS_MARKETPLACE_TRUST_KEYS`.

## Signature Contract

- Remote catalogs may include `signature` metadata.
- Supported signature block fields:
  - `keyId`
  - `algorithm` (`hmac-sha256`)
  - `value`
- Verification failures surface reason codes (for example `missing_signature`, `signature_mismatch`).

## Deterministic Merge Policy

When duplicate module ids are encountered across sources, prefer:

1. verified entries over unverified entries
2. newer `lastUpdated`
3. lower source priority index
4. lexical repo tie-break

## CLI Transparency Requirements

`lifeos marketplace list` and `--json` status surfaces must include:

- source path/url
- source kind
- trust mode
- trusted/verified flags
- entry counts
- freshness (`lastUpdated`, stale state)
- verification error message when present

## Required Test Coverage

- strict mode rejects unsigned remote source entries.
- warn mode includes unsigned source entries with warning status.
- off mode includes unsigned source entries without verification gating.
- strict mode accepts valid signed remote catalogs.
- merge precedence prefers verified over newer unverified duplicates.
