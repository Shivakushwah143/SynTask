# ADR: Recruitment Job Approval Workflow

## Status

Accepted — 2026-08-15

## Context

The Recruitment module had a complete backend state machine for job lifecycle
(`DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED → PAUSED → CLOSED → ARCHIVED`)
but lacked the endpoints and UI for the approval workflow. Jobs could be
created and published directly, bypassing the intended approval gate.

This gap meant:
- No submit-for-approval endpoint existed
- No approve/reject endpoints existed
- The frontend had no approval workflow buttons
- The dashboard linked to `/hr/recruitment/jobs/{jobId}` but no such route existed

## Decision

1. **Add `submit_job`, `approve_job`, `reject_job` service methods** to `JobService`
   that reuse the existing `transition_job` validation and event publishing.
   The `JOB_LIFECYCLE_TRANSITIONS` dict already defined these transitions.

2. **Add three new API endpoints**:
   - `POST /jobs/{job_id}/submit-for-approval` — DRAFT → PENDING_APPROVAL
   - `POST /jobs/{job_id}/approve` — PENDING_APPROVAL → APPROVED
   - `POST /jobs/{job_id}/reject` — PENDING_APPROVAL → DRAFT

3. **Add `require_job_approve` permission** using the existing `recruitment.jobs.approve`
   capability, consistent with the existing permission architecture.

4. **Add job detail route** `/hr/recruitment/jobs/:jobId` on the frontend that
   reuses the existing `JobsPage` component (drawer-based detail view).

5. **Add lifecycle-aware action buttons** on the Jobs page that show different
   actions based on the current job status, respecting backend state machine rules.

6. **Add offer list endpoint** `GET /offers` with pagination, filtering, and
   candidate name enrichment — the only missing list endpoint in the recruitment API.

7. **Add `mark-joined` endpoint** `POST /candidates/{candidate_id}/mark-joined`
   for the OFFER_ACCEPTED → JOINED transition, completing the standard recruitment
   flow before employee conversion.

## Consequences

- The approval workflow is now complete end-to-end: create → submit → approve → publish
- The state machine is enforced server-side; frontend buttons are UX hints only
- Invalid transitions return controlled 400 responses, not 500
- The offer list endpoint enables the Offers page to show all offers
- The mark-joined endpoint completes the standard OFFER_ACCEPTED → JOINED → CONVERT flow
- No duplicate models or services were created; all changes reuse existing infrastructure

## Files Changed

- `backend/app/recruitment/services.py` — added `submit_job`, `approve_job`, `reject_job`, `mark_joined`
- `backend/app/recruitment/routes.py` — added 5 new endpoints + offer list
- `backend/app/recruitment/permissions.py` — added `require_job_approve`
- `backend/app/recruitment/schemas.py` — added `OfferListResponse`, `MarkJoinedRequest`, `JobRejectRequest`
- `frontend/src/api/recruitment.js` — added missing API client methods
- `frontend/src/App.jsx` — added `/hr/recruitment/jobs/:jobId` route
- `frontend/src/modules/hr/recruitment/pages/JobsPage.jsx` — lifecycle action buttons
- `frontend/src/modules/hr/recruitment/pages/CandidatesPage.jsx` — stage transition actions, removed unsupported filter
- `backend/tests/recruitment/test_job_approval_workflow.py` — new test file
