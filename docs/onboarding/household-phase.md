# Household Contributor Onboarding (Phase)

Use this checklist when contributing to shared household workflows and modules.

## Checklist

- [ ] Validate the end-to-end local household contributor environment before implementation (`pnpm install`, `pnpm run validate`, and household runtime prerequisites).
- [ ] Execute required household test commands and record outcomes for reviewer verification.
- [ ] Ensure module tests, setup/docs updates, and CI expectations stay aligned for every changed household surface.
- [ ] Document workflow side effects and traceability expectations for published events, audits, and downstream automations.
- [ ] For voice features, explicitly document capture mode, storage/retention behavior, and privacy constraints.

## Required References

- Test class requirements: [docs/testing/test-taxonomy.md](../testing/test-taxonomy.md)
- Privacy model: [docs/architecture/security-and-privacy.md](../architecture/security-and-privacy.md)

## Local Development Commands

```bash
pnpm test:household-identity
pnpm test:voice-capture
pnpm test:household-mvp
```

## Reference Implementation

Use `modules/household-identity` as the canonical reference implementation when scaffolding new household modules.

## Reminder Automation Traceability Ownership

- Dashboard route orchestration (`services/dashboard/src/routes/household.ts`) owns emission of reminder automation failure spans and `lifeos.household.automation.failed` events.
- `modules/household-identity` owns reminder failure evaluation (`REMINDER_NO_TOKEN`, `REMINDER_QUIET_HOURS`, `REMINDER_MEMBER_INACTIVE`) and audit persistence via the registered interceptor.
- Do not add a second emission path for reminder automation failures inside household-identity; this prevents duplicate `householdAutomationFailed` events.
