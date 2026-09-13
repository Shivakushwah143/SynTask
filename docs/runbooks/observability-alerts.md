# Observability alerts runbook

Prometheus rules: `observability/prometheus/rules/syntask-alerts.yml`
Alertmanager: `observability/alertmanager/alertmanager.yml`
Dashboards: **SynTask API Overview**, **SynTask Infrastructure Overview**,
**SynTask Logs Overview**, **SynTask Alerts Overview** (Grafana folder `SynTask`).

---

## SynTaskBackendDown

- **Meaning** — Prometheus cannot scrape the backend `/metrics` target
  (`up{job="syntask-backend"} == 0`) for 1 minute. The API is likely unavailable.
- **First checks** — `docker compose -f docker-compose.prod.yml ps backend`;
  container logs; `curl http://127.0.0.1:8000/health` from the host.
- **Dashboard / log source** — SynTask Alerts Overview (pipeline targets),
  SynTask Logs Overview (`{service="backend"}`).
- **First mitigation** — restart the backend container; if it crash-loops, read
  the last error lines in Loki or `docker compose logs backend` and fix the
  dependency/startup failure.

## SynTaskRedisDown

- **Meaning** — `redis_up == 0` for 1 minute: the Redis exporter cannot reach
  Redis. Caching, rate limiting, and Celery background work degrade.
- **First checks** — `docker compose -f docker-compose.prod.yml ps redis redis-exporter`;
  `docker compose exec redis redis-cli ping`; check memory/`maxmemory` evictions.
- **Dashboard / log source** — SynTask Infrastructure Overview (Redis Up/Down,
  Redis memory), SynTask Logs Overview (`{service=~"redis|worker"}`).
- **First mitigation** — restart Redis; if it is out of memory, free space or
  raise the limit, then confirm AOF state is intact.

## SynTaskHigh5xxRate

- **Meaning** — more than 5% of API requests returned 5xx over 5 minutes.
- **First checks** — recent backend error logs; correlate with a deploy or with
  dependency health (MongoDB, Redis, Qdrant).
- **Dashboard / log source** — SynTask API Overview (5xx error rate,
  p95 by route), SynTask Logs Overview (`{service="backend", level=~"ERROR|CRITICAL"}`).
- **First mitigation** — if a deploy caused it, roll back; otherwise fix the
  failing dependency or route identified in the logs.

## SynTaskHighP95Latency

- **Meaning** — API p95 latency above 2 s for 5 minutes. The API is slow but not
  failing.
- **First checks** — which route is slow (SynTask API Overview "p95 Latency by
  Route"); container CPU/memory saturation; slow MongoDB/Qdrant queries.
- **Dashboard / log source** — SynTask API Overview, SynTask Infrastructure
  Overview (host + container metrics), SynTask Logs Overview for slow-route logs.
- **First mitigation** — reduce load or scale worker concurrency; investigate the
  slow route's query or external call before restarting anything.

## SynTaskRootDiskAlmostFull

- **Meaning** — host root filesystem above 85% for 10 minutes.
- **First checks** — `df -h /`; largest consumers under `/var/lib/docker`
  (images, container logs, volumes); Loki/Prometheus retention sizes.
- **Dashboard / log source** — SynTask Infrastructure Overview (Root Disk
  Utilization). Docker log rotation keeps container logs bounded
  (`max-size=10m`, `max-file=3`); Loki retention is 7 days.
- **First mitigation** — prune unused Docker images/volumes
  (`docker system prune`), and confirm Loki retention compaction is running.
