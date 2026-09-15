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
| Observability | Prometheus, Grafana, Loki + Grafana Alloy, Alertmanager, Grafana Tempo + OpenTelemetry tracing, Node Exporter, cAdvisor, Redis Exporter |

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

## Observability

Production deployments run an internal observability stack on the `syntask` Docker network. Only loopback-bound UIs are reachable from the host.

| Component | Purpose | Dev port | Prod exposure |
|---|---|---|---|
| Prometheus | Metrics, alert rule evaluation | `9090` | `127.0.0.1:9090` |
| Grafana | API, infrastructure, logs and alert dashboards | `3001` | `127.0.0.1:3001` |
| Loki | Centralized log storage (7-day retention) | `3100` | internal only |
| Alloy | Collects container stdout/stderr and forwards to Loki | `12345` | internal only |
| Tempo | Distributed tracing store (OTLP gRPC `4317` / HTTP `4318`, 48 h retention) | `3200` (query API) | internal only |
| Alertmanager | Groups, de-duplicates and routes Prometheus alerts | `9093` | `127.0.0.1:9093` |
| Node Exporter / cAdvisor / Redis Exporter | Host, container and Redis metrics | internal | internal only |

Configuration is version-controlled under `observability/`; Docker log rotation is configured in both Compose files. Loki, Alloy, Alertmanager and the exporters are never published publicly.

Reliability is measured with two internal SLOs (availability >= 99.5%, latency >= 95% within 2.5s, rolling 7 days) shown on the **SynTask SLO Overview** dashboard. See [docs/observability/SLOS.md](docs/observability/SLOS.md) for SLI/SLO/error-budget definitions and the distinction from any contractual SLA. Operational runbooks: [alerts](docs/runbooks/observability-alerts.md), [incident drill](docs/runbooks/INCIDENT_DRILL.md), [incident template](docs/runbooks/INCIDENT_TEMPLATE.md).

Distributed tracing is provided by OpenTelemetry exported over OTLP to Grafana Tempo, with distinct `service.name` values for the backend and Celery worker. Structured logs carry both `request_id` and `trace_id`, so Grafana can pivot from a log line to its trace. See [docs/observability/TRACING.md](docs/observability/TRACING.md). Tracing is sampled at 10% in production (configurable via `OTEL_TRACES_SAMPLER_ARG`).

Application deployments use `scripts/deployment/deploy.sh`, which never runs `docker compose down`, waits for release readiness, and rolls back to the previous recorded release when the health gate fails. Each release is identified by `syntask_build_info{version,commit,environment}` and an `event=deployment` structured log line. See [the deployment and rollback runbook](docs/runbooks/DEPLOYMENT_ROLLBACK.md).

MongoDB must be reachable before using authenticated API routes. If database initialization fails, the backend starts in a degraded state, `/health` reports `503`, `/api/v1/*` routes return a database-unavailable `503`, and database background workers are skipped until the backend is restarted with a valid `MONGODB_URL`.

## Environment Variables
## Environment Variables
See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example). Required backend variables are `SECRET_KEY`, `ENCRYPTION_KEY`, `MONGODB_URL`, `DATABASE_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `REDIS_URL`. RAG development uses `QDRANT_URL` against pinned Qdrant server `v1.14.1` with `qdrant-client==1.14.3`. Optional integrations include SMTP, Brevo, Stripe, Razorpay, Zoom, Google OAuth, AWS S3, Celery overrides, AI provider keys, and the disabled-by-default Meta foundation. Google Workspace support reuses the existing Google OAuth flow and can use `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and workspace scope configuration when connected account features are enabled. Meta deployment credentials use `META_APP_ID`, `META_APP_SECRET`, and `META_VERIFY_TOKEN`; `META_INTEGRATION_ENABLED=False` remains the safe default. The startup guide and infrastructure audit document the full environment strategy. Observability-specific optional variables are `OTEL_TRACES_ENABLED` (false outside production; set true to trace locally), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER_ARG`, and the deploy-time `SYNTASK_RELEASE_{COMMIT,VERSION,BRANCH,BUILT_AT}` release identity values. Production Compose also requires `GRAFANA_ADMIN_PASSWORD`.

## Project Structure
```text
backend/                 FastAPI application, Beanie models, scripts, API docs
backend/app/api/         Versioned endpoint routers and dependencies
backend/app/core/        Config, security, database, Redis, email, background helpers
backend/app/models/      MongoDB document models
backend/app/schemas/     Pydantic request/response schemas
backend/scripts/         One-off setup and migration scripts
frontend/                React/Vite single-page app
frontend/src/api/        Axios API client modules (permissions.js, etc.)
frontend/src/components/ Reusable UI components (permissions/UserAccessEditor.jsx, etc.)
frontend/src/hooks/      React hooks (usePermissions.js for can/effective/hasModule)
frontend/src/pages/      Application pages
docs/                    Testing guide and diagrams
```

## Key Features
- Task management with comments, attachments, strict execution/review statuses, checklist and dependency blockers, subtasks, watchers, versions, components, workflows, automation, backlog, epics, and sprints
- Work Requests for operational requests, approvals, blockers, resource needs, client requests, and conversion into Tasks or Projects without replacing Support Tickets
- Scheduled Work with one-time scheduled jobs plus recurring task-generation rules backed by occurrence history and pause/resume controls
- Project Kanban boards and project files/pages
- Ticketing system with assignments, comments, priorities, escalation fields, and reporting
- Client CRM with profile, CRM contacts, services, deliverables, client approval, communication, meetings, files/documents, activity, finance, renewal/churn, health, next action, escalation, overview insights, saved views, automation, AI client intelligence, and project links
- Invoicing, ledger, MSA generation/signing, and payment tracking
- Chat conversations and group chat
- Meetings and calendar endpoints
- Google Workspace module for Gmail, Calendar, Meet, and connection diagnostics
- Sales CRM for categories, products, contacts, prospects, stage-specific pipeline pages, masters, and reports
- Super-admin tenant, usage, plans, and billing management
- **HRMS (Human Resource Management System):** Employee profiles, HR documents, leave management (configurable types + balances), attendance with policy engine + corrections + eTimeOffice biometric sync (server-side), versioned salary structures, payroll processing, payslip PDF generation, employee self-service (My HR), employee lifecycle management (confirmation/promotion/transfer/resignation/exit), employee detail change request workflow (self-service profile edits with admin approval, stale-data detection), HR dashboard with real metrics, and HR reports with role-based access control
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

The Admin Permissions page supports catalog-backed action overrides in addition to module access. An override can inherit, allow, or deny a business capability and may be scoped to the relevant resource relationship; tenant isolation and protected platform administration remain non-configurable. See the [authorization override ADR](docs/architecture/decisions/2026-09-10-granular-authorization-overrides.md).

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
- [Distributed Tracing](docs/observability/TRACING.md)
- [Deployment and Rollback Runbook](docs/runbooks/DEPLOYMENT_ROLLBACK.md)
- [Observability Alerts Runbook](docs/runbooks/observability-alerts.md)

## License
Proprietary. Copyright SynTask / Alphanexis Tech LLC.

Documentation is maintained as part of feature delivery. Repository-wide Codex instructions are in [AGENTS.md](AGENTS.md); every implementation change must review its PRD, user-flow, architecture, testing, deployment, and README impact.
# Work Module Foundation

The Projects module uses logical `Project.project_id` for user-visible identity and MongoDB `_id` internally. Phase 1 adds backend-owned Project Owner (`lead_id`), client linkage (`client_id`), business priority, company-persistent project types, derived project health, deadline urgency, and progress. See `PHASE1_WORK_FOUNDATION_REPORT.md` for verification details and `docs/architecture/decisions/2026-09-02-work-phase1-project-foundation.md` for the architecture decision.

Phase 2 adds strict Task execution/review workflow with reviewer assignment, checklist gates, dependency blockers, semantic action endpoints, changelog/timeline audit, and updated task board statuses. See `PHASE2_TASK_EXECUTION_REPORT.md`.

Phase 4 adds Work Requests plus recurring Scheduled Work. Work Requests coordinate operational approvals and conversion into Tasks/Projects without replacing Support Tickets. Scheduled Work supports one-time and recurring jobs, occurrence history, and pause/resume controls. See `PHASE4_REQUESTS_SCHEDULED_WORK_REPORT.md` and `docs/architecture/decisions/2026-09-02-work-phase4-requests-recurring-work.md`.

Phase 5 adds backend-authoritative active timers, timer/manual TimeLog sources, server-side time reporting, and project completion readiness gates before completion/archive. See `PHASE5_TIME_PROJECT_CONTROL_REPORT.md` and `docs/architecture/decisions/2026-09-02-work-phase5-time-project-control.md`.
