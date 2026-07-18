# SynTask Product Requirements Document

Status: baseline derived from repository analysis  
Version: 1.0  
Last reviewed: 2026-07-16  
Product owner: to be assigned

## 1. Product definition

SynTask is a multi-tenant B2B operations platform combining project delivery, tasks, support, CRM/sales, client and financial workflows, workforce operations, recruitment, collaboration, AI assistance, subscriptions, and platform administration.

### Problem

Growing organizations split customer, delivery, workforce, and financial activity across disconnected tools. SynTask should provide one tenant-aware workspace with consistent identity, permissions, workflow context, reporting, and auditability.

### Outcomes

1. Reduce duplicated operational data and manual handoffs.
2. Make ownership, progress, blockers, and financial status visible to authorized users.
3. Enforce company, module, role, hierarchy, and resource access consistently.
4. Support packaged SaaS plans, entitlements, usage, and billing.

### Current non-goals

- Microservices solely for organizational preference.
- Payroll or statutory accounting unless separately approved.
- Treating frontend route guards as security controls.
- Claiming HA, compliance, or disaster recovery without verification evidence.

## 2. Personas and authority

| Persona | Goal | Expected scope |
|---|---|---|
| Super Admin | Operate SaaS | Cross-tenant plans, companies, usage and billing; tenant content only under explicit support policy |
| Company Admin | Govern one company | Users, departments, modules, projects and tenant data |
| Manager | Oversee organizational scope | Permitted descendants, departments and delivery scope |
| Lead | Coordinate execution | Authorized employees and delivery resources |
| Employee | Complete work | Owned, assigned, participating or shared resources |
| Client/signatory | Complete constrained external actions | Token/portal-scoped actions only |
| Candidate | Discover/apply for jobs | Public careers and candidate-owned tracking |

Access is the intersection of authentication, active status, company, enabled module, role, hierarchy, ownership, membership, and capability. Backend enforcement is mandatory.

## 3. Product-wide requirements

| ID | Requirement | Acceptance summary |
|---|---|---|
| CORE-001 | Tenant isolation | Every tenant-owned operation is company-scoped; foreign identifiers expose no protected data |
| CORE-002 | Authorization | Backend evaluates role, hierarchy, module and resource scope |
| CORE-003 | Auditability | Privileged/material changes record actor, tenant, action, resource and time |
| CORE-004 | Lifecycle | Records have documented states and reject invalid transitions |
| CORE-005 | List usability | Large lists provide scoped filtering, pagination and safe export where required |
| CORE-006 | Error handling | Stable API errors and recoverable user messages |
| CORE-007 | Accessibility | Core journeys meet WCAG 2.1 AA expectations |
| CORE-008 | Observability | Requests/jobs carry correlation context without sensitive logging |
| CORE-009 | Data governance | Sensitive domains have retention, deletion and export rules |
| CORE-010 | Responsive UX | Approved desktop and mobile/tablet workflows function correctly |

## 4. Module requirements

### 4.1 Identity, tenant and administration

- Login, refresh, logout/revocation, recovery and optional 2FA are supported.
- Company Admin creates only permitted lower roles; hierarchy cycles and cross-company managers are rejected.
- Module assignments and subscription entitlements are backend-validated.
- Super-admin actions are separately authorized and audited.
- Deactivation promptly prevents access without deleting required history.

Measures: login success/error rate, provisioning completion, authorization rejections, permission-related support volume.

### 4.2 Projects, tasks and delivery

- Authorized users create projects, boards, sprints, epics, tasks and subtasks.
- Project boards show separate Manager and Leader assignment fields; Company Admin assigns the Manager, and Company Admin or Manager can assign/change the Leader.
- Task details show the project Lead as read-only context and expose Employee assignment for permitted task reassignment.
- Workflow transitions are validated and recorded in history.
- Assignment candidates are restricted by company, hierarchy, project membership and policy.
- Comments, files, watchers, links, components, versions and time records remain tenant/resource bound.
- Automation/webhooks are idempotent or safely retryable and expose terminal failures.

Acceptance: create-to-close succeeds for each role; invalid transitions and foreign-tenant access fail; concurrent board changes do not silently lose data.

### 4.3 CRM and sales

- Leads have controlled lifecycle, ownership, source and activity history.
- Duplicate handling prevents unintended records and supports reviewed merge behavior where implemented.
- Pipeline stages and deal movement are company-configurable and validated.
- Client/project conversion preserves source relationships.
- Imports validate rows, report partial failures and prevent cross-tenant references.

### 4.4 Clients, invoices, ledger, subscriptions and MSA

- Client/project/invoice/ledger relationships are company-scoped.
- Calculations follow defined currency/rounding policy and material changes are audited.
- Payment/webhook processing verifies signatures and uses idempotency.
- Public signing tokens are time-bound, purpose-bound, revocable and audited.
- Financial states reject invalid transitions and reconcile provider results.

### 4.5 Attendance, leave, EOD and timesheets

- Check-in/out rejects impossible or duplicate active sessions and uses consistent timezone handling.
- Corrections/approvals retain original values and approver history.
- Managers see only authorized scope.
- Leave balance/overlap rules are deterministic.
- Reports and exports enforce the same scope as records.

See [attendance flow](../user-flows/attendance.md).

### 4.6 Recruitment and careers

- Public routes expose only explicitly public fields.
- Candidate files are validated, controlled and retained by policy.
- Application transitions, interviews, feedback and offers are audited.
- Duplicate applicants and synchronization failures are visible.
- Candidate consent, deletion and export rules are approved before production use.

### 4.7 Support, chat, meetings and notifications

- Ticket/chat/meeting visibility is participant, team and tenant scoped.
- Meeting creation shows searchable selectable junior participants by creator role, stores participant IDs internally, rejects durations outside 1-60 minutes, and limits ordinary meeting visibility to hosts and invited participants.
- Meeting records support host/admin update, reschedule, start, complete, cancel, and delete actions with meeting domain events.
- Delivery records preference, channel, retry and terminal failure where material.
- Unread/read and actionable/informational states are clear.
- Provider failure does not corrupt the primary record.

### 4.8 AI and creative assistance

- Retrieval/tools use the caller's tenant and resource permissions.
- Prompts/logs do not expose secrets or unrelated tenant data.
- Material actions require confirmation and audit.
- Output is identified as AI-generated and can be corrected/rejected.
- Provider/model/timeout/cost/quality are observable with safe fallback.
- Evaluation covers correctness, tenant leakage, unsafe output and tool authorization.

## 5. Analytics

Minimum events: tenant activated, user invited/activated, login, project created, task completed, lead converted, invoice issued/paid, attendance completed, job published, application submitted, AI output accepted/rejected, and integration failure. Events require versioned schemas and must avoid sensitive content.

A candidate north star is **weekly active tenant workflows completed**, segmented by module and tenant maturity; validate it through customer research before adoption.

## 6. Release acceptance

A feature is releasable only when problem, scope, roles, states, errors and criteria are approved; API/data compatibility is documented; tenant/authorization negative tests exist; monitoring/support behavior is defined; user-flow and product docs are updated; and applicable NFR/go-live gates have evidence.

## 7. Open product decisions

1. Subscription/module entitlement catalogue and limits.
2. Formal permission matrix for every module/action.
3. Browser/device and accessibility support policy.
4. Retention/deletion periods by domain.
5. Availability, recovery and response commitments by plan.
6. Financial jurisdiction, tax, currency and rounding rules.
7. AI provider data processing and customer opt-out policy.

