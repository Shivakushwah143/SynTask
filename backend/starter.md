# Backend local startup

The backend is a FastAPI application served on `http://localhost:8000`. It requires MongoDB and Redis. API documentation is available at `http://localhost:8000/api/docs` after startup.

## Recommended: start the complete project with Docker

Docker Compose supplies compatible MongoDB and Redis services and avoids host-name configuration mistakes.

### Requirements

- Docker Desktop (Windows/macOS) or Docker Engine with Compose (Linux)
- Ports `3000`, `8000`, `27017`, and `6379` available

From the repository root (`taskmanagent-`):

```powershell
# Windows
.\bootstrap.ps1
```

```bash
# Linux or macOS
chmod +x bootstrap.sh
./bootstrap.sh
```

The bootstrap script creates missing `.env` files, validates Compose, builds the images, and starts the services.

Verify startup:

```bash
docker compose -f docker-compose.dev.yml ps
curl http://localhost:8000/health
```

In Windows PowerShell, the health command can be:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

If a container is unhealthy or exited, show its real error with:

```bash
docker compose -f docker-compose.dev.yml logs --tail=200 backend mongo redis
```

Stop the stack with `docker compose -f docker-compose.dev.yml down`. Avoid adding `-v` unless you intentionally want to delete local database data.

## Run the backend directly on the host

### Requirements

- Python 3.11 (the project-supported version)
- MongoDB 6+ listening on `localhost:27017`
- Redis 7+ listening on `localhost:6379`

> Important: `.env.example` uses `mongo` and `redis`, which are Docker Compose service names. They do not resolve when Python runs directly on your computer. For a host run, change them to `localhost` as shown below.

### 1. Create and activate a virtual environment

From the `backend` directory:

```powershell
# Windows PowerShell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run this once in the current terminal and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

```bash
# Linux or macOS
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 2. Create the environment file

```powershell
# Windows PowerShell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
```

```bash
# Linux or macOS
cp -n .env.example .env
```

For a host run, ensure these values in `backend/.env`:

```dotenv
ENVIRONMENT=development
MONGODB_URL=mongodb://localhost:27017/alphanexis_task_management
DATABASE_NAME=alphanexis_task_management
REDIS_URL=redis://localhost:6379/0
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
ALLOWED_HOSTS=["localhost","127.0.0.1"]
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=choose-a-local-password-at-least-16-characters
```

Also replace `SECRET_KEY` with a long random value and `ENCRYPTION_KEY` with a valid Fernet key. Generate both from the activated environment:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Paste the first output into `SECRET_KEY` and the second into `ENCRYPTION_KEY`. Do not commit `backend/.env`.

Optional email, payment, Zoom, AWS, and AI keys may remain empty for basic local development.

### 3. Confirm MongoDB and Redis, then start FastAPI

Make sure both services are running. If Docker is available, you can start only the dependencies from the repository root:

```bash
docker compose -f docker-compose.dev.yml up -d mongo redis
```

Then, from `backend` with the virtual environment active:

```bash
python run.py
```

Equivalent command:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Verify `http://localhost:8000/health` and `http://localhost:8000/api/docs`.

### 4. Create the configured super-admin (optional)

With MongoDB running and `.env` configured:

```bash
python scripts/init_super_admin.py
```

Use the `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` values from `.env` to sign in.

## Common errors

### `FATAL: Missing required environment variables`

Run the server from the `backend` directory, confirm `backend/.env` exists, and fill every required setting: `SECRET_KEY`, `ENCRYPTION_KEY`, `MONGODB_URL`, `DATABASE_NAME`, `REDIS_URL`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`.

### MongoDB name-resolution or connection error

- Host run: use `mongodb://localhost:27017/...`.
- Docker Compose run: use `mongodb://mongo:27017/...` (Compose overrides this automatically).
- Confirm MongoDB is running and port `27017` is not blocked.

### Redis name-resolution, timeout, or connection error

- Host run: use `redis://localhost:6379/0`.
- Docker Compose run: use `redis://redis:6379/0`.
- Test a local Redis installation with `redis-cli ping`; the expected response is `PONG`.

### `Invalid Fernet key` or encryption-key error

`ENCRYPTION_KEY` is not an arbitrary password. Generate it with the Fernet command above and paste the complete output without quotes or spaces.

### `ModuleNotFoundError`

Activate `.venv`, run `python -m pip install -r requirements.txt`, and start the command from the `backend` directory. Confirm `python -c "import fastapi, beanie, redis"` succeeds.

### Port 8000 is already in use

Stop the existing backend/container, or identify the process using port 8000. The frontend is configured for port 8000, so changing the backend port also requires changing frontend `VITE_API_URL`.

### Server starts, but the health check reports a dependency failure

Read the backend log first, then confirm MongoDB and Redis independently. With Compose, use:

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs --tail=200 backend mongo redis
```

When reporting an issue, include the first traceback/error, the command used, `python --version`, and whether the services were started with Docker or directly on the host. Never include secret values from `.env`.
