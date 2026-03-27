# Maintainer Policy

This policy defines the minimum maintainer expectations for LifeOS.

## Triage Cadence

- Review new issues and pull requests at least 3 times per week.
- Apply labels on first triage (`type:*`, `area:*`, `os:*`) so routing is explicit.
- Close duplicates with a reference to the canonical issue.

## Response Targets

- New issues: first maintainer response within 72 hours.
- Pull requests: first review within 5 business days.
- Security reports follow `SECURITY.md` response timelines.

## Merge Expectations

- `pnpm run validate` must be green in CI before merge.
- Required docs updates must land in the same PR when behavior changes.
- Prefer squash merges with a Conventional Commit title.

## Docs Update Rule

Update docs in the same PR when changing any of these:

- CLI behavior, flags, or output
- setup, validation, or troubleshooting steps
- security, trust, or policy behavior
- release or contribution process

## Issue and PR Hygiene

- Use issue forms for new bug/feature/docs intake.
- Keep PRs scoped to one milestone or one behavior change.
- Request follow-up issues instead of expanding PR scope late in review.
