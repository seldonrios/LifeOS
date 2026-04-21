> **Status: current implementation guide**
> This document describes a working CLI demo that is part of the current implementation.
> For the active MVP contract, see [`docs/product/current-product-contract.md`](../product/current-product-contract.md).

# Goal Interpreter CLI Demo (MVP #1)

## Purpose

Show the fastest path to run the current Goal Interpreter + Life Graph MVP locally and verify it is working.

## Current MVP Boundary

This demo is currently **CLI-only**.

- no Docker profile is required
- no `module-loader` wiring is required
- no service log tailing is required

The command runs a local model through Ollama, prints a structured plan, and writes the result to a local versioned JSON life graph.

You can also run a full end-to-end walkthrough with:

```bash
pnpm lifeos demo
```

## Shell Support

Most commands in this guide are identical on Linux/macOS and PowerShell.
Linux/macOS examples use `bash` syntax. PowerShell-specific equivalents are shown where command syntax differs.

## Prerequisites

- Node.js >= 20.19.0
- pnpm >= 9.15.4
- Ollama installed and available in your shell

## Run The Demo

From the repository root:

Recommended first-run path:

```bash
pnpm lifeos init
```

The wizard validates Ollama, helps with local model setup, and seeds your first goal. If you prefer the manual flow, use the steps below.

1. Install dependencies (once):

```bash
pnpm install
```

2. Start Ollama:

```bash
ollama serve
```

3. Pull the default model (once):

```bash
ollama pull llama3.1:8b
```

4. Run a goal decomposition:

```bash
pnpm lifeos goal "Help me prepare for the quarterly board meeting next Thursday"
```

Optional one-command walkthrough:

```bash
pnpm lifeos demo
```

5. Verify persisted output:

**Linux/macOS (bash/zsh)**

```bash
cat ./.lifeos/life-graph.json
```

**PowerShell**

```powershell
Get-Content .\.lifeos\life-graph.json
```

6. Check graph status:

```bash
pnpm lifeos status
pnpm lifeos status --json
pnpm lifeos review --period weekly
pnpm lifeos task list
pnpm lifeos task complete <task-id-prefix>
pnpm lifeos next
pnpm lifeos tick
pnpm lifeos modules
pnpm lifeos events listen --topic "lifeos.>"
```

## Useful Flags

- JSON output:

```bash
pnpm lifeos goal "..." --json
```

Note: `goal --json` prints the normalized plan only. Use `status --json` for status summary JSON and `review --json` for insights JSON.

- Skip persistence:

```bash
pnpm lifeos goal "..." --no-save
```

- Override model:

```bash
pnpm lifeos goal "..." --model qwen2.5:7b
```

- Override graph path:

```bash
pnpm lifeos goal "..." --graph-path ./tmp/life-graph.json
```

- Safe diagnostics:

```bash
pnpm lifeos goal "..." --verbose
```

- Review insights:

```bash
pnpm lifeos review --period weekly
pnpm lifeos review --period daily --json
```

- Task operations:

```bash
pnpm lifeos task list
pnpm lifeos task list --json
pnpm lifeos task complete <task-id-prefix>
pnpm lifeos task next
pnpm lifeos next
```

- Deadline tick:

```bash
pnpm lifeos tick
pnpm lifeos tick --json
```

- Event stream listener:

```bash
pnpm lifeos events listen --topic "lifeos.>"
pnpm lifeos events listen --topic "lifeos.tick.overdue" --json
```

- Modules:

```bash
pnpm lifeos modules
pnpm lifeos modules load reminder
```

## Environment Overrides

- `LIFEOS_GOAL_MODEL`: default model name used by the CLI
- `OLLAMA_HOST`: remote Ollama endpoint, for example `http://192.168.1.20:11434`
- `LIFEOS_NATS_URL`: NATS endpoint for event publish/listen, default `nats://127.0.0.1:4222`

If NATS is unavailable, the CLI automatically falls back to an in-memory event bus for local module reactions.

Example:

**Linux/macOS (bash/zsh)**

```bash
export OLLAMA_HOST="http://192.168.1.20:11434"
pnpm lifeos goal "Plan my next 2 weeks"
```

**PowerShell**

```powershell
$env:OLLAMA_HOST="http://192.168.1.20:11434"
pnpm lifeos goal "Plan my next 2 weeks"
```

## Help And Global Command

- Show CLI help:

```bash
pnpm lifeos --help
pnpm lifeos goal --help
pnpm lifeos status --help
pnpm lifeos review --help
pnpm lifeos task --help
pnpm lifeos tick --help
pnpm lifeos modules --help
pnpm lifeos events --help
pnpm lifeos events listen --help
```

- Test global command locally:

```bash
pnpm --filter @lifeos/cli run build
pnpm --filter @lifeos/cli link --global
lifeos goal "Plan my next 2 weeks"
```

## Troubleshooting

- `Error: fetch failed`
  - Ollama is not reachable. Start `ollama serve` or set `OLLAMA_HOST` correctly.
- model not found
  - Pull the requested model first (`ollama pull <model>`).
- command usage printed unexpectedly
  - Ensure the command starts with `goal`, for example:
    - `pnpm lifeos goal "..."`.
