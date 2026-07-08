# SynTask Startup Guide

## Recommended workflow

Use Docker Compose as the canonical local workflow.

### Windows

```powershell
.\bootstrap.ps1
```

### Linux and macOS

```bash
./bootstrap.sh
```

### Direct Compose

```powershell
docker compose -f docker-compose.dev.yml up --build -d
```

## Common commands

Use the Makefile from the repository root.

```powershell
make up
make down
make logs
make build
make test
make lint
make clean
make restart
```

## Expected local ports

### Development

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Backend health: `http://localhost:8000/health`
- API docs: `http://localhost:8000/api/docs`
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`

### Production compose

- Public entrypoint: `http://localhost`
- Backend health through Nginx: `http://localhost/health`

## First run checklist

1. Copy `backend/.env.example` to `backend/.env`.
2. Copy `frontend/.env.example` to `frontend/.env` if you want local frontend overrides.
3. Start the stack with one of the bootstrap commands above.
4. Wait for health checks to pass.
5. Open the frontend URL and verify the backend health endpoint.

## Notes

- `make up` starts the development stack in detached mode.
- `make logs` follows the full stack logs.
- `make clean` removes the development stack and its volumes.
- Backend startup waits for MongoDB and Redis before serving traffic.
- The worker waits for MongoDB, Redis, and backend health before starting.
