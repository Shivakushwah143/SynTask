# Deployment Guide - SynTask

## Canonical Deployment

SynTask now uses Docker + Docker Compose as the standard deployment path.

### Files
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `nginx/reverse-proxy.conf`

## Development

1. Copy `backend/.env.example` to `backend/.env`.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. Start the stack:

```powershell
docker compose -f docker-compose.dev.yml up --build
```

Services:
- Backend on `http://localhost:8000`
- Frontend on `http://localhost:3000`
- MongoDB on `localhost:27017`
- Redis on `localhost:6379`

## Production

Use the safe deployment script; it never runs `docker compose down`, waits for a
readiness health gate, and rolls back to the previous release on failure.

```bash
cd /opt/syntask
GRAFANA_ADMIN_PASSWORD='<secret>' \
  bash scripts/deployment/deploy.sh --env production --yes
```

Preconditions: `backend/.env` and `frontend/.env` contain production secrets, and
`GRAFANA_ADMIN_PASSWORD` is set (required by `docker-compose.prod.yml`).

For a manual first start without the script, `docker compose -f
docker-compose.prod.yml up -d --build` is still valid, but normal deployments
should go through the script. See the
[deployment and rollback runbook](../runbooks/DEPLOYMENT_ROLLBACK.md).

Services:
- Public entrypoint through Nginx on port `80`
- Backend internal service on `8000`
- Frontend internal service on `80`
- Celery worker for background jobs
- MongoDB and Redis internal services
- Observability stack (Prometheus/Grafana/Loki/Alloy/Alertmanager/Tempo) — loopback or internal only

## Operational Notes

- The backend and worker share the same backend image.
- The frontend dev and prod targets share the same frontend image definition.
- Use `GET /health` for backend health checks; use `GET /livez` and `GET /readyz` for probes, and the deployment health gate (`scripts/deployment/verify_release.sh`) before declaring a release successful.
- The backend and worker export OpenTelemetry traces to Tempo with distinct service names; see [distributed tracing](../observability/TRACING.md).
- Keep MongoDB backups outside the application stack.
- Store production uploads on durable storage before moving beyond single-node deployments.
