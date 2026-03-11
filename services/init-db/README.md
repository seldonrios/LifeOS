# init-db

This bootstrap service is intentionally one-shot.

Contract:

- Runs with the official `postgres:16-alpine` image (no local Dockerfile).
- Executes `scripts/init-postgres.sh` through the mounted `/scripts` volume.
- Starts only after `postgres` is healthy.
- Must complete successfully before Postgres-dependent app services start.
