# Works with LifeOS Checklist

This checklist defines enforceable requirements for external module compatibility.

## Required

- Valid `lifeos.json` manifest passes `lifeos module validate`.
- Declared permissions are least-privilege for publish/subscribe and graph access.
- Declared `resources.cpu` and `resources.memory` fields are present.
- Module sources compile with `pnpm run build:modules`.
- Runtime behavior includes success/failure event emission for observable workflows.
- Migration folder exists (`migrations/.gitkeep` acceptable for new modules).

## Recommended

- Add package/module tests for primary flows.
- Provide clear README with setup and environment variables.
- Provide module-specific troubleshooting notes.

## CI Validation Profile

External module profile workflow validates these checks using:

- `pnpm run build:modules`
- `pnpm lifeos module validate --all`

For marketplace submissions, include compatibility evidence in PR description.
