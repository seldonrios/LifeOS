## Summary

- Describe the user-visible behavior change.
- List key implementation updates.
- Link the related issue(s) when available.

## Product Definition of Done (Personal Ops MVP)

- [ ] If this PR changes capture, inbox, planning, reminders, or review behavior, it includes:
  - [ ] one integration/journey test that exercises the updated flow
  - [ ] one failure-mode assertion (error path or degraded dependency path)
  - [ ] docs updates for user-facing behavior (`README.md` and/or `docs/*`)
  - [ ] UX evidence in the PR body (CLI output snippet or UI screenshot/video)
- [ ] User-facing failures include a stable error code and actionable message

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

## Household impact (if applicable)

- What household roles are affected?
- Does this change generate notifications? If yes, what are the defaults?

## Privacy & safety checklist (household changes only)

- [ ] Household vs personal vs home-state data separation reviewed
- [ ] Data retention documented (especially voice)
- [ ] Audit log entries added for state mutations
