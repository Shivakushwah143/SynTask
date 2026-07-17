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
| Background Work | asyncio deadline checker; Celery worker service |
| Deployment | Docker, Docker Compose, Nginx reverse proxy |

## Prerequisites
- Python 3.11
- Node.js 18+
- MongoDB Atlas account or local MongoDB 6+
- Redis 7+
- Docker Desktop if using Redis or Docker Compose locally

## Quick Start

Use the dedicated startup guide for the canonical local workflow:

- [Startup Guide](docs/infrastructure/STARTUP_GUIDE.md)

### Minimal local setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Copy `frontend/.env.example` to `frontend/.env` if you want local frontend overrides.
3. Start the development stack with `.\bootstrap.ps1` on Windows or `./bootstrap.sh` on Linux/macOS.

The frontend defaults to Vite port `3000`. The backend API defaults to port `8000`. See the startup guide for the complete port map and commands.

## Environment Variables
See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example). Required backend variables are `SECRET_KEY`, `ENCRYPTION_KEY`, `MONGODB_URL`, `DATABASE_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `REDIS_URL`. Optional integrations include SMTP, Brevo, Stripe, Razorpay, Zoom, AWS S3, Celery overrides, and AI provider keys. The startup guide and infrastructure audit document the full environment strategy.

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
- [Documentation Index](docs/DOCUMENTATION_INDEX.md)
- [Product Requirements](docs/product/PRD.md)
- [Detailed Architecture](docs/architecture/DETAILED_ARCHITECTURE.md)
- [Non-Functional Requirements](docs/architecture/NON_FUNCTIONAL_REQUIREMENTS.md)
- [Production Deployment Guide](docs/infrastructure/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Master Test Plan](docs/quality/TEST_PLAN.md)
- [Go-Live Readiness](docs/operations/GO_LIVE_READINESS.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Security](docs/infrastructure/SECURITY.md)
- [Deployment](docs/infrastructure/DEPLOYMENT.md)
- [CI/CD](docs/infrastructure/CI_CD.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Startup Guide](docs/infrastructure/STARTUP_GUIDE.md)
- [API Documentation](backend/API_DOCUMENTATION.md)
- [Database Schema](backend/DATABASE_SCHEMA.md)
- [Testing Guide](docs/TESTING_GUIDE.md)

## License
Proprietary. Copyright SynTask / Alphanexis Tech LLC.

Documentation is maintained as part of feature delivery. Repository-wide Codex instructions are in [AGENTS.md](AGENTS.md); every implementation change must review its PRD, user-flow, architecture, testing, deployment, and README impact.
