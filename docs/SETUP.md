# Setup

This guide gets a LifeOS development environment running and validates that it is healthy before you start contributing.

Current architecture boundary for this release: [docs/architecture/current-system-boundary.md](architecture/current-system-boundary.md).

## New user: try the hero loop in 3 steps

1. Install Node.js >= 20.19.0 and pnpm >= 9.15.4.
2. In **terminal 1**, install dependencies and start Ollama:
  ```
  pnpm install
  ollama serve
  ```
  Leave this terminal running. Then open **terminal 2** and run:
  ```
  pnpm lifeos init
  ```
3. Try the loop: `pnpm lifeos capture "your first task"` -> `pnpm lifeos inbox list` -> `pnpm lifeos inbox triage <id> --action task` -> `pnpm lifeos task list` -> `pnpm lifeos review --period daily`.

_If you are setting up a development environment to contribute, continue to the Prerequisites section below._

## Prerequisites

- Node.js >= 20.19.0
- pnpm >= 9.15.4 (matches the root packageManager pin)
- Python >= 3.11
- uv
- Docker Desktop or Docker Engine
- Git

## Shell Support

- Linux/macOS: use `bash` or `zsh`.
- Windows: use PowerShell for general commands; run bash scripts with `bash`, Git Bash, or WSL.
- Bash-only scripts used in setup:
  - `bash scripts/init-secrets.sh`
  - `bash scripts/provision-nats-identities.sh`

## Supported Environments

| Environment | Support level | Primary use | Notes |
| --- | --- | --- | --- |
| Linux/macOS shell (bash/zsh) | Supported | Primary CLI surface | All hero loop commands |
| PowerShell | Supported where noted | CLI surface | Bash-only scripts noted explicitly |
| Docker optional profile | Optional | Full stack / NATS | Not required for CLI MVP |
| Home-server profile | Reference / advanced | Full ambient stack | Phase 6 context; not primary MVP target |
| Web/mobile surfaces | Contract-dependent | Companion surfaces | Not primary MVP surface; Tauri desktop and Expo mobile are companion apps |

Persistence posture for this setup guide:

- current MVP canonical persistence is local SQLite
- documented JSON-file adapter fallback is for development compatibility
- Postgres/Neo4j are optional extended platform stores (non-MVP by default)

## Recommended: Dev Container

1. Clone and enter the repository.

```bash
git clone <repo-url> && cd lifeos
```

2. Open the folder in VS Code and accept the Reopen in Container prompt.
3. Wait for the container post-create step to complete. It runs `pnpm install` automatically.
4. Validate the workspace.

```bash
pnpm run validate
```

This command must exit 0. It runs build:modules -> typecheck -> lint -> format:check -> test. The first `build:modules` step is the precompile gate for light modules because typecheck and lint depend on compiled dist output; module discovery and validation are based on each module's `lifeos.json`, while `dist/manifest.js` is a TypeScript compilation artifact.

5. Copy `.env.example` to `.env` and populate required secrets.
6. Start the platform stack.

```bash
docker compose up ollama nats
# Ollama is required for planning commands (lifeos init, lifeos goal); optional for capture/triage/remind/task/review; a model must be pulled (e.g. `ollama pull llama3.1:8b`) before planning commands will succeed
```

This is the supported default contributor path.

For the full stack (all profile-gated services), run:

```bash
docker compose --profile dormant up
```

The `dormant` profile name is retained for command compatibility and means optional/non-MVP extended platform services.

7. For full stack runs, confirm `init-db` completes before app services continue.

`init-db` requires bash and runs on `postgres:16` (Debian). If it exits immediately, run `docker compose logs init-db` to see the error. See `services/init-db/README.md` for the full diagnostic checklist.

8. Confirm startup diagnostics are emitted by a running service.

**Linux/macOS (bash/zsh)**

```bash
docker compose logs module-loader | grep "Startup Diagnostics Report"
```

**PowerShell**

```powershell
docker compose logs module-loader | Select-String "Startup Diagnostics Report"
```

9. Continue only when the Ready to Contribute signal is met.

## Advanced: Native Install

1. Install prerequisites locally: Node.js >= 20.19.0, pnpm >= 9.15.4, Python >= 3.11, uv, Docker, Git.
2. Clone and enter the repository.

```bash
git clone <repo-url> && cd lifeos
```

3. Install JavaScript dependencies.

```bash
pnpm install
```

4. Copy `.env.example` to `.env` and fill required values.
5. Seed secrets where needed.

**Linux/macOS (bash/zsh)**

```bash
scripts/init-secrets.sh
```

**PowerShell**

```powershell
bash scripts/init-secrets.sh
```

6. Validate the workspace.

```bash
pnpm run validate
```

This runs build:modules -> typecheck -> lint -> format:check -> test. The first `build:modules` phase must succeed before typecheck and lint can resolve light-module dist artifacts; module discovery remains `lifeos.json` driven, and `dist/manifest.js` is a build artifact.

7. Start services.

```bash
docker compose up ollama nats
# Ollama is required for planning commands (lifeos init, lifeos goal); optional for capture/triage/remind/task/review; a model must be pulled (e.g. `ollama pull llama3.1:8b`) before planning commands will succeed
```

For the full stack (all profile-gated services), run:

```bash
docker compose --profile dormant up
```

The `dormant` profile name is retained for command compatibility and means optional/non-MVP extended platform services.

8. Confirm `init-db` completion and startup diagnostics output from running application services before development work (full stack path).

## Ready to Contribute Signal

Use this checklist before opening a PR:

- `pnpm run validate` exits 0
- Minimal path: `docker compose up ollama nats` starts and both services stay healthy
  (Ollama is required for lifeos init and lifeos goal; other hero-loop commands work without it; a model must be pulled, e.g. `ollama pull llama3.1:8b`, before planning commands will succeed)
- Full stack path: `docker compose --profile dormant up` runs `init-db` to completion (`service_completed_successfully`) and profile-gated services start
- Startup diagnostics report is emitted (full stack path)

## Module Contract Surface

LifeOS currently uses one manifest artifact and one SDK surface for modules:

- `lifeos.json`: the current MVP manifest artifact used for certification, policy checks, and runtime validation
- `@lifeos/module-sdk`: the current authoring/runtime SDK surface for module code

First-party module composition in the CLI is currently centralized in a registry. That is accepted MVP architecture debt, not a second manifest layer.

## Sync Authentication

Sync authentication is enabled by default. `@lifeos/sync-core` enforces Ed25519 signatures with TOFU trust persistence, and unsigned or unverifiable deltas are rejected when no override is set.

Explicit override:

- Set `LIFEOS_SYNC_REQUIRE_AUTH=0` to run in unauthenticated sync mode.
- This is a deliberate security downgrade and is surfaced as a warning in `lifeos doctor`.

## Reminder Delivery and tick

Reminders in LifeOS only fire when `lifeos tick` runs — there is no background daemon.

**Manual tick** (fire due reminders once):

```bash
pnpm lifeos tick
```

**Watch mode** (repeat in the foreground):

```bash
# Default: check every 15 minutes
pnpm lifeos tick --watch

# Custom interval (minimum 30 s)
pnpm lifeos tick --watch --every 5m
pnpm lifeos tick --watch --every 1h
```

The watch process runs in the foreground and exits cleanly on SIGINT (Ctrl-C) or SIGTERM.

**Sample cron** (Linux/macOS — fires reminders every 15 minutes without a foreground process):

```
*/15 * * * * cd /path/to/lifeos && pnpm lifeos tick
```

> **Note:** If you stop the `tick --watch` process or never run `lifeos tick`, scheduled reminders will not fire until the next manual or cron-triggered tick.

## Event Transport and Durability

**Event transport:** When NATS is unavailable, LifeOS uses a non-durable in-memory event fallback. Events published through the in-memory bus do not survive process restart and are not replayed. Module reactions still work locally. Cross-device sync and durable event delivery require NATS (`docker compose up -d nats`). Run `lifeos doctor` to see the active transport and `lifeos status` to see `eventTransport` and `eventDurability` fields.

Trust material path and permissions:

- Local trust data is stored at `~/.lifeos/mesh-trust.json`.
- On Linux/macOS, this file is written with `0o600` permissions.
- On Windows, explicit permission hardening is not applied by the runtime; restrict access manually via file properties/ACLs.

## Personal Operations OS Onboarding Checklist

### Core loop smoke test

- [ ] Run the system locally via the recommended path
- [ ] Create a capture: `pnpm lifeos capture "test"`
- [ ] Triage a capture: `pnpm lifeos inbox triage <id> --action task`
- [ ] Schedule a reminder: `pnpm lifeos remind <action-id> --at <datetime>`
- [ ] Mark completion: `pnpm lifeos task complete <id>`
- [ ] Review history: `pnpm lifeos review --period daily`

### Contributor readiness

- [ ] `pnpm validate` passes locally
- [ ] `pnpm test:core-loop` passes
- [ ] Open a PR and it passes CI

## First-Run Journey Smoke Check

Run this exact sequence to verify the recommended contributor path:

```bash
pnpm install
pnpm run validate
pnpm lifeos demo --dry-run
pnpm lifeos status --json
```

Expected outcomes:

- `pnpm install` completes with no lockfile drift errors
- `pnpm run validate` exits 0
- `pnpm lifeos demo --dry-run` prints demo wiring output without mutating graph state
- `pnpm lifeos status --json` returns valid JSON and reports runtime/storage metadata

What next:

- run `pnpm lifeos init` for guided local setup
- run `pnpm lifeos task list` to inspect generated task state
- run `pnpm lifeos trust status` to inspect local-first trust posture

## ARM64

`@lifeos/life-graph` bundles `better-sqlite3`, a C++ native addon compiled via `node-gyp`. On ARM64 hosts the addon must be compiled from source, which requires system build tools. If those tools are absent, the package falls back automatically to a **JSON-file storage adapter** that requires no native build.

### Enabling the SQLite backend on ARM64

Install the required build tools before running `pnpm install`:

**Debian / Ubuntu (including GitHub Actions `ubuntu-24.04-arm`)**

```bash
sudo apt-get update && sudo apt-get install -y python3 make g++
```

**macOS (Apple Silicon)**

```bash
xcode-select --install
```

After installing the tools, re-run `pnpm install` to compile `better-sqlite3`.

### JSON-file adapter (automatic fallback)

When `better-sqlite3` cannot be loaded (native addon missing or failed to compile), `LifeGraphManager` automatically selects the **JSON-file adapter**. The adapter stores the entire life-graph document in a single `.db.json` file beside the usual `.db` path.

Characteristics of the JSON-file adapter:

- **No ACID guarantees** — writes are atomic at the Node.js `writeFileSync` level only.
- **Lower throughput** — the whole store is serialised on every write.
- **Full API compatibility** — all `LifeGraphManager` methods (`load`, `save`, `appendPlan`, `getStorageInfo`) behave identically from the caller's perspective.
- **`getStorageInfo()` returns `backend: 'json-file'`** — callers can surface a warning if the SQLite backend is preferred.

The JSON-file adapter is suitable for development and contributor use. For production or long-running personal-OS deployments, install build tools to enable the SQLite backend.

## Troubleshooting

| Symptom                                                                                 | Cause                                                            | Fix                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init-db` exits non-zero                                                                | `postgres` is not yet healthy                                    | Wait for `pg_isready` healthcheck and verify `POSTGRES_USER` and `POSTGRES_DB` in `.env`                                                                |
| Missing secrets error on service start                                                  | `.env` is not populated                                          | Copy `.env.example` to `.env` and run `scripts/init-secrets.sh` (Linux/macOS) or `bash scripts/init-secrets.sh` (PowerShell)                            |
| NATS auth failure                                                                       | NKey credentials were not provisioned                            | Run `scripts/provision-nats-identities.sh` (Linux/macOS) or `bash scripts/provision-nats-identities.sh` (PowerShell)                                    |
| Port conflict on 5432/4222/3000/7474                                                    | Another process is holding the port                              | Stop the conflicting process or remap ports in `docker-compose.yml`                                                                                     |
| `init-db` exits immediately with `exec format error` or `/usr/bin/env: bash: not found` | `init-db` image was changed to an Alpine variant that lacks bash | Restore `image: postgres:16` (Debian) for the `init-db` service in `docker-compose.yml`; run `docker compose pull init-db && docker compose up init-db` |
| `pnpm run validate` fails on typecheck                                                  | Dependencies are missing                                         | Run `pnpm install` first                                                                                                                                |
