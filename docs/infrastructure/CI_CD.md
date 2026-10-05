# CI/CD

## Branch Strategy

- `main` maps to production
- `dev` maps to development
- `feature/*` branches are for short-lived feature work and merge through pull requests
- No `release/*` or `staging/*` branches are used

This keeps the workflow simple: feature work is reviewed into `dev`, and `dev` is promoted to `main` when production-ready.

## CI

The repository uses one GitHub Actions workflow for continuous integration.

It runs on:

- Pull requests
- Pushes to `dev`
- Pushes to `main`

CI performs:

- Repository checkout
- Backend setup and dependency installation
- Frontend setup and dependency installation
- Backend dependency audit
- Backend lint/validation
- Frontend linting
- Backend tests
- Frontend tests
- Deployment script validation (`bash -n`, plus a guard that `deploy.sh` never runs `docker compose down`)
- Docker Compose configuration validation for both stacks
- Frontend build
- Docker image builds for backend and frontend

CI does not deploy.

## Development Deployment

Pushes to `dev` trigger an automatic deployment to the development server.

Deployment flow:

1. SSH into the development server
2. Pull the latest `dev` branch
3. Write the development environment files from GitHub Secrets
4. Run `scripts/deployment/deploy.sh --env development --yes`, which builds and updates services **without** `docker compose down`
5. Wait for the health gate (`/livez`, `/readyz`, Prometheus target, frontend) with bounded retries
6. Record the release on success; on failure roll back to the previous recorded release and re-verify

## Production Deployment

Pushes to `main` trigger an automatic deployment to the production server.

Deployment flow:

1. SSH into the production server
2. Pull the latest `main` branch
3. Write the production environment files from GitHub Secrets (and expose `GRAFANA_ADMIN_PASSWORD`)
4. Run `scripts/deployment/deploy.sh --env production --yes`, which builds and updates services **without** `docker compose down`
5. Wait for the health gate (`/livez`, `/readyz`, Prometheus target, frontend) with bounded retries
6. Record the release on success; on failure roll back to the previous recorded release and re-verify

Normal deployments must not use `docker compose down`; they update services in place so databases, volumes and networks are preserved.

## Rollback Procedure

Rollback is scripted and verified. `deploy.sh` records the previous release in
`.deploy-state/<env>.json` and rolls back automatically when an update or the
health gate fails. Manual rollback:

```bash
cd /opt/syntask
bash scripts/deployment/rollback.sh --env production --yes
# equivalent: bash scripts/deployment/deploy.sh --env production --rollback --yes
```

This restores the previous release SHA, rebuilds, updates services in place and
re-runs the health gate. It never deletes volumes or the database. See the
[deployment and rollback runbook](../runbooks/DEPLOYMENT_ROLLBACK.md).

As a fallback, pushing the previous known-good commit to `dev`/`main` re-runs
the deployment workflow on that revision.

## Required GitHub Secrets

Development deployment:

- `DEV_SSH_HOST`
- `DEV_SSH_USER`
- `DEV_SSH_KEY`
- `DEV_SSH_PORT`
- `DEV_BACKEND_ENV`
- `DEV_FRONTEND_ENV`

Production deployment:

- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_KEY`
- `PROD_SSH_PORT`
- `PROD_BACKEND_ENV`
- `PROD_FRONTEND_ENV`
- `PROD_GRAFANA_ADMIN_PASSWORD` (Grafana admin account in the production observability stack)

Recommended server prerequisites:

- Docker Engine with Docker Compose v2
- A checked-out copy of the repository at `/opt/syntask`
- SSH access restricted to deployment accounts only

## Notes

- Secrets are never stored in the repository.
- The deployment workflow uses the release health gate and fails fast if a service does not become healthy.
- Each deployment is identified by `SYNTASK_RELEASE_*`, exposed via logs, `/readyz` and `syntask_build_info`, and visible on the **SynTask Deployment Overview** dashboard.
- Production and development remain separate environments with separate secrets.
