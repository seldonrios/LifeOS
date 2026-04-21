# LifeOS

![LifeOS v0.1 Demo](https://i.imgur.com/QanyiXk.gif)
[![CI](https://github.com/seldonrios/LifeOS/actions/workflows/ci.yml/badge.svg)](https://github.com/seldonrios/LifeOS/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Security Policy](https://img.shields.io/badge/security-policy-blue.svg)](SECURITY.md)

## What LifeOS is today

LifeOS is currently a **local-first Personal Operations OS** with a **CLI-first MVP**. It provides a dependable daily operations loop — capture, inbox triage, planning, reminders / next actions, and daily / weekly review — running entirely on your own infrastructure.

Active product slice stages:

- Capture incoming tasks, ideas, and requests
- Inbox triage (approvals, reminders, plans)
- Planning and next-action generation
- Reminders / next actions
- Daily / weekly review

> **Current status: Phase 3 — Personal Operations OS MVP + Daily-Use Validation**
> **Primary surface: CLI**
> **Primary goal: one dependable daily hero loop on user-controlled infrastructure**
> Full product contract: [docs/product/current-product-contract.md](docs/product/current-product-contract.md)
> Current architecture boundary: [docs/architecture/current-system-boundary.md](docs/architecture/current-system-boundary.md)

The broader Personal AI Node vision is architectural context for future expansion — it is **not** the default release promise for contributors unless explicitly marked as current MVP work.

| Binding now                        | Not binding yet                      |
| ---------------------------------- | ------------------------------------ |
| CLI-first hero loop                | Room-aware automation                |
| Local-first storage and sync       | Receptionist flows                   |
| Life graph persistence             | Full smart-home orchestration        |
| Reminders / reviews / next actions | Health/social/economic domain suites |
| Module loader + manifest rules     | Federated node ecosystem             |
| Trust/reporting surfaces           | Agentic web / cognitive internet     |

Full contract: [docs/product/current-product-contract.md](docs/product/current-product-contract.md)

## Architecture Navigation

- Current product contract (scope authority): [docs/product/current-product-contract.md](docs/product/current-product-contract.md)
- Current system boundary (architecture authority for active release): [docs/architecture/current-system-boundary.md](docs/architecture/current-system-boundary.md)
- Phase 1 reference architecture (foundation context): [docs/phase-1/reference-architecture.md](docs/phase-1/reference-architecture.md)
- Roadmap (future direction): [docs/vision/roadmap.md](docs/vision/roadmap.md)

**LifeOS** - Personal Operations OS (local-first)

LifeOS is an open-source system for running a dependable personal operations loop on your own infrastructure.

Daily hero loop:

1. Capture incoming tasks, ideas, and requests.
2. Triage inbox items into approvals, reminders, or plans.
3. Plan clear next actions.
4. Execute with reminders and task completion.
5. Review wins and next steps daily or weekly.

## Start Here

If you are new here, start with the CLI MVP and run the full loop in minutes.

### Setup (recommended)

```bash
pnpm install
ollama serve
pnpm lifeos init
```

### 60-second hero loop

```bash
pnpm lifeos goal "Prepare for the quarterly board meeting next Thursday"
pnpm lifeos task list
pnpm lifeos next
pnpm lifeos task complete <task-id>
pnpm lifeos review --period daily
```

Setup paths:

- Recommended path (CLI MVP): `docs/SETUP.md` -> "Recommended: Dev Container" or "Advanced: Native Install"
- Advanced path (full Docker profile): `docker compose --profile dormant up`

Note: the `dormant` profile name is a compatibility label for optional/non-MVP extended platform services; it does not mean abandoned code.

These commands work in Linux/macOS shells (`bash`/`zsh`) and in PowerShell unless noted otherwise.

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

## Module Marketplace

Browse and install community modules from dynamic multi-source catalogs:

```bash
pnpm lifeos marketplace list
pnpm lifeos marketplace list --certified
pnpm lifeos marketplace refresh https://example.com/community-modules.json
pnpm lifeos module install username/repo
```

`lifeos marketplace list` prints source freshness and trust verification status per catalog source.
Trust policy defaults to `warn` in development and `strict` in production.

Operator migration notes:

- Set `LIFEOS_MARKETPLACE_SOURCES` to a comma-separated source list for multi-catalog aggregation.
- Set `LIFEOS_MARKETPLACE_TRUST_KEYS` with key material used to verify signed remote catalogs.
- Set `LIFEOS_MARKETPLACE_TRUST_MODE` to `strict` for fail-closed production behavior.

## Storage + Trust Transparency

- `lifeos status` now reports storage backend, graph path, and resolved SQLite path.
- `lifeos trust status` and `lifeos trust report --json` include storage backend/path metadata.
- Compatibility path remains `life-graph.json`, while runtime persistence is SQLite (`life-graph.db` alongside it).
- Current canonical persistence for the MVP runtime is local SQLite, with a documented JSON fallback for development compatibility.
- Postgres/Neo4j and other service-stack stores are optional extended platform data stores (non-MVP by default).

## Quick Start (Detailed CLI)

### 1) Install dependencies

```bash
pnpm install
```

### 2) Start Ollama

```bash
ollama serve
```

### 3) Verify CLI

```bash
pnpm lifeos --version
```

### 4) Run guided setup (recommended first run)

```bash
pnpm lifeos init
```

### 5) Run the one-command demo

```bash
pnpm lifeos demo
```

### 6) Explore your workspace

```bash
pnpm lifeos status
pnpm lifeos trust status
pnpm lifeos task list
pnpm lifeos voice start
pnpm lifeos modules
```

## Demo Flow (Manual)

```bash
pnpm lifeos goal "Help me prepare for the quarterly board meeting next Thursday"
pnpm lifeos review --period weekly
pnpm lifeos next
pnpm lifeos tick
pnpm lifeos status --json
```

## CLI Commands

```text
lifeos goal "<goal>" [--json] [--no-save] [--model <model>] [--graph-path <path>] [--verbose]
lifeos demo [--goal <goal>] [--model <model>] [--graph-path <path>] [--verbose]
lifeos research "<query>" [--graph-path <path>] [--verbose]
lifeos sync [pair|devices|demo] [device-name] [--json] [--verbose]
lifeos module [create|validate|list|status|setup|enable|disable|install|certify|authorize] [name-or-repo] [--sub calendar,tasks,gmail,drive,contacts]
lifeos marketplace [list|search|refresh|compatibility] [term-or-url] [--certified] [--json]
lifeos graph [migrate] [--to <version>] [--dry-run] [--json] [--graph-path <path>] [--verbose]
lifeos mesh [join|status|assign|start|delegate|debug|demo] [arg1] [arg2] [--json] [--verbose]
lifeos voice [start|demo|consent|calendar|briefing] [--text "<utterance>"] [--scenario task|calendar|research|note|weather|news|briefing|proactive] [--graph-path <path>] [--verbose]
lifeos memory [status] [--json] [--graph-path <path>] [--verbose]
lifeos trust [status|explain|report] [action] [--json] [--verbose]
lifeos doctor [--json] [--verbose]
lifeos status [--json] [--graph-path <path>] [--verbose]
lifeos review [--period daily|weekly] [--json] [--graph-path <path>] [--verbose]
lifeos task [list|complete|next] [id] [--json] [--graph-path <path>] [--verbose]
lifeos capture "<text>" [--json] [--graph-path <path>]
lifeos inbox [list|triage] [id] [--action task|note|defer] [--json] [--graph-path <path>]
lifeos remind <action-id> --at <datetime> [--json] [--graph-path <path>]
lifeos demo:loop [--dry-run] [--json]
lifeos next [--json] [--graph-path <path>] [--verbose]
lifeos tick [--json] [--graph-path <path>] [--verbose]
lifeos modules [list|load] [id]
lifeos events listen [--topic "lifeos.>"] [--json] [--verbose]
```

Voice-first examples:

> Foundation capability — voice commands are available but not the primary MVP surface

```text
pnpm lifeos voice consent
pnpm lifeos voice start
pnpm lifeos voice briefing
# "Hey LifeOS, schedule team meeting tomorrow at 3pm"
# "Hey LifeOS, add a task to finish the report by Friday"
# "Hey LifeOS, research quantum computing breakthroughs this year"
# "Hey LifeOS, note that the team prefers async updates"
# "Hey LifeOS, I prefer short answers"
# "Hey LifeOS, what's the weather in London this weekend?"
# "Hey LifeOS, give me top tech news today"
pnpm lifeos voice demo --scenario research
pnpm lifeos voice demo --scenario weather
pnpm lifeos voice demo --scenario briefing
pnpm lifeos voice demo --scenario proactive
pnpm lifeos memory status
pnpm lifeos sync pair "My Phone"
pnpm lifeos sync devices
pnpm lifeos sync demo
```

## Configuration

LifeOS is configured through environment variables and a local YAML config file. The `lifeos init` wizard handles first-run setup automatically.

### Environment Variables

| Variable                             | Default                                 | Description                                                          |
| ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------- |
| `OLLAMA_HOST`                        | `http://127.0.0.1:11434`                | Ollama API endpoint                                                  |
| `LIFEOS_GOAL_MODEL`                  | `llama3.1:8b`                           | LLM model for goal planning                                          |
| `LIFEOS_GRAPH_PATH`                  | `~/.local/share/lifeos/life-graph.json` | Compatibility path; runtime persistence is SQLite at `life-graph.db` |
| `LIFEOS_NATS_URL`                    | `nats://127.0.0.1:4222`                 | NATS/event-bus endpoint                                              |
| `LIFEOS_SECRETS_DIR`                 | `~/.lifeos/secrets/`                    | Directory for module credentials                                     |
| `LIFEOS_MESH_RPC_HOST`               | `127.0.0.1`                             | Mesh RPC server bind host                                            |
| `LIFEOS_MESH_RPC_PORT`               | `5590`                                  | Mesh RPC server port                                                 |
| `LIFEOS_MESH_HEARTBEAT_INTERVAL_MS`  | `5000`                                  | Mesh heartbeat publish interval                                      |
| `LIFEOS_MESH_NODE_TTL_MS`            | `15000`                                 | Mesh node healthy TTL                                                |
| `LIFEOS_MESH_LEADER_LEASE_MS`        | `10000`                                 | Leader lease duration before re-election                             |
| `LIFEOS_MESH_DELEGATION_TIMEOUT_MS`  | `8000`                                  | RPC delegation timeout                                               |
| `LIFEOS_JWT_SECRET`                  | _none_                                  | Signing secret for mesh RPC tokens                                   |
| `LIFEOS_MARKETPLACE_SOURCES`         | _unset_                                 | Comma-separated catalog sources (URLs/paths)                         |
| `LIFEOS_MARKETPLACE_TRUST_MODE`      | `warn` dev / `strict` prod              | Catalog trust mode: `strict`, `warn`, `off`                          |
| `LIFEOS_MARKETPLACE_TRUST_KEYS`      | _unset_                                 | Trust key map for catalog signature verification                     |
| `LIFEOS_MODULE_MANIFEST_REQUIRED`    | `true`                                  | Require valid module manifests                                       |
| `LIFEOS_MODULE_RUNTIME_PERMISSIONS`  | `strict`                                | Enforce declared module runtime permissions                          |
| `LIFEOS_MODULE_RESOURCE_ENFORCEMENT` | `warn` dev / `strict` prod              | Heap-pressure module load enforcement (`strict \| warn \| off`)      |
| `LIFEOS_HOME_NODE_PORT`              | `3010`                                  | Phase 6 home-node service listen port                                |
| `LIFEOS_HOME_NODE_DB_PATH`           | `./data/home-node.db`                   | Phase 6 home-node SQLite database path                               |

### Config File

After running `lifeos init`, settings are stored in `~/.lifeos/config.json`:

```json
{
  "model": "llama3.1:8b",
  "configuredAt": "2026-01-01T00:00:00.000Z",
  "enabledModules": ["research", "weather"]
}
```

### Module Configuration

Enable or disable optional modules any time with:

```bash
pnpm lifeos module enable research
pnpm lifeos module disable weather
```

Baseline modules (`scheduler`, `notes`, `calendar`, `personality`, `briefing`) are always active.

## Multi-Device Sync

> Foundation capability — available but not primary MVP surface

### Multi-Device Sync

LifeOS now syncs your Life Graph across laptop, phone, tablet, etc. -- 100% locally via NATS.

**Quick start:**

```bash
# On Device 1
pnpm lifeos sync pair "My Phone"

# On Device 2
pnpm lifeos sync pair "My Laptop"
```

Changes made on any device instantly appear on the others. Works offline when disconnected.
Try it:

```bash
pnpm lifeos sync demo
```

Environment variables:

- `OLLAMA_HOST` override Ollama endpoint
- `LIFEOS_GOAL_MODEL` override default model
- `LIFEOS_GRAPH_PATH` override default life graph location
- `LIFEOS_NATS_URL` override NATS endpoint

Defaults:

- model: `llama3.1:8b`
- graph path (Windows): `%APPDATA%\\lifeos\\life-graph.json`
- graph path (Unix): `$XDG_DATA_HOME/lifeos/life-graph.json` or `~/.local/share/lifeos/life-graph.json`
- NATS URL: `nats://127.0.0.1:4222`

Runtime enforcement options:

- `LIFEOS_MODULE_MANIFEST_REQUIRED=true` requires a valid `lifeos.json` for loaded modules.
- `LIFEOS_MODULE_RUNTIME_PERMISSIONS=strict` rejects undeclared runtime graph/event operations.
- `LIFEOS_MODULE_RESOURCE_ENFORCEMENT` enforces heap-pressure checks before `module.init` (`strict` in production, `warn` in development, `off` by explicit override).

## Local Orchestration Mesh Runtime

> Foundation capability and future-scale context - not required for current MVP loop

Mesh vocabulary used in this README:

- local orchestration mesh: bounded runtime coordination used by current local deployments
- node/federation mesh: optional/future cross-node delegation context
- mesh service: only when referring to a separately deployed service boundary

LifeOS local orchestration mesh uses a hybrid model:

- Event-bus control plane (heartbeats + delegation transparency topics).
- HTTP JSON RPC data plane (`goal.plan`, heavy intent publish).

Key commands:

```bash
pnpm lifeos mesh start <node-id> --role heavy-compute --capabilities goal-planning,research
pnpm lifeos mesh status --json
pnpm lifeos mesh delegate goal-planning --goal "Plan launch checklist" --json
pnpm lifeos mesh delegate research --topic lifeos.voice.intent.research --data '{"query":"quantum chips"}'
pnpm lifeos mesh debug --bundle ./mesh-debug.json --json
```

Heavy-intent delegation behavior:

- Goal planning plus heavy voice intents (`research`, `weather`, `news`, `email-summarize`) delegate to healthy mesh nodes when available.
- Delegation failures (timeout, auth rejection, no healthy node, unreachable RPC) fall back to local execution.
- Transparency topics emitted: `lifeos.mesh.delegate.requested`, `accepted`, `completed`, `failed`, `fallback_local`.

Leader election + failover behavior:

- Control plane leader is elected from healthy nodes with deterministic precedence: `primary` > `heavy-compute` > `fallback`, then freshest heartbeat, then lexical `nodeId`.
- Leader lease persists in `~/.lifeos/mesh-leader.json` with `leaderId`, `leaseUntil`, `electedAt`, and `term`.
- `mesh status` now includes `leaderId`, `term`, `leaseUntil`, `isLeader`, and `leaderHealthy`.
- Leader events emitted: `lifeos.mesh.leader.elected`, `lifeos.mesh.leader.changed`, `lifeos.mesh.leader.lost`.

Local orchestration mesh/JWT environment variables:

- `LIFEOS_MESH_RPC_HOST` (default `127.0.0.1`)
- `LIFEOS_MESH_RPC_PORT` (default `5590`)
- `LIFEOS_MESH_HEARTBEAT_INTERVAL_MS` (default `5000`)
- `LIFEOS_MESH_NODE_TTL_MS` (default `15000`)
- `LIFEOS_MESH_LEADER_LEASE_MS` (default `10000`)
- `LIFEOS_MESH_DELEGATION_TIMEOUT_MS` (default `8000`)
- `LIFEOS_JWT_SECRET` (required for secure mesh RPC in real deployments)
- Optional JWT claims config: `LIFEOS_JWT_ISSUER`, `LIFEOS_JWT_AUDIENCE`

## Docker (Optional)

For external event streaming with NATS:

```bash
docker compose up -d nats
pnpm lifeos events listen --topic "lifeos.>"
```

For local inference + NATS:

```bash
docker compose up -d ollama nats
```

If NATS is unavailable, LifeOS falls back to an in-memory event bus so local module reactions still work.

## Current MVP Scope

Active implementation packages:

- `@lifeos/cli`
- `@lifeos/goal-engine`
- `@lifeos/life-graph`
- `@lifeos/event-bus`
- `@lifeos/module-loader`
- `@lifeos/reminder-module`
- `@lifeos/calendar-module`
- `@lifeos/scheduler-module`
- `@lifeos/research-module`
- `@lifeos/notes-module`
- `@lifeos/weather-module`
- `@lifeos/news-module`
- `@lifeos/google-bridge`
- `@lifeos/personality`
- `@lifeos/orchestrator`
- `@lifeos/sync-core`

Runtime modules:

- baseline modules load by default: `scheduler`, `notes`, `calendar`, plus orchestrator-backed `personality` and `briefing`
- optional modules can be enabled per node: `research`, `weather`, `news`, `health`, `google-bridge`
- use `lifeos module list`, `lifeos module enable <name>`, and `lifeos module disable <name>`
- `google-bridge` supports feature-level toggles: `lifeos module enable google-bridge --sub calendar,tasks`
- authorize Google access once: `lifeos module authorize google-bridge`
- `reminder` listens to overdue tick/task events and creates follow-up plans
- `calendar` persists voice-driven events to `calendarEvents`
- `scheduler` applies overdue reschedule suggestions
- `research`, `notes`, `weather`, and `news` handle voice-first daily assistant flows
- `sync-core` mirrors life-event deltas across paired devices (local-first)
- `orchestrator` builds contextual memory, proactive suggestions, and daily briefings

Module contract layers:

- `lifeos.json`: distribution/security/trust contract for certification and loading policy
- runtime manifest (`manifest.ts` and compiled runtime manifest consumed by loader): runtime capability contract

## Works with LifeOS

Modules that follow the official spec get this badge:

![Works with LifeOS](docs/badges/works-with-lifeos.svg)

Compatibility checklist and CI profile:

- [Works with LifeOS Checklist](docs/community/works-with-lifeos-checklist.md)
- [External Module CI Example](templates/module/community-module-ci.yml)

## Good First Issues

New to LifeOS? Start with one of these:

- 🐛 [Browse good first issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  — bug fixes and small improvements to existing loop-stage CLI commands
- 📦 [Submit a community module](docs/community/works-with-lifeos-checklist.md)
  — build a module that improves one loop stage using only `@lifeos/module-sdk`

Good first issues are a good fit when they:

- improve one loop stage or one platform foundation area
- have a clear user-visible outcome or docs gap to close
- avoid broad architecture changes or cross-repo coordination
- can be validated with a focused command, test, or docs update

Recommended first contribution paths:

- docs and onboarding: tighten `README.md`, `docs/SETUP.md`, or command help for first-run clarity
- core loop CLI: improve `lifeos capture`, `lifeos inbox`, `lifeos remind`, or `lifeos review` behavior and evidence
- community modules: add or refine a small local-first module with the marketplace checklist

Before opening a PR, read [CONTRIBUTING.md](CONTRIBUTING.md) and state which loop stage your change improves. If you are proposing a new feature instead of implementing one, use the [feature request form](.github/ISSUE_TEMPLATE/feature_request.yml).

If you want a lightweight map of where contributions are most useful, start with [docs/community/contributor-map.md](docs/community/contributor-map.md).

Contribution scope: work should improve one loop stage (capture, inbox, plan, reminders, review) or the platform foundation. PRs that add breadth without improving loop reliability will be deferred to Phase 4.

## Project Direction

LifeOS is in **Phase 3: Personal Operations OS MVP + Daily-Use Validation**.

Current focus:

- ship one dependable daily hero loop (capture -> triage -> plan -> execute -> review)
- stabilize cross-surface contracts used by CLI, web, and mobile
- instrument and dogfood the hero loop with observable CI/runtime evidence
- keep onboarding fast and opinionated for first-run success

Next direction:

- richer module ecosystem once the hero loop is stable
- multi-node/federated personal AI patterns in later roadmap phases

## Release Highlights (v0.3.x)

- Mesh runtime keeps existing delegation routing and adds leader lease election with deterministic failover.
- Marketplace discovery supports multi-source aggregation with trust verification (`strict|warn|off`) and per-source transparency in CLI output.
- Module loader now enforces heap-pressure resource budgets before module init (`strict` in production, `warn` in development, `off` by explicit override).
- Backward compatibility is preserved for existing CLI command names and `community-modules.json` module entry shape.

See [CHANGELOG.md](CHANGELOG.md) for versioned release details.

## Contributing

Contributors are welcome across systems, backend, modules, docs, and UX.

Start here:

- [Current Product Contract](docs/product/current-product-contract.md)
- [Current System Boundary](docs/architecture/current-system-boundary.md)
- [Setup Guide](docs/SETUP.md)
- [Docs Index](docs/README.md)
- [Phase 1 Landing Page](docs/phase-1/README.md)
- [Goal Interpreter CLI Demo](docs/phase-1/goal-interpreter-cli-demo.md)
- [Reference Architecture](docs/phase-1/reference-architecture.md)
- [Mesh Protocol v1 Contract](docs/architecture/mesh-protocol-v1.md)
- [Marketplace Trust Contract v1](docs/architecture/marketplace-trust-contract-v1.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Release Policy](docs/community/release-policy.md)
- [Changelog](CHANGELOG.md)
- [Test Taxonomy](docs/testing/test-taxonomy.md)
- [Roadmap](docs/vision/roadmap.md)
- [Module Manifest Spec](docs/module-spec/lifeos-manifest.md)
- [Contributor Map](docs/community/contributor-map.md)

Community launch docs:

- [Phase 1 MVP North Star Issue Draft](docs/community/phase-1-mvp-north-star-issue.md)
- [v0.1.0 Launch Thread Draft](docs/community/v0.1.0-launch-thread.md)
- [v0.2.0 Ecosystem North Star Issue Draft](docs/community/v0.2.0-ecosystem-north-star-issue.md)
- [v0.2.0 Launch Thread Draft](docs/community/v0.2.0-launch-thread.md)

## License

See [LICENSE](LICENSE).
