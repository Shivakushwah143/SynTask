# Deployment and rollback runbook

Status: implemented (Topic 10 — deployment observability + safe rollback)
Last reviewed: 2026-09-13

Deployments are performed by [`scripts/deployment/deploy.sh`](../../scripts/deployment/deploy.sh).
It builds and updates services **without** `docker compose down`, verifies the
release with [`scripts/deployment/verify_release.sh`](../../scripts/deployment/verify_release.sh),
and rolls back automatically to the previous recorded release when the update or
health gate fails.

Single-VPS Docker Compose cannot guarantee zero downtime. The goal is minimal
downtime, fast failure detection and reliable recovery — never a zero-downtime
claim.

## When to roll back

Roll back when the new release:

* fails the health gate (`/livez`, `/readyz`, Prometheus target, frontend);
* shows a sustained 5xx spike or p95 regression that started at the deployment;
* breaks a critical module and the fix is not a fast, low-risk patch;
* leaves a required service crash-looping (`backend`, `worker`, `frontend`).

Do not roll back for a symptom that clearly predates the deployment.

## Identify the current and previous release

| Source | Command / location |
|---|---|
| Marker/state file | `cat .deploy-state/production.json` (`release_commit`, `previous_commit`, `status`) |
| Deployment history | `tail -n 20 .deploy-state/production.history.jsonl` |
| Backend readiness | `curl -s http://127.0.0.1:8000/readyz` → `release` block |
| Metric | `syntask_build_info{environment="production"}` in Prometheus / Grafana |
| Logs | Loki: `{service="syntask-backend"} \| json \| event="deployment"` |
| Git | `git -C /opt/syntask rev-parse HEAD` |

## Deploy

Handled automatically by `.github/workflows/deploy.yml` (push to `dev` or
`main`). Manual deployment on the server:

```bash
cd /opt/syntask
git fetch --prune origin main
git checkout -B main origin/main
git reset --hard origin/main
# backend/.env and frontend/.env are written from GitHub Secrets by the workflow
bash scripts/deployment/deploy.sh --env production --yes
```

Useful flags: `--dry-run`, `--no-build`, `--skip-verify`, `--timeout`, `--interval`.

## Health verification

```bash
bash scripts/deployment/verify_release.sh --env production --timeout 180
```

Checks (bounded retry/backoff): `/livez`, `/readyz`, Prometheus
`up{job="syntask-backend"} == 1`, and frontend HTTP 200. A non-zero exit means
the release is not healthy.

## Rollback

Automatic: `deploy.sh` rolls back when the update or health gate fails
(disable with `--no-rollback-on-failure`).

Manual (to the previous release recorded in the state file):

```bash
cd /opt/syntask
bash scripts/deployment/rollback.sh --env production --yes
# equivalent to: bash scripts/deployment/deploy.sh --env production --rollback --yes
```

The rollback checks out the previous SHA, rebuilds, updates services in place,
and re-runs the health gate. It never deletes volumes or the database.

If the working tree is dirty, the script refuses `git` rollback; use
`--force-git` only after confirming the local changes are intentional.

## Post-rollback validation

1. `bash scripts/deployment/verify_release.sh --env production --timeout 180`.
2. Confirm the reported release: `curl -s http://127.0.0.1:8000/readyz` and the
   `syntask_build_info` metric now show the restored commit.
3. Watch the **SynTask Deployment Overview** dashboard and the **SynTask API
   Overview** for a full error/latency stabilisation window.
4. Reconcile side effects created during the failed window (queued jobs,
   provider webhooks, emails) as described in the
   [production deployment guide](../infrastructure/PRODUCTION_DEPLOYMENT_GUIDE.md).

## Where to look (logs, metrics, traces)

| Signal | Location |
|---|---|
| Deployment events | Loki: `{service=~"syntask-backend\|syntask-worker"} \| json \| event="deployment"`; Grafana **SynTask Deployment Overview** annotations |
| Release identity | `syntask_build_info`, `syntask_release_deployed_timestamp_seconds`, `/readyz`, `/debug` |
| Metrics / RED | Grafana **SynTask API Overview**, **SynTask SLO Overview**, Prometheus |
| Traces | Grafana Explore → Tempo; open from a log line's `trace_id` link |
| Alerts | Alertmanager (`127.0.0.1:9093`), [alerts runbook](observability-alerts.md) |

## Required secrets

Deployments read secrets from GitHub Secrets (never committed):

| Secret | Used by |
|---|---|
| `DEV_SSH_HOST` / `DEV_SSH_USER` / `DEV_SSH_KEY` / `DEV_SSH_PORT` | dev SSH |
| `DEV_BACKEND_ENV` / `DEV_FRONTEND_ENV` | dev env files |
| `PROD_SSH_HOST` / `PROD_SSH_USER` / `PROD_SSH_KEY` / `PROD_SSH_PORT` | prod SSH |
| `PROD_BACKEND_ENV` / `PROD_FRONTEND_ENV` | prod env files |
| `PROD_GRAFANA_ADMIN_PASSWORD` | Grafana admin account (`GF_SECURITY_ADMIN_PASSWORD`) |

## Known limitations

* Recreating a container briefly interrupts its requests. Minimise the window by
  building before `up -d`; do not claim zero downtime.
* `git`-based rollback restores code and Compose files, not environment files.
  If a failed release changed `backend/.env`/`frontend/.env`, restore the prior
  values manually and rerun `deploy.sh`.
* Rollback rebuilds images; there is no pre-baked previous-image tag.

## Related

* [CI/CD](../infrastructure/CI_CD.md)
* [Security](../infrastructure/SECURITY.md)
* [Tracing](../observability/TRACING.md)
* [ADR: safe deployment and rollback](../architecture/decisions/2026-09-13-safe-deployment-and-rollback.md)
