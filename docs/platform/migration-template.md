# Migration Note Template

## Version pair

- From: `<old-version>`
- To: `<new-version>`

## Breaking changes

- List each breaking change and impacted surface.

## Deprecated removals

- List removed deprecated items and their replacement.

## Upgrade procedure

1. Backup graph/state files.
2. Update dependencies and CLI.
3. Run migrations and validations.
4. Restart services.

## Rollback notes

- Steps to revert safely to previous version.

## Verification commands

- `pnpm lifeos status --json`
- `pnpm lifeos module validate --all`
- `pnpm lifeos doctor --verbose`
