# init-db

This bootstrap service is intentionally one-shot.

## Schema-per-service ownership model

Each application schema is created and owned by the Postgres superuser identified by `POSTGRES_USER`. Service roles are granted access to their schema; they do not own the schema and they do not run DDL.

This split is deliberate:

- Migrations run as the superuser so schema changes can be applied without granting each service role broader DDL capabilities.
- Application roles only need data-plane access for normal operation.
- Keeping ownership centralized avoids privilege escalation paths where a service account could change schema objects or grant itself additional access.

In practice, the bootstrap creates a schema per service and grants each service role the privileges it needs for DML, while ownership remains with the migration runner.

## Why `ALTER DEFAULT PRIVILEGES` is needed

`GRANT ... ON ALL TABLES IN SCHEMA ...` is a point-in-time grant. It applies only to tables that already exist when the command runs during bootstrap.

That means a later migration that creates a new table would not automatically make that table visible to the service role. Without an additional step, developers would need to re-run manual grants after every migration that introduces new tables or sequences.

`ALTER DEFAULT PRIVILEGES FOR ROLE <superuser> IN SCHEMA <schema>` fixes that. It instructs Postgres to automatically apply the configured grants to every future table or sequence created by that role in that schema.

Because migrations run as `POSTGRES_USER`, the default privilege rule must be scoped with `FOR ROLE <superuser>` matching that migration runner role.

## The `public` schema

No application tables are created in `public`.

The `public` schema is reserved for Postgres extensions only, such as `pgcrypto`. Application code must always use schema-qualified names when referring to tables. For example, use `secrets.secret_entries`, not `secret_entries`.

This keeps application data isolated by service boundary and avoids ambiguous lookups through the default search path.

## How to verify grants after bootstrap

To inspect the configured default privileges for future tables and sequences, run:

```sql
SELECT n.nspname AS schema,
	   r.rolname AS defaclrole,
	   pg_catalog.array_to_string(d.defaclacl, ', ') AS acl
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
JOIN pg_roles r ON r.oid = d.defaclrole
ORDER BY schema;
```

To inspect current table grants that already exist in the database, run:

```sql
SELECT grantee, table_schema, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, grantee;
```

Together, these queries show both sides of the privilege model:

- The current grants on tables that already exist.
- The default grants that will be applied to future objects created by migrations.

## Bootstrap ordering contract

- Runs with the official `postgres:16-alpine` image with no local Dockerfile.
- Executes `scripts/init-postgres.sh` through the mounted `/scripts` volume.
- Starts only after `postgres` is healthy.
- Must complete successfully before Postgres-dependent app services start.
- Uses a one-shot bootstrap pattern with Compose dependencies such as `service_completed_successfully`.
- Is safe to re-run because the schema creation, role creation, grants, and default privilege configuration are all idempotent.
