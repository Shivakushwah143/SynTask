# SynTask - Multi-Tenant B2B SaaS Task Management Platform

## Overview
SynTask is a multi-tenant B2B SaaS platform for task management, project boards, ticketing, client operations, billing workflows, MSA signing, meetings, chat, and sales CRM. It is built for companies that need one operational workspace with tenant isolation, role-based access, and module-based feature access.

The application has a FastAPI backend, MongoDB/Beanie document models, Redis-backed token revocation, and a React 18 frontend. It supports a five-level role hierarchy, company-scoped data access, task/project workflows, support tickets, invoice and ledger flows, sales contacts/prospects/products, and super-admin tenant management.

## Tech Stack
| Layer | Technology |
|---|---|
| Backend | FastAPI, Uvicorn, Beanie ODM, Motor, Pydantic, SlowAPI |
| Frontend | React 18, Vite, Zustand, React Query, Tailwind CSS, Axios |
| Database | MongoDB Atlas or MongoDB 6+ |
| Cache/Security | Redis 7+ for JWT blacklist and future caching |
| Background Work | asyncio deadline checker; Celery dependencies are present for future workers |
| Deployment | Docker, Docker Compose, PM2, Nginx |

## Prerequisites
- Python 3.11
- Node.js 18+
- MongoDB Atlas account or local MongoDB 6+
- Redis 7+
- Docker Desktop if using Redis or Docker Compose locally

## Quick Start
### 1. Clone the Repository
```powershell
git clone <repo-url>
cd taskmanagent-
```

### 2. Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Fill in required values in `backend/.env`:
- `SECRET_KEY`: generate with `python -c "import secrets; print(secrets.token_hex(32))"`
- `ENCRYPTION_KEY`: generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `MONGODB_URL`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `REDIS_URL`

Run Redis:
```powershell
docker run -d --name syntask-redis -p 6379:6379 redis:7-alpine
```

Run the backend:
```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Initialize Super Admin
```powershell
cd backend
.\.venv\Scripts\activate
python scripts\init_super_admin.py
```

### 4. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```

The frontend defaults to Vite port `3000`. Set `VITE_API_URL=http://localhost:8000/api/v1` in a frontend env file if you need to override API location.

### 5. Verify
- Backend health: http://localhost:8000/health
- Frontend: http://localhost:3000
- Swagger docs in development: http://localhost:8000/api/docs

## Environment Variables
See [backend/.env.example](backend/.env.example). Required backend variables are `SECRET_KEY`, `ENCRYPTION_KEY`, `MONGODB_URL`, `DATABASE_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `REDIS_URL`. Optional integrations include SMTP, Stripe, Razorpay, Zoom, and AWS S3.

## Project Structure
```text
backend/                 FastAPI application, Beanie models, scripts, API docs
backend/app/api/         Versioned endpoint routers and dependencies
backend/app/core/        Config, security, database, Redis, email, background helpers
backend/app/models/      MongoDB document models
backend/app/schemas/     Pydantic request/response schemas
backend/scripts/         One-off setup and migration scripts
frontend/                React/Vite single-page app
frontend/src/api/        Axios API client modules
frontend/src/components/ Reusable UI components
frontend/src/pages/      Application pages
docs/                    Testing guide and diagrams
```

## Key Features
- Task management with comments, attachments, statuses, subtasks, watchers, versions, components, workflows, automation, backlog, epics, and sprints
- Project Kanban boards and project files/pages
- Ticketing system with assignments, comments, priorities, escalation fields, and reporting
- Client CRM with documents and project links
- Invoicing, ledger, MSA generation/signing, and payment tracking
- Chat conversations and group chat
- Meetings and calendar endpoints
- Sales CRM for categories, products, contacts, prospects, masters, and reports
- Super-admin tenant, usage, plans, and billing management

## User Roles
| Role | Scope | Can Create |
|---|---|---|
| Super Admin | Whole platform | Company admins |
| Admin | One company tenant | Managers, leads, employees |
| Manager | Team hierarchy | Managers and leads |
| Lead | Direct execution team | Employees |
| Employee | Individual task/ticket work | No users |

## Multi-Tenancy
SynTask uses a single database with tenant isolation through `company_id` fields. Most tenant-owned models store `company_id`, and API queries use the authenticated user from `get_current_user()` plus dependency helpers to restrict access. Super admins can cross tenant boundaries; company users are scoped to their company.

## Documentation
- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
- [Deployment](DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
- [API Documentation](backend/API_DOCUMENTATION.md)
- [Database Schema](backend/DATABASE_SCHEMA.md)
- [Testing Guide](docs/TESTING_GUIDE.md)

## License
Proprietary. Copyright SynTask / Alphanexis Tech LLC.
