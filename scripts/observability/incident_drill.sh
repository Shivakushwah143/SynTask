#!/usr/bin/env bash
#
# SynTask controlled incident drill (Topic 8).
#
# Stops ONE service, observes how the observability stack detects it, restores
# the service, and reports the timings. Detects -> observes -> restores.
#
# THIS IS A CONTROLLED EXERCISE.
# The timings it prints are produced by a deliberate injection and must NOT be
# reported as historical production MTTD/MTTR data. See
# docs/runbooks/INCIDENT_DRILL.md and docs/runbooks/INCIDENT_TEMPLATE.md.
#
# Supported targets: backend | redis
# Default compose   : docker-compose.dev.yml  (production files are refused)
#
# Usage:
#   I_UNDERSTAND_THIS_STOPS_A_SERVICE=1 \
#     ./scripts/observability/incident_drill.sh backend
#
#   I_UNDERSTAND_THIS_STOPS_A_SERVICE=1 \
#     ./scripts/observability/incident_drill.sh redis
#
# Optional overrides:
#   COMPOSE_FILE=docker-compose.dev.yml   # any non-production compose file
#   PROMETHEUS_URL=http://localhost:9090  # where to read up/redis_up/ALERTS
#   DETECTION_TIMEOUT=120                 # seconds to wait for detection
#   ALERT_TIMEOUT=120                     # seconds to wait for the alert
#   RECOVERY_TIMEOUT=180                  # seconds to wait for recovery
#   POLL_INTERVAL=5                       # seconds between polls
#
set -euo pipefail

print_usage() {
  cat <<'USAGE'
SynTask controlled incident drill — supports ONLY: backend | redis

  I_UNDERSTAND_THIS_STOPS_A_SERVICE=1 scripts/observability/incident_drill.sh <backend|redis>

The safety acknowledgement is mandatory. The drill stops the target service,
observes Prometheus (up / redis_up and the matching alert), then restores the
service via `docker compose start`. Production compose files are refused.

This is a controlled exercise: its timings are NOT historical incident data.
USAGE
}

TARGET="${1:-}"

case "$TARGET" in
  backend)
    PROBE='up{job="syntask-backend"}'
    ALERT_NAME='SynTaskBackendDown'
    CONTROL_SERVICES=(backend)
    ;;
  redis)
    PROBE='redis_up'
    ALERT_NAME='SynTaskRedisDown'
    CONTROL_SERVICES=(redis)
    ;;
  ""|-h|--help|help)
    print_usage
    exit 0
    ;;
  *)
    echo "ERROR: unsupported drill target '$TARGET' (only 'backend' and 'redis' are supported)." >&2
    print_usage
    exit 2
    ;;
esac

if [[ "${I_UNDERSTAND_THIS_STOPS_A_SERVICE:-}" != "1" ]]; then
  cat >&2 <<EOF
ERROR: refusing to run.

This drill intentionally stops a running service. Re-run with the explicit
safety acknowledgement:

  I_UNDERSTAND_THIS_STOPS_A_SERVICE=1 $0 $TARGET
EOF
  exit 3
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"

case "$COMPOSE_FILE" in
  *prod*)
    echo "ERROR: refusing to run against a production compose file ($COMPOSE_FILE)." >&2
    echo "This tooling is development-first and must never target production." >&2
    exit 4
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: compose file not found: $REPO_ROOT/$COMPOSE_FILE" >&2
  exit 5
fi

PROM_URL="${PROMETHEUS_URL:-http://localhost:9090}"
DETECTION_TIMEOUT="${DETECTION_TIMEOUT:-120}"
ALERT_TIMEOUT="${ALERT_TIMEOUT:-120}"
RECOVERY_TIMEOUT="${RECOVERY_TIMEOUT:-180}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"

INJECT_EPOCH=0
RESTORE_EPOCH=0
DETECT_EPOCH=0
RECOVERY_EPOCH=0
ALERT_SEEN="no"
ALERT_FIRED="no"
ALERT_RESOLVED="n/a"
DETECTED=0
STOPPED=0
RESTORED=0
DRILL_STARTED=0

now_epoch() { date +%s; }
now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# Query Prometheus and print the scalar value of the first result (or nothing).
prom_value() {
  command -v curl >/dev/null 2>&1 || return 0
  curl -sfG --max-time 5 "${PROM_URL}/api/v1/query" \
    --data-urlencode "query=$1" 2>/dev/null \
    | sed -n 's/.*"value":\[[0-9.]*,"\([^"]*\)"\].*/\1/p' \
    | head -n1
  return 0
}

# Restore the stopped service. Safe to call more than once, and a no-op if the
# drill never actually stopped anything (e.g. a precondition failed).
restore_service() {
  if [[ "$STOPPED" -ne 1 || "$RESTORED" -eq 1 ]]; then
    return 0
  fi
  echo
  echo ">> RESTORE: starting ${CONTROL_SERVICES[*]}"
  if docker compose -f "$COMPOSE_FILE" start "${CONTROL_SERVICES[@]}" >/dev/null 2>&1; then
    RESTORED=1
    RESTORE_EPOCH="$(now_epoch)"
    echo "   'docker compose -f $COMPOSE_FILE start ${CONTROL_SERVICES[*]}' issued at $(now_iso)"
  else
    echo "   WARNING: automatic restore failed. Restore manually:"
    echo "     docker compose -f $COMPOSE_FILE start ${CONTROL_SERVICES[*]}"
  fi
  return 0
}

on_exit() {
  local rc=$?
  # Always attempt restoration, even if a later verification step failed.
  restore_service
  if [[ "$DRILL_STARTED" -eq 1 ]]; then
    echo
    echo "Drill finished (exit code $rc). Service restoration attempted above."
  fi
  return 0
}
trap on_exit EXIT
trap 'echo; echo ">> Interrupted - restoring before exit."; restore_service; exit 130' INT TERM

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
echo "=============================================================="
echo " SynTask controlled incident drill"
echo " target   : $TARGET"
echo " compose  : $COMPOSE_FILE"
echo " probe    : $PROBE"
echo " alert    : $ALERT_NAME"
echo "=============================================================="
echo "CONTROLLED EXERCISE - not historical incident data."
echo "Timings below must NOT be reported as production MTTD/MTTR."
echo

if ! docker compose -f "$COMPOSE_FILE" ps --status running --services >/dev/null 2>&1; then
  echo "ERROR: 'docker compose -f $COMPOSE_FILE' is not usable (is Docker running?)." >&2
  exit 6
fi

running="$(docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null || true)"
for svc in "${CONTROL_SERVICES[@]}"; do
  if ! grep -qx "$svc" <<< "$running"; then
    echo "ERROR: service '$svc' is not running in $COMPOSE_FILE - nothing to drill." >&2
    exit 7
  fi
done

probe_before="$(prom_value "$PROBE" || true)"
echo "Pre-drill probe : $PROBE = ${probe_before:-<no data>}"
if [[ -z "$probe_before" ]]; then
  echo "NOTE: no data from Prometheus at $PROM_URL. Detection/alert observation"
  echo "      will be skipped; the drill will still stop and restore the service."
fi
echo

# ---------------------------------------------------------------------------
# INJECT
# ---------------------------------------------------------------------------
DRILL_STARTED=1
INJECT_EPOCH="$(now_epoch)"
INJECT_ISO="$(now_iso)"
echo ">> INJECT: stopping ${CONTROL_SERVICES[*]} at $INJECT_ISO"
docker compose -f "$COMPOSE_FILE" stop "${CONTROL_SERVICES[@]}" >/dev/null
STOPPED=1
echo "   stop completed at $(now_iso)"
echo

# ---------------------------------------------------------------------------
# DETECT
# ---------------------------------------------------------------------------
echo ">> DETECT: polling $PROBE for '0' (timeout ${DETECTION_TIMEOUT}s)"
deadline=$(( $(now_epoch) + DETECTION_TIMEOUT ))
while [[ "$(now_epoch)" -lt "$deadline" ]]; do
  value="$(prom_value "$PROBE" || true)"
  if [[ "$value" == "0" ]]; then
    DETECT_EPOCH="$(now_epoch)"
    DETECTED=1
    echo "   observed $PROBE == 0 at $(now_iso)"
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [[ "$DETECTED" -eq 0 ]]; then
  echo "   NOT observed within ${DETECTION_TIMEOUT}s"
  echo "   (Prometheus unreachable, or scrape/evaluation is slower than this drill)."
fi

echo ">> ALERT: polling for $ALERT_NAME (timeout ${ALERT_TIMEOUT}s)"
deadline=$(( $(now_epoch) + ALERT_TIMEOUT ))
while [[ "$(now_epoch)" -lt "$deadline" ]]; do
  if [[ -n "$(prom_value "ALERTS{alertname=\"$ALERT_NAME\"}" || true)" ]]; then
    ALERT_SEEN="yes"
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [[ "$ALERT_SEEN" == "yes" ]]; then
  if [[ -n "$(prom_value "ALERTS{alertname=\"$ALERT_NAME\",alertstate=\"firing\"}" || true)" ]]; then
    ALERT_FIRED="yes"
    echo "   $ALERT_NAME is FIRING at $(now_iso)"
  else
    echo "   $ALERT_NAME is PENDING (its 1m 'for' must elapse before firing)"
  fi
else
  echo "   $ALERT_NAME not observed (rule evaluation/for duration not reached)."
fi
echo

# ---------------------------------------------------------------------------
# RECOVER
# ---------------------------------------------------------------------------
restore_service
echo

echo ">> RECOVER: polling $PROBE for '1' (timeout ${RECOVERY_TIMEOUT}s)"
deadline=$(( $(now_epoch) + RECOVERY_TIMEOUT ))
while [[ "$(now_epoch)" -lt "$deadline" ]]; do
  value="$(prom_value "$PROBE" || true)"
  if [[ "$value" == "1" ]]; then
    RECOVERY_EPOCH="$(now_epoch)"
    echo "   observed $PROBE == 1 at $(now_iso)"
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [[ "$RECOVERY_EPOCH" -eq 0 ]]; then
  echo "   Recovery not observed within ${RECOVERY_TIMEOUT}s."
fi

if [[ "$ALERT_SEEN" == "yes" ]]; then
  echo ">> RESOLVE: waiting for $ALERT_NAME to clear"
  deadline=$(( $(now_epoch) + RECOVERY_TIMEOUT ))
  while [[ "$(now_epoch)" -lt "$deadline" ]]; do
    if [[ -z "$(prom_value "ALERTS{alertname=\"$ALERT_NAME\"}" || true)" ]]; then
      ALERT_RESOLVED="yes"
      echo "   $ALERT_NAME resolved at $(now_iso)"
      break
    fi
    sleep "$POLL_INTERVAL"
  done
  if [[ "$ALERT_RESOLVED" != "yes" ]]; then
    ALERT_RESOLVED="no"
    echo "   $ALERT_NAME still active (Prometheus may need another evaluation cycle)."
  fi
  echo
fi

# ---------------------------------------------------------------------------
# REPORT
# ---------------------------------------------------------------------------
restore_observed="$RESTORE_EPOCH"
if [[ "$RECOVERY_EPOCH" -ne 0 ]]; then
  restore_observed="$RECOVERY_EPOCH"
fi

detect_seconds="n/a"
if [[ "$DETECT_EPOCH" -ne 0 ]]; then
  detect_seconds="$(( DETECT_EPOCH - INJECT_EPOCH ))s"
fi

total_seconds="n/a"
if [[ "$restore_observed" -ne 0 ]]; then
  total_seconds="$(( restore_observed - INJECT_EPOCH ))s"
fi

echo "=============================================================="
echo " DRILL SUMMARY (controlled exercise)"
echo "=============================================================="
echo " injection time      : $INJECT_ISO"
if [[ "$DETECT_EPOCH" -ne 0 ]]; then
  echo " detection time      : $DETECT_EPOCH ($(date -u -d @"$DETECT_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 'see epoch'))"
else
  echo " detection time      : not observed"
fi
if [[ "$RECOVERY_EPOCH" -ne 0 ]]; then
  echo " restoration time    : $RECOVERY_EPOCH ($(date -u -d @"$RECOVERY_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 'see epoch'))"
elif [[ "$RESTORE_EPOCH" -ne 0 ]]; then
  echo " restoration time    : $RESTORE_EPOCH (restore command issued; recovery not observed)"
else
  echo " restoration time    : not observed"
fi
echo " detection latency   : $detect_seconds (injection -> Prometheus saw the failure)"
echo " total drill duration: $total_seconds (injection -> service observed restored)"
echo " alert fired         : $ALERT_FIRED"
echo " alert resolved      : $ALERT_RESOLVED"
echo "=============================================================="
echo "REMINDER: these numbers come from a deliberate controlled drill."
echo "They are NOT historical MTTR/MTTD data and must not be presented as such."
echo "Record the exercise with docs/runbooks/INCIDENT_TEMPLATE.md if desired."
