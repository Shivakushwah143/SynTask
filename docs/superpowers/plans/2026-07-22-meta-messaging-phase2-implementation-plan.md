# Meta Messaging Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `metaintegrationphase2.md` into a fully functional governed Meta omnichannel messaging platform for WhatsApp, Instagram, and Messenger.

**Architecture:** Extend the existing `backend/app/integrations/meta` module instead of replacing it. Add channel-neutral connection, webhook, conversation, message, identity, AI-draft, analytics, and partner-readiness contracts so provider-specific Meta logic stays isolated from CRM core. All sending remains human-approved; all external Meta approval/partner outcomes are tracked as evidence, not guaranteed.

**Tech Stack:** FastAPI, Beanie/MongoDB, Celery/Redis, React 18, React Query, existing auth/RBAC, existing Fernet-style secret helpers, current Meta integration foundation.

## Global Constraints

- Phase 2 must extend the Phase 1 channel-neutral contracts, not fork inbox, CRM, AI, analytics, or audit systems.
- No cross-channel identity merge without deterministic evidence or human confirmation.
- No autonomous high-risk messaging or pipeline mutation.
- No unrestricted bulk campaigns.
- No automatic outbound WhatsApp, Instagram, or Messenger sending.
- Store provider tokens encrypted or referenced through the existing secrets pattern.
- Never log tokens, signatures, raw personal identifiers, or message bodies in general logs.
- Every model/query must enforce `company_id`.
- Verify raw webhook signatures before parsing JSON.
- Meta verification, Tech Partner, Solution Partner, and Business Partner status are external outcomes; SynTask can track readiness only.
- Stop after each work package and collect test/build evidence before continuing.

---

## Current Starting Point

Already implemented:

- `backend/app/integrations/meta/` module exists.
- Meta settings/config service exists.
- Meta webhook GET/POST exists.
- `MetaWebhookEvent` durable inbox exists.
- Facebook Lead Ads ingestion exists.
- CRM lead attribution exists.
- Read-only marketing insights sync exists.
- Admin Meta settings UI exists.

Not yet implemented for Phase 2:

- Channel-neutral messaging connection model.
- Instagram Messaging connection and adapter.
- Facebook Messenger connection and adapter.
- Unified messaging inbox.
- Cross-channel customer identity model.
- Human-approved outbound messaging workflow.
- Governed Meta AI draft workflow.
- Partner readiness/evidence dashboard.
- Omnichannel analytics.

---

## Phase 2A — Contract Audit and Messaging Core

**Purpose:** Create the stable internal foundation before adding Instagram/Messenger.

**Files to inspect first:**

- `backend/app/integrations/meta/models.py`
- `backend/app/integrations/meta/webhook_service.py`
- `backend/app/integrations/meta/tasks.py`
- `backend/app/api/v1/router.py`
- `backend/app/api/v1/endpoints/chat.py`
- `backend/app/crm/lead_timeline.py`
- `frontend/src/api/chat.js`
- `frontend/src/pages/crm/settings/MetaIntegrationSettings.jsx`

**Likely files to create:**

- `backend/app/integrations/meta/messaging_models.py`
- `backend/app/integrations/meta/channel_adapters.py`
- `backend/app/integrations/meta/messaging_service.py`
- `backend/tests/integrations/meta/test_channel_adapters.py`
- `backend/tests/integrations/meta/test_messaging_service.py`
- `backend/scripts/migrate_meta_messaging_core.py`

**Build:**

- [x] Confirm whether existing chat/conversation models can be reused.
- [x] If reusable, wrap them; if not, create additive Meta messaging models.
- [x] Add channel enum: `whatsapp`, `instagram`, `messenger`.
- [x] Add `ChannelConnection` model with `company_id`, `channel`, `provider_asset_id`, encrypted credential reference, scopes, status, and health fields.
- [x] Add normalized event contract: inbound message, delivery, read, reaction, referral, opt-in, opt-out, unknown.
- [x] Add adapter protocol matching the Phase 2 FRD.
- [x] Add tenant-safe indexes/migration.

**Phase 2A evidence — 2026-07-22:**

```powershell
pytest -q tests/integrations/meta/test_channel_adapters.py tests/integrations/meta/test_messaging_service.py
# 7 passed

python scripts/migrate_meta_messaging_core.py --dry-run
# meta_channel_connections: 4 indexes
# meta_conversations: 4 indexes
# meta_messages: 4 indexes
# Dry run complete; database unchanged.
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_channel_adapters.py tests/integrations/meta/test_messaging_service.py
python scripts/migrate_meta_messaging_core.py --dry-run
pytest -q tests/integrations/meta
```

**Investor explanation:** This creates the “socket board” where every Meta channel plugs into the same SynTask messaging brain.

---

## Phase 2B — Unified Meta Webhook Router

**Purpose:** Make WhatsApp, Instagram, and Messenger events enter one safe pipeline.

**Files to modify:**

- `backend/app/integrations/meta/webhook_service.py`
- `backend/app/integrations/meta/tasks.py`
- `backend/app/integrations/meta/api.py`

**Build:**

- [x] Preserve existing Lead Ads webhook behavior.
- [x] Route `leadgen` events to the existing lead service.
- [x] Route `messages`, `messaging_postbacks`, reads, delivery, and reactions to messaging service.
- [x] Add idempotency per provider event ID.
- [x] Add unknown-event quarantine status.
- [x] Return HTTP 200 quickly and process through Celery.

**Phase 2B evidence — 2026-07-22:**

```powershell
pytest -q tests/integrations/meta/test_webhook_service.py tests/integrations/meta/test_tasks.py
# 28 passed

pytest -q tests/integrations/meta
# 90 passed

pytest -q tests
# 279 passed, 9 failed, 15 warnings
# Failures are outside Meta integration tests and match the pre-existing regression bucket:
# tests/test_phase1_security_qa.py health/auth/CORS 503 failures
# tests/api/test_project_create_resilience.py Project.project_id fake-model issue
# tests/api/test_sales_prospect_permissions.py route expectation mismatch
# tests/api/test_task_phase5_flow.py task fake/model permission issues
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_webhook_api.py tests/integrations/meta/test_webhook_service.py tests/integrations/meta/test_tasks.py
```

**Investor explanation:** This is the secure intake gate. Meta sends events once; SynTask safely sorts them into leads, messages, or analytics.

---

## Phase 2C — WhatsApp Inbound Foundation

**Purpose:** Complete the WhatsApp messaging base without enabling auto-send.

**Files to inspect first:**

- Existing WhatsApp/no-op provider paths if present.
- Existing contact phone matching code.
- CRM timeline code.

**Likely files to modify/create:**

- `backend/app/integrations/meta/whatsapp_adapter.py`
- `backend/app/integrations/meta/messaging_service.py`
- `backend/tests/integrations/meta/test_whatsapp_adapter.py`

**Build:**

- [x] Normalize inbound WhatsApp messages into channel-neutral events.
- [x] Match by tenant + phone number ID + customer phone.
- [x] Create or link CRM contact/lead only when deterministic.
- [x] Create timeline event: `WhatsApp message received`.
- [x] Store draft state only; no real provider send.

**Phase 2C evidence — 2026-07-22:**

```powershell
pytest -q tests/integrations/meta/test_whatsapp_adapter.py tests/integrations/meta/test_messaging_service.py tests/integrations/meta/test_webhook_service.py tests/integrations/meta/test_tasks.py
# 32 passed

pytest -q tests/integrations/meta
# 98 passed

pytest -q tests
# 288 passed, 9 failed, 15 warnings
# Same non-Meta regression bucket as Phase 1.
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_whatsapp_adapter.py tests/integrations/meta/test_messaging_service.py
```

**Investor explanation:** WhatsApp messages start appearing in CRM safely, but SynTask does not send anything automatically.

---

## Phase 2D — Instagram Authorization and Messaging

**Purpose:** Add Instagram professional-account messaging.

**Files to create:**

- `backend/app/integrations/meta/instagram_adapter.py`
- `backend/tests/integrations/meta/test_instagram_adapter.py`
- `frontend/src/pages/crm/settings/InstagramConnectionPanel.jsx`

**Build:**

- [x] Add Instagram connection fields to `ChannelConnection`.
- [x] Store Instagram professional account ID and scoped sender IDs.
- [x] Add connection health check.
- [x] Normalize Instagram webhook messages.
- [x] Enforce Instagram conversation initiation rules.
- [x] Add channel badge and composer restrictions.

**Phase 2D evidence — 2026-07-22:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_config_service.py tests/integrations/meta/test_instagram_adapter.py tests/integrations/meta/test_messenger_adapter.py tests/integrations/meta/test_webhook_service.py
# 31 passed

cd ..\frontend
node node_modules\vitest\vitest.mjs run MessageComposer InstagramConnectionPanel MessengerConnectionPanel
# 3 passed (3 files), 7 passed (7 tests)
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_instagram_adapter.py
cd ..\frontend
npm test -- MetaIntegrationSettings
```

**External Meta gate:** Instagram permissions/App Review must be approved by Meta before production usage.

**Investor explanation:** Instagram DMs become manageable inside SynTask CRM, with policy-safe reply rules.

---

## Phase 2E — Facebook Messenger Authorization and Messaging

**Purpose:** Add Facebook Page Messenger.

**Files to create:**

- `backend/app/integrations/meta/messenger_adapter.py`
- `backend/tests/integrations/meta/test_messenger_adapter.py`
- `frontend/src/pages/crm/settings/MessengerConnectionPanel.jsx`

**Build:**

- [x] Add Page Messenger connection records.
- [x] Store Page ID and page-scoped sender IDs.
- [x] Normalize Messenger webhook messages.
- [x] Enforce Messenger send-window/capability rules.
- [x] Add page/channel context to inbox.

**Phase 2E evidence — 2026-07-22:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_config_service.py tests/integrations/meta/test_instagram_adapter.py tests/integrations/meta/test_messenger_adapter.py tests/integrations/meta/test_webhook_service.py
# 31 passed

pytest -q tests/integrations/meta
# 83 passed

cd ..\frontend
node node_modules\vitest\vitest.mjs run MessageComposer InstagramConnectionPanel MessengerConnectionPanel
# 3 passed (3 files), 7 passed (7 tests)
node node_modules\vite\bin\vite.js build
# built successfully; existing browser-data and CSS pseudo-class warnings only.
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_messenger_adapter.py
cd ..\frontend
npm test -- MetaIntegrationSettings
```

**External Meta gate:** Messenger permissions/App Review must be approved by Meta before production usage.

**Investor explanation:** Facebook Page messages become CRM conversations, not scattered social inbox noise.

---

## Phase 2F — Unified Inbox and Routing

**Purpose:** Give users one shared inbox for WhatsApp, Instagram, and Messenger.

**Likely frontend files to create:**

- `frontend/src/api/metaInbox.js`
- `frontend/src/pages/crm/inbox/MetaInbox.jsx`
- `frontend/src/pages/crm/inbox/ConversationList.jsx`
- `frontend/src/pages/crm/inbox/ConversationThread.jsx`
- `frontend/src/pages/crm/inbox/MessageComposer.jsx`

**Likely backend files to create:**

- `backend/app/integrations/meta/inbox_api.py`
- `backend/tests/integrations/meta/test_inbox_api.py`

**Build:**

- [x] List conversations across all Meta channels.
- [x] Filter by channel, owner, status, priority, unread, linked CRM record.
- [x] Show provider traceability: channel, connection, provider message ID.
- [x] Add assignment, notes, tags, priority.
- [x] Add routing rules but keep destructive automation disabled.
- [x] Add outage/status indicators per channel.

**Phase 2F slice evidence — 2026-07-22:**

```powershell
cd frontend
npm test -- metaInbox MetaInbox
# 2 passed (2 files), 7 passed (7 tests)

cd backend
pytest -q tests/integrations/meta/test_inbox_api.py tests/integrations/meta
# 103 passed

npm run build
# built successfully; existing CSS/browser-data warnings only.

git diff --check
# clean; CRLF warnings only.
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_inbox_api.py
cd ..\frontend
npm test -- MetaInbox
npm run build
```

**Investor explanation:** Teams get one operational command center for customer conversations across Meta.

---

## Phase 2G — Cross-Channel Identity and CRM Linkage

**Purpose:** Connect customer identities safely without unsafe auto-merging.

**Files to create:**

- `backend/app/integrations/meta/identity_service.py`
- `backend/tests/integrations/meta/test_identity_service.py`
- `frontend/src/pages/crm/inbox/IdentityLinkPanel.jsx`

**Build:**

- [x] Add `CustomerIdentity`.
- [x] Add `CrossChannelIdentityLink`.
- [x] Suggest links using deterministic evidence only.
- [x] Require human confirmation before linking.
- [x] Write CRM timeline events for confirmed links.
- [x] Keep tenant isolation mandatory.

**Phase 2G evidence — 2026-07-22:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_identity_service.py
# 4 passed

pytest -q tests/integrations/meta
# 116 passed

cd ..\frontend
npm test -- metaIdentity metaInbox MetaInbox IdentityLinkPanel
# 4 passed (4 files), 13 passed (13 tests)

npm run build
# built successfully; existing browser-data and CSS pseudo-class warnings only.
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_identity_service.py
cd ..\frontend
npm test -- IdentityLinkPanel
```

**Investor explanation:** SynTask can recognize the same customer across channels, but only merges identity when it is safe and approved.

---

## Phase 2H — Governed AI Drafts

**Purpose:** Add AI help without autonomous sending.

**Files to inspect first:**

- `backend/app/api/v1/endpoints/ai.py`
- Existing AI logging/models.
- Existing CRM lead AI files.

**Likely files to create/modify:**

- `backend/app/integrations/meta/ai_draft_service.py`
- `backend/tests/integrations/meta/test_ai_draft_service.py`
- `frontend/src/pages/crm/inbox/AIDraftPanel.jsx`

**Build:**

- [x] Build channel-aware AI draft request contract.
- [x] Include channel policy, send-window/capabilities, CRM context, and conversation context.
- [x] Generate draft only.
- [x] Require human approval before any outbound send.
- [x] Audit prompt metadata, outcome, approval/rejection.
- [x] Never include secrets or inaccessible tenant data.

**Phase 2H evidence — 2026-07-22:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_ai_draft_service.py tests/test_ai_tools.py
# 6 passed

cd ..\frontend
npm test -- metaAIDrafts AIDraftPanel MetaInbox
# 4 passed (4 files), 12 passed (12 tests)

cd ..\backend
pytest -q tests/integrations/meta
# 119 passed

cd ..\frontend
npm run build
# built successfully; existing browser-data and CSS pseudo-class warnings only.
```

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_ai_draft_service.py tests/test_ai_tools.py
cd ..\frontend
npm test -- AIDraftPanel
```

**Investor explanation:** AI assists staff with better replies, but humans stay in control.

---

## Phase 2I — Human-Approved Outbound Send

**Purpose:** Enable safe manual sending after approval.

**Files to create/modify:**

- `backend/app/integrations/meta/send_service.py`
- `backend/tests/integrations/meta/test_send_service.py`
- Channel adapters from earlier phases.

**Build:**

- [ ] Add send command with `conversation_id`, `message_id`, `approved_by`, `channel`.
- [ ] Validate tenant, channel connection health, recipient eligibility, and channel capabilities.
- [ ] Call provider only after explicit user action.
- [ ] Store provider send result.
- [ ] Record timeline/audit event.
- [ ] Add provider failure retry only where Meta allows retry.

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_send_service.py tests/integrations/meta/test_instagram_adapter.py tests/integrations/meta/test_messenger_adapter.py tests/integrations/meta/test_whatsapp_adapter.py
```

**Investor explanation:** SynTask becomes a controlled customer communication platform, not a risky bot.

---

## Phase 2J — Omnichannel Analytics

**Purpose:** Report conversations, response speed, AI usage, and channel performance.

**Files to create/modify:**

- `backend/app/integrations/meta/omnichannel_analytics.py`
- `backend/tests/integrations/meta/test_omnichannel_analytics.py`
- `frontend/src/pages/crm/settings/MetaAnalyticsPanel.jsx`

**Build:**

- [ ] Per-channel conversation counts.
- [ ] First-response and resolution time.
- [ ] Assignment workload.
- [ ] AI draft acceptance/rejection/escalation.
- [ ] Linked CRM leads/deals.
- [ ] Combined dashboard with channel breakdown.

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_omnichannel_analytics.py
cd ..\frontend
npm test -- MetaAnalyticsPanel
```

**Investor explanation:** Leadership can see which Meta channels create pipeline and how fast teams respond.

---

## Phase 2K — Partner Readiness and Evidence Pack

**Purpose:** Prepare SynTask for Meta App Review, Tech Provider maintenance, Tech Partner readiness, and Business Partner readiness.

**Files to create:**

- `backend/app/integrations/meta/readiness_models.py`
- `backend/app/integrations/meta/readiness_service.py`
- `backend/app/integrations/meta/readiness_api.py`
- `backend/tests/integrations/meta/test_readiness_service.py`
- `frontend/src/pages/admin/meta-readiness/MetaReadinessDashboard.jsx`

**Build:**

- [ ] Add `MetaReadinessRecord`.
- [ ] Track requirement ID, owner, status, evidence links, notes, source checked date.
- [ ] Add App Review evidence generator from real working screens/API behavior.
- [ ] Add badge/claim control: no official claims unless status is approved.
- [ ] Add admin-only dashboard.
- [ ] Add audit records for evidence/status edits.

**Gate:**

```powershell
cd backend
pytest -q tests/integrations/meta/test_readiness_service.py
cd ..\frontend
npm test -- MetaReadinessDashboard
```

**Investor explanation:** This turns Meta approval readiness into a managed compliance workflow, not guesswork.

---

## Phase 2L — Security, Privacy, Release Certification

**Purpose:** Prove it is safe enough for production rollout.

**Files to update:**

- `README.md`
- `backend/API_DOCUMENTATION.md`
- `backend/DATABASE_SCHEMA.md`
- `docs/infrastructure/SECURITY.md`
- `docs/infrastructure/PRODUCTION_DEPLOYMENT_GUIDE.md`
- `docs/operations/GO_LIVE_READINESS.md`
- `docs/quality/TEST_PLAN.md`
- `docs/architecture/ARCHITECTURE.md`
- New ADR under `docs/architecture/decisions/`

**Build:**

- [ ] Add tenant export/delete coverage for Meta messaging data.
- [ ] Add redaction tests for tokens, signatures, scoped IDs, and message payloads.
- [ ] Add webhook replay tests.
- [ ] Add provider outage tests.
- [ ] Add rollback guide.
- [ ] Add environment variable/setup guide.
- [ ] Add Meta Dashboard setup guide.
- [ ] Add production readiness score and Go/No-Go recommendation.

**Final Gate:**

```powershell
cd backend
pytest -q tests test_*.py
cd ..\frontend
npm audit --omit=dev --audit-level=high
npm run lint
npm test
npm run build
cd ..
git diff --check
```

**Investor explanation:** This is the proof pack: security, reliability, rollback, testing, and operational readiness.

---

## Recommended Execution Order

1. Phase 2A — Messaging core contracts.
2. Phase 2B — Unified webhook router.
3. Phase 2C — WhatsApp inbound foundation.
4. Phase 2F — Basic unified inbox shell.
5. Phase 2D — Instagram connection and inbound messaging.
6. Phase 2E — Messenger connection and inbound messaging.
7. Phase 2G — Identity and CRM linkage.
8. Phase 2H — AI drafts.
9. Phase 2I — Human-approved outbound send.
10. Phase 2J — Analytics.
11. Phase 2K — Partner readiness.
12. Phase 2L — Production certification.

Reason: build the stable core first, prove one channel end-to-end, then add the other channels without duplicating logic.

---

## Investor Workflow

```text
Customer messages business on WhatsApp / Instagram / Messenger
        ↓
Meta sends webhook to SynTask
        ↓
SynTask verifies signature and stores event
        ↓
Webhook worker normalizes event
        ↓
Message appears in unified inbox
        ↓
SynTask links or suggests CRM customer identity
        ↓
Team member replies manually or uses AI draft
        ↓
Human approves send
        ↓
Conversation, CRM timeline, and analytics update
```

## Non-Negotiable Blockers

- Do not begin Instagram production messaging until Meta permissions are approved.
- Do not begin Messenger production messaging until Meta permissions are approved.
- Do not claim partner badges unless Meta formally approves the status.
- Do not auto-send customer messages.
- Do not auto-merge cross-channel identities.
