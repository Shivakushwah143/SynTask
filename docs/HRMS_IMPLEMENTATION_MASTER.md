# SynTask HRMS — Master Implementation & Progress File

> **Recommended repository path:** `docs/HRMS_IMPLEMENTATION_MASTER.md`
>
> This file is the single source of truth for the SynTask HRMS implementation.
> Keep the approved FRD, phase plan, implementation rules, progress, decisions, and validation status here.

---

# 1. HOW TO USE THIS FILE

This HRMS must be built **phase by phase**.

For every phase:

1. Read the complete FRD.
2. Audit the existing SynTask implementation related to that phase.
3. Do not duplicate existing working functionality.
4. Build the complete backend.
5. Build the complete frontend.
6. Connect frontend to real backend APIs.
7. Add authentication and authorization.
8. Add validation and proper UX states.
9. Add/update tests.
10. Run relevant backend/frontend validation.
11. Test the full workflow from the browser.
12. Update this file with completed work, remaining issues, files changed, tests, assumptions, and known limitations.
13. Only then move to the next phase.

## Mandatory vertical-slice rule

A phase is **NOT COMPLETE** if only backend or only frontend exists.

Each feature must follow:

```text
Database / Model
       ↓
Backend Service
       ↓
Business Rules
       ↓
API
       ↓
Authentication
       ↓
Authorization
       ↓
Frontend API Integration
       ↓
Frontend UI
       ↓
Validation
       ↓
Loading / Error / Empty States
       ↓
Tests
       ↓
Browser Workflow Verification
```

Never do this:

```text
Build all backend first
        ↓
Frontend later
```

Always do this:

```text
Phase 1
Backend + Frontend + Integration + Test
        ↓
Phase 2
Backend + Frontend + Integration + Test
        ↓
Phase 3
...
```

---

# 2. GLOBAL IMPLEMENTATION RULES

- Existing SynTask codebase is the technical source of truth.
- This FRD is the functional source of truth.
- This is not a greenfield HRMS.
- Reuse existing models, services, components, APIs, permissions, storage, notifications, and PDF systems where appropriate.
- Do not rewrite working functionality unnecessarily.
- Do not create duplicate employee systems.
- Do not create duplicate attendance systems.
- Do not create duplicate notification systems.
- Do not create duplicate file-storage systems.
- Do not create duplicate permission systems.
- Preserve existing data.
- Preserve existing authentication.
- Preserve existing company scoping.
- Preserve existing recruitment.
- Preserve existing attendance.
- Preserve existing leave functionality unless it must be extended.
- Keep changes focused on the active phase.
- Do not modify unrelated modules without a justified dependency.
- Backend authorization is mandatory even when frontend controls already hide actions.
- Every list must support appropriate loading, empty, error, and permission-denied states.
- Never use mock data for a feature being marked complete.
- Dashboard data must come from real backend aggregation.
- Payroll calculations must occur on the backend.
- Historical payroll must use immutable/snapshotted calculation data.
- HR documents and payslips must not become publicly accessible without authorization.

---

# 3. DEFINITION OF DONE FOR EVERY PHASE

A phase is complete only when all applicable items are checked:

- [ ] Existing related code audited
- [ ] Requirement-to-code mapping updated
- [ ] Database/model changes completed
- [ ] Migration/backfill completed where needed
- [ ] Backend schemas completed
- [ ] Backend services/business logic completed
- [ ] API endpoints completed
- [ ] Authentication applied
- [ ] Authorization applied
- [ ] Company scoping verified
- [ ] Frontend API client completed
- [ ] Frontend routes/navigation completed
- [ ] Frontend list/detail/forms completed
- [ ] Real backend data connected
- [ ] Loading states implemented
- [ ] Empty states implemented
- [ ] Error states implemented
- [ ] Permission-denied states implemented
- [ ] Form validation implemented
- [ ] Success/error feedback implemented
- [ ] Backend tests added/updated
- [ ] Frontend tests added/updated where appropriate
- [ ] Existing affected tests pass
- [ ] Build/type/lint checks pass where available
- [ ] Full workflow verified through actual frontend
- [ ] Regression risks checked
- [ ] This master file updated
- [ ] No known blocker remains before next phase

---

# 4. MASTER PHASE STATUS

| Phase | Module | Status | Backend | Frontend | Integration | Tests | Browser Verified |
|---|---|---|---|---|---|---|---|
| 0 | Audit & Baseline | PARTIAL | N/A | N/A | N/A | N/A | N/A |
| 1 | Employee Profile Foundation | READY FOR UI TEST | ✅ | ✅ | ✅ | ✅ | ⬜ |
| 2 | HR Documents | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Leave Management Upgrade | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Attendance HR/Payroll Readiness | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Salary Structure | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | Payroll | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Payslip PDF | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Employee Self-Service | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Employee Lifecycle | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | HR Dashboard & Reports | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Final Integration & Regression | NOT STARTED | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

Allowed phase statuses:

```text
NOT STARTED
IN AUDIT
IN PROGRESS
BLOCKED
READY FOR UI TEST
COMPLETE
```

---

# 5. CURRENT ACTIVE PHASE

**Current Phase:** Phase 1 — Employee Profile Foundation  
**Status:** READY FOR UI TEST (backend, frontend, integration, and tests complete; browser verification deferred by decision — see work log)

Do not start Phase 2 until Phase 1 satisfies the Definition of Done.

---

# 6. APPROVED FRD

## SynTask HRMS — Functional Requirements Document

### 6.1 Purpose

Extend SynTask into a structured, production-ready HRMS while preserving and reusing the existing architecture.

The HRMS must:

- preserve existing working functionality;
- reuse current authentication and authorization;
- reuse existing users/employees;
- reuse Recruitment;
- reuse Attendance;
- extend Leave;
- reuse file storage;
- reuse notifications;
- reuse PDF infrastructure;
- follow current frontend patterns;
- avoid duplicate HR subsystems.

### 6.2 Product Vision

```text
Candidate
   ↓
Selection
   ↓
Offer
   ↓
Joining
   ↓
Employee Profile
   ↓
Documents
   ↓
Attendance
   ↓
Leave
   ↓
Salary Structure
   ↓
Payroll
   ↓
Payslip
   ↓
Employee Self-Service
   ↓
Promotion / Transfer
   ↓
Resignation
   ↓
Exit
```

All HR modules feed:

```text
HR Dashboard
+
HR Reports
```

### 6.3 Core HRMS modules

1. Employee / Candidate Profile Management
2. HR Document Management
3. Attendance Integration
4. Leave Management
5. Salary Structure
6. Monthly Payroll
7. Payslip PDF
8. Employee Self-Service
9. Employee Lifecycle
10. HR Dashboard
11. HR Reports
12. HR Configuration
13. HR Permissions and Data Security

---

# 7. EMPLOYEE / CANDIDATE ARCHITECTURE

Recruitment remains the candidate source of truth.

The employee authentication identity remains the existing SynTask User.

Conceptual architecture:

```text
User
 │
 │ 1:1
 ▼
Employee Profile
 │
 ├── Documents
 ├── Attendance
 ├── Leave
 ├── Salary Structure
 ├── Payroll
 └── Lifecycle History
```

Do not create a second authentication Employee entity.

Candidate conversion:

```text
Candidate
   ↓
Application
   ↓
Interview
   ↓
Offer
   ↓
Accepted
   ↓
Joined
   ↓
Canonical Employee Creation
   ↓
User + Employee Profile
```

All candidate-to-employee conversion paths must converge on one canonical employee creation/onboarding service.

---

# 8. PHASE 1 — EMPLOYEE PROFILE FOUNDATION

## Objective

Create the HR employee foundation that every later HRMS module will reference.

## Backend requirements

Implement or extend:

- Employee Profile
- Employee Number
- Personal Information
- Contact Information
- Address
- Emergency Contact
- Employment Information
- Department
- Team where supported
- Designation
- Reporting Manager
- Employment Type
- Joining Date
- Work Location
- Work Mode
- HR Employment Status
- Probation
- Confirmation Date
- Exit Information
- Employee Search
- Employee Filtering
- Sorting
- Pagination
- Company Scoping
- HR Permissions
- Employee Self Ownership
- Employee History foundation

### Candidate conversion

- Audit all candidate → employee paths.
- Create one canonical employee onboarding/conversion service.
- Prevent duplicate User creation.
- Prevent duplicate Employee Profile creation.
- Link Candidate to employee User/Profile.
- Preserve recruitment history.
- Map relevant job/offer/department/designation data into employment information.

## Frontend requirements

Create/extend:

### Employees List

Show:

- Employee Number
- Name
- Profile Photo
- Department
- Designation
- Manager
- Employment Type
- Joining Date
- Status
- Actions

### Search and filters

Search:

- employee name;
- employee number;
- email.

Filter:

- department;
- designation;
- employment status;
- employment type;
- work mode.

### Employee Detail

Tabs:

```text
Overview
Employment
Documents
Attendance
Leave
Salary
Lifecycle / History
```

Tabs whose modules are not built yet may show a clear “Not yet available” state during earlier phases, but must not use fake data.

### Create/Edit

HR-authorized users must be able to:

- create profile for an existing applicable User where allowed;
- edit employee HR details;
- change allowed employment properties;
- see validation errors.

## Migration

Backfill existing employee Users with Employee Profiles.

Migration must be idempotent.

## Acceptance test

From frontend:

```text
HR/Admin logs in
    ↓
People → Employees
    ↓
Search employee
    ↓
Open employee
    ↓
View HR details
    ↓
Edit employment/profile information
    ↓
Save
    ↓
Refresh page
    ↓
Updated real backend data remains
```

Candidate conversion must also be testable from the real Recruitment frontend.

---

# 8A. PHASE 1 — IMPLEMENTATION LOG

## Iteration 1 — Employee Profile Foundation

**Date:** 2026-08-13  
**Phase:** 1  
**Status:** IN PROGRESS

### Audited

- `backend/app/models/user.py` — `User` is the single authentication/account identity (roles, account status, company, department, reports_to, modules). Reused; no second auth Employee model created.
- `backend/app/recruitment/` — two inconsistent candidate → employee paths existed: `RecruitmentService.convert` (required JOINED + accepted offer) and `RecruitmentService.hire_candidate` (quick-hire via `assign_job_to_candidate(hire=True)`). Both created Users directly without any HR profile.
- `backend/app/models/department.py` — company-scoped Department; reused for HR department references.
- `backend/app/models/capability.py` — global role + department capability permission system; extended with `employee_management.*` capabilities.
- `backend/app/recruitment/events.py` + `subscribers.py` — existing domain-event/timeline/audit infrastructure; reused for employee profile events.
- Frontend: `frontend/src/modules/hr/recruitment/pages/EmployeesPage.jsx` was the HR Employees screen (candidate-centric cards, `/recruitment/employees`); `People → Employees` nav pointed at `/users` (account management).

### Implemented — Backend

- **`EmployeeProfile` Beanie model** (`backend/app/models/employee_profile.py`): company-scoped, 1:1 with `User` (unique `company_id + user_id`), employee number (unique company-scoped, sparse), candidate link, personal/contact/address/emergency-contact, employment information, HR employment status (separate from account status), probation, exit info. Indexes: `company_id+employee_number` (unique sparse), `company_id+user_id` (unique), `company_id+candidate_id` (unique sparse), status/department/reports_to access indexes.
- **Schemas** (`backend/app/schemas/employee_profile.py`): create/update DTOs, list item, paginated list response, normalized detail DTO (explicit fields only — never raw User serialization, no secrets/password/payroll exposure).
- **Service** (`backend/app/services/employee_profile_service.py`):
  - `list_employees` — backend search (name/email/phone/employee number), filters (department, designation, employment status, type, work mode), sorting, pagination; batched joins for users/departments/managers (no N+1).
  - `get_employee` — normalized detail with own-profile permission rule.
  - `create_profile` / `update_profile` — HR create/partial update with company-scope validation (department, manager, self-report prevention, employee-number uniqueness).
  - `generate_employee_number` — company-scoped `EMP-YYYY-####` (TrackingCodeService-style scan + unique index backstop). Numbers never generated on the frontend.
  - `ensure_employee_profile` — automatic profile creation for created staff.
  - **`EmployeeOnboardingService.create_employee_from_candidate`** — THE canonical candidate → employee path: duplicate-conversion prevention, company scope, existing-user-by-email reuse (same company) / rejection (other company), department/manager validation, User creation when needed, EmployeeProfile creation/linking, candidate → employee_id linking, `CandidateConverted` + `EmployeeProfileCreated` events.
- **Endpoints** (`backend/app/api/v1/endpoints/employees.py`): `GET /employees`, `GET /employees/me`, `GET /employees/{id}`, `POST /employees`, `PATCH /employees/{id}` with role + HR-department capability dependencies (`employee_management.view` / `.manage`).
- **Normalized conversion**: `RecruitmentService.convert` and `RecruitmentService.hire_candidate` now delegate to the canonical onboarding service.
- **User-creation integration**: `create_employee` and `create_user` (`backend/app/api/v1/endpoints/users.py`) auto-create Employee Profiles for company staff (any authorization role; platform Super Admins skipped).
- **Capabilities** (`backend/app/models/capability.py`): added `employee_management.view` / `employee_management.manage` for HR SUB_ADMIN/MANAGER, `employee_management.view` for HR LEAD/EMPLOYEE; seed now merges new capabilities into already-seeded rows.
- **Registration**: model registered in `backend/app/core/database.py`; router mounted at `/employees` in `backend/app/api/v1/router.py`.
- **Migration** (`backend/scripts/migrate_employee_profiles.py`): idempotent backfill for every applicable existing company User (skips SUPER_ADMIN, skips existing profiles, preserves department/designation/reports_to, generates employee numbers).

### Implemented — Frontend

- **API client** (`frontend/src/api/employees.js`): `list/get/me/create/update` against `/employees`.
- **EmployeesPage** (`frontend/src/modules/hr/recruitment/pages/EmployeesPage.jsx`): production employee table (avatar + name + email, Employee ID, Department, Designation, Manager, Type, Joining Date, Status, Actions), debounced backend search, filters (Department, Designation, Employment Status, Employment Type, Work Mode), backend pagination, loading/empty/error states, stat cards, Add Employee (create modal, admin only), row → detail navigation, edit shortcut (`?edit=1`).
- **EmployeeDetailPage** (`frontend/src/modules/hr/recruitment/pages/EmployeeDetailPage.jsx`): employee detail inside the normal shell; tabs Overview + Employment (functional, real API data) and Documents/Attendance/Leave/Salary/Lifecycle showing clean “not available yet” states; Edit form; `can_edit` from backend.
- **EmployeeFormModal** (`frontend/src/modules/hr/recruitment/components/EmployeeFormModal.jsx`): create/edit form with grouped sections (Employment, Personal, Address, Emergency Contact, Probation, Exit), validation, submitting state, success/error toasts, double-submit prevention.
- **Routing**: `App.jsx` route `/hr/recruitment/employees/:employeeId`; navigation re-enables the HR “Employees” item under People as “Employee Profiles” (`config/navigation.js`) so HR users can reach the canonical screen.

### API Integration

- Frontend list/detail/edit/create all call the real `/employees` backend APIs (no mock data). Employee conversions appear automatically (canonical onboarding creates the profile).

### Database / Migration

- New `employee_profiles` collection with company-scoped unique indexes.
- `backend/scripts/migrate_employee_profiles.py` backfills existing staff (`python -m scripts.migrate_employee_profiles`); idempotent.

### Permissions

- Backend: list/detail require employee-directory access (Admin/SubAdmin/Manager/SuperAdmin or HR-department capability `employee_management.view`); create/update require `employee_management.manage`; regular staff can open only their own profile; `/employees/me` is self-service. Company scoping enforced on every operation.
- Frontend: Add/Edit affordances shown for company admins (UX only); backend remains authoritative.

### Validation / UX

- Loading skeletons, empty state with guidance, error state with retry, debounced search, filter panel, pagination, modal validation near fields, submitting states, toasts.

### Files Modified

- `backend/app/api/v1/endpoints/users.py`, `backend/app/api/v1/router.py`, `backend/app/core/database.py`, `backend/app/models/capability.py`, `backend/app/recruitment/services.py`
- `frontend/src/App.jsx`, `frontend/src/config/navigation.js`, `frontend/src/modules/hr/recruitment/pages/EmployeesPage.jsx`
- `docs/HRMS_IMPLEMENTATION_MASTER.md` (this file)

### Files Created

- `backend/app/models/employee_profile.py`, `backend/app/schemas/employee_profile.py`, `backend/app/services/employee_profile_service.py`, `backend/app/api/v1/endpoints/employees.py`, `backend/scripts/migrate_employee_profiles.py`, `backend/tests/recruitment/test_employee_profile.py`
- `frontend/src/api/employees.js`, `frontend/src/modules/hr/recruitment/components/EmployeeFormModal.jsx`, `frontend/src/modules/hr/recruitment/pages/EmployeeDetailPage.jsx`, `frontend/src/modules/hr/recruitment/pages/EmployeesPage.test.jsx`

### Tests Added / Updated

- Backend: 21 unit tests (`tests/recruitment/test_employee_profile.py`) — normalization, employee number, create/update validation (duplicate profile, cross-company user/department/manager, self-report), detail access rules, canonical onboarding (duplicate conversion, user creation + job field mapping, existing-user reuse, cross-company rejection, offer joining date → PROBATION).
- Frontend: 9 vitest tests (`EmployeesPage.test.jsx`) — list renders, loading, empty, error+retry, debounced search, filters, pagination, detail navigation, add-employee modal.

### Commands Run

```text
backend: python -m pytest tests/recruitment (56 passed)
backend: python -m pytest tests (43 pre-existing failures in unrelated modules confirmed present on a clean tree; 499 passed)
frontend: npm test (415 passed; 7 pre-existing failures in unrelated files confirmed present on a clean tree)
frontend: npm run build (passes)
frontend lint: BLOCKED BY ENVIRONMENT — ESLint v9 requires eslint.config.js; repo ships .eslintrc.cjs only
```

### Browser Workflow Tested

Not executed in this session — decision: user chose to skip live browser verification. The configured `MONGODB_URL` points at a production Atlas cluster and no local MongoDB is available, so no live workflow was run. The complete browser workflow (People → Employees → search → filter → detail → Overview → Employment → edit → save → reload persists; Recruitment → Convert/Hire → appears in Employees) is implemented end-to-end and documented in §61/§8 of this file; verify it in an environment with a reachable, non-production database.

### Result

- End-to-end implementation complete: model → migration → schemas → services → business rules → APIs → auth → authorization → frontend client → pages → forms → validation → loading/error/empty states → tests. Frontend build passes. No new test failures introduced.

### Known Issues

- Lint cannot run (pre-existing environment/config issue).
- Pre-existing backend/frontend test failures in unrelated modules (confirmed on a clean tree before this phase).
- HR-department Managers with the `employee_management.manage` capability do not see Add/Edit controls (frontend shows them for company admins only; backend still allows them).
- Legacy `/recruitment/employees` endpoint remains for the older recruitment employees view; the canonical HR surface is `/employees`.

### Assumptions

- “Applicable existing employee” for backfill = any company User with `company_id` and role ≠ SUPER_ADMIN (matches §68: staff regardless of authorization role).
- Work-mode vocabulary aligns with Recruitment (`onsite/remote/hybrid`); legacy variants are normalized at the backend boundary.
- Employment status defaults: `onboarding`; converted candidates with a joining date start at `probation`.
- HR list surfaces Employee Profiles only; backfill migration + ensure-on-create keep every applicable staff member covered.

### Remaining Before Phase Completion

- [ ] (Deferred by decision) Run the People → Employees workflow from the real frontend against a reachable non-production DB and mark Browser Verified
- [ ] (Deferred by decision) Verify candidate conversion from the real Recruitment frontend with seeded candidate data

---

# 9. PHASE 2 — HR DOCUMENTS

## Objective

Create structured employee/candidate document management using existing storage infrastructure.

## Document Types

Configurable examples:

- Resume
- Aadhaar
- PAN
- Passport
- Driving License
- Educational Certificate
- Experience Letter
- Offer Letter
- Appointment Letter
- Joining Document
- Bank Document
- Salary Document
- Tax Document
- Other

## Document model

Support:

- Document ID
- Company
- Employee/Candidate owner
- Document Type
- File Name
- MIME Type
- File Size
- Storage Reference
- Uploaded By
- Upload Date
- Expiry Date
- Status
- Version
- Description
- Visibility
- Created At
- Updated At

## Actions

- Upload
- Preview
- Download
- Replace
- Add Version
- Delete where permitted
- View history

## Expiry statuses

```text
VALID
EXPIRING_SOON
EXPIRED
NO_EXPIRY
```

Use existing notification architecture when expiry notifications are implemented.

## Frontend

Employee Documents tab must support:

- list;
- upload;
- preview;
- download;
- replace;
- delete;
- expiry information;
- version information.

HR Settings should include document type configuration where appropriate.

## Acceptance test

```text
HR opens Employee
    ↓
Documents
    ↓
Upload document
    ↓
Document saved
    ↓
Preview
    ↓
Download
    ↓
Replace/version
    ↓
Refresh
    ↓
History remains correct
```

---

# 10. PHASE 3 — LEAVE MANAGEMENT UPGRADE

## Objective

Extend existing SynTask Leave rather than rebuilding it.

## Required model correction

Separate:

```text
Leave Type
```

from:

```text
Leave Duration
```

Examples:

```text
Leave Type = Sick Leave
Duration   = Full Day
```

## Leave Type configuration

Support configurable:

- Name
- Code
- Description
- Paid/Unpaid
- Allocation
- Carry Forward where required
- Approval requirement
- Active status

## Leave balance

Track:

- Allocated
- Used
- Pending
- Available

Calculation must happen on backend.

## Employee workflow

- View balance
- Select type
- Select duration
- Select dates
- Enter reason
- Attach document where allowed
- Submit
- View status
- Cancel where permitted

## Manager/HR workflow

- View pending requests
- View relevant employee balance
- Approve
- Reject
- Forward if existing workflow supports it
- Comment

## Attendance integration

Approved leave must affect attendance classification.

Paid leave ≠ unexplained absence.

Unpaid leave must be visible to payroll input later.

## Frontend

Implement:

- My Leave
- Leave balances
- Leave Request
- Leave history
- Approval queue
- Leave Type settings

## Acceptance test

```text
Employee submits leave
      ↓
Manager receives it
      ↓
Manager approves
      ↓
Employee sees approved status
      ↓
Balance updates
      ↓
Attendance reflects approved leave correctly
```

---

# 11. PHASE 4 — ATTENDANCE HR/PAYROLL READINESS

## Objective

Preserve existing attendance and remove assumptions that prevent payroll-grade use.

## Requirements

Support configurable:

- expected working hours;
- expected start/end;
- grace period;
- work week;
- holidays;
- overtime rules;
- applicable schedule/policy.

Avoid fixed global UTC rules.

## Attendance statuses

Support appropriate representation for:

- Present
- Absent
- Paid Leave
- Unpaid Leave
- Half Day
- Holiday
- Week Off

Use existing naming conventions where practical.

## Attendance correction

Employee may request correction for:

- missing check-in;
- missing check-out;
- incorrect time;
- wrong absence.

Authorized manager/HR may:

- approve;
- reject.

Changes must be auditable.

## Payroll adapter

Create a stable backend attendance summary/interface for a payroll period.

Payroll must not duplicate attendance records.

## Frontend

Extend existing attendance UI with:

- policy-aware status;
- corrections;
- history;
- manager/HR correction review;
- holiday/work policy screens if required.

## Acceptance test

Test from browser:

- check-in;
- break;
- check-out;
- history;
- approved leave;
- holiday;
- correction;
- manager approval;
- resulting attendance summary.

---

# 12. PHASE 5 — SALARY STRUCTURE

## Objective

Create flexible, versioned employee salary structures.

## Salary Component

Types:

```text
EARNING
DEDUCTION
```

Possible components are business configuration, not permanent hard-coded schema columns.

Support:

- Name
- Code
- Type
- Description
- Calculation Method
- Fixed/Variable
- Active

## Salary Structure

Support:

- Employee
- Effective From
- Effective To where needed
- Currency
- Components
- Version/history

Historical salary structures must remain available.

## Frontend

Payroll/HR authorized users can:

- create components;
- edit components;
- assign salary;
- edit effective salary;
- view salary structure;
- view salary history.

## Acceptance test

```text
HR opens employee
    ↓
Salary
    ↓
Assign structure
    ↓
Add earnings/deductions
    ↓
Save
    ↓
Refresh
    ↓
Structure persists
    ↓
Create new effective version
    ↓
Old version remains in history
```

---

# 13. PHASE 6 — PAYROLL

## Objective

Implement reproducible monthly payroll.

## Payroll Period

Support:

- Company
- Month
- Year
- Start Date
- End Date
- Status
- Created By
- Calculated At
- Approved By
- Approved At
- Processed At

## Workflow

```text
DRAFT
  ↓
CALCULATED
  ↓
REVIEW
  ↓
APPROVED
  ↓
PROCESSED
```

## Payroll calculation inputs

- Employee
- Effective Salary Structure
- Attendance
- Approved Leave
- Holidays
- Overtime where applicable
- Earnings
- Deductions

## Outputs

- Working Days
- Payable Days
- Earnings
- Gross Salary
- Deductions
- Net Salary

## Payroll snapshot

Every Payroll Record must preserve the data used to calculate it.

Historical payroll must not dynamically recalculate from today's data.

## Finalization

After approval/processing:

- source changes cannot silently mutate payroll;
- corrections require explicit recalculation/adjustment.

## Frontend

Create Payroll workspace:

```text
Payroll Periods
Current Payroll
Salary Structures
Salary Components
Payroll History
```

Current payroll table:

```text
Employee
Payable Days
Gross
Deductions
Net
Status
Actions
```

## Acceptance test

From frontend:

```text
Create Payroll Period
       ↓
Calculate
       ↓
Review employee payroll
       ↓
Approve
       ↓
Process
       ↓
Reload
       ↓
Payroll remains stable
```

---

# 14. PHASE 7 — PAYSLIP PDF

## Objective

Generate secure PDF payslips from processed payroll snapshots.

Reuse existing ReportLab/PDF architecture where suitable.

## Payslip content

- Company Logo
- Company Name
- Company Address
- Employee Name
- Employee ID
- Department
- Designation
- Payroll Month
- Pay Period
- Payable Days
- Attendance Summary
- Earnings
- Gross Salary
- Deductions
- Net Salary
- Generation Date

## Security

Employee can access own payslips.

Unauthorized access to another employee's payslip must be rejected by backend.

## Frontend

Support:

- Generate
- View/Preview
- Download
- Payroll history
- Employee self-service history

## Acceptance test

```text
Processed Payroll
      ↓
Generate Payslip
      ↓
Open/Download PDF
      ↓
Employee logs in
      ↓
My Salary
      ↓
Downloads own payslip
      ↓
Cannot access another employee's payslip
```

---

# 15. PHASE 8 — EMPLOYEE SELF-SERVICE

## Objective

Create one coherent employee HR workspace using real existing/new APIs.

Recommended:

```text
My HR
├── My Profile
├── My Attendance
├── My Leave
├── My Documents
└── My Salary / Payslips
```

Reuse existing attendance and leave UI/API logic.

## Security

Employee may access own resources only unless explicitly authorized otherwise.

## Acceptance test

Employee must be able to use every My HR module from frontend and must be denied access to another employee's protected HR data.

---

# 16. PHASE 9 — EMPLOYEE LIFECYCLE

## Objective

Maintain employment lifecycle separately from authentication/account state.

Potential statuses:

```text
ONBOARDING
PROBATION
ACTIVE
NOTICE_PERIOD
EXITED
```

Use only states needed by approved business requirements.

## Onboarding

Support:

- joining;
- department;
- designation;
- manager;
- employment type;
- required documents;
- probation.

## Confirmation

Support:

- probation end;
- confirmation date;
- confirmation status.

## Transfer

Track:

- old/new department;
- old/new team;
- old/new manager;
- old/new location;
- effective date.

## Promotion

Track:

- old/new designation;
- effective date;
- salary structure change reference where applicable.

## Resignation

Track:

- resignation date;
- reason;
- notice period;
- expected last working day;
- approved last working day;
- status.

## Exit

Track:

- final working day;
- exit reason;
- exit documentation;
- final employee status.

## History

Preserve events such as:

- Joined
- Department Changed
- Manager Changed
- Designation Changed
- Promotion
- Salary Revised
- Confirmed
- Resigned
- Exited

## Frontend

Employee detail lifecycle/history tab must show real chronological data and authorized lifecycle actions.

---

# 17. PHASE 10 — HR DASHBOARD & REPORTS

## Objective

Build dashboard/reporting only after source modules are reliable.

## Workforce metrics

Potential:

- Total Employees
- Active Employees
- New Joiners
- Probation
- Exiting Employees
- By Department
- By Designation
- By Employment Type

## Attendance metrics

- Present Today
- Absent Today
- On Leave
- Late
- Attendance %
- Working Hours where appropriate

## Leave metrics

- Pending
- Approved
- Rejected
- On Leave Today
- Utilization

## Payroll metrics

- Current Payroll
- Processed Employees
- Pending Review
- Processed
- Total Earnings
- Total Deductions
- Net Payroll

## Document metrics

- Total Documents
- Missing
- Expired
- Expiring Soon

Only display metrics that can be reliably derived.

## Reports

### Employee
- Employee List
- Employee Directory
- Department
- Designation
- Status
- New Joiners
- Exits

### Attendance
- Daily
- Monthly
- Employee
- Department
- Absence
- Late
- Overtime

### Leave
- Requests
- Usage
- Balances
- Employee History
- Department

### Payroll
- Monthly
- Employee History
- Salary Summary
- Earnings
- Deductions
- Net Payroll

### Documents
- Missing
- Expired
- Expiring

## Frontend

Provide:

- cards;
- charts where useful;
- report tables;
- filters;
- date/period selectors;
- exports where existing infrastructure supports them.

No fake/static numbers.

---

# 18. PHASE 11 — FINAL INTEGRATION & REGRESSION

Verify the complete HRMS flow:

```text
Candidate
   ↓
Offer
   ↓
Join
   ↓
Employee
   ↓
Employee Profile
   ↓
Documents
   ↓
Attendance
   ↓
Leave
   ↓
Salary Structure
   ↓
Payroll
   ↓
Payslip
   ↓
Employee Self-Service
```

Verify lifecycle:

```text
Onboarding
   ↓
Probation
   ↓
Confirmation
   ↓
Transfer / Promotion
   ↓
Resignation
   ↓
Exit
```

Verify reporting:

```text
Employee + Attendance + Leave + Documents + Payroll + Lifecycle
                              ↓
                        HR Dashboard
                              ↓
                          HR Reports
```

Regression-test unrelated critical SynTask modules that could be affected:

- Authentication
- Permissions
- Recruitment
- Attendance
- Leave
- Projects
- Tasks
- CRM
- Notifications
- Storage

---

# 19. CURRENT KNOWN ARCHITECTURAL FINDINGS

These findings came from the initial repository audit and should be revalidated before code changes:

1. SynTask already has User/Employee authentication/account entities.
2. Recruitment already contains Candidate, Job, Application, Offer, Interview, Resume and conversion flows.
3. Candidate → Employee conversion paths may not currently enforce exactly the same prerequisites.
4. Employee HR information is currently too thin for full HRMS.
5. Attendance already supports check-in/out, breaks, working time, history, monitoring, and reporting.
6. Attendance contains assumptions such as standard work hours/late timing that need policy configuration before payroll.
7. Existing Leave has request and approval workflows but lacks a complete configurable leave-balance/policy model.
8. Existing Leave type concepts mix leave category and duration and need normalization.
9. Existing file-storage infrastructure should be reused.
10. Existing ReportLab/PDF infrastructure should be reused for payslips.
11. Existing module permission architecture should be extended rather than replaced.
12. Payroll, salary structures, HR documents, lifecycle history, and HR-specific dashboards require new functionality.

---

# 20. ACTIVE PHASE WORK LOG TEMPLATE

Copy this section under the currently active phase after each implementation iteration.

## Iteration

**Date:**  
**Phase:**  
**Status:**  

### Audited

- 

### Implemented — Backend

- 

### Implemented — Frontend

- 

### API Integration

- 

### Database / Migration

- 

### Permissions

- 

### Validation / UX

- 

### Files Modified

- 

### Files Created

- 

### Tests Added / Updated

- 

### Commands Run

```text

```

### Browser Workflow Tested

```text

```

### Result

- 

### Known Issues

- 

### Assumptions

- 

### Remaining Before Phase Completion

- [ ] 

---

# 21. DECISION LOG

Record important architectural decisions here so later Codex sessions do not undo them.

| Date | Decision | Reason | Affected Phase |
|---|---|---|---|
| 2026-08-13 | Existing User remains authentication identity; EmployeeProfile is a 1:1 HR companion | Avoid duplicate employees/accounts | 1 |
| 2026-08-13 | One canonical `EmployeeOnboardingService.create_employee_from_candidate`; `convert` + `hire_candidate` delegate to it | Eliminate two inconsistent employee-creation paths | 1 |
| 2026-08-13 | Employment status (`onboarding/probation/active/notice_period/exited`) is distinct from `UserStatus` | Account state ≠ employment lifecycle | 1 |
| 2026-08-13 | Work mode/employment type vocabulary aligns with Recruitment (`onsite/remote/hybrid`, `full_time/…`) | No duplicated string variants | 1 |
| 2026-08-13 | Employee numbers are generated backend-side, company-scoped (`EMP-YYYY-####`) + unique index | Stable, safe, never client-generated | 1 |
| 2026-08-13 | HR screen lives in the existing HR module (`/hr/recruitment/employees`); People → Employees (`/users`) stays account management | No second HR application; clear canonical screen | 1 |
| | Every phase is backend + frontend | Allows browser testing before next phase | All |
| | Payroll uses snapshots | Historical financial integrity | 6 |
| | Existing Attendance is extended, not rebuilt | Preserve working functionality | 4 |
| | Existing file storage is reused | Avoid duplicate infrastructure | 2 |
| | Existing PDF infrastructure is reused | Native codebase compatibility | 7 |

---

# 22. BUG / BLOCKER LOG

| ID | Phase | Problem | Severity | Root Cause | Status | Resolution |
|---|---|---|---|---|---|---|
| | | | | | | |

---

# 23. FINAL HRMS DEFINITION OF DONE

The HRMS is complete only when:

- [ ] Candidate → Employee flow is unified
- [ ] Employee profiles are complete
- [ ] Existing employee data is migrated safely
- [ ] Documents work end-to-end
- [ ] Document permissions are secure
- [ ] Leave types and balances work
- [ ] Leave integrates with attendance
- [ ] Holidays are handled
- [ ] Attendance is payroll-ready
- [ ] Attendance corrections work
- [ ] Salary components work
- [ ] Versioned salary structures work
- [ ] Payroll calculation works
- [ ] Payroll review/approval/processing works
- [ ] Historical payroll remains stable
- [ ] Payslip PDFs work
- [ ] Payslip access is secure
- [ ] Employee Self-Service works
- [ ] Lifecycle workflows work
- [ ] Lifecycle history is preserved
- [ ] HR Dashboard uses real data
- [ ] HR Reports use real data
- [ ] Frontend contains no production mock HR data
- [ ] Backend permissions are verified
- [ ] Frontend permissions are verified
- [ ] Backend tests pass
- [ ] Frontend tests pass where applicable
- [ ] Production build passes
- [ ] Critical workflows are verified from browser
- [ ] Existing SynTask functionality has not regressed

---

# 24. CODEX PHASE EXECUTION RULE

When giving this file to Codex, use the following instruction:

```text
Read docs/HRMS_IMPLEMENTATION_MASTER.md completely.

Identify the CURRENT ACTIVE PHASE.

Work ONLY on that phase.

Before modifying code:
1. Deeply audit all existing code related to the active phase.
2. Compare it against the active phase requirements in this master file.
3. Reuse existing SynTask functionality wherever possible.
4. Produce a concise requirement-to-code/file mapping.

Then implement the active phase completely end-to-end:
- database/model
- migration/backfill if required
- backend schemas/services/APIs
- authentication and authorization
- frontend API integration
- frontend pages/components/forms
- loading/error/empty/permission states
- validation
- tests
- browser-testable workflow

Do not implement future phases unless a minimal dependency is absolutely required for the current phase.

Do not mark the phase COMPLETE until frontend and backend are fully connected and the workflow can be tested from the SynTask UI.

Run relevant tests/build checks.

At the end, update docs/HRMS_IMPLEMENTATION_MASTER.md:
- phase status
- backend completed
- frontend completed
- files changed
- migrations
- APIs
- permissions
- tests
- browser workflow
- known limitations
- remaining items

If anything remains incomplete, keep the phase IN PROGRESS and clearly state what remains.

Never rewrite unrelated working functionality.
Never create duplicate HR systems when SynTask already has an equivalent foundation.
```

---

# 25. STARTING POINT

The first implementation task should be:

```text
PHASE 1 — EMPLOYEE PROFILE FOUNDATION
```

Do not begin Payroll, Documents, or other later phases before Phase 1 has a stable employee identity/profile foundation unless an unavoidable dependency requires a minimal supporting change.
