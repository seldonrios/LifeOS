# LifeOS

> 🚀 A local-first personal AI node for turning goals into executable plans.

LifeOS is an open-source project focused on **user-owned AI systems** that run on your machine, keep your data local by default, and coordinate work through a persistent life graph + event-driven modules.

## 👋 Welcome

If you are new here, start with the CLI MVP.  
You can go from clone to first working plan in a few minutes.

## ⚡ Quick Start (CLI MVP)

### 1) Install dependencies

```powershell
pnpm install
```

### 2) Start Ollama

```powershell
ollama serve
```

### 3) Pull the default model (first time only)

```powershell
ollama pull llama3.1:8b
```

### 4) Verify CLI

```powershell
pnpm lifeos --version
```

### 5) Run the one-command demo

```powershell
pnpm lifeos demo
```

### 6) Explore the graph

```powershell
pnpm lifeos status
pnpm lifeos task list
pnpm lifeos modules
```

## 🧪 Demo Flow (Manual)

```powershell
pnpm lifeos goal "Help me prepare for the quarterly board meeting next Thursday"
pnpm lifeos review --period weekly
pnpm lifeos next
pnpm lifeos tick
pnpm lifeos status --json
```

## 🛠 CLI Commands

```text
lifeos goal "<goal>" [--json] [--no-save] [--model <model>] [--graph-path <path>] [--verbose]
lifeos demo [--goal <goal>] [--model <model>] [--graph-path <path>] [--verbose]
lifeos status [--json] [--graph-path <path>] [--verbose]
lifeos review [--period daily|weekly] [--json] [--graph-path <path>] [--verbose]
lifeos task [list|complete|next] [id] [--json] [--graph-path <path>] [--verbose]
lifeos next [--json] [--graph-path <path>] [--verbose]
lifeos tick [--json] [--graph-path <path>] [--verbose]
lifeos modules [list|load] [id]
lifeos events listen [--topic "lifeos.>"] [--json] [--verbose]
```

## ⚙️ Configuration

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

## 📦 Docker (Optional)

For external event streaming with NATS:

```powershell
docker compose up -d nats
pnpm lifeos events listen --topic "lifeos.>"
```

For local inference + NATS:

```powershell
docker compose up -d ollama nats
```

If NATS is unavailable, LifeOS falls back to an in-memory event bus so local module reactions still work.

## 🌱 Current MVP Scope

Active implementation packages:

- `@lifeos/cli`
- `@lifeos/goal-engine`
- `@lifeos/life-graph`
- `@lifeos/event-bus`
- `@lifeos/module-loader`
- `@lifeos/reminder-module`

First runtime module:

- `reminder` listens to overdue tick/task events
- creates follow-up reminder plans automatically
- emits `lifeos.reminder.followup.created`

## 🧭 Project Direction

LifeOS is currently **docs-first + working CLI MVP**.

Short-term focus:

- make single-node workflows solid and fast
- strengthen life graph quality and schema safety
- improve module ecosystem and event-driven automation

Long-term direction:

- richer module ecosystem (health, finance, calendar, voice)
- multi-node/federated personal AI patterns

## 🤝 Contributing

Contributors are welcome across systems, backend, modules, docs, and UX.

Start here:

- [Setup Guide](docs/SETUP.md)
- [Docs Index](docs/README.md)
- [Phase 1 Landing Page](docs/phase-1/README.md)
- [Goal Interpreter CLI Demo](docs/phase-1/goal-interpreter-cli-demo.md)
- [Reference Architecture](docs/phase-1/reference-architecture.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Contributor Map](docs/community/contributor-map.md)

Community launch docs:

- [Phase 1 MVP North Star Issue Draft](docs/community/phase-1-mvp-north-star-issue.md)
- [v0.1.0 Launch Thread Draft](docs/community/v0.1.0-launch-thread.md)

## 📄 License

See [LICENSE](LICENSE).
