# Application-scoped Recruitment lifecycle

## Decision

`Application.status` is the canonical Recruitment lifecycle. A Candidate is a reusable, company-scoped person profile and may own multiple independently staged Applications. Lifecycle mutations require an application context.

## Consequences

- The global Candidates workspace and Job Candidate Pipeline query the same application API.
- Legacy Candidate lifecycle endpoints only resolve one unambiguous Application; otherwise they return `APPLICATION_CONTEXT_REQUIRED`.
- Offers, new interviews, timeline events, joining, and conversion carry `application_id`.
- Cross-company candidate, job, resume, recruiter, offer, and application references are rejected by the canonical services.
- Candidate status remains a temporary compatibility field and must not fan out to applications.

## Migration

`backend/scripts/migrate_recruitment_application_context.py` backfills only records with exactly one candidate/job application match and logs ambiguous records without changing them.
