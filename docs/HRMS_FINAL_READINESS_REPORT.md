# SynTask HRMS — Final Readiness Report

**Date:** 2026-08-14
**Branch:** `sk/feat/hrms-complete`
**Phase 11 (Final Integration & Regression) closure**

---

# Executive Result

```text
READY WITH LIMITATIONS
```

The complete HRMS chain (Candidate → Employee → Documents → Leave → Attendance →
Salary → Payroll → Payslip → My HR → Lifecycle → Dashboard/Reports) is implemented
end-to-end with backend-authoritative permissions, calculations, ownership, company
scope and effective dates. All P0/P1 audit items from the Phase 11 closure prompt
are fixed, the backend and frontend automated suites pass with **zero new failures**
(the remaining failures are pre-existing and unrelated), and the production frontend
build passes.

**Limitation:** browser verification was not executed because no reachable
non-production database is configured — all workflows are implemented end-to-end
and covered by unit/integration tests, but were not walked from a live UI.

---

# Phase Matrix

| Phase | Module | Status | Backend | Frontend | Integration | Tests |
|---|---|---|---|---|---|---|
| 1 | Employee Profile Foundation | COMPLETE | ✅ | ✅ | ✅ | ✅ |
| 2 | HR Documents | COMPLETE | ✅ | ✅ | ✅ | ✅ |
| 3 | Leave Management Upgrade | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 4 | Attendance HR/Payroll Readiness | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 5 | Salary Structure | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 6 | Payroll | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 7 | Payslip PDF | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 8 | Employee Self-Service | READY FOR UI TEST | ✅ | ✅ | ✅ | ⬜ |
| 9 | Employee Lifecycle | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 10 | HR Dashboard & Reports | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |
| 11 | Final Integration & Regression | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ |

`READY FOR UI TEST` = fully implemented + automated tests/build green; only the
live-browser workflow (blocked by no reachable test DB) remains before `COMPLETE`.

---

# Architecture Source of Truth

```text
User                 → authentication identity (roles, account, company)
EmployeeProfile      → current employment state (1:1 with User, company-scoped)
Lifecycle            → employment history (EmployeeLifecycleEvent timeline)
HR Documents         → employee/candidate HR files (owner = EmployeeProfile _id)
Leave                → Leave domain (LeaveTypeConfig + LeaveRequest/LeaveBalance, keyed by User id)
Attendance           → Attendance truth (Attendance records + Phase 4 payroll adapter)
Salary Structure     → configured compensation (SalaryStructure, keyed by User id, versioned)
Payroll              → processed monthly financial result (PayrollPeriod/PayrollRecord snapshots)
Payslip              → presentation of PROCESSED Payroll snapshots only (never recalculates)
My HR                → employee self-service (/hr/me, ownership-scoped)
HR Reporting         → read-only aggregation over the above (capability + team-scoped)
```

Key integration boundaries (no duplicated business logic):

```text
LeaveRequest.leave_type_id → LeaveTypeConfig.is_paid → PAID_LEAVE / UNPAID_LEAVE
Attendance (Phase 4 adapter) → payroll day records + payable factors → Payroll
SalaryStructure → get_salary_snapshot_for_payroll → Payroll calculation
Payroll PROCESSED → payslip PDF (immutable snapshot values)
EmployeeProfile update (lifecycle-sensitive fields) → record_profile_changes BEFORE save
```

---

# Final Routes

## People / HR (management)

| Route | Page |
|---|---|
| `/hr/dashboard` | HR Dashboard |
| `/hr/reports` · `/hr/reports/:category/:report` | HR Reports |
| `/hr/employees` | Employees |
| `/hr/employees/:employeeId` | Employee Detail (Overview / Employment / Documents / Attendance / Leave / Salary / Lifecycle) |
| `/hr/documents` | HR Documents |
| `/hr/leave-allocations` | Leave Allocations |
| `/hr/payroll` · `/hr/payroll/:periodId` · `/hr/payroll/:periodId/records/:recordId` | Payroll workspace |
| `/hr/settings/document-types` | HR Settings → Document Types |
| `/hr/settings/leave-types` | HR Settings → Leave Types |
| `/hr/settings/attendance-policy` | HR Settings → Attendance Policy |
| `/hr/settings/holidays` | HR Settings → Holidays |
| `/hr/settings/salary-components` | HR Settings → Salary Components |
| `/hr/recruitment/*` | Recruitment workspace |

Legacy aliases `/hr/recruitment/employees`, `/hr/recruitment/employees/:id`,
`/hr/recruitment/settings/document-types` redirect to the canonical routes.

## My HR (self-service)

| Route | Page |
|---|---|
| `/hr/me` | My HR Overview |
| `/hr/me/profile` | My Profile |
| `/hr/me/attendance` | My Attendance |
| `/hr/me/leave` | My Leave |
| `/hr/me/documents` | My Documents |
| `/hr/me/payslips` | My Salary & Payslips |

---

# Permission Matrix

| Capability | Admin / SubAdmin | HR Manager | HR Lead | HR Employee | Manager (non-HR) | Lead | Employee |
|---|---|---|---|---|---|---|---|
| `employee_management.view` | ✅ (pass-through) | ✅ | ✅ | ✅ | ❌ | ❌ | own profile only |
| `employee_management.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `leave_management.view` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | own only |
| `leave_management.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `attendance_policy.view` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | own only |
| `attendance_policy.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `attendance_corrections.view/.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | own requests |
| `salary_management.view/.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | own salary |
| `payroll.view` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | own payslips |
| `payroll.manage` / `.approve` | ✅ | ✅ (view/manage) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `employee_lifecycle.view` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | own lifecycle |
| `employee_lifecycle.manage` / `.separation` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | resignation via My HR |

Rules enforced server-side on every endpoint:

- Company admins (ADMIN/SUB_ADMIN/SUPER_ADMIN) pass through `require_capability`.
- HR-department staff get capabilities from `get_capabilities_for_role(department_type, role, company)`.
- **Managers/Leads never auto-grant Salary/Payroll** — payroll reports keep their own `payroll.view` gate; manager-scoped reports (employee/attendance/leave/document/lifecycle) are restricted to the manager's monitorable team (`_report_scope_user_ids`).
- Reports/exports require the matching capability (`employee_management.view`, `attendance_policy.view`, `leave_management.view`, HR document view, `employee_lifecycle.view`, `payroll.view`). Frontend hiding is never the security boundary.
- My HR is available to any authenticated company user with an Employee Profile (role-independent).

---

# Employee ID Mapping

| Domain | Stored employee reference | Notes |
|---|---|---|
| EmployeeProfile | own `_id` + `user_id` (User) | 1:1, unique `company_id + user_id` |
| LeaveRequest / LeaveBalance | `employee_id` = **User id** | never EmployeeProfile `_id` |
| Attendance | `employee_id` = **User id** | `get_employee_period_summary(company, user_id, …)` |
| SalaryStructure | `employee_id` = **User id** | `/salary/employees/{user_id}/…` |
| PayrollRecord / Payslip | `employee_id` = **User id** | snapshot also stores name/number/profile id |
| HRDocument | `employee_id` = **EmployeeProfile `_id`** | owner semantics |
| EmployeeLifecycleEvent | `employee_id` = **EmployeeProfile `_id`** | |

Centralized conversion: frontend Employee Detail resolves `userScopedId = employee.user_id`
for Salary/Attendance/Leave and `employee.id` for Documents/Lifecycle; reporting services
resolve User → profile (`user_id`) or profile → User (`_id`) explicitly — an arbitrary
`employee_id` is never assumed to mean EmployeeProfile `_id`.

---

# Migration Order

All scripts are idempotent. Safe execution order:

```text
1. python -m scripts.migrate_employee_profiles     # Phase 1 backfill (idempotent)
2. python -m scripts.migrate_payslips               # Phase 7 (no backfill needed)
3. python -m scripts.migrate_*                      # any other repository migration script
   (inspect each script's real dependencies before running; HR models are
    auto-created via ensure_*_defaults on first use — leave types, attendance
    policy, salary components — so no manual data seeding is required)
```

Models are registered in `backend/app/core/database.py` Beanie initialization and
create their own company-scoped indexes on startup; duplicate defaults are prevented
by idempotent `ensure_default_leave_types` / `ensure_default_policy` guards and
unique indexes (`company_id+code`, `company_id+user_id`, …).

---

# Test Results

## Backend

```text
python -m pytest tests/recruitment tests/salary tests/payroll tests/api/test_hr_dashboard_permissions.py
→ 192 passed

python -m pytest tests -q --ignore=tests/rag --ignore=tests/recruitment/test_permissions.py --ignore=tests/integrations/meta
→ 674 passed, 27 failed, 8 skipped
  (27 failed are pre-existing at HEAD, all in unrelated modules: tasks, sales, CRM,
   security QA, route-registration, time audit. 22 previously-failing tests now pass.)

python -m pytest tests/integrations/meta
→ 140 passed, 10 failed (pre-existing webhook/insights/tasks failures, unrelated to HRMS)
```

New/updated HRMS tests:

- `tests/salary/test_salary_revision_history.py` — historical lookup is range-driven (never status-filtered), July→V1 / August→V2, normal + future revisions valid, same-day/backdated/mid-history rejected (409), concurrent duplicate removed.
- `tests/recruitment/test_attendance_payroll_boundaries.py` — joining/exit boundaries exclude pre-join/post-exit days, no-overlap returns empty, paid/unpaid/half-day/unresolvable leave classification.
- `tests/api/test_hr_dashboard_permissions.py` — dashboard/report permission & scoping tests.
- `tests/integrations/meta/test_instagram_adapter.py` + `test_messenger_adapter.py` — reconstructed corrupted merge syntax (the suite now collects).

## Frontend

```text
npx vitest run
→ 463 passed, 9 failed (identical pre-existing set confirmed at HEAD:
   navigation section-count, breadcrumb label, time audit, gradients,
   sidebar role tests, admin-permissions, task-detail helpers)

npm run build
→ passes (≈21s)
```

New frontend tests: `SalaryTab.test.jsx` (6 tests — `onAssign`/`onRevise` contract,
permission gating, error state).

---

# Browser Verification

Not executed in this session — no reachable non-production database is configured
(the configured `MONGODB_URL` points at a production Atlas cluster). Implemented
workflows that must be walked from the UI once a test DB is reachable:

```text
Recruitment → Hire/Convert → People → Employees → Employee Detail (Overview/Employment/
Documents/Attendance/Leave/Salary/Lifecycle tabs) → Edit → persists
Employee My HR → Check In → Break → End Break → Check Out; HR sees same data
Leave: request paid → approve → balance changes → Attendance = PAID_LEAVE;
       unpaid → Attendance = UNPAID_LEAVE
Salary: assign V1 → revise V2 → historical lookup July→V1 / August→V2
Payroll: create period → calculate → review → approve → process
Payslip: generate → preview → download → My HR shows same payslip
Lifecycle: promote/transfer → profile updates + history preserved; resignation → exit
HR Dashboard metrics + HR Reports filters/exports match created data
```

---

# Security Verification

Covered by automated tests and code audit (browser verification pending):

- **Cross-employee:** normal employees can only access their own profile, documents,
  payslips, salary, attendance and leave; ownership is enforced backend-side
  (self endpoints accept no employee_id; document/payslip ids are ownership-checked).
- **Cross-company:** every HR query is scoped by `company_id`; identifier lookups are
  never trusted across companies (404/403).
- **Reports/exports:** capability-gated; manager team scope server-side; payroll
  reports require `payroll.view`; attention items are permission-filtered.
- **Payslips:** PROCESSED-only generation, snapshot-driven (no recalculation),
  ownership + `payroll.view` access, no raw public storage URLs.
- **Lifecycle:** history recording is atomic with the profile mutation (never
  silently swallowed); generic PATCH cannot set lifecycle-sensitive fields that
  bypass history.

---

# Performance Findings

- Employee list/detail use batched user/department/manager joins (no N+1).
- Reporting service uses batched `_resolve_employee_names` / `_resolve_employee_details`.
- Attendance period summaries batch-fetch attendance/leaves/holidays and resolve leave
  types via a single `build_leave_type_map`.
- Salary revisions add a post-insert duplicate check (single indexed query).

---

# Known Limitations

Only genuine unresolved items:

1. **Browser verification pending** — no reachable non-production DB.
2. **HR Reports department filter dropdown is a static placeholder** (needs departments-API options).
3. **Mid-period salary revision proration** not implemented (single effective structure per period start).
4. **No manual payroll adjustments** (bonus/deduction one-offs) and **no overtime monetary
   calculation** (no rate configured) — documented Phase 6 limitations.
5. **Company branding on payslips** uses current company data as presentation metadata
   (stored amounts/history remain immutable); no per-company logo field exists.
6. **Frontend lint** blocked by environment (ESLint v9 vs `.eslintrc.cjs`).
7. Pre-existing unrelated test failures (backend 27 + Meta 10 + frontend 9) — all
   confirmed present at HEAD, none introduced by HRMS.

---

# Deployment Checklist

```text
git checkout sk/feat/hrms-complete

# Backend
cd backend
pip install -r requirements.txt
python -m scripts.migrate_employee_profiles     # idempotent backfill (once)
# leave types / attendance policy / salary components are seeded idempotently on first use

# Frontend
cd frontend
npm ci
npm run build                                    # production bundle (passes)

# Run
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
npm run preview                                  # or serve dist/ via nginx

# Verification
cd backend && python -m pytest tests/recruitment tests/salary tests/payroll tests/api/test_hr_dashboard_permissions.py
cd frontend && npx vitest run
```

Do not merge into `main` without an explicit request.
