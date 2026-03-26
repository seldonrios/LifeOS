## Summary

- Describe the user-visible behavior change.
- List key implementation updates.

## Validation

- [ ] `pnpm run validate`
- [ ] If modules changed: `pnpm run build:modules`
- [ ] If behavior changed: docs updated (`README.md` and/or `docs/*`)

## Release Integrity

- [ ] Ran `git show --name-only HEAD`
- [ ] Ran `git status -sb`
- [ ] Verified `git status -sb` is clean before push
- [ ] For Life Graph runtime/client changes, confirmed `git show --name-only HEAD` includes:
  - `packages/life-graph/src/manager.ts`
  - `packages/life-graph/src/index.ts`
