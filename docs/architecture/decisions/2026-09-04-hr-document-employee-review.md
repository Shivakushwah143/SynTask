# HR Document employee submissions with HR review workflow

Status: Accepted
Date: 2026-09-04
Owners: HRMS / Phase 2 HR Document system

## Context

HR could upload employee documents, but employees could not submit their own
documents (resume updates, identity cards, education/experience proofs). The
product asks for a workflow: employee uploads → Pending Review → HR approves
or rejects (rejection carries a reason) → employee sees the reason and
resubmits → Pending Review. Required documents must be considered complete
only when approved.

The existing HR document system is a metadata layer over the shared
FileService/Cloudinary storage: one `HRDocument` per logical file with an
`active`/`archived` lifecycle and versioned files (`HRDocumentVersion`), typed
by company-scoped `HRDocumentType`s. No separate document system may be
introduced, and existing HR uploads (which are implicitly trusted/approved)
must keep working unchanged.

## Decision

Extend the existing models/services/APIs — no duplicate architecture:

- **Review is separate from lifecycle.** `HRDocument.status` stays
  `active`/`archived`. Approval state is new fields on `HRDocument`
  (`submission_source`, `review_status`, `reviewed_by`, `reviewed_at`,
  `review_note`) mirroring the current outcome, and each
  `HRDocumentVersion` stores its own copy of those fields so version history
  (V1 rejected → V2 pending → V2 approved) is auditable forever.
- **Sources & defaults.** `submission_source`: `hr` | `employee`.
  `review_status`: `pending` | `approved` | `rejected`. HR uploads and
  replacements are `hr` + `approved` (existing behavior unchanged). Legacy
  rows without review fields read back as `hr`/`approved` and the idempotent
  `scripts/migrate_hr_document_review_flow.py` backfills them.
- **Self-service endpoints resolve identity server-side.** `GET/POST
  /hr/me/documents` and `GET /hr/me/documents/status` derive the employee
  from the authenticated user (`company_id + user_id` Employee Profile) —
  no `employee_id` is accepted from clients, so an employee can never upload
  for, read, or review another employee's documents, and company isolation is
  structural. Normal employees are granted no HR document permission.
- **HR review.** `POST /hr/documents/{id}/review` (`approve` | `reject`)
  requires HR manage (`has_hr_manage`), applies only to `pending` documents,
  and requires a reason for rejection. The outcome is written to the document
  and its current version.
- **Resubmission reuses versioning.** Resubmitting a rejected document appends
  the next version to the *same* `HRDocument` and resets it to `pending` —
  never a duplicate document record; previous (rejected) versions are kept.
- **Config gate.** `HRDocumentType.employee_upload_allowed` (default `false`,
  HR-editable in Document Types settings) controls which types appear in the
  employee upload UI and are accepted by the submission endpoint. Only active,
  employee-scoped, employee-visible types can be employee-submitted.
- **Required documents count only approved.** `missing_required_documents`
  and the employee status overview treat pending/rejected as not completed;
  the employee UI distinguishes Missing / Pending Review / Approved /
  Rejected.

## Alternatives considered

- **Review fields only on versions** — accurate history but every list/filter
  would need a join to the current version; filtering pending documents
  company-wide becomes expensive and the mirror (document + current version)
  keeps read paths trivial while retaining full per-version audit.
- **A separate approval/checklist system** — rejected: duplicate ownership,
  permissions and storage bookkeeping over an existing document system.
- **Trusting a frontend-supplied `employee_id` on an employee upload route**
  with a server-side ownership check — rejected in favor of structurally
  self-scoped routes (nothing to forge).

## Consequences and risks

- Document/version rows gain a few nullable fields; serialization defaults
  keep pre-migration data stable (approved/hr).
- Employees see only employee-visible, active documents; HR_ONLY types cannot
  be self-submitted (they would otherwise be invisible to their owner).
- An approved document of a type blocks further employee submissions for that
  type (409) — resubmission exists only for rejected documents.
- HR replace of an employee-submitted document preserves the current review
  outcome on the new version.

## Migration and rollback

- Run `python -m scripts.migrate_hr_document_review_flow` from `backend/`
  (idempotent; `--dry-run` available). Backfills `submission_source=hr`,
  `review_status=approved` on documents/versions missing those fields and
  `employee_upload_allowed` defaults per document-type code (standard
  self-declared codes enabled, everything else `false`).
- Rollback: feature-flag-free; reverting code leaves the new fields unused —
  no destructive migration is required.

## Verification

- Backend unit tests in `tests/recruitment/test_hr_documents.py` cover
  employee submit, ownership/company isolation, pending visibility, HR
  approve, HR reject + reason, employee cannot approve/reject, resubmission
  creating the next version with old versions preserved, HR upload staying
  approved, disallowed document-type uploads, and legacy serialization.
- Frontend vitest suites cover DocumentsTab review actions and the My
  Documents self-service upload/resubmit/statuses.
