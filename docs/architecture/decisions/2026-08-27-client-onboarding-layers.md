# Client onboarding layers
Status: Accepted
Date: 2026-08-27
Owners: SynTask platform team

## Context
Client activation needs a durable, tenant-scoped readiness record without duplicating Contacts, Documents, Projects, Meetings, Files, or Finance records. Some layers are derived from those records, while commercial gaps, requirements, assets, access, and start readiness need structured onboarding metadata until a canonical source record exists.

## Decision
Use one `ClientOnboarding` document per `(company_id, client_id)` and one `ClientOnboardingItem` per layer key. The backend onboarding service calculates derived statuses and required progress, persists item status changes with actor/timestamp audit entries, and is the only source of truth for `ONBOARDING -> ACTIVE` validation. Commercial, primary contact, requirements, asset, access, project, team, kickoff, and start-readiness statuses are derived from structured data or linked tenant-scoped records, not arbitrary status patches. Manual item updates are restricted to genuinely manual document/agreement layers. Each blocker includes the item key, current status, reason, destination tab, and action label.

## Consequences
Existing domain records remain canonical and are linked by type/id. Structured onboarding metadata is stored additively under `Client.lifecycle_metadata.onboarding` to preserve Client document compatibility. The onboarding document is a PDF snapshot with a source hash; later verified data changes mark the generated document stale. Optional layers are visible but cannot block activation. Legacy Client list, workspace, and lifecycle payloads remain backward compatible.

## Verification
Backend lifecycle regression tests and the frontend Vite production build are the release checks. Negative tenant tests must cover Client, linked entity, and onboarding item company keys. Full end-to-end verification requires a configured MongoDB tenant with Contacts, Documents, Projects, Meetings, and user assignments.

## Scope boundary
This decision covers Phase 3 onboarding only. Client Services, Deliverables, Client Health, At Risk, Renewal, Churn analytics, Insights, and AI remain future phases.
