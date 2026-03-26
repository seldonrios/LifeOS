# @lifeos/module-loader

Module loader contracts for profile-aware startup sequencing.

This package now enforces strict-by-default runtime controls:

- module manifests required by default
- runtime permissions default to `strict`
- publish wildcard permissions denied
- wildcard subscribe permissions limited to trusted system modules

Temporary migration bypass:

- `LIFEOS_ALLOW_LEGACY_MANIFESTLESS=true` allows manifest-less loading (deprecated compatibility mode)

## Spec References

- [Module Platform Layer](../../docs/architecture/module-system.md)
