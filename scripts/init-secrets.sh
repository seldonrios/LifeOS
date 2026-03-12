#!/usr/bin/env bash
set -euo pipefail

mkdir -p .secrets

MASTER_KEY="$(openssl rand -base64 32)"
printf '%s\n' "${MASTER_KEY}" > .secrets/master.key
chmod 600 .secrets/master.key

cat > .secrets/postgres-roles.env <<EOF
LIFEOS_GOAL_ENGINE_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_APPROVAL_WORKFLOW_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_EVENT_STORE_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_AUTH_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_SECRETS_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_SERVICE_CATALOG_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_FEATURE_FLAGS_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_SCHEDULER_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_OBSERVABILITY_DB_PASSWORD=$(openssl rand -hex 24)
LIFEOS_LIFE_GRAPH_REL_DB_PASSWORD=$(openssl rand -hex 24)
EOF
chmod 600 .secrets/postgres-roles.env

cat > .env.example <<'EOF'
POSTGRES_USER=lifeos
POSTGRES_PASSWORD=CHANGEME
POSTGRES_DB=lifeos
NEO4J_AUTH=neo4j/CHANGEME
NATS_URL=nats://nats:4222
LIFEOS_GOAL_ENGINE_DB_PASSWORD=CHANGEME
LIFEOS_APPROVAL_WORKFLOW_DB_PASSWORD=CHANGEME
LIFEOS_EVENT_STORE_DB_PASSWORD=CHANGEME
LIFEOS_AUTH_DB_PASSWORD=CHANGEME
LIFEOS_SECRETS_DB_PASSWORD=CHANGEME
LIFEOS_SERVICE_CATALOG_DB_PASSWORD=CHANGEME
LIFEOS_FEATURE_FLAGS_DB_PASSWORD=CHANGEME
LIFEOS_SCHEDULER_DB_PASSWORD=CHANGEME
LIFEOS_OBSERVABILITY_DB_PASSWORD=CHANGEME
LIFEOS_LIFE_GRAPH_REL_DB_PASSWORD=CHANGEME
GRAFANA_ADMIN_PASSWORD=CHANGEME

# NATS NKey/JWT Auth
# Populated by scripts/provision-nats-identities.sh
NATS_OPERATOR_JWT=CHANGEME
NATS_ACCOUNT_JWT=CHANGEME
NATS_CREDS_DIR=.nats/creds
EOF

echo "Bootstrap secrets generated."
echo "Next steps:"
echo "  1) cp .env.example .env"
echo "  2) Fill in all CHANGEME values"
echo "  3) Source .secrets/postgres-roles.env when needed"