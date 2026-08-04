# ADR: Project-Scoped Authorization

Date: 2026-08-03
Status: Accepted

## Context

SynTask allows an Employee to be assigned as the Leader of a project through `Project.lead_id`. Before this decision, many task and project-board actions checked only the user's global role. That meant an Employee project Leader could see the project but could not perform Lead actions such as creating tasks. It also spread project access rules across controllers.

## Decision

Use `app.services.project_permissions` as the backend source of truth for project-scoped authorization.

Effective project role priority:

1. Organization-level management: Super Admin, Admin, Sub Admin, Manager.
2. Assigned project Lead: current project `lead_id`, plus legacy global Lead association where already allowed.
3. Project member: assigned, team member, or creator.
4. No access.

The global user role is unchanged. Every protected request must authenticate the user, load the real project from the database, calculate the effective project role from current project data, and verify the requested task/page/sprint/file resource belongs to that project. Frontend permission hooks may hide controls, but backend checks remain authoritative.

## Consequences

- Employee project Leaders can perform Lead actions only within the project where they are assigned.
- Replacing or clearing project `lead_id` removes permissions immediately because permissions are recalculated per request.
- Normal project members retain view/member behavior and cannot perform Lead-only actions.
- Cross-project forged IDs are rejected at the resource/project boundary.
- No migration is required because existing `Project.lead_id`, assignment, and membership fields are reused.

## Tests

Focused tests cover Employee project Lead permission gain/loss, normal member denial, admin/global Lead behavior, task manage/assign checks, scheduled task permission, cross-project denial, and frontend permission gating.
