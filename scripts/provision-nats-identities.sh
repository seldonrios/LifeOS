#!/usr/bin/env bash
set -euo pipefail

MODE="reconcile"
TARGET=""
CONFIRM="false"

OPERATOR_NAME="lifeos-operator"
ACCOUNT_NAME="lifeos"
NSC_HOME=".nats/nsc"
NATS_CREDS_DIR=".nats/creds"
NATS_RESOLVER_DIR=".nats/resolver"
NATS_ACCOUNTS_DIR=".nats/accounts"
NATS_OPERATOR_JWT_FILE="${NATS_RESOLVER_DIR}/${OPERATOR_NAME}.jwt"
NATS_ACCOUNT_JWT_FILE="${NATS_ACCOUNTS_DIR}/${ACCOUNT_NAME}.jwt"

declare -a SERVICES=(
  "reasoning-service"
  "goal-engine-service"
  "agent-mesh-service"
  "simulation-service"
  "dashboard"
  "auth-service"
  "secrets-service"
  "service-catalog"
  "feature-flag-service"
  "otel-collector"
  "tempo"
  "grafana"
  "life-graph-db"
  "postgres"
  "opa"
  "nats"
)

declare -A PUB_SUBJECTS=(
  ["reasoning-service"]="reasoning.*"
  ["goal-engine-service"]="goal.*,task.*,plan.*"
  ["agent-mesh-service"]="agent.*"
  ["simulation-service"]="simulation.*"
  ["dashboard"]="dashboard.*"
  ["auth-service"]="auth.*"
  ["secrets-service"]="secrets.*"
  ["service-catalog"]="catalog.*"
  ["feature-flag-service"]="flags.*"
  ["otel-collector"]="telemetry.*"
  ["tempo"]="tempo.*"
  ["grafana"]="grafana.*"
  ["life-graph-db"]="graph.*"
  ["postgres"]="db.*"
  ["opa"]="policy.*"
  ["nats"]=""
)

declare -A SUB_SUBJECTS=(
  ["reasoning-service"]="event.*,goal.*"
  ["goal-engine-service"]="event.*"
  ["agent-mesh-service"]="goal.*,event.*,task.*"
  ["simulation-service"]="goal.*,event.*"
  ["dashboard"]="goal.*,task.*,event.*"
  ["auth-service"]="event.*"
  ["secrets-service"]="event.*"
  ["service-catalog"]="event.*"
  ["feature-flag-service"]="event.*"
  ["otel-collector"]="event.*"
  ["tempo"]="telemetry.*"
  ["grafana"]="telemetry.*"
  ["life-graph-db"]="event.*,goal.*"
  ["postgres"]="event.*"
  ["opa"]="event.*"
  ["nats"]=""
)

warn() {
  printf '[WARN] %s\n' "$*"
}

ok() {
  printf '[OK] %s\n' "$*"
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  scripts/provision-nats-identities.sh                # reconcile (default)
  scripts/provision-nats-identities.sh --mode reconcile
  scripts/provision-nats-identities.sh check          # validate only
  scripts/provision-nats-identities.sh --mode check   # validate only
  scripts/provision-nats-identities.sh repair         # recreate missing creds
  scripts/provision-nats-identities.sh --mode repair
  scripts/provision-nats-identities.sh rotate --target <id>
  scripts/provision-nats-identities.sh --mode rotate --target <id>
  scripts/provision-nats-identities.sh rotate-all --confirm
  scripts/provision-nats-identities.sh --mode rotate-all --confirm
EOF
}

require_prereqs() {
  if ! command -v nsc >/dev/null 2>&1; then
    cat <<'EOF' >&2
[ERROR] 'nsc' is required but not installed.
Install it with one of the following methods:
  curl -sf https://install.nats.io/nsc | sh
  https://docs.nats.io/running-a-nats-service/configuration/securing_nats/auth_intro/nsc
EOF
    exit 1
  fi

  if ! command -v nats >/dev/null 2>&1; then
    warn "'nats' CLI is not installed. Continuing without CLI-based validation."
  fi
}

parse_args() {
  local mode_set="false"

  set_mode() {
    local candidate="$1"
    case "$candidate" in
      check|repair|rotate|rotate-all|reconcile)
        MODE="$candidate"
        mode_set="true"
        ;;
      *)
        fail "Unknown mode: $candidate"
        ;;
    esac
  }

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        [[ -n "${2:-}" ]] || fail "--mode requires a value"
        set_mode "$2"
        shift 2
        ;;
      check|repair|rotate|rotate-all|reconcile)
        if [[ "$mode_set" == "true" ]]; then
          fail "Mode already set. Provide mode once (positional or --mode)."
        fi
        set_mode "$1"
        shift
        ;;
      --target)
        TARGET="${2:-}"
        shift 2
        ;;
      --confirm)
        CONFIRM="true"
        shift
        ;;
      -h|--help|help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done

  if [[ "$MODE" == "rotate" && -z "$TARGET" ]]; then
    fail "rotate mode requires --target <id>"
  fi

  if [[ "$MODE" == "rotate-all" && "$CONFIRM" != "true" ]]; then
    fail "rotate-all is destructive and requires --confirm"
  fi
}

init_dirs() {
  mkdir -p "$NSC_HOME" "$NATS_CREDS_DIR" "$NATS_RESOLVER_DIR" "$NATS_ACCOUNTS_DIR"
  chmod 700 "$NSC_HOME" "$NATS_CREDS_DIR" "$NATS_RESOLVER_DIR" "$NATS_ACCOUNTS_DIR"
}

operator_exists() {
  nsc describe operator "$OPERATOR_NAME" >/dev/null 2>&1
}

account_exists() {
  nsc describe account "$ACCOUNT_NAME" >/dev/null 2>&1
}

user_exists() {
  local service="$1"
  nsc describe user "$service" --account "$ACCOUNT_NAME" >/dev/null 2>&1
}

account_public_key() {
  nsc describe account "$ACCOUNT_NAME" --field sub 2>/dev/null | tr -d '[:space:]'
}

user_issuer_key() {
  local service="$1"
  nsc describe user "$service" --account "$ACCOUNT_NAME" --field iss 2>/dev/null | tr -d '[:space:]'
}

extract_creds_jwt() {
  local creds_file="$1"
  awk '/BEGIN NATS USER JWT/{getline; print; exit}' "$creds_file"
}

decode_base64url() {
  local raw="$1"
  local normalized
  local pad_len

  normalized="${raw//-/+}"
  normalized="${normalized//_/\/}"
  pad_len=$(( (4 - ${#normalized} % 4) % 4 ))
  if (( pad_len > 0 )); then
    normalized="${normalized}$(printf '=%.0s' $(seq 1 "$pad_len"))"
  fi

  printf '%s' "$normalized" | base64 --decode 2>/dev/null || true
}

issuer_from_creds_file() {
  local creds_file="$1"
  local jwt
  local payload_segment
  local payload_json

  jwt="$(extract_creds_jwt "$creds_file")"
  if [[ -z "$jwt" ]]; then
    printf ''
    return
  fi

  payload_segment="$(printf '%s' "$jwt" | cut -d'.' -f2)"
  payload_json="$(decode_base64url "$payload_segment")"
  printf '%s' "$payload_json" | sed -n 's/.*"iss"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1
}

export_operator_and_account() {
  local op_jwt
  local acct_jwt
  local acct_pub

  op_jwt="$(nsc describe operator "$OPERATOR_NAME" --raw 2>/dev/null | tr -d '\n')"
  [[ -n "$op_jwt" ]] || fail "Failed to export operator JWT"
  printf '%s\n' "$op_jwt" > "$NATS_OPERATOR_JWT_FILE"
  chmod 600 "$NATS_OPERATOR_JWT_FILE"

  acct_pub="$(account_public_key)"
  [[ -n "$acct_pub" ]] || fail "Failed to read account public key"
  acct_jwt="$(nsc describe account "$ACCOUNT_NAME" --raw 2>/dev/null | tr -d '\n')"
  [[ -n "$acct_jwt" ]] || fail "Failed to export account JWT"

  printf '%s\n' "$acct_jwt" > "${NATS_RESOLVER_DIR}/${acct_pub}.jwt"
  chmod 600 "${NATS_RESOLVER_DIR}/${acct_pub}.jwt"
  printf '%s\n' "$acct_jwt" > "$NATS_ACCOUNT_JWT_FILE"
  chmod 600 "$NATS_ACCOUNT_JWT_FILE"

  ok "Exported operator/account JWT artifacts and reconciled resolver state"
}

create_user_with_permissions() {
  local service="$1"
  local pub
  local sub
  local args

  pub="${PUB_SUBJECTS[$service]}"
  sub="${SUB_SUBJECTS[$service]}"

  args=(add user "$service" --account "$ACCOUNT_NAME")
  if [[ -n "$pub" ]]; then
    args+=(--allow-pub "$pub")
  fi
  if [[ -n "$sub" ]]; then
    args+=(--allow-sub "$sub")
  fi

  nsc "${args[@]}" >/dev/null
}

generate_creds_for_user() {
  local service="$1"
  local creds_file="${NATS_CREDS_DIR}/${service}.creds"

  nsc generate creds --account "$ACCOUNT_NAME" --name "$service" > "$creds_file"
  chmod 600 "$creds_file"
}

reconcile_operator_account() {
  if ! operator_exists; then
    nsc add operator "$OPERATOR_NAME" >/dev/null
    ok "Created operator $OPERATOR_NAME"
  fi

  if ! account_exists; then
    nsc add account "$ACCOUNT_NAME" >/dev/null
    ok "Created account $ACCOUNT_NAME"
  fi

  export_operator_and_account
}

reconcile_users_and_creds() {
  local service
  local creds_file

  for service in "${SERVICES[@]}"; do
    creds_file="${NATS_CREDS_DIR}/${service}.creds"

    if ! user_exists "$service"; then
      create_user_with_permissions "$service"
      ok "Created user identity for $service"
    fi

    if [[ ! -f "$creds_file" ]]; then
      generate_creds_for_user "$service"
      ok "Generated creds for $service"
    else
      ok "$service identity present - skipping"
    fi
  done
}

repair_missing_creds() {
  local service
  local creds_file
  local repaired=0

  for service in "${SERVICES[@]}"; do
    creds_file="${NATS_CREDS_DIR}/${service}.creds"
    if user_exists "$service" && [[ ! -f "$creds_file" ]]; then
      generate_creds_for_user "$service"
      repaired=$((repaired + 1))
      ok "Repaired missing creds for $service"
    fi
  done

  if (( repaired == 0 )); then
    ok "No missing creds to repair"
  fi
}

rotate_user() {
  local service="$1"

  if [[ -z "${PUB_SUBJECTS[$service]+_}" ]]; then
    fail "Unknown service target: $service"
  fi

  if user_exists "$service"; then
    nsc delete user "$service" --account "$ACCOUNT_NAME" --force >/dev/null || true
  fi

  create_user_with_permissions "$service"
  generate_creds_for_user "$service"
  export_operator_and_account

  warn "Rotated ${service}. Previous creds are now invalid; restart dependent services."
}

rotate_account_and_all_users() {
  nsc delete account "$ACCOUNT_NAME" --force >/dev/null || true
  nsc add account "$ACCOUNT_NAME" >/dev/null
  export_operator_and_account

  local service
  for service in "${SERVICES[@]}"; do
    create_user_with_permissions "$service"
    generate_creds_for_user "$service"
  done

  warn "Completed full rotation. Existing creds are invalid and services must be restarted."
}

drift_check() {
  local service
  local creds_file
  local expected_issuer
  local actual_issuer
  local drift_found=0

  for service in "${SERVICES[@]}"; do
    creds_file="${NATS_CREDS_DIR}/${service}.creds"

    if ! user_exists "$service"; then
      warn "[DRIFT] ${service}: missing user identity"
      drift_found=1
      continue
    fi

    if [[ ! -f "$creds_file" ]]; then
      warn "[DRIFT] ${service}: missing creds file"
      drift_found=1
      continue
    fi

    expected_issuer="$(user_issuer_key "$service")"
    if [[ -z "$expected_issuer" ]]; then
      expected_issuer="$(account_public_key)"
    fi
    actual_issuer="$(issuer_from_creds_file "$creds_file")"

    if [[ -z "$actual_issuer" || "$actual_issuer" != "$expected_issuer" ]]; then
      printf '[DRIFT] %s: issuer mismatch - run with '\''rotate --target %s'\'' to repair\n' "$service" "$service"
      drift_found=1
    fi
  done

  return "$drift_found"
}

check_mode() {
  local issues=0

  if ! operator_exists; then
    warn "Missing operator: $OPERATOR_NAME"
    issues=1
  fi

  if ! account_exists; then
    warn "Missing account: $ACCOUNT_NAME"
    issues=1
  fi

  if ! drift_check; then
    issues=1
  fi

  if (( issues == 0 )); then
    ok "Check passed: all 16 identities are present and issuers match"
    exit 0
  fi

  fail "Check failed: missing and/or drifted identities detected"
}

main() {
  parse_args "$@"
  require_prereqs

  if [[ "$MODE" != "check" ]]; then
    init_dirs
  fi

  export NSC_HOME

  case "$MODE" in
    reconcile)
      reconcile_operator_account
      reconcile_users_and_creds
      if ! drift_check; then
        exit 1
      fi
      ;;
    check)
      check_mode
      ;;
    repair)
      reconcile_operator_account
      repair_missing_creds
      ;;
    rotate)
      if [[ "$TARGET" == "$ACCOUNT_NAME" ]]; then
        rotate_account_and_all_users
      else
        rotate_user "$TARGET"
      fi
      ;;
    rotate-all)
      reconcile_operator_account
      rotate_account_and_all_users
      ;;
    *)
      fail "Unhandled mode: $MODE"
      ;;
  esac
}

main "$@"
