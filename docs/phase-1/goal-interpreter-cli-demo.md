# Goal Interpreter CLI Demo (MVP #1)

## Purpose

Show the fastest path to run the current Goal Interpreter + Life Graph MVP locally and verify it is working.

## Current MVP Boundary

This demo is currently **CLI-only**.

- no Docker profile is required
- no `module-loader` wiring is required
- no service log tailing is required

The command runs a local model through Ollama, prints a structured plan, and writes the result to a local JSON life graph.

## Prerequisites

- Node.js >= 20
- pnpm >= 9.15.4
- Ollama installed and available in your shell

## Run The Demo

From the repository root:

1. Install dependencies (once):

```powershell
pnpm install
```

2. Start Ollama:

```powershell
ollama serve
```

3. Pull the default model (once):

```powershell
ollama pull llama3.1:8b
```

4. Run a goal decomposition:

```powershell
pnpm lifeos goal "Help me prepare for the quarterly board meeting next Thursday"
```

5. Verify persisted output:

```powershell
Get-Content .\.lifeos\life-graph.json
```

## Useful Flags

- JSON output:

```powershell
pnpm lifeos goal "..." --json
```

- Skip persistence:

```powershell
pnpm lifeos goal "..." --no-save
```

- Override model:

```powershell
pnpm lifeos goal "..." --model qwen2.5:7b
```

- Override graph path:

```powershell
pnpm lifeos goal "..." --graph-path .\tmp\life-graph.json
```

- Safe diagnostics:

```powershell
pnpm lifeos goal "..." --verbose
```

## Environment Overrides

- `LIFEOS_GOAL_MODEL`: default model name used by the CLI
- `OLLAMA_HOST`: remote Ollama endpoint, for example `http://192.168.1.20:11434`

Example:

```powershell
$env:OLLAMA_HOST="http://192.168.1.20:11434"
pnpm lifeos goal "Plan my next 2 weeks"
```

## Help And Global Command

- Show CLI help:

```powershell
pnpm lifeos --help
pnpm lifeos goal --help
```

- Test global command locally:

```powershell
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
