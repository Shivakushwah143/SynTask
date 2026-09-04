# ADR: eTimeOffice biometric attendance → existing SynTask Attendance module

- **Date:** 2026-09-04
- **Status:** Accepted (feature branch `feat/etimeoffice-attendance-integration`)
- **Deciders:** Engineering (feature request + evidence-first discovery)

## Context

The company's eTimeOffice biometric devices record real office punches, but HR
currently only sees SynTask app check-ins. We were asked to bring eTimeOffice
attendance into the **existing** HRMS Attendance module (no duplicate
attendance system) with an evidence-first loop and a hard stop-condition: never
invent eTimeOffice endpoints.

Portal login credentials were available in backend environment variables, but
no confirmed API contract existed. `https://etimeoffice.com/api` returns 404/500
and the prompt explicitly forbade assuming `https://api.etimeoffice.com/api`
was usable.

## Discovery evidence

Read-only probes and third-party documentation established:

1. The machine-data download API base is `https://api.etimeoffice.com/api`
   (corroborated by the Merciglobal docs, Horilla integration, the Odoo
   WebbyCrown module, and the open-source `pyetimeoffice` library).
2. `GET /DownloadInOutPunchData?Empcode=ALL&FromDate=DD/MM/YYYY&ToDate=DD/MM/YYYY`
   returns `{ Error, Msg, IsAdmin, InOutPunchData[] }` — one row per employee
   per workday with `Empcode`, `Name`, `DateString`, `INTime`, `OUTTime`,
   `WorkTime`, `OverTime`, `BreakTime`, `Status` (`P`/`A`), `Remark`,
   `Erl_Out`, `Late_In`.
3. Authentication is HTTP Basic with a **compound username**
   `CorporateID:Username:Password:true` and an empty Basic password. The
   trailing `:true` was confirmed against the live service: omitting it returns
   HTTP 500 `"String was not recognized as a valid Boolean"`.
4. The API is read-only and sessionless (Basic auth per request), so there is
   no login/cookie/CSRF ceremony and no per-request re-login concern.

## Decision

- **Provider isolation.** Add `ETimeOfficeClient`
  (`backend/app/integrations/etimeoffice/client.py`). Vendor field names and
  the compound-auth detail never leave the provider; SynTask consumes
  normalized `ETimeOfficeInOutDay` values.
- **Server-side only.** React never calls eTimeOffice; FastAPI is the only
  caller. Credentials live only in backend env vars.
- **Sync into the existing Attendance model.** Write mapped employees' device
  days into `Attendance` (per employee/company/day), with new optional fields
  `source="etimeoffice"` and `external_employee_code` for attribution. Reuse
  existing attendance surfaces (`/attendance/history`, reports, payroll
  resolver) instead of building a parallel attendance store.
- **Idempotent, non-destructive upsert.** Re-syncing a window updates changed
  days and counts identical days as duplicates. Manual SynTask app attendance
  is never overwritten and never deleted; provider failures leave existing
  attendance untouched.
- **Code-based mapping.** eTimeOffice `Empcode` → SynTask
  `EmployeeProfile.employee_number` (exact, or an unambiguous numeric tail so
  `EMP-2026-0001` ↔ `0001` works). Never map by name. Unmapped employees are
  counted and reported; they never fail the run.
- **Company-scoped timezone interpretation.** The device returns wall-clock
  times without an offset, so `ETIMEOFFICE_TIMEZONE` (default `Asia/Kolkata`)
  defines the corporate clock; instants are stored as naive UTC per SynTask
  convention. Late/early/overtime flags are recomputed through SynTask policy
  rules rather than copied from vendor `Late_In`.
- **Reuse existing background scheduling.** The automatic sync is a
  leader-gated in-process loop (same pattern as HR document expiry / reminder
  schedulers) gated on `ETIMEOFFICE_ENABLED`, with a per-company in-flight
  guard preventing overlapping sync jobs.
- **Safe status only.** A company-scoped `attendance_sync_states` document
  stores connection health and the last run summary (never credentials).

## Consequences

- HR sees biometric punches with a `Source: eTimeOffice` marker inside
  Attendance Reports without new attendance infrastructure.
- Two known constraints are documented rather than solved here: (a) the
  attendance policy timezone in the tenant data (currently `UTC`) is
  inconsistent with corporate time; the sync uses `ETIMEOFFICE_TIMEZONE` for
  display correctness and policy flag fixes belong to policy configuration;
  (b) `attendance_status_resolver.compute_late_minutes`/`compute_early_departure`
  contain a naive-vs-aware datetime comparison bug, so the sync computes flags
  locally instead of calling the broken helpers.
- Scope guardrails: no punch editing/correction, no eTimeOffice writeback, no
  per-employee override mapping UI (numeric-tail matching covers the current
  `EMP-2026-XXXX` codes). If codes ever diverge structurally, a small
  company-scoped `external_employee_code → employee_id` mapping model is the
  documented follow-up.
