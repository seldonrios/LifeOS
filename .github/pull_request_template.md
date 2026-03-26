## Summary

- Describe the user-visible behavior change.
- List key implementation updates.
- Link the related issue(s) when available.

## Validation

- [ ] `pnpm run validate`
- [ ] If behavior changed: docs updated (`README.md` and/or `docs/*`)
- [ ] If tests were added/changed: package-level test scripts still pass in isolation
- [ ] No unrelated files are included in this PR

## Release Integrity

- [ ] Ran `git show --name-only HEAD`
- [ ] Ran `git status -sb`
- [ ] Verified `git status -sb` is clean before push
- [ ] For Life Graph runtime/client changes, confirmed `git show --name-only HEAD` includes:
  - `packages/life-graph/src/manager.ts`
  - `packages/life-graph/src/index.ts`
