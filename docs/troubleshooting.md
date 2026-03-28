# Troubleshooting

This guide lists common runtime failures.

## 1) Node.js version too old
- Symptoms: CLI exits early with engine/version error.
- Cause: Node version below required baseline.
- Fix: Install Node.js >= 20.19.0.
- Verify: `node --version`.

## 2) Ollama unreachable
- Symptoms: goal/research commands fail with connection errors.
- Cause: Ollama not running or wrong endpoint.
- Fix: run `ollama serve`; verify `OLLAMA_HOST`.
- Verify: `curl http://127.0.0.1:11434`.

## 3) NATS unreachable
- Symptoms: event streaming degrades/fails.
- Cause: NATS unavailable.
- Fix: `docker compose up -d nats`.
- Verify: `pnpm lifeos doctor`.

## 4) Life Graph file missing
- Symptoms: graph/status commands fail with missing file.
- Cause: path does not exist.
- Fix: initialize graph via normal CLI flows.
- Verify: `pnpm lifeos status --json`.

## 5) Life Graph parse/schema failure
- Symptoms: schema or parse error output.
- Cause: corrupted or incompatible graph payload.
- Fix: restore from backup or migrate.
- Verify: `pnpm lifeos status --json`.

## 6) Module state file invalid
- Symptoms: optional module toggles behave unexpectedly.
- Cause: malformed `modules.json`.
- Fix: repair JSON or regenerate via CLI.
- Verify: `pnpm lifeos module list`.

## 7) Manifest validation failure
- Symptoms: module fails to load/validate.
- Cause: invalid `lifeos.json` fields.
- Fix: run validator and fix listed fields.
- Verify: `pnpm lifeos module validate <module>`.

## 8) Permission policy denied
- Symptoms: module load blocked by policy checks.
- Cause: disallowed permissions.
- Fix: narrow permissions and/or policy rules.
- Verify: inspect structured policy-denied logs.

## 9) Dependency cycle in module requires
- Symptoms: startup pre-check reports cycle.
- Cause: circular `requires` graph.
- Fix: break cycle by loosening/removing circular dependency.
- Verify: `pnpm lifeos doctor --verbose`.

## 10) Resource enforcement block
- Symptoms: module load denied under pressure.
- Cause: high heap pressure + strict enforcement.
- Fix: reduce module set or switch env to warn for development.
- Verify: rerun startup and inspect enforcement logs.

Use `pnpm lifeos doctor` for automated detection of many failures above.
