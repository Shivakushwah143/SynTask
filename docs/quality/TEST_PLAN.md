# SynTask Master Test Plan

Status: required release framework; automated coverage is partial  
Last reviewed: 2026-07-17

## Objective

Demonstrate that approved PRDs are satisfied, tenants are protected, expected load/failures are handled, and deployment/rollback are safe. Passing means retained evidence against a versioned build.

## Test levels

| Level | Focus | Gate |
|---|---|---|
| Static | Syntax, style, schema, dependencies | Every PR |
| Unit | Domain rules, states, calculations, policies | Every PR |
| API/integration | Routes, MongoDB, Redis, jobs, adapters | Merge/release |
| Contract | OpenAPI and provider/webhook compatibility | Contract change |
| Component | UI forms, states, guards, recovery | Affected PR |
| E2E | Critical user journeys | Release |
| Security | Auth, tenants, hierarchy, inputs, uploads, limits | Release |
| Performance/resilience | Latency, capacity, soak, degradation | Go-live/scale change |
| UAT | Business acceptance | Go-live |
| Restore/rollback | Recovery and reversibility | Go-live/drill |

## Environments and data

Unit/component tests use deterministic fixtures. Integration uses separate MongoDB/Redis/storage and never production. Staging should mirror production topology with synthetic or approved anonymized data. Production permits only approved smoke/synthetic checks.

Data must include two unrelated companies, every role, module on/off, active/inactive users, separate hierarchy branches, owners/non-members, boundary timezones, large lists, invalid files, and provider failures.

## Critical suites

### Authentication and authorization

- Login, refresh, logout/revocation, expiry, deactivation, reset, 2FA.
- Each role/action: allowed path and direct-API denial.
- Sibling, ancestor, descendant, and non-member access.
- Disabled module, expired plan, manipulated client state.
- Redis degradation follows approved security policy.

### Tenant isolation

For every tenant-owned endpoint/job, attempt list, get, foreign-parent create, update, delete, search, export, file access, and guessed identifiers from another tenant. Verify no data, existence detail, count, file, notification, event, cache, or AI context leaks.

### Domain regression

- Project/task lifecycle, assignment, boards, automation, history.
- Task list graphs resolve assigned employee names from API `assigned_to_name`, embedded assignee objects, assignable users, or current-user fallback.
- Task detail UI verifies status tone labels and color-coded selector/indicator states for each task status.
- Calendar events verify date-window parsing, assigned-only employee task visibility, assigned task event serialization, and project-name resolution from logical project keys such as `PROJ-101`.
- Reminder engine tests verify calendar-day remaining calculations, task/content reminder rules including task due-today critical popup eligibility, skipped completed/submitted records, daily duplicate protection, toast eligibility, and due-tone color mapping. Frontend smoke checks should verify global authenticated reminder popup polling, sound attempt, cancel/dismiss control, and notification-panel persistence.
- Scheduled job tests verify future-date validation, timezone normalization, role gates by action type, company-scoped list/action authorization, pending-to-running atomic lock, exactly-once project/task creation, retry/cancel/delete state gates, creator notifications, and activity timeline entries.
- Project/task role matrix: Admin company-wide list/manage; Manager company-wide list with same-department edit/assign only; Employee assigned-task visibility with project context and no detail edits except progress, comments, and attachments.
- CRM lifecycle, deduplication, import, conversion.
- Meta unified inbox: tenant-scoped conversation/message API filters, channel badges, provider traceability, and read-only UI with no send action.
- Invoice/ledger/MSA states, rounding, signing, payment callbacks.
- Attendance duplicate sessions, timezone, corrections, leave, reports.
- Recruitment public fields, files/privacy, transitions.
- Chat/ticket/notification participant scope and retry.
- Meeting creation/lifecycle: searchable junior-only participant selection by creator role, same-tenant rejection, host/participant visibility, host URL redaction, 1-60 minute duration boundaries, update/reschedule, start, complete, cancel, delete, and Zoom failure/retry paths.
- AI permissions, confirmation, leakage, evaluation.

### Data/integration and quality

- Migration compatibility, partial failure, retry, reconciliation.
- Webhook signature, replay, duplicate, ordering, timeout.
- Upload type/size/signature, authorization, missing object.
- Provider rate limits/unavailability.
- Accessibility keyboard/focus/labels/contrast/errors.
- Baseline, peak, burst, soak, and dependency failure.
- Supported browsers, responsive layouts, deep-link refresh.

## Traceability

Map `PRD requirement -> risk -> test -> result -> defect/waiver -> evidence`. Use stable requirement IDs in test names/markers.

## Entry and exit

Entry requires approved scope, deployable build, stable environment, data, risks, and owners.

Exit requires critical/P0/P1 execution; no critical defects or unaccepted high security/integrity defect; passing tenant isolation; approved NFR results/waivers; UAT, rollback, and restore evidence; and updated docs/runbooks.

## Severity

- Critical: tenant leak, auth bypass, irreversible corruption, unsafe payment, outage without recovery.
- High: core workflow unavailable, major wrong result, serious privacy/security weakness.
- Medium: impaired workflow with workaround.
- Low: cosmetic/low-impact inconsistency.

## Current baseline

Tests cover selected CRM, events, recruitment, semantic isolation, knowledge, services, dashboard, task/project, CRM, and calendar behavior. Coverage is incomplete for the broad route surface. Expand first around authentication, permission matrix, tenant CRUD/export/file paths, finance/webhooks, and critical E2E journeys.

## Release test report

Record commit, environment, scope, pass/fail/blocked counts, requirement coverage, defects, NFR results, scan summaries, UAT, residual risks/waivers, and QA recommendation.

