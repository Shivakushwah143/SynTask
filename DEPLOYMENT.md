# Deployment Guide - SynTask

## Option A: Docker Compose
Docker Compose is suitable for local integration and future production hardening.

```powershell
cd C:\Users\HP\Desktop\intern\taskmanagent-
copy backend\.env.example backend\.env
# Fill backend\.env with real values
docker compose up -d --build
```

Services currently defined:
- `backend`: FastAPI app built from `backend/Dockerfile`
- `mongo`: local MongoDB 7 container
- `redis`: Redis 7 Alpine

For Atlas production deployments, set `MONGODB_URL` in `backend/.env` to the Atlas connection string and remove or ignore the local `mongo` service as needed.

## Option B: Manual Windows Server Deployment
This reflects the current PM2-style deployment configuration in the repository.

### Backend
```powershell
cd C:\apps\task-management\backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
```

The backend PM2 ecosystem file points to `C:\apps\task-management\backend` and runs Uvicorn through Python.

### Frontend
```powershell
cd C:\apps\task-management\frontend
npm install
npm run build
pm2 start ecosystem.config.js
```

The frontend PM2 ecosystem file runs `server.js` on port `3000`.

### Reverse Proxy
Use Nginx, Caddy, IIS ARR, or another reverse proxy:
- `/` -> frontend on port `3000`
- `/api` -> backend on port `8000`
- `/uploads` -> backend static upload mount or object storage path

Enable HTTPS, HSTS, and proxy headers.

## Environment Variables
Use [backend/.env.example](backend/.env.example). Required values:
- `ENVIRONMENT`
- `SECRET_KEY`
- `ENCRYPTION_KEY`
- `MONGODB_URL`
- `DATABASE_NAME`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- `ALLOWED_HOSTS`
- `REDIS_URL`

Optional integrations include SMTP, Stripe, Razorpay, Zoom, and AWS S3.

## First-Time Setup
1. Copy `backend/.env.example` to `backend/.env`.
2. Fill required secrets and URLs.
3. Start Redis.
4. Start backend.
5. Run `python scripts/init_super_admin.py`.
6. Login as super admin.
7. Create the first company and admin user.

## Production Checklist
- [ ] `ENVIRONMENT=production`
- [ ] `SECRET_KEY` is strong and not reused
- [ ] `ENCRYPTION_KEY` is a valid Fernet key
- [ ] `MONGODB_URL` uses rotated production credentials
- [ ] Redis is running and reachable
- [ ] SMTP credentials configured if password reset email is required
- [ ] `FRONTEND_URL` set to production domain
- [ ] `ALLOWED_ORIGINS` and `ALLOWED_HOSTS` are strict
- [ ] TLS certificate active
- [ ] PM2 startup configured: `pm2 startup` and `pm2 save`
- [ ] Test users removed
- [ ] `/api/docs` disabled in production by `ENVIRONMENT=production`

## Health Checks
```http
GET /health
```

Expected:
```json
{"status":"healthy","version":"1.0.0","environment":"production"}
```

## Rollback Procedure
1. Keep the previous backend commit available.
2. Keep the previous frontend `dist` or deployment directory.
3. Stop PM2 process or service.
4. Restore previous backend/frontend build.
5. Restart backend and frontend.
6. Confirm `/health` and frontend login.

## Operational Notes
- Rotate any credential that has appeared in source or chat.
- Back up MongoDB before schema-affecting migrations.
- Keep Redis memory monitored because token blacklist entries live until token expiry.
