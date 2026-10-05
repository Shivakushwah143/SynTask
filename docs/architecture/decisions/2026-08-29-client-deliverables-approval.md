# 2026-08-29 Client Deliverables and Approval

## Status
Accepted

## Context
Client operations need to track client-facing outputs and review decisions, but Work Projects and Tasks are already the canonical execution systems. Creating parallel ClientProject or ClientTask records would fragment permissions, task history, comments, and project boards.

## Decision
Add `ClientDeliverable` as the output layer under `Client -> ClientService -> Project`. A Deliverable stores title, description, owner, due date, status, linked file references, linked existing Work Task ids, approval state, approver contact, timestamps, revision note/count, approval history, and a hashed public review token.

Projects and Tasks remain Work module source-of-truth records. Service/project linking uses existing Project ids and is validated against the same Client and tenant. Tasks linked to a Deliverable must belong to the Deliverable Project.

Client Review prefers an existing CRM Contact with the Client role `Approver`. Approval and revision requests are stored on the Deliverable history; no separate communication/activity redesign is introduced in Phase 5.

## Consequences
- Client Workspace can report Deliverables without duplicating Work tasks or files.
- Safe Project unlinking from a Service must check for dependent Deliverables.
- Tenant isolation is enforced across Client, ClientService, Project, Task, Deliverable, owner, and approver contact.
- Phase 6 communication/activity redesign remains out of scope.

## Verification
- Backend regression tests cover client workspace scoping plus deliverable serialization and lifecycle transition rules.
- Frontend build verifies the Client Workspace Deliverables tab compiles with existing Work API wrappers.
