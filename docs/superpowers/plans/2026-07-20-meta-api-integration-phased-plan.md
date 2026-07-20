# Meta API Integration Phased Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add isolated, tenant-safe Meta Lead Ads, read-only marketing insights, and inbound messaging foundations without changing existing CRM behavior.

**Architecture:** Build `app.integrations.meta` as one-way adapter into existing SynTask services. Meta failures remain isolated; CRM never imports Meta code. Global and tenant flags default disabled.

**Tech Stack:** FastAPI, Beanie/MongoDB, Celery/Redis, React 18, React Query, existing Fernet security helpers.

## Global Constraints

- Follow approved design: `docs/superpowers/specs/2026-07-20-meta-api-integration-design.md`.
- Re-read touched code before every phase; stop if repository differs from plan.
- TDD: failing focused test, minimal code, focused pass, full phase gate.
- Every document/query stores or enforces `company_id`.
- Verify raw webhook signature before parsing JSON.
- Never log or return secrets, tokens, signatures, or raw personal data.
- No Meta campaign writes. No automatic WhatsApp/Messenger sending.
- Additive MongoDB scripts only; no destructive startup migration.
- Stop after each phase. Continue only after gate evidence and user approval.

---

## Phase 1 — Foundation and Kill Switch

**Create**

- `backend/app/integrations/__init__.py`
- `backend/app/integrations/meta/__init__.py`
- `backend/app/integrations/meta/models.py`
- `backend/app/integrations/meta/schemas.py`
- `backend/app/integrations/meta/config_service.py`
- `backend/tests/integrations/meta/test_config_service.py`
- `backend/scripts/migrate_meta_foundation.py`

**Modify**

- `backend/app/core/config.py`
- `backend/app/core/database.py`
- `backend/.env.example`
- `backend/DATABASE_SCHEMA.md`
- `docs/architecture/ARCHITECTURE.md`

**Steps**

- [ ] Re-check config, encryption, Beanie registration, migration-script, admin-role, and audit patterns.
- [ ] Write failing tests for disabled default, encryption, masking, tenant ownership, unique Page/Form mapping, and invalid owner.
- [ ] Add environment flags and `MetaIntegrationSettings`, `MetaWebhookEvent`, `MetaSyncRun`, `MetaMarketingInsight`.
- [ ] Register models and add dry-run/idempotent index migration.
- [ ] Run focused tests, migration dry-run, backend regression suite, and documentation check.
- [ ] Commit `feat(meta): add integration foundation`.
- [ ] Stop for Phase 1 approval.

**Gate**

```powershell
cd backend
pytest -q tests/integrations/meta/test_config_service.py
python scripts/migrate_meta_foundation.py --dry-run
pytest -q tests test_*.py
```

---

## Phase 2 — Secure Webhook Inbox

**Create**

- `backend/app/integrations/meta/signatures.py`
- `backend/app/integrations/meta/webhook_service.py`
- `backend/app/integrations/meta/api.py`
- `backend/app/integrations/meta/tasks.py`
- `backend/tests/integrations/meta/test_signatures.py`
- `backend/tests/integrations/meta/test_webhook_api.py`
- `backend/tests/integrations/meta/test_webhook_service.py`

**Modify**

- `backend/app/api/v1/router.py`
- `backend/app/worker/celery_app.py`
- `backend/API_DOCUMENTATION.md`

**Steps**

- [ ] Re-check FastAPI raw-body access, router dependencies, SlowAPI, Celery task, and Mongo duplicate-key patterns.
- [ ] Write failing tests for GET verification, valid/invalid signature, body limit, duplicate event, unknown tenant, and quick HTTP 200.
- [ ] Implement constant-time verification, parse-after-verify, tenant mapping, durable insert, idempotency, and queue dispatch.
- [ ] Add bounded Celery retry state transitions and correlation IDs.
- [ ] Run focused tests plus backend regression.
- [ ] Commit `feat(meta): add secure webhook inbox`.
- [ ] Stop for Phase 2 approval.

**Gate**

```powershell
cd backend
pytest -q tests/integrations/meta/test_signatures.py tests/integrations/meta/test_webhook_api.py tests/integrations/meta/test_webhook_service.py
pytest -q tests test_*.py
```

---

## Phase 3 — Facebook Lead Ads

**Create**

- `backend/app/integrations/meta/client.py`
- `backend/app/integrations/meta/transformers.py`
- `backend/app/integrations/meta/lead_service.py`
- `backend/tests/integrations/meta/test_client.py`
- `backend/tests/integrations/meta/test_transformers.py`
- `backend/tests/integrations/meta/test_lead_service.py`
- `backend/scripts/migrate_meta_lead_fields.py`

**Modify**

- `backend/app/models/sales_prospect.py`
- `backend/app/crm/lead_engine.py`
- `backend/app/crm/lead_timeline.py`
- `backend/app/integrations/meta/tasks.py`
- `backend/DATABASE_SCHEMA.md`
- `docs/user-flows/crm.md`

**Steps**

- [ ] Re-check current lead constructor, duplicate rules, tenant visibility, timeline publisher, and response serializers.
- [ ] Write failing tests for Graph lookup, mapping, Meta ID replay, existing-lead link, new lead, missing phone quarantine, invalid owner, and cross-tenant rejection.
- [ ] Add optional attribution fields and unique tenant/Meta-lead index through migration.
- [ ] Implement read-only Graph client, transformer, and narrow `LeadEngine` adapter.
- [ ] Add `Lead received from Meta` and attribution timeline records.
- [ ] Run focused tests, migration dry-run, backend regression.
- [ ] Commit `feat(meta): ingest Lead Ads`.
- [ ] Stop for Phase 3 approval.

**Gate**

```powershell
cd backend
pytest -q tests/integrations/meta/test_client.py tests/integrations/meta/test_transformers.py tests/integrations/meta/test_lead_service.py
python scripts/migrate_meta_lead_fields.py --dry-run
pytest -q tests test_*.py
```

---

## Phase 4 — Read-Only Marketing Insights

**Create**

- `backend/app/integrations/meta/insights_service.py`
- `backend/tests/integrations/meta/test_insights_service.py`

**Modify**

- `backend/app/integrations/meta/client.py`
- `backend/app/integrations/meta/api.py`
- `backend/app/integrations/meta/tasks.py`
- `backend/app/worker/celery_app.py`
- `backend/API_DOCUMENTATION.md`

**Steps**

- [ ] Re-check existing scheduling and Celery conventions; choose existing pattern, not new scheduler.
- [ ] Write failing tests for pagination, incremental cursor, CPL/ROAS, rate limits, retry, manual sync permission, and absence of write methods.
- [ ] Implement campaign/ad-set/ad insight reads, tenant snapshots, sync-run status, manual Sync Now, and scheduled task.
- [ ] Prove client exposes no budget, bid, publish, pause, resume, create, update, or delete operations.
- [ ] Run focused tests plus backend regression.
- [ ] Commit `feat(meta): sync marketing insights`.
- [ ] Stop for Phase 4 approval.

**Gate**

```powershell
cd backend
pytest -q tests/integrations/meta/test_insights_service.py tests/integrations/meta/test_client.py
pytest -q tests test_*.py
```

---

## Phase 5 — Admin and CRM UI

**Create**

- `frontend/src/api/meta.js`
- `frontend/src/pages/crm/settings/MetaIntegrationSettings.jsx`
- `frontend/src/pages/crm/settings/MetaIntegrationSettings.test.jsx`
- `frontend/src/pages/crm/leads/MetaAttribution.jsx`
- `frontend/src/pages/crm/leads/MetaAttribution.test.jsx`

**Modify**

- `frontend/src/pages/crm/settings/page.jsx`
- `frontend/src/pages/crm/leads/workspace.jsx`
- `frontend/src/pages/crm/leads/page.jsx`
- `frontend/src/pages/crm/leads/timeline.jsx`
- backend serializers only where discovery confirms missing additive fields
- `docs/user-flows/crm.md`

**Steps**

- [ ] Re-check current route guards, API wrapper, CRM settings layout, lead table, workspace, and timeline data shapes.
- [ ] Write failing UI tests for admin guard, secret masking, health states, connection test, Sync Now, attribution, errors, and no Send action.
- [ ] Build settings panel and attribution components using existing UI primitives.
- [ ] Add only required additive backend response fields.
- [ ] Run frontend tests, lint, build, and backend regression.
- [ ] Commit `feat(meta): add admin and CRM UI`.
- [ ] Stop for Phase 5 approval.

**Gate**

```powershell
cd frontend
npm test
npm run lint
npm run build
cd ..\backend
pytest -q tests test_*.py
```

---

## Phase 6 — Inbound WhatsApp/Messenger Foundation

**Create after phase-start discovery confirms final names**

- `backend/app/integrations/meta/messaging_service.py`
- `backend/tests/integrations/meta/test_messaging_service.py`

**Modify**

- `backend/app/integrations/meta/models.py`
- `backend/app/integrations/meta/webhook_service.py`
- `backend/app/integrations/meta/tasks.py`
- `backend/app/crm/lead_timeline.py`
- CRM UI only for inbound events and editable drafts

**Steps**

- [ ] Re-check contact phone matching, conversations, notifications, timeline, AI drafts, and existing `WhatsAppNoopProvider`.
- [ ] Lock exact model/UI paths in plan before editing; do not invent missing abstractions.
- [ ] Write failing tests for inbound persistence, tenant matching, unmatched messages, timeline, draft creation, and zero outbound provider calls.
- [ ] Implement inbound processing and draft state only.
- [ ] Verify no real provider registers with `sendWhatsAppMessage`.
- [ ] Run focused tests and full backend/frontend gates.
- [ ] Commit `feat(meta): add inbound messaging foundation`.
- [ ] Stop for Phase 6 approval.

**Gate**

```powershell
cd backend
pytest -q tests/integrations/meta/test_messaging_service.py tests/test_ai_tools.py tests/test_sales_agent.py
pytest -q tests test_*.py
cd ..\frontend
npm test
npm run lint
npm run build
```

---

## Phase 7 — Production Certification

**Modify**

- `README.md`
- `backend/API_DOCUMENTATION.md`
- `backend/DATABASE_SCHEMA.md`
- `docs/product/PRD.md`
- `docs/quality/TEST_PLAN.md`
- `docs/infrastructure/SECURITY.md`
- `docs/infrastructure/PRODUCTION_DEPLOYMENT_GUIDE.md`
- `docs/operations/GO_LIVE_READINESS.md`
- `docs/architecture/ARCHITECTURE.md`
- new ADR under `docs/architecture/decisions/`

**Steps**

- [ ] Run secret-redaction, tenant-isolation, replay, failure, retry, rate-limit, migration, rollback, and load checks.
- [ ] Run full CI-equivalent suite and Docker builds.
- [ ] Verify disabled-state deployment and one test-tenant rollout.
- [ ] Record evidence, changed files, migrations, environment variables, endpoints, setup, security, performance, regression, deployment, rollback, readiness score, and Go/No-Go.
- [ ] Commit `docs(meta): certify production rollout`.
- [ ] Stop. No production enablement without explicit approval.

**Gate**

```powershell
cd backend
pytest -q tests test_*.py
cd ..\frontend
npm audit --omit=dev --audit-level=high
npm run lint
npm test
npm run build
cd ..
docker build -t syntask-backend:ci ./backend
docker build -t syntask-frontend:ci ./frontend
git diff --check
```

## Anti-Hallucination Rule

At phase start:

1. Read listed files and current Git diff.
2. Confirm named classes, functions, routes, and data shapes exist.
3. Update this plan if code moved or contracts changed.
4. Never create a parallel service when existing infrastructure fits.
5. Report `Unable to verify from current codebase.` for unresolved behavior.
6. Do not enter next phase without test evidence and explicit approval.
