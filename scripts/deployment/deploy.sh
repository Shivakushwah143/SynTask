#!/usr/bin/env bash
#
# SynTask production deployment (Topics 10, 12, 15).
#
# Design goals:
#   * No guaranteed downtime. This script NEVER tears the stack down; it
#     builds/pulls, updates changed services with `docker compose up -d`
#     (adds `--wait` when Compose supports it) and preserves all volumes,
#     networks and databases.
#   * Deployment success is verified, not assumed: the release must pass the
#     health gate in verify_release.sh (livez, readyz, Prometheus target,
#     frontend) before it is recorded as successful.
#   * A real rollback path: the previous release SHA is read from the marker
#     file before deploying, and rolled back to (git checkout + rebuild +
#     re-verify) if the new release fails.
#   * Minimal downtime, never a zero-downtime claim (single-VPS Compose cannot
#     guarantee it).
#
# Safety:
#   * `set -euo pipefail`, no shell tracing (never logs command expansion).
#   * No `docker compose down`, no `-v`, no `docker system prune`.
#   * No secret logging: this script never reads or echoes env files; secrets
#     are written by the caller (GitHub Actions) before deployment.
#
# Usage:
#   scripts/deployment/deploy.sh --env production --yes
#   scripts/deployment/deploy.sh --env development
#   scripts/deployment/deploy.sh --env production --rollback
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENVIRONMENT=""
REPO_DIR="${DEPLOY_REPO_DIR:-$DEFAULT_REPO_DIR}"
COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-}"
RELEASE_COMMIT="${SYNTASK_RELEASE_COMMIT:-}"
DO_BUILD=1
DRY_RUN=0
ASSUME_YES=0
DO_ROLLBACK=0
ROLLBACK_ON_FAILURE="${DEPLOY_ROLLBACK_ON_FAILURE:-1}"
FORCE_GIT=0
SKIP_VERIFY=0
SKIP_FRONTEND=0
SKIP_PROMETHEUS=0
TIMEOUT="${HEALTH_TIMEOUT:-180}"
INTERVAL="${HEALTH_INTERVAL:-5}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"

usage() {
  cat <<'USAGE'
SynTask safe deployment.

  scripts/deployment/deploy.sh --env <production|development> [options]

Required:
  --env <production|development>   Target environment (must be explicit)

Options:
  --compose-file <path>   Compose file (default: prod for production, dev else)
  --repo-dir <path>       Repository root (default: script's repo)
  --release-commit <sha>  Override release SHA (default: current git HEAD)
  --no-build              Do not rebuild images before updating services
  --rollback              Roll back to the previous recorded release, then exit
  --no-rollback-on-failure  Do not auto-rollback when a deploy fails
  --yes                   Non-interactive confirmation (required for production)
  --force-git             Allow git rollback with a dirty working tree
  --skip-verify           Skip the health gate (NOT recommended)
  --skip-frontend         Do not require the frontend in the health gate
  --skip-prometheus       Do not require the Prometheus target in the gate
  --backend-url <url>     Health-gate backend URL
  --frontend-url <url>    Health-gate frontend URL
  --prometheus-url <url>  Health-gate Prometheus URL
  --timeout <seconds>     Health-gate retry budget (default 180)
  --interval <seconds>    Health-gate retry interval (default 5)
  --dry-run               Print the planned commands without executing them
  -h, --help              Show this help

Environment:
  DEPLOY_CONFIRM=yes      Alternative to --yes for production
  DEPLOY_STATE_DIR        Marker/state directory (default <repo>/.deploy-state)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENVIRONMENT="${2:?missing value for --env}"; shift 2 ;;
    --compose-file) COMPOSE_FILE="${2:?}"; shift 2 ;;
    --repo-dir) REPO_DIR="${2:?}"; shift 2 ;;
    --release-commit) RELEASE_COMMIT="${2:?}"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    --rollback) DO_ROLLBACK=1; shift ;;
    --no-rollback-on-failure) ROLLBACK_ON_FAILURE=0; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    --force-git) FORCE_GIT=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --skip-frontend) SKIP_FRONTEND=1; shift ;;
    --skip-prometheus) SKIP_PROMETHEUS=1; shift ;;
    --backend-url) BACKEND_URL="${2:?}"; shift 2 ;;
    --frontend-url) FRONTEND_URL="${2:?}"; shift 2 ;;
    --prometheus-url) PROMETHEUS_URL="${2:?}"; shift 2 ;;
    --timeout) TIMEOUT="${2:?}"; shift 2 ;;
    --interval) INTERVAL="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log()  { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Argument safety
# ---------------------------------------------------------------------------
[[ -n "$ENVIRONMENT" ]] || { usage >&2; fail "--env is required."; }
case "$ENVIRONMENT" in
  production|development|staging) ;;
  *) fail "unsupported --env '$ENVIRONMENT' (production|development|staging)." ;;
esac

if [[ -z "$COMPOSE_FILE" ]]; then
  case "$ENVIRONMENT" in
    development) COMPOSE_FILE="docker-compose.dev.yml" ;;
    *) COMPOSE_FILE="docker-compose.prod.yml" ;;
  esac
fi

case "$ENVIRONMENT:$COMPOSE_FILE" in
  production:*dev*) fail "refusing to deploy the production environment with a dev compose file ($COMPOSE_FILE)." ;;
  development:*prod*) fail "refusing to deploy the development environment with a prod compose file ($COMPOSE_FILE)." ;;
esac

if [[ "$ENVIRONMENT" == "production" ]]; then
  if [[ "$ASSUME_YES" -ne 1 && "${DEPLOY_CONFIRM:-}" != "yes" ]]; then
    fail "production deployment requires --yes or DEPLOY_CONFIRM=yes."
  fi
fi

[[ -f "$REPO_DIR/$COMPOSE_FILE" ]] || fail "compose file not found: $REPO_DIR/$COMPOSE_FILE"

cd "$REPO_DIR"

GIT_AVAILABLE=0
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_AVAILABLE=1
fi

STATE_DIR="${DEPLOY_STATE_DIR:-$REPO_DIR/.deploy-state}"
STATE_FILE="$STATE_DIR/${ENVIRONMENT}.json"
HISTORY_FILE="$STATE_DIR/${ENVIRONMENT}.history.jsonl"

mkdir -p "$STATE_DIR" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  printf '+ %s\n' "$*"
  "$@"
}

run_compose() { run docker compose -f "$COMPOSE_FILE" "$@"; }

compose_supports_wait() {
  docker compose up --help 2>&1 | grep -q -- '--wait'
}

json_field() {  # json_field <file> <key>
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$file" | head -n1
  return 0
}

write_state() {  # write_state <status> <commit> [previous_commit]
  local status="$1" commit="$2" previous="${3:-unknown}"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  printf '{"environment":"%s","status":"%s","release_version":"%s","release_commit":"%s","release_branch":"%s","release_built_at":"%s","previous_commit":"%s","updated_at":"%s"}\n' \
    "$ENVIRONMENT" "$status" "$RELEASE_VERSION" "$commit" "$RELEASE_BRANCH" "$RELEASE_BUILT_AT" "$previous" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    > "$STATE_FILE"
}

record_event() {  # record_event <status> <commit> [previous_commit]
  local status="$1" commit="$2" previous="${3:-unknown}"
  local line
  line="$(printf '{"event":"deployment","environment":"%s","release_version":"%s","release_commit":"%s","release_branch":"%s","status":"%s","previous_commit":"%s","timestamp":"%s"}' \
    "$ENVIRONMENT" "$RELEASE_VERSION" "$commit" "$RELEASE_BRANCH" "$status" "$previous" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  # Structured deployment log (also the deployment marker file / audit trail).
  log "DEPLOYMENT $line"
  if [[ "$DRY_RUN" -ne 1 ]]; then
    printf '%s\n' "$line" >> "$HISTORY_FILE"
  fi
}

resolve_release_identity() {
  RELEASE_COMMIT="${RELEASE_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
  RELEASE_VERSION="${SYNTASK_RELEASE_VERSION:-$(git describe --tags --always 2>/dev/null || echo "$RELEASE_COMMIT")}"
  RELEASE_BRANCH="${SYNTASK_RELEASE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
  RELEASE_BUILT_AT="${SYNTASK_RELEASE_BUILT_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  export SYNTASK_RELEASE_COMMIT="$RELEASE_COMMIT"
  export SYNTASK_RELEASE_VERSION="$RELEASE_VERSION"
  export SYNTASK_RELEASE_BRANCH="$RELEASE_BRANCH"
  export SYNTASK_RELEASE_BUILT_AT="$RELEASE_BUILT_AT"
}

# Build (optional) + update services WITHOUT tearing the stack down.
build_and_update() {
  if [[ "$DO_BUILD" -eq 1 ]]; then
    run_compose build || return 1
  fi
  local -a up_args=(up -d --remove-orphans)
  if compose_supports_wait; then
    up_args+=(--wait "--wait-timeout" "$(( TIMEOUT + 120 ))")
  fi
  run_compose "${up_args[@]}" || return 1
  run_compose ps || true
  return 0
}

run_health_gate() {
  if [[ "$SKIP_VERIFY" -eq 1 || "$DRY_RUN" -eq 1 ]]; then
    warn "health gate skipped (--skip-verify/--dry-run)."
    return 0
  fi
  local -a args=(--env "$ENVIRONMENT" --backend-url "$BACKEND_URL"
                 --frontend-url "$FRONTEND_URL" --prometheus-url "$PROMETHEUS_URL"
                 --timeout "$TIMEOUT" --interval "$INTERVAL")
  [[ "$SKIP_FRONTEND" -eq 1 ]] && args+=(--skip-frontend)
  [[ "$SKIP_PROMETHEUS" -eq 1 ]] && args+=(--skip-prometheus)
  bash "$SCRIPT_DIR/verify_release.sh" "${args[@]}"
}

git_tree_is_dirty() {
  [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]
}

# ---------------------------------------------------------------------------
# Rollback (Topics 10 & 14)
# ---------------------------------------------------------------------------
rollback_to() {
  local target="$1" failed_commit="${2:-$RELEASE_COMMIT}"

  [[ "$GIT_AVAILABLE" -eq 1 ]] || { warn "git unavailable; cannot roll back automatically."; return 1; }
  [[ -n "$target" && "$target" != "unknown" ]] || { warn "no previous release recorded; cannot roll back."; return 1; }
  [[ "$target" != "$failed_commit" ]] || { warn "previous release equals failed release; nothing to roll back to."; return 1; }

  if git_tree_is_dirty && [[ "$FORCE_GIT" -ne 1 ]]; then
    warn "working tree is dirty; refusing git rollback (use --force-git to override)."
    return 1
  fi

  log "ROLLBACK: restoring previous release ${target}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] git checkout --detach $target && rebuild && verify"
    return 0
  fi

  git checkout --detach "$target" >/dev/null 2>&1 || { warn "git checkout $target failed."; return 1; }

  # Re-resolve identity from the checked-out revision (ignore the failed
  # release's exported values).
  unset SYNTASK_RELEASE_COMMIT SYNTASK_RELEASE_VERSION SYNTASK_RELEASE_BRANCH SYNTASK_RELEASE_BUILT_AT
  RELEASE_COMMIT=""
  RELEASE_VERSION=""
  RELEASE_BRANCH=""
  RELEASE_BUILT_AT=""
  resolve_release_identity

  record_event rolled_back "$RELEASE_COMMIT" "$failed_commit"
  if ! build_and_update; then
    record_event rollback_failed "$failed_commit" "$RELEASE_COMMIT"
    warn "rollback update failed; manual intervention required."
    return 1
  fi
  if ! run_health_gate; then
    record_event rollback_failed "$failed_commit" "$RELEASE_COMMIT"
    warn "rollback did not pass the health gate; manual intervention required."
    return 1
  fi
  write_state "rolled_back" "$RELEASE_COMMIT" "$failed_commit"
  record_event rollback_success "$RELEASE_COMMIT" "$failed_commit"
  log "ROLLBACK COMPLETE: now running ${RELEASE_COMMIT}."
  return 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
log "=============================================================="
log " SynTask deployment"
log " environment : $ENVIRONMENT"
log " compose     : $COMPOSE_FILE"
log " repo        : $REPO_DIR"
log "=============================================================="

if [[ "$DO_ROLLBACK" -eq 1 ]]; then
  PREVIOUS="$(json_field "$STATE_FILE" release_commit)"
  [[ -n "$PREVIOUS" ]] || fail "no previous release recorded in $STATE_FILE; cannot roll back."
  resolve_release_identity
  CURRENT="$RELEASE_COMMIT"
  log "Manual rollback requested: current=${CURRENT} target=${PREVIOUS}"
  if rollback_to "$PREVIOUS" "$CURRENT"; then
    exit 0
  fi
  exit 1
fi

resolve_release_identity
PREVIOUS_COMMIT="$(json_field "$STATE_FILE" release_commit)"
PREVIOUS_COMMIT="${PREVIOUS_COMMIT:-unknown}"
log " release     : $RELEASE_VERSION ($RELEASE_COMMIT, $RELEASE_BRANCH)"
log " previous    : $PREVIOUS_COMMIT"
log "=============================================================="

record_event started "$RELEASE_COMMIT" "$PREVIOUS_COMMIT"

if ! build_and_update; then
  record_event failed "$RELEASE_COMMIT" "$PREVIOUS_COMMIT"
  warn "service update failed."
  if [[ "$ROLLBACK_ON_FAILURE" -eq 1 ]]; then
    rollback_to "$PREVIOUS_COMMIT" "$RELEASE_COMMIT" && exit 0
  fi
  exit 1
fi

if ! run_health_gate; then
  record_event failed "$RELEASE_COMMIT" "$PREVIOUS_COMMIT"
  warn "release ${RELEASE_COMMIT} did not pass the health gate."
  if [[ "$ROLLBACK_ON_FAILURE" -eq 1 ]]; then
    rollback_to "$PREVIOUS_COMMIT" "$RELEASE_COMMIT" && exit 0
  fi
  fail "deployment failed and was not rolled back (see log above)."
fi

write_state success "$RELEASE_COMMIT" "$PREVIOUS_COMMIT"
record_event success "$RELEASE_COMMIT" "$PREVIOUS_COMMIT"
log "DEPLOYMENT SUCCESS: $RELEASE_VERSION ($RELEASE_COMMIT) is live."
