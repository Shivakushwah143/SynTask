# SynTask Production Deployment Guide

Status: repository-supported Compose procedure; production controls require verification  
Last reviewed: 2026-07-17

## Deployment model

- Development: `docker-compose.dev.yml`, source mounts, Vite 3000, API 8000, locally exposed MongoDB/Redis.
- Production baseline: `docker-compose.prod.yml`, Nginx port 80, internal frontend/API, two Uvicorn workers, Celery worker, MongoDB, Redis, and named volumes.
- Target: external TLS/load balancer, managed MongoDB/Redis, object storage, centralized telemetry, and independent backups.

## Preconditions

- Docker Engine/Compose v2 and approved host capacity.
- DNS, TLS, firewall, and deployment identity approved.
- Secrets supplied outside Git with least privilege.
- Pinned release commit/tag and successful CI evidence.
- Backup/rollback owner available.
- Production `backend/.env` derived from `.env.example`; frontend/API URLs verified.

Validate `ENVIRONMENT`, keys, database/Redis URLs, allowed origins/hosts, bootstrap admin, frontend/API URLs, and only enabled integration credentials. Never print secret values during validation.

## Development procedure

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml up --build
```

Verify frontend, `/health`, database/Redis health, login, and a tenant-scoped read.

## Production procedure

1. Record commit, operator, window, current service state, and rollback commit.
2. Confirm database/file backup and last restoration evidence.
3. Validate configuration: `docker compose -f docker-compose.prod.yml config --quiet`.
4. Build immutable images in CI where possible; repository fallback is `docker compose -f docker-compose.prod.yml build`.
5. Apply approved backward-compatible migrations/backfills.
6. Start: `docker compose -f docker-compose.prod.yml up -d`.
7. Inspect: `docker compose -f docker-compose.prod.yml ps`.
8. Verify Nginx/frontend/API, worker, database/Redis, storage, and logs.
9. Smoke-test login/logout, role denial, cross-tenant denial, project/task write, an enabled critical module, upload/download, queued job, and configured sandbox callback.
10. Observe error rate, latency, resources, and queue depth through stabilization; record evidence.

## TLS and exposure warning

Production Compose publishes Nginx on port 80 without certificates. Do not expose it directly as a production-grade endpoint. Terminate TLS at an approved load balancer/proxy or add reviewed certificate configuration. Do not expose MongoDB, Redis, or the API directly to the internet.

## Data and storage

Named volumes persist on one Docker host but are not high availability or independent backup. Use object storage before multi-host scaling. Keep MongoDB backups outside Compose and prove restoration. Decide Redis persistence according to revocation/queue recoverability needs.

## Rollback

- Application-only/backward compatible: redeploy the last known-good image/commit.
- Schema expansion: old code must tolerate new optional fields/indexes.
- Destructive migration: require tested reverse migration or restoration; otherwise no-go.
- External side effects: reconcile or compensate; do not replay unsafe callbacks.

After rollback, repeat health/security smoke tests and reconcile jobs/provider events created in the failed window.

## Troubleshooting

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --since=15m backend
docker compose -f docker-compose.prod.yml logs --since=15m worker
```

Check dependency health, configuration presence, DNS/TLS, capacity, database limits, Redis/queue, storage, and migrations before repeated restarts. Never paste secrets or full sensitive payloads into tickets.

## Decommissioning

Remove traffic, drain jobs, take final backup, confirm retention, and obtain owner approval. Deleting volumes is destructive and requires separate explicit approval.

