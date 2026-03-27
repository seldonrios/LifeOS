# Release Policy

This policy defines how LifeOS cuts repeatable releases.

## Versioning

LifeOS uses Semantic Versioning for tagged releases.

- `patch`: bug fixes, docs corrections, internal hardening with no behavior break
- `minor`: new stable capabilities and additive interfaces
- `major`: breaking behavior or contract changes

## Changesets Workflow

1. Add a changeset entry for every user-visible change.
2. Merge PRs into `main` with pending changesets.
3. Let the release workflow open a version PR.
4. Merge the version PR to update package versions and `CHANGELOG.md`.
5. Tag the merge commit (example: `v0.3.0`) and push the tag.

## Operator Checklist Before Tag

- `pnpm run validate` passes locally and in CI
- release-impacting docs are updated
- `CHANGELOG.md` entries are accurate and complete
- release commit is on `main` and clean (`git status -sb`)

## Current Phase 2 Default

- GitHub release tags + changelog are enabled.
- npm publishing is intentionally disabled for this cycle.
