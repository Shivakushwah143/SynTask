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

For Super Admin functionality, verify ordinary company users cannot call `/api/v1/superadmin/*`. Verify suspended-company users receive only the `account_suspended` denial and no cross-tenant data. Verify feature flags, usage details, tenant user lists, and invoices are keyed by `company_id`.

### Domain regression

- Project/task lifecycle, assignment, boards, automation, history.
- Project board task creation verifies the Assign to dropdown includes active employees across managers within the tenant, excludes non-employee/inactive/current-user records, rejects cross-tenant employees, and keeps quick-created employee modal content above the Create task modal.
- Project board task creation verifies suggested estimated hours never auto-fill as `0`; future due dates use at least `0.25` hours and past/invalid due dates leave the field blank.
- Project board task creation verifies estimated hours accepts any positive value, including values greater than 24.
- Super Admin platform operations: tenant list user counts, tenant user list, password reset confirmation/email attempt, suspend with reason/notes/notify-admin, suspended-user login/API denial, activate tenant, plan create/edit, tenant plan assignment, invoice generate/list/send, revenue analytics period selector, subscription overview, usage summary/detail expansion, tenant feature toggles, global feature matrix toggles, and audit log entries for each material action.
- Task list graphs resolve assigned employee names from API `assigned_to_name`, embedded assignee objects, assignable users, or current-user fallback.
- Task detail UI verifies status tone labels and color-coded selector/indicator states for each task status.
- Calendar events verify date-window parsing, assigned-only employee task visibility, assigned task event serialization, and project-name resolution from logical project keys such as `PROJ-101`.
- Reminder engine tests verify calendar-day remaining calculations, task/content reminder rules including task due-today critical popup eligibility, skipped completed/submitted records, daily duplicate protection, toast eligibility, and due-tone color mapping. Frontend smoke checks should verify global authenticated reminder popup polling, sound attempt, cancel/dismiss control, and notification-panel persistence.
- Scheduled job tests verify future-date validation, timezone normalization, role gates by action type, company-scoped list/action authorization, pending scheduled project placeholders visible only to their creator with publish time in project lists, pending-to-running atomic lock, exactly-once project/task creation, retry/cancel/delete state gates, creator notifications, and activity timeline entries.
- Project/task role matrix: Work module route guard allows Admin, Sub Admin, Manager, Lead, and Employee users consistently with sidebar visibility; Admin company-wide list/manage; Manager company-wide list with same-department edit/assign only; Employee project-list/dashboard visibility when assigned as project Leader, team member, or task assignee; Employee project Leads can create/schedule tasks, manage task details/assignment/status, board columns, sprints, epics, pages, files, and summaries only in their project; normal members cannot perform Lead-only actions; old/new Lead replacement takes effect immediately; forged cross-project task, parent task, sprint, page, and file requests are rejected.
- CRM lifecycle, deduplication, import, conversion, lead workspace header/sidebar form saves, pipeline move loading states, and lead-card metadata rendering from real pipeline fields without fabricated value fields or raw record identifiers.
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
- Sidebar overview panels verify `/sections/:sectionKey` routes render only `getSectionItems`-authorized operational cards, submodule routes do not render an extra overview panel, section tab bars keep the Overview tab visible on sibling routes, local search filters by card content, quick actions open existing routes, React Query cache and reused existing list APIs never expose unauthorized tenant data, empty states do not expose tenant data, and responsive light/dark layouts remain usable on mobile and desktop.

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
