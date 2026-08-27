# Client onboarding layers
Status: Accepted
Date: 2026-08-27
Owners: SynTask platform team

## Context
Client activation needs a durable, tenant-scoped readiness record without duplicating Contacts, Documents, Projects, Meetings, Files, or Finance records. Some layers are derived from those records, while requirements, assets, access, and agreement notes can remain manual until a source record exists.

## Decision
Use one `ClientOnboarding` document per `(company_id, client_id)` and one `ClientOnboardingItem` per layer key. The backend onboarding service calculates derived statuses and required progress, persists item status changes with actor/timestamp audit entries, and is the only source of truth for `ONBOARDING -> ACTIVE` validation. Manual updates are exposed through the existing company-admin/lead permission gate and the tenant-scoped onboarding item endpoint. Each blocker includes the item key, current status, reason, destination tab, and action label.

## Consequences
Existing domain records remain canonical and are linked by type/id. The workspace can guide users to the existing domain tabs and only presents editable controls for genuinely manual layers. Optional layers are visible but cannot block activation. Legacy Client list, workspace, and lifecycle payloads remain backward compatible.

## Verification
Backend lifecycle regression tests and the frontend Vite production build are the release checks. Negative tenant tests must cover Client, linked entity, and onboarding item company keys. Full end-to-end verification requires a configured MongoDB tenant with Contacts, Documents, Projects, Meetings, and user assignments.

## Scope boundary
This decision covers Phase 3 onboarding only. Client Services, Deliverables, Client Health, At Risk, Renewal, Churn analytics, Insights, and AI remain future phases.
