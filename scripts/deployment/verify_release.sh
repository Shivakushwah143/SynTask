#!/usr/bin/env bash
#
# SynTask release health gate (Topic 13).
#
# Verifies that a deployment is really serving traffic — a container that merely
# started is NOT a successful release. Exits non-zero when any required check
# does not pass within the bounded timeout.
#
# Checks (each retried until the shared deadline):
#   1. backend  GET /livez      -> 200 and "alive"
#   2. backend  GET /readyz     -> 200 (MongoDB + Redis ready)
#   3. prometheus `up{job="syntask-backend"} == 1`
#   4. frontend GET /           -> 200            (optional, --skip-frontend)
#
# Safety: read-only probes. No secrets are read or printed.
#
# Usage:
#   scripts/deployment/verify_release.sh [--env production|development]
#                                        [--backend-url URL] [--frontend-url URL]
#                                        [--prometheus-url URL]
#                                        [--timeout SECONDS] [--interval SECONDS]
#                                        [--skip-frontend] [--skip-prometheus]
#
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"
TIMEOUT="${HEALTH_TIMEOUT:-180}"
INTERVAL="${HEALTH_INTERVAL:-5}"
CHECK_FRONTEND=1
CHECK_PROMETHEUS=1
ENVIRONMENT=""

usage() {
  cat <<'USAGE'
SynTask release health gate.

  scripts/deployment/verify_release.sh [options]

Options:
  --env <production|development>  Informational; also sets sensible URL defaults.
  --backend-url <url>             Backend base URL   (default http://127.0.0.1:8000)
  --frontend-url <url>            Frontend base URL  (default http://127.0.0.1:3000)
  --prometheus-url <url>          Prometheus URL     (default http://127.0.0.1:9090)
  --timeout <seconds>             Total retry budget (default 180)
  --interval <seconds>            Delay between attempts (default 5)
  --skip-frontend                 Do not require the frontend to answer
  --skip-prometheus               Do not require the Prometheus backend target
  -h, --help                      Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENVIRONMENT="${2:?}"; shift 2 ;;
    --backend-url) BACKEND_URL="${2:?}"; shift 2 ;;
    --frontend-url) FRONTEND_URL="${2:?}"; shift 2 ;;
    --prometheus-url) PROMETHEUS_URL="${2:?}"; shift 2 ;;
    --timeout) TIMEOUT="${2:?}"; shift 2 ;;
    --interval) INTERVAL="${2:?}"; shift 2 ;;
    --skip-frontend) CHECK_FRONTEND=0; shift ;;
    --skip-prometheus) CHECK_PROMETHEUS=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$ENVIRONMENT" in
  ""|production|development|staging) ;;
  *) echo "ERROR: unsupported --env '$ENVIRONMENT'." >&2; exit 2 ;;
esac

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/syntask-verify.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT

now_epoch() { date +%s; }
now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ---------------------------------------------------------------------------
# HTTP probe. Prints the status code on stdout; body is written to $2.
# Prefers curl, falls back to python3.
# ---------------------------------------------------------------------------
http_probe() {
  local url="$1" body_file="$2" status
  if command -v curl >/dev/null 2>&1; then
    status="$(curl -s -o "$body_file" -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || true)"
    [[ -n "$status" ]] || status="000"
    echo "$status"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$url" "$body_file" <<'PY'
import sys, urllib.error, urllib.request
url, out = sys.argv[1], sys.argv[2]
try:
    with urllib.request.urlopen(url, timeout=5) as resp:
        body, status = resp.read().decode("utf-8", "replace"), resp.status
except urllib.error.HTTPError as exc:
    body, status = exc.read().decode("utf-8", "replace"), exc.code
except Exception:
    body, status = "", 0
try:
    open(out, "w", encoding="utf-8").write(body)
except OSError:
    pass
print(status)
PY
    return 0
  fi
  echo "000"
  return 0
}

# Read a scalar from the Prometheus HTTP API (empty string when unavailable).
prom_value() {
  local query="$1" raw
  if command -v curl >/dev/null 2>&1; then
    raw="$(curl -sfG --max-time 5 "${PROMETHEUS_URL}/api/v1/query" --data-urlencode "query=${query}" 2>/dev/null || true)"
  elif command -v python3 >/dev/null 2>&1; then
    raw="$(python3 - "$PROMETHEUS_URL" "$query" <<'PY' 2>/dev/null || true
import json, sys, urllib.parse, urllib.request
base, query = sys.argv[1], sys.argv[2]
url = f"{base}/api/v1/query?" + urllib.parse.urlencode({"query": query})
try:
    with urllib.request.urlopen(url, timeout=5) as resp:
        print(resp.read().decode("utf-8", "replace"))
except Exception:
    pass
PY
)"
  else
    return 0
  fi
  sed -n 's/.*"value":\[[0-9.]*,"\([^"]*\)"\].*/\1/p' <<< "$raw" | head -n1
  return 0
}

# ---------------------------------------------------------------------------
# Individual checks. Return 0 on pass; set CHECK_DETAIL on failure.
# ---------------------------------------------------------------------------
CHECK_DETAIL=""

check_backend_live() {
  local body="$TMP_DIR/livez.json" status
  status="$(http_probe "${BACKEND_URL}/livez" "$body")"
  if [[ "$status" != "200" ]]; then
    CHECK_DETAIL="GET /livez -> HTTP ${status}"; return 1
  fi
  if ! grep -q '"alive"' "$body" 2>/dev/null; then
    CHECK_DETAIL="GET /livez body unexpected"; return 1
  fi
  CHECK_DETAIL="GET /livez -> 200 alive"; return 0
}

check_backend_ready() {
  local body="$TMP_DIR/readyz.json" status
  status="$(http_probe "${BACKEND_URL}/readyz" "$body")"
  if [[ "$status" != "200" ]]; then
    CHECK_DETAIL="GET /readyz -> HTTP ${status}"; return 1
  fi
  CHECK_DETAIL="GET /readyz -> 200"; return 0
}

check_prometheus() {
  local value
  value="$(prom_value 'up{job="syntask-backend"}')"
  if [[ "$value" != "1" ]]; then
    CHECK_DETAIL="up{job=\"syntask-backend\"} = ${value:-<no data>}"; return 1
  fi
  CHECK_DETAIL="up{job=\"syntask-backend\"} = 1"; return 0
}

check_frontend() {
  local body="$TMP_DIR/frontend.html" status
  status="$(http_probe "${FRONTEND_URL}/" "$body")"
  if [[ "$status" != "200" ]]; then
    CHECK_DETAIL="GET / (frontend) -> HTTP ${status}"; return 1
  fi
  CHECK_DETAIL="GET / (frontend) -> 200"; return 0
}

# ---------------------------------------------------------------------------
# Wait for every enabled check using a single shared deadline.
# ---------------------------------------------------------------------------
wait_for_checks() {
  local -a checks=("check_backend_live" "check_backend_ready")
  [[ "$CHECK_PROMETHEUS" -eq 1 ]] && checks+=("check_prometheus")
  [[ "$CHECK_FRONTEND" -eq 1 ]] && checks+=("check_frontend")

  local deadline attempt=0
  deadline=$(( $(now_epoch) + TIMEOUT ))

  echo "Health gate: ${#checks[@]} checks, timeout ${TIMEOUT}s, interval ${INTERVAL}s"
  echo "  backend   : $BACKEND_URL"
  [[ "$CHECK_PROMETHEUS" -eq 1 ]] && echo "  prometheus: $PROMETHEUS_URL"
  [[ "$CHECK_FRONTEND" -eq 1 ]] && echo "  frontend  : $FRONTEND_URL"

  while :; do
    attempt=$((attempt + 1))
    local failed=0
    for check in "${checks[@]}"; do
      if ! "$check" >/dev/null 2>&1; then
        failed=1
      fi
    done
    if [[ "$failed" -eq 0 ]]; then
      echo "RESULT: healthy (attempt ${attempt}, $(now_iso))"
      for check in "${checks[@]}"; do
        "$check" >/dev/null 2>&1 || true
        echo "  PASS  $CHECK_DETAIL"
      done
      return 0
    fi
    if [[ "$(now_epoch)" -ge "$deadline" ]]; then
      echo "RESULT: UNHEALTHY after ${attempt} attempt(s) ($(now_iso))" >&2
      for check in "${checks[@]}"; do
        if "$check" >/dev/null 2>&1; then
          echo "  PASS  $CHECK_DETAIL"
        else
          echo "  FAIL  $CHECK_DETAIL" >&2
        fi
      done
      return 1
    fi
    sleep "$INTERVAL"
  done
}

wait_for_checks
