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
- Backend lint/validation
- Frontend linting
- Backend tests
- Frontend tests
- Frontend build
- Docker image builds for backend and frontend

CI does not deploy.

## Development Deployment

Pushes to `dev` trigger an automatic deployment to the development server.

Deployment flow:

1. SSH into the development server
2. Pull the latest `dev` branch
3. Write the development environment files from GitHub Secrets
4. Rebuild the Docker Compose stack
5. Wait for service health checks to pass
6. Stop immediately if health checks fail

## Production Deployment

Pushes to `main` trigger an automatic deployment to the production server.

Deployment flow:

1. SSH into the production server
2. Pull the latest `main` branch
3. Write the production environment files from GitHub Secrets
4. Rebuild the Docker Compose stack
5. Wait for service health checks to pass
6. Stop immediately if health checks fail

## Rollback Procedure

Rollback is intentionally simple.

1. Re-deploy the previous known-good Git commit or branch tag to the target branch.
2. Re-run the deployment workflow by pushing that commit to `dev` or `main`.
3. If needed, SSH into the server and run:

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up -d --build --wait
```

or, for production:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build --wait
```

Because the deployment is branch-based and Docker Compose driven, rollback is just a redeploy of the prior known-good revision.

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

Recommended server prerequisites:

- Docker Engine with Docker Compose v2
- A checked-out copy of the repository at `/opt/syntask`
- SSH access restricted to deployment accounts only

## Notes

- Secrets are never stored in the repository.
- The deployment workflow uses Compose health checks and fails fast if a service does not become healthy.
- Production and development remain separate environments with separate secrets.
