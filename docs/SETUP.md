# Setup

This guide gets a LifeOS development environment running and validates that it is healthy before you start contributing.

## Prerequisites

- Node.js >= 20
- pnpm >= 9.15.4 (matches the root packageManager pin)
- Python >= 3.11
- uv
- Docker Desktop or Docker Engine
- Git

## Primary Path - Dev Container (Recommended)

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

This command must exit 0. It runs build:modules -> typecheck -> lint -> format:check -> test. The first `build:modules` step is the precompile gate for light modules because typecheck and lint depend on compiled dist output, and the runtime loader reads `modules/<name>/dist/manifest.js` rather than source `manifest.ts` files.

5. Copy `.env.example` to `.env` and populate required secrets.
6. Start the platform stack.

```bash
docker compose up
```

7. Confirm `init-db` completes before app services continue.

`init-db` requires bash and runs on `postgres:16` (Debian). If it exits immediately, run `docker compose logs init-db` to see the error. See `services/init-db/README.md` for the full diagnostic checklist.

8. Confirm startup diagnostics are emitted by a running service.

```bash
docker compose logs module-loader | grep "Startup Diagnostics Report"
```

9. Continue only when the Ready to Contribute signal is met.

## Alternate Path - Native Install

1. Install prerequisites locally: Node.js >= 20, pnpm >= 9.15.4, Python >= 3.11, uv, Docker, Git.
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

```bash
scripts/init-secrets.sh
```

6. Validate the workspace.

```bash
pnpm run validate
```

This runs build:modules -> typecheck -> lint -> format:check -> test. The first `build:modules` phase must succeed before typecheck and lint can resolve light-module dist artifacts, and before the module loader can discover light modules from `modules/<name>/dist/manifest.js`.

7. Start services.

```bash
docker compose up
```

8. Confirm `init-db` completion and startup diagnostics output from running application services before development work.

## Ready to Contribute Signal

Use this checklist before opening a PR:

- `pnpm run validate` exits 0
- `docker compose up` runs `init-db` to completion (`service_completed_successfully`)
- All 16 long-running services start without crash-looping
- Startup diagnostics report is emitted

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `init-db` exits non-zero | `postgres` is not yet healthy | Wait for `pg_isready` healthcheck and verify `POSTGRES_USER` and `POSTGRES_DB` in `.env` |
| Missing secrets error on service start | `.env` is not populated | Copy `.env.example` to `.env` and run `scripts/init-secrets.sh` |
| NATS auth failure | NKey credentials were not provisioned | Run `scripts/provision-nats-identities.sh` |
| Port conflict on 5432/4222/3000/7474 | Another process is holding the port | Stop the conflicting process or remap ports in `docker-compose.yml` |
| `init-db` exits immediately with `exec format error` or `/usr/bin/env: bash: not found` | `init-db` image was changed to an Alpine variant that lacks bash | Restore `image: postgres:16` (Debian) for the `init-db` service in `docker-compose.yml`; run `docker compose pull init-db && docker compose up init-db` |
| `pnpm run validate` fails on typecheck | Dependencies are missing | Run `pnpm install` first |
