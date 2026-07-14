# Frontend local startup

The frontend is a React 18 application served by Vite on `http://localhost:3000`. It expects the backend API at `http://localhost:8000/api/v1`.

## Recommended: start the complete project with Docker

This is the simplest option because it also starts MongoDB, Redis, the backend, and the worker.

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

Then open `http://localhost:3000`. Check the API at `http://localhost:8000/health`.

To inspect startup errors:

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f frontend backend
```

Stop the project with:

```bash
docker compose -f docker-compose.dev.yml down
```

## Run only the frontend on the host

### Requirements

- Node.js 18 or newer
- npm (included with Node.js)
- A running backend on port `8000`

Confirm the tools are available:

```bash
node --version
npm --version
```

From the `frontend` directory:

```powershell
# Windows PowerShell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm ci
npm run dev
```

```bash
# Linux or macOS
cp -n .env.example .env
npm ci
npm run dev
```

The expected terminal output includes a local URL for `http://localhost:3000`. Keep this terminal open while using the application.

The local `.env` should contain:

```dotenv
VITE_API_URL=http://localhost:8000/api/v1
VITE_LOGIN_URL=http://localhost:3000/login
```

Restart Vite after changing `.env`; environment changes are not picked up while it is running.

## Verify the frontend

Before opening the UI, verify the backend and then the frontend:

```powershell
Invoke-WebRequest http://localhost:8000/health
Invoke-WebRequest http://localhost:3000
```

On Linux/macOS, use `curl http://localhost:8000/health` and `curl -I http://localhost:3000`.

Optional project checks:

```bash
npm run build
npm test
```

## Common errors

### `npm` or `node` is not recognized

Install Node.js 18+ and open a new terminal. Confirm with `node --version`.

### Dependency installation fails or the dependency tree is inconsistent

Use `npm ci`, not `npm install`, because the repository contains `package-lock.json`. If dependencies were installed with a different Node version, remove `node_modules` and run `npm ci` again.

### Port 3000 is already in use

Stop the other process, or temporarily run:

```bash
npm run dev -- --port 3001
```

If using port 3001, add `http://localhost:3001` to backend `ALLOWED_ORIGINS` and update `VITE_LOGIN_URL`.

### The page opens but login/API requests fail

1. Open `http://localhost:8000/health` directly.
2. Confirm `VITE_API_URL` ends in `/api/v1`.
3. Start the backend if the health URL does not respond.
4. Check the browser Network tab and the Vite terminal for the exact request error.

`ERR_CONNECTION_REFUSED` means the target service is not running or is using another port. A browser CORS error means the frontend URL is missing from backend `ALLOWED_ORIGINS`.

### Blank page or compile error

Read the first error in the Vite terminal and browser console; later errors are often consequences of the first one. Run `npm run build` for a clean, reproducible error report.

