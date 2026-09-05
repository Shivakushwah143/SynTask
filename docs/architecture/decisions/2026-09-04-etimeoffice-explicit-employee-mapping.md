# Explicit eTimeOffice → SynTask employee mapping

Status: Accepted
Date: 2026-09-04

Supersedes the employee-mapping choice made in
[2026-09-04-etimeoffice-attendance-integration.md](./2026-09-04-etimeoffice-attendance-integration.md).

## Context

The eTimeOffice attendance sync initially resolved which SynTask employee owns
an eTimeOffice `Empcode` by matching `EmployeeProfile.employee_number` numeric
suffixes (`EMP-2026-0001` ↔ `0001`). That is unsafe identity inference: the
eTimeOffice code and the SynTask internal code are independent numbering
systems that merely looked similar in the demo data. In practice the real
device directory (`0001 = Kavita Borse`, `0002 = Purvi Khandelwal`, …) did not
match the SynTask employees whose numbers ended in the same suffix, so
biometric punches were silently attached to the wrong people (e.g. Kavita
Borse's punches appeared under the employee whose number was `EMP-2026-0001`).

## Decision

1. **Remove inference.** The sync never derives an employee from an
   `employee_number` suffix (or any other code pattern) and never maps by name
   at runtime.
2. **Explicit company-scoped mapping table.** A `etimeoffice_employee_mappings`
   collection (model `ETimeOfficeEmployeeMapping`) stores one row per external
   employee:
   - `(company_id, provider, external_employee_code)` unique;
   - `external_employee_name` = directory metadata refreshed from every
     provider fetch (informational only);
   - `employee_id` (SynTask User id) set only after HR confirms the mapping in
     the Attendance UI; a partial unique index
     `(company_id, provider, employee_id)` guarantees one eTimeOffice code per
     SynTask employee.
3. **Provider directory is data, not code.** `Empcode`/`Name` pairs are
   persisted from the eTimeOffice response on every sync/fetch. Nothing about
   the current roster is hard-coded in business logic.
4. **Safe suggestion, never assignment.** The mapping UI may suggest a SynTask
   employee for an exact (or uniquely high-confidence) normalized name match,
   excluding placeholder identities such as `Empname0005`. Confirming the
   mapping is an explicit HR action (`PUT /mappings/{code}`).
5. **Sync honors the table only.** Unmapped codes produce no Attendance rows
   and are reported as `unmapped`.
6. **Reconciliation is explicit and audited.** Historical biometric rows
   written under the wrong employee are repaired by
   `scripts/reconcile_etimeoffice_mappings.py` (dry-run by default): rows are
   moved/merged to the mapped employee, duplicate copies of the same day are
   removed, and rows for unmapped codes are left untouched rather than guessed.

## Consequences

- No biometric attendance can be silently attached to the wrong SynTask
  employee; a wrong link now requires an HR action.
- Companies must confirm mappings for every eTimeOffice employee before their
  punches appear; codes without a confirmed mapping stay unmapped in the UI.
- Company isolation is unchanged: every mapping row and attendance row is
  tenant-scoped by `company_id`, and all mapping endpoints are restricted to
  company admin/sub-admin roles.
- Existing wrong rows were reconciled for the affected company (see the
  reconciliation report in the integration task notes); a documented script is
  kept so any other company can be reconciled identically.
