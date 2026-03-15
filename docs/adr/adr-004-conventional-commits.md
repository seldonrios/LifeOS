# ADR-004: Conventional Commits Enforcement

## Status

Accepted

## Context

A multi-contributor monorepo needs a structured commit history to support changelogs, release automation, and clear attribution by scope.

## Decision

Enforce Conventional Commits through `commitlint.config.js` (using `@commitlint/config-conventional`) and a Husky `commit-msg` hook. Allowed types are `feat | fix | docs | chore | refactor | test | ci`. Scope should match the relevant package or module when provided.

## Consequences

- Malformed commit messages are rejected at commit time.
- Contributors must learn and follow the commit format.
- Scope is optional but encouraged for better history readability.

## Alternatives Considered

- No commit convention: results in unstructured history.
- Angular commit format: a more complex superset of Conventional Commits.
- semantic-release without commitlint enforcement: creates an enforcement gap.
