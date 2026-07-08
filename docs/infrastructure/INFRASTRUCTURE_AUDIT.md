# SynTask Infrastructure Audit

## Repository Structure

- `frontend/`: React/Vite SPA, layouts, pages, API clients, UI components, hooks, and build/runtime config.
- `backend/`: FastAPI app, Beanie models, API routers, AI layer, services, worker tasks, scripts, and tests.
- `docs/`: product, testing, architecture, security, and design references.
- `docker-compose.dev.yml`: local developer stack.
- `docker-compose.prod.yml`: production stack.
- `backend/.env.example`: backend environment reference.
- `frontend/.env.example`: frontend environment reference.
- `nginx/reverse-proxy.conf`: production reverse proxy config.

## Build Process

### Frontend
- Development builds run through Vite.
- Production builds compile the React app into `dist/`.
- The frontend Dockerfile now has separate `dev` and `prod` targets.

### Backend
- Development uses Uvicorn with reload.
- Production uses Uvicorn with multiple workers.
- The backend Docker image is shared by the API and Celery worker.

### Production Start
- `backend` serves FastAPI on `8000` inside the Docker network.
- `frontend` serves the compiled SPA on `80` inside the Docker network.
- `nginx` publishes the public entrypoint on host port `80`.
- `worker` runs Celery for background jobs.

### Development Start
- `backend` runs on `8000`.
- `frontend` runs on `3000`.
- `mongo` runs on `27017`.
- `redis` runs on `6379`.

## Environment Variables

### Backend

#### Required
- `ENVIRONMENT`
- `SECRET_KEY`
- `ENCRYPTION_KEY`
- `MONGODB_URL`
- `DATABASE_NAME`
- `REDIS_URL`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`

#### Shared / routing
- `ALLOWED_ORIGINS`
- `ALLOWED_HOSTS`
- `FRONTEND_URL`

#### Email
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM`
- `MAIL_FROM_NAME`
- `MAIL_SERVER`
- `MAIL_PORT`
- `MAIL_TLS`
- `MAIL_SSL`

#### Brevo
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `BREVO_REPLY_TO`
- `BREVO_BASE_URL`
- `BREVO_TIMEOUT_SECONDS`
- `BREVO_RETRY_ATTEMPTS`

#### Payments
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

#### Zoom
- `ZOOM_API_KEY`
- `ZOOM_API_SECRET`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_ACCOUNT_ID`

#### Files and storage
- `MAX_UPLOAD_SIZE`
- `ALLOWED_EXTENSIONS`
- `UPLOAD_DIR`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_BUCKET_NAME`
- `AWS_REGION`

#### Redis and workers
- `ENABLE_TOKEN_REVOCATION`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`

#### Pagination and rate limiting
- `DEFAULT_PAGE_SIZE`
- `MAX_PAGE_SIZE`
- `RATE_LIMIT_REQUESTS`
- `RATE_LIMIT_PERIOD`
- `AUTH_RATE_LIMIT_REQUESTS`
- `AUTH_RATE_LIMIT_PERIOD`

#### Logging and AI
- `LOG_LEVEL`
- `AI_PROVIDER`
- `GROQ_API_KEY`
- `OPENAI_API_KEY`
- `AI_TIMEOUT`
- `AI_MAX_TOKENS`
- `AI_TEMPERATURE`
- `AI_MODEL_GROQ`
- `AI_MODEL_OPENAI`

### Frontend

#### Required for local development
- `VITE_API_URL`
- `VITE_LOGIN_URL`

### Compose/runtime
- `PORT`
- `NODE_ENV`
- `PYTHONUNBUFFERED`
- `CELERY_CONCURRENCY`

### Classification
- Sensitive: `SECRET_KEY`, `ENCRYPTION_KEY`, all provider keys, all payment keys, all mail credentials, all Zoom credentials, MongoDB credentials, Redis credentials if protected.
- Public: `ALLOWED_ORIGINS`, `ALLOWED_HOSTS`, `FRONTEND_URL`, `VITE_API_URL`, `VITE_LOGIN_URL`, `ENVIRONMENT`, `DATABASE_NAME`, `LOG_LEVEL`, pagination values.
- Missing from the old repo templates and now covered by the new example files: `VITE_LOGIN_URL`, `BREVO_*`, `AI_*`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `AWS_*`, `ZOOM_*`, `STRIPE_PUBLISHABLE_KEY`, `ENABLE_TOKEN_REVOCATION`.
- Unused or weakly used: `ENABLE_TOKEN_REVOCATION`, `LOG_LEVEL`, some `AWS_*` settings, and several payment credentials outside payment-specific code paths.

## Docker Audit

Docker is already used, but the previous setup was split across multiple approaches:
- Root compose file for a partial stack
- PM2 process configs
- Nginx serving wrappers
- Manual Windows copy scripts

The new canonical setup is Docker Compose:
- `backend` image for the FastAPI API
- `frontend` image for the built React app
- `worker` service for Celery
- `mongo` for local/dev data
- `redis` for cache and task queues
- `nginx` as the public reverse proxy

## Database

- Database: MongoDB
- ODM: Beanie
- Driver: Motor / PyMongo
- Migration strategy: scripted migrations under `backend/scripts/`
- Seed strategy: Python and Mongo shell seed scripts for demo and production data
- Backup strategy: not automated in the repo; should be scheduled outside the application

## Deployment

### Current state before standardization
- Manual Windows deployments
- PM2-based process management
- Docker Compose partial local stack
- Nginx and Express wrappers for frontend serving

### Canonical deployment now
- Docker Compose for dev and prod
- External Nginx reverse proxy
- One backend image reused by API and worker
- One frontend image reused by dev and prod targets
- Separate local and production compose files

## Branch Strategy Recommendation

- `main`: production-ready
- `dev`: integration branch
- `feature/*`: isolated feature work
- `hotfix/*`: urgent production fixes
- `release/*`: optional stabilization branch

## Environment Strategy

- Development: local MongoDB, local Redis, frontend dev server
- Staging: production-like Docker stack with separate secrets and database
- Production: locked-down secrets, managed database/Redis preferred, Nginx entrypoint, object storage recommended for uploads

## CI/CD Strategy

Not implemented yet.

Recommended design:
- CI on pull requests and branch pushes
- Build, lint, and test backend and frontend
- Build Docker images
- Promote the same artifact through staging then production
- Roll back by redeploying the previous image/tag

## Security Audit

- No `.gitignore` previously existed.
- Old repo contained stray root-level artifact files.
- Several scripts and templates embedded placeholder credentials and demo passwords.
- Backend email fallback logging can leak sensitive links or credentials.
- Public debug endpoints should be gated or removed in production.

## Risks

### Critical
- Frontend build/runtime mismatch if build-time env vars are not supplied.
- Sensitive values may be logged by email fallback code.

### High
- No automated production deployment.
- No backup orchestration.
- Manual Windows deployment drift.

### Medium
- Local file uploads are not durable by default.
- Multiple legacy deployment paths still exist in the repo.

### Low
- Documentation drift and noisy legacy scripts.

## Recommendations

1. Keep the Docker Compose stack as the only canonical deployment path.
2. Use managed MongoDB and Redis in production.
3. Move file storage to durable object storage when possible.
4. Eliminate sensitive fallback logging.
5. Add automated backups and restore drills.
6. Remove or gate production debug endpoints.
7. Add CI/CD after the infrastructure baseline is stable.
