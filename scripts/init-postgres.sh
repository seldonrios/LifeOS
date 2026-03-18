#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:=lifeos}"

# Role passwords
: "${LIFEOS_GOAL_ENGINE_DB_PASSWORD:?LIFEOS_GOAL_ENGINE_DB_PASSWORD is required}"
: "${LIFEOS_APPROVAL_WORKFLOW_DB_PASSWORD:?LIFEOS_APPROVAL_WORKFLOW_DB_PASSWORD is required}"
: "${LIFEOS_EVENT_STORE_DB_PASSWORD:?LIFEOS_EVENT_STORE_DB_PASSWORD is required}"
: "${LIFEOS_AUTH_DB_PASSWORD:?LIFEOS_AUTH_DB_PASSWORD is required}"
: "${LIFEOS_SECRETS_DB_PASSWORD:?LIFEOS_SECRETS_DB_PASSWORD is required}"
: "${LIFEOS_SERVICE_CATALOG_DB_PASSWORD:?LIFEOS_SERVICE_CATALOG_DB_PASSWORD is required}"
: "${LIFEOS_FEATURE_FLAGS_DB_PASSWORD:?LIFEOS_FEATURE_FLAGS_DB_PASSWORD is required}"
: "${LIFEOS_SCHEDULER_DB_PASSWORD:?LIFEOS_SCHEDULER_DB_PASSWORD is required}"
: "${LIFEOS_OBSERVABILITY_DB_PASSWORD:?LIFEOS_OBSERVABILITY_DB_PASSWORD is required}"
: "${LIFEOS_LIFE_GRAPH_REL_DB_PASSWORD:?LIFEOS_LIFE_GRAPH_REL_DB_PASSWORD is required}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
PSQL=(psql -h postgres -U "${POSTGRES_USER}" -v ON_ERROR_STOP=1)

# Create DB idempotently.
"${PSQL[@]}" -d postgres <<SQL
SELECT 'CREATE DATABASE ' || quote_ident('${POSTGRES_DB}')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'
)\gexec
SQL

"${PSQL[@]}" -d "${POSTGRES_DB}" <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE SCHEMA IF NOT EXISTS goal_engine;
CREATE SCHEMA IF NOT EXISTS approval_workflow;
CREATE SCHEMA IF NOT EXISTS event_store;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS secrets;
CREATE SCHEMA IF NOT EXISTS service_catalog;
CREATE SCHEMA IF NOT EXISTS feature_flags;
CREATE SCHEMA IF NOT EXISTS scheduler;
CREATE SCHEMA IF NOT EXISTS observability;
CREATE SCHEMA IF NOT EXISTS life_graph_rel;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_goal_engine_rw') THEN
    CREATE ROLE lifeos_goal_engine_rw LOGIN PASSWORD '${LIFEOS_GOAL_ENGINE_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_approval_workflow_rw') THEN
    CREATE ROLE lifeos_approval_workflow_rw LOGIN PASSWORD '${LIFEOS_APPROVAL_WORKFLOW_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_event_store_rw') THEN
    CREATE ROLE lifeos_event_store_rw LOGIN PASSWORD '${LIFEOS_EVENT_STORE_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_auth_rw') THEN
    CREATE ROLE lifeos_auth_rw LOGIN PASSWORD '${LIFEOS_AUTH_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_secrets_rw') THEN
    CREATE ROLE lifeos_secrets_rw LOGIN PASSWORD '${LIFEOS_SECRETS_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_catalog_rw') THEN
    CREATE ROLE lifeos_catalog_rw LOGIN PASSWORD '${LIFEOS_SERVICE_CATALOG_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_feature_flags_rw') THEN
    CREATE ROLE lifeos_feature_flags_rw LOGIN PASSWORD '${LIFEOS_FEATURE_FLAGS_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_scheduler_rw') THEN
    CREATE ROLE lifeos_scheduler_rw LOGIN PASSWORD '${LIFEOS_SCHEDULER_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_observability_rw') THEN
    CREATE ROLE lifeos_observability_rw LOGIN PASSWORD '${LIFEOS_OBSERVABILITY_DB_PASSWORD}';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_life_graph_rel_rw') THEN
    CREATE ROLE lifeos_life_graph_rel_rw LOGIN PASSWORD '${LIFEOS_LIFE_GRAPH_REL_DB_PASSWORD}';
  END IF;
END
\$\$;

-- Privilege model:
-- 1. GRANT ... ON ALL TABLES applies only to objects that already exist at bootstrap time.
-- 2. ALTER DEFAULT PRIVILEGES applies the same access rules to tables and sequences created later by migrations.
-- 3. FOR ROLE ${POSTGRES_USER} must match the role that runs CREATE TABLE, which is the superuser-backed migration runner here.
-- 4. Re-running these ALTER DEFAULT PRIVILEGES statements is safe because the resulting default ACL state is idempotent.

GRANT USAGE ON SCHEMA goal_engine TO lifeos_goal_engine_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA goal_engine TO lifeos_goal_engine_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA goal_engine
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_goal_engine_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA goal_engine
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_goal_engine_rw;

GRANT USAGE ON SCHEMA approval_workflow TO lifeos_approval_workflow_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA approval_workflow TO lifeos_approval_workflow_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA approval_workflow
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_approval_workflow_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA approval_workflow
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_approval_workflow_rw;

GRANT USAGE ON SCHEMA event_store TO lifeos_event_store_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA event_store TO lifeos_event_store_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA event_store
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_event_store_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA event_store
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_event_store_rw;

GRANT USAGE ON SCHEMA auth TO lifeos_auth_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO lifeos_auth_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_auth_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA auth
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_auth_rw;

GRANT USAGE ON SCHEMA secrets TO lifeos_secrets_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA secrets TO lifeos_secrets_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA secrets
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_secrets_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA secrets
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_secrets_rw;

GRANT USAGE ON SCHEMA service_catalog TO lifeos_catalog_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA service_catalog TO lifeos_catalog_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA service_catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_catalog_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA service_catalog
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_catalog_rw;

GRANT USAGE ON SCHEMA feature_flags TO lifeos_feature_flags_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA feature_flags TO lifeos_feature_flags_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA feature_flags
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_feature_flags_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA feature_flags
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_feature_flags_rw;

GRANT USAGE ON SCHEMA scheduler TO lifeos_scheduler_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA scheduler TO lifeos_scheduler_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA scheduler
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_scheduler_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA scheduler
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_scheduler_rw;

GRANT USAGE ON SCHEMA observability TO lifeos_observability_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA observability TO lifeos_observability_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA observability
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_observability_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA observability
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_observability_rw;

GRANT USAGE ON SCHEMA life_graph_rel TO lifeos_life_graph_rel_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA life_graph_rel TO lifeos_life_graph_rel_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA life_graph_rel
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifeos_life_graph_rel_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA life_graph_rel
  GRANT USAGE, SELECT ON SEQUENCES TO lifeos_life_graph_rel_rw;
SQL

echo "Default Privileges Verification"
"${PSQL[@]}" -d "${POSTGRES_DB}" <<SQL
WITH expected_pairs(schema_name, service_role) AS (
  VALUES
    ('approval_workflow', 'lifeos_approval_workflow_rw'),
    ('auth', 'lifeos_auth_rw'),
    ('event_store', 'lifeos_event_store_rw'),
    ('feature_flags', 'lifeos_feature_flags_rw'),
    ('goal_engine', 'lifeos_goal_engine_rw'),
    ('life_graph_rel', 'lifeos_life_graph_rel_rw'),
    ('observability', 'lifeos_observability_rw'),
    ('scheduler', 'lifeos_scheduler_rw'),
    ('secrets', 'lifeos_secrets_rw'),
    ('service_catalog', 'lifeos_catalog_rw')
),
actual_defaults AS (
  SELECT n.nspname AS schema_name,
         grantee.rolname AS service_role,
         COUNT(DISTINCT exploded.privilege_type) FILTER (
           WHERE d.defaclobjtype = 'r'
             AND exploded.privilege_type IN ('DELETE', 'INSERT', 'SELECT', 'UPDATE')
         ) AS table_privilege_count,
         COUNT(DISTINCT exploded.privilege_type) FILTER (
           WHERE d.defaclobjtype = 'S'
             AND exploded.privilege_type IN ('SELECT', 'USAGE')
         ) AS sequence_privilege_count
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  JOIN pg_roles definer ON definer.oid = d.defaclrole
  JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS exploded ON TRUE
  JOIN pg_roles grantee ON grantee.oid = exploded.grantee
  WHERE definer.rolname = '${POSTGRES_USER}'
  GROUP BY n.nspname, grantee.rolname
)
SELECT e.schema_name AS schema,
       e.service_role,
       CASE WHEN COALESCE(a.table_privilege_count, 0) = 4 THEN 'ok' ELSE 'missing' END AS table_defaults,
       CASE WHEN COALESCE(a.sequence_privilege_count, 0) = 2 THEN 'ok' ELSE 'missing' END AS sequence_defaults,
       CASE
         WHEN COALESCE(a.table_privilege_count, 0) = 4
          AND COALESCE(a.sequence_privilege_count, 0) = 2 THEN 'ok'
         ELSE 'missing required default privileges'
       END AS status
FROM expected_pairs e
LEFT JOIN actual_defaults a
  ON a.schema_name = e.schema_name
 AND a.service_role = e.service_role
ORDER BY e.schema_name, e.service_role;
SQL
echo "End Default Privileges Verification"

missing_default_privileges="$(${PSQL[@]} -d "${POSTGRES_DB}" -tA <<SQL
WITH expected_pairs(schema_name, service_role) AS (
  VALUES
    ('approval_workflow', 'lifeos_approval_workflow_rw'),
    ('auth', 'lifeos_auth_rw'),
    ('event_store', 'lifeos_event_store_rw'),
    ('feature_flags', 'lifeos_feature_flags_rw'),
    ('goal_engine', 'lifeos_goal_engine_rw'),
    ('life_graph_rel', 'lifeos_life_graph_rel_rw'),
    ('observability', 'lifeos_observability_rw'),
    ('scheduler', 'lifeos_scheduler_rw'),
    ('secrets', 'lifeos_secrets_rw'),
    ('service_catalog', 'lifeos_catalog_rw')
),
actual_defaults AS (
  SELECT n.nspname AS schema_name,
         grantee.rolname AS service_role,
         COUNT(DISTINCT exploded.privilege_type) FILTER (
           WHERE d.defaclobjtype = 'r'
             AND exploded.privilege_type IN ('DELETE', 'INSERT', 'SELECT', 'UPDATE')
         ) AS table_privilege_count,
         COUNT(DISTINCT exploded.privilege_type) FILTER (
           WHERE d.defaclobjtype = 'S'
             AND exploded.privilege_type IN ('SELECT', 'USAGE')
         ) AS sequence_privilege_count
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  JOIN pg_roles definer ON definer.oid = d.defaclrole
  JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS exploded ON TRUE
  JOIN pg_roles grantee ON grantee.oid = exploded.grantee
  WHERE definer.rolname = '${POSTGRES_USER}'
  GROUP BY n.nspname, grantee.rolname
)
SELECT COUNT(*)
FROM expected_pairs e
LEFT JOIN actual_defaults a
  ON a.schema_name = e.schema_name
 AND a.service_role = e.service_role
WHERE COALESCE(a.table_privilege_count, 0) <> 4
   OR COALESCE(a.sequence_privilege_count, 0) <> 2;
SQL
)"

if [[ "${missing_default_privileges}" != "0" ]]; then
  echo "Default privilege verification failed: ${missing_default_privileges} schema/service-role pair(s) are missing required table or sequence defaults." >&2
  exit 1
fi

echo "Postgres bootstrap complete: database, schemas, roles, and grants are configured."