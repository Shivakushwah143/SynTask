# SynTask - Multi-Tenant B2B SaaS Task Management Platform

## Overview
SynTask is a multi-tenant B2B SaaS platform for task management, project boards, ticketing, client operations, billing workflows, MSA signing, meetings, Google Workspace, chat, and sales CRM. It is built for companies that need one operational workspace with tenant isolation, role-based access, and module-based feature access.

The application has a FastAPI backend, MongoDB/Beanie document models, Redis-backed token revocation, and a React 18 frontend. It supports a five-level role hierarchy, company-scoped data access, task/project workflows, support tickets, invoice and ledger flows, sales contacts/prospects/products, lead Discovery/Audit workspaces, quotation-driven Proposal status, a dedicated Negotiation workspace, contract-driven Agreement status, and super-admin tenant management.

## Tech Stack
| Layer | Technology |
|---|---|
| Backend | FastAPI, Uvicorn, Beanie ODM, Motor, Pydantic, SlowAPI |
| Frontend | React 18, Vite, Zustand, React Query, Tailwind CSS, Axios |
| Database | MongoDB Atlas or MongoDB 6+ |
| Cache/Security | Redis 7+ for JWT blacklist and future caching |
| AI Retrieval | Qdrant `v1.14.1` with `qdrant-client==1.14.3` for RAG vector storage |
| Background Work | asyncio deadline checker, reminder scheduler, and one-minute scheduled-job runner; Celery worker service |
| Deployment | Docker, Docker Compose, Nginx reverse proxy |

## Prerequisites
- Python 3.11
- Node.js 18+
- MongoDB Atlas account or local MongoDB 6+
- Redis 7+
- Qdrant `v1.14.1` for RAG development and release-gate integration tests
- Docker Desktop if using Redis or Docker Compose locally

## Quick Start

Use the dedicated startup guide for the canonical local workflow:

- [Startup Guide](docs/infrastructure/STARTUP_GUIDE.md)

### Minimal local setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Copy `frontend/.env.example` to `frontend/.env` if you want local frontend overrides.
3. Start the development stack with `.\bootstrap.ps1` on Windows or `./bootstrap.sh` on Linux/macOS.

The frontend defaults to Vite port `3000`. The backend API defaults to port `8000`. See the startup guide for the complete port map and commands.

MongoDB must be reachable before using authenticated API routes. If database initialization fails, the backend starts in a degraded state, `/health` reports `503`, `/api/v1/*` routes return a database-unavailable `503`, and database background workers are skipped until the backend is restarted with a valid `MONGODB_URL`.

## Environment Variables
## Environment Variables
See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example). Required backend variables are `SECRET_KEY`, `ENCRYPTION_KEY`, `MONGODB_URL`, `DATABASE_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `REDIS_URL`. RAG development uses `QDRANT_URL` against pinned Qdrant server `v1.14.1` with `qdrant-client==1.14.3`. Optional integrations include SMTP, Brevo, Stripe, Razorpay, Zoom, Google OAuth, AWS S3, Celery overrides, AI provider keys, and the disabled-by-default Meta foundation. Google Workspace support reuses the existing Google OAuth flow and can use `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and workspace scope configuration when connected account features are enabled. Meta deployment credentials use `META_APP_ID`, `META_APP_SECRET`, and `META_VERIFY_TOKEN`; `META_INTEGRATION_ENABLED=False` remains the safe default. The startup guide and infrastructure audit document the full environment strategy.

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
- Client CRM with profile, CRM contacts, services, deliverables, client approval, communication, meetings, files/documents, activity, finance, renewal/churn, health, next action, escalation, overview insights, saved views, automation, AI client intelligence, and project links
- Invoicing, ledger, MSA generation/signing, and payment tracking
- Chat conversations and group chat
- Meetings and calendar endpoints
- Google Workspace module for Gmail, Calendar, Meet, and connection diagnostics
- Sales CRM for categories, products, contacts, prospects, stage-specific pipeline pages, masters, and reports
- Super-admin tenant, usage, plans, and billing management
- **HRMS (Human Resource Management System):** Employee profiles, HR documents, leave management (configurable types + balances), attendance with policy engine + corrections, versioned salary structures, payroll processing, payslip PDF generation, employee self-service (My HR), employee lifecycle management (confirmation/promotion/transfer/resignation/exit), HR dashboard with real metrics, and HR reports with role-based access control
- **Executive Operations Agent (`/executive-assistant`):** a company-wide command-center chat backed by the Executive Agent. Streamed operational states, structured answer cards (KPIs, tables, risk items, summaries) instead of raw Markdown, capability chips, expandable "Sources checked" evidence, and contextual follow-up actions. See the [Executive Assistant user flow](docs/user-flows/executive-assistant.md).

## User Roles
| Role | Scope | Can Create |
|---|---|---|
| Super Admin | Whole platform | Company admins |
| Admin | One company tenant | Managers, leads, employees |
| Manager | Team hierarchy | Managers and leads |
| Lead | Direct execution team | Employees |
| Employee | Individual task/ticket work | No users |

Employees can be assigned as a project Leader without changing their global role. In that case, the backend grants Lead-level permissions only for that project and recalculates access from current project membership on every protected request.

## Multi-Tenancy
SynTask uses a single database with tenant isolation through `company_id` fields. Most tenant-owned models store `company_id`, and API queries use the authenticated user from `get_current_user()` plus dependency helpers to restrict access. Super admins can cross tenant boundaries; company users are scoped to their company.

## HRMS Module

The HRMS module provides end-to-end HR management integrated into SynTask:

| Area | Routes |
|---|---|
| HR Dashboard | `/hr/dashboard` |
| HR Reports | `/hr/reports` |
| Employees | `/hr/employees`, `/hr/employees/:id` |
| HR Documents | `/hr/documents` |
| Leave Allocations | `/hr/leave-allocations` |
| Payroll | `/hr/payroll`, `/hr/payroll/:periodId` |
| Employee Self-Service | `/hr/me`, `/hr/me/profile`, `/hr/me/attendance`, `/hr/me/leave`, `/hr/me/documents`, `/hr/me/payslips` |
| HR Settings | `/hr/settings/leave-types`, `/hr/settings/document-types`, `/hr/settings/attendance-policy`, `/hr/settings/holidays`, `/hr/settings/salary-components` |

For detailed implementation status, see [docs/HRMS_FINAL_READINESS_REPORT.md](docs/HRMS_FINAL_READINESS_REPORT.md).

## Documentation
- [Documentation Index](docs/DOCUMENTATION_INDEX.md)
- [Product Requirements](docs/product/PRD.md)
- [SOP Library User Flow](docs/user-flows/sop-library.md)
- [Executive Assistant User Flow](docs/user-flows/executive-assistant.md)
- [Global Time ADR](docs/architecture/decisions/2026-07-19-global-time-service.md)
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
