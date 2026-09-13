# Incident drill runbook

Purpose: prove the SynTask observability stack actually detects, explains, and
confirms recovery of a real failure. Two drills only:

1. **Backend outage** — `SynTaskBackendDown`
2. **Redis outage** — `SynTaskRedisDown`

> **This is a controlled exercise.** Timings come from a deliberate injection
> and must never be reported as historical production MTTD/MTTR. Use
> [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md) and label it
> `Type: controlled drill`.

## Safety rules

- **Development only.** The script refuses any compose file containing `prod`.
- The drill stops a service; it requires
  `I_UNDERSTAND_THIS_STOPS_A_SERVICE=1`.
- Prefer a maintenance window and confirm no active work before starting.
- The script restores the service automatically on exit, including on failure
  or `Ctrl+C`. If automatic restore ever fails, restore manually with the
  printed `docker compose -f <file> start <service>` command.
- Do not stop more than one service per drill.

## Run it

```bash
# Backend outage
I_UNDERSTAND_THIS_STOPS_A_SERVICE=1 \
  ./scripts/observability/incident_drill.sh backend

# Redis outage
I_UNDERSTAND_THIS_STOPS_A_SERVICE=1 \
  ./scripts/observability/incident_drill.sh redis
```

Overrides: `COMPOSE_FILE` (default `docker-compose.dev.yml`),
`PROMETHEUS_URL` (default `http://localhost:9090`), `DETECTION_TIMEOUT`,
`ALERT_TIMEOUT`, `RECOVERY_TIMEOUT`, `POLL_INTERVAL`.

What the script does: record injection time → stop the service → poll the probe
until it reports down → observe the alert (pending → firing) → restore the
service → poll until the probe is healthy again → wait for the alert to clear →
print injection/detection/restoration times and total duration.

---

## DETECT

Observe, don't assume. Record the time the failure first became visible.

- **Backend:** Prometheus target `up{job="syntask-backend"}` drops to `0`
  (15s scrape). `SynTaskBackendDown` goes **pending**, then **firing** after its
  1m `for`.
- **Redis:** `redis_up` drops to `0` (Redis Exporter). `SynTaskRedisDown` goes
  **pending**, then **firing** after 1m.

Where to look:

| Signal | Location |
|---|---|
| Target down | Prometheus → Status → Targets; **SynTask Alerts Overview** → "Observability Pipeline Targets" |
| Alert state | **SynTask Alerts Overview** → "Firing Alerts" / "Alert State"; Alertmanager UI `http://localhost:9093` |
| Detection latency | Drill script summary (`detection latency`) |

## INVESTIGATE

Use the existing dashboards — do not build new ones for a drill.

- **Prometheus / Grafana**
  - **SynTask API Overview** — RED metrics: request rate, 5xx ratio, p95 latency
    (backend drill: traffic collapses or errors rise; the target is down).
  - **SynTask Infrastructure Overview** — host CPU/memory/disk, container CPU
    and memory, and **Redis Up/Down** (`redis_up`) plus Redis memory usage
    (redis drill).
  - **SynTask Alerts Overview** — corroborate pending/firing state; confirm the
    observability pipeline itself is UP.
- **Loki (centralized logs)** — **SynTask Logs Overview**
  - backend: `{service="backend"}`
  - worker: `{service="worker"}`
  - errors: `{level=~"ERROR|CRITICAL"}`
  - trace a single request: `{service="backend"} | request_id="<id>"`
- **Alertmanager** (`http://localhost:9093`) — grouping, dedup, and
  pending/firing/resolved lifecycle.

### Redis drill: observe actual behavior, do not assume

Do **not** assume every SynTask route fails when Redis is unavailable. Observed
behavior differs by route. Check the logs for Redis-related errors before
concluding:

```
{service=~"backend|worker"} |~ "(?i)redis"
```

Known design note (`docs/infrastructure/SECURITY.md`): token-revocation
(blacklist) checks **fail open** when Redis is unavailable, so some authenticated
routes keep working while revocation enforcement is degraded. Celery/background
jobs and rate limiting are the first things to visibly degrade. Record what you
actually observe.

## MITIGATE

Restore service quickly; a temporary measure is acceptable here.

- **Backend:** `docker compose -f docker-compose.dev.yml start backend` (the
  script does this automatically). If it crash-loops, read the last error lines
  in Loki and fix the cause before retrying.
- **Redis:** `docker compose -f docker-compose.dev.yml start redis`. If Redis
  restarted empty, confirm AOF state; revocation blacklist and queues may need a
  short period to recover.
- After mitigation, confirm the probe returns to `1`.

## RECOVER

Verify recovery with evidence, then let the alert resolve.

- `up{job="syntask-backend"} == 1` (backend) or `redis_up == 1` (redis).
- Backend container healthy again (`docker compose ps`), worker unaffected.
- Alert transitions to **resolved** in Alertmanager; `ALERTS{...}` disappears.
- SLO recording rules return to sane values (**SynTask SLO Overview**):
  availability/latency SLIs and error-budget remaining recover toward 1. A drill
  this short should leave the 7-day error budget almost untouched.

## LEARN

- Write the record with [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md);
  label it `Type: controlled drill`.
- Compare measured detection latency against the alert `for` durations. If
  detection felt slow, adjust the `for`/evaluation interval — not the SLI.
- Confirm the runbook you actually used is the one that exists; fix it if not.
- Note any gap where a dashboard or log query was missing, and add it to the
  follow-up table rather than improvising new dashboards mid-drill.

## Quick reference

| Question | Where |
|---|---|
| Is the target up? | Prometheus targets, Alerts Overview |
| What is erroring? | SynTask API Overview (RED), Loki error panels |
| Is the host/container saturated? | SynTask Infrastructure Overview |
| What happened for request X? | Loki: `{service="backend"} | request_id="<id>"` |
| Is the alert pending or firing? | Alertmanager UI, Alerts Overview |
| Are we consuming error budget? | SynTask SLO Overview |
| Why did a service fail? | Loki backend/worker logs |
