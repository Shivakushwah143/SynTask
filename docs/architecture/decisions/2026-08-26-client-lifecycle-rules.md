# Client lifecycle transition rules
Status: Accepted
Date: 2026-08-26
Owners: SynTask platform team

## Context
Client setup requires ordered progression, while operational client states depend on business conditions. A frontend-owned transition map could drift from backend validation and expose invalid actions.

## Decision
The backend `client_lifecycle.py` owns one rule catalog. Each stage declares its transition type, allowed destinations, prerequisites, destination reason requirements, and action label. The Client API exposes that catalog at `/api/v1/clients/lifecycle/rules`; the frontend renders controls from it. The update endpoint remains the enforcement boundary and stores lifecycle reason and metadata on the Client.

Setup is strictly `New -> Onboarding -> Active`. Post-activation transitions are conditional. Archived has no destination without a separately authorized restore flow. Activation requires primary contact, account owner, requirements, and kickoff meeting.

## Alternatives considered
- Keep separate React and backend maps: rejected because they can diverge.
- Treat every state as one sequence: rejected because operational situations do not require every intermediate state.

## Consequences and risks
The UI stays aligned with backend-approved destinations. Existing Client tabs and related actions remain unchanged. New transition rules require backend catalog changes and frontend handling only when a new requirement field is introduced.

## Migration and rollback
The new optional Client fields are backward compatible with existing documents. Rollback can remove the rules endpoint consumption and optional fields, but the sequential transition validation must be rolled back together with the frontend controls.

## Verification
Backend lifecycle regression tests cover sequential rejection, direct conditional movement, prerequisites, tenant isolation, and reason persistence. The frontend production build verifies the rule-driven controls compile.
