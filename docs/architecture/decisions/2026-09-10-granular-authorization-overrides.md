# ADR: Granular authorization overrides

## Status

Accepted

## Context

Module access controlled workspace entry while `capability_grants` could only
add actions. Roles and project context still decided several operational paths,
so an Admin could not safely grant or remove an individual business action.

## Decision

The backend permission catalog is the source of truth for configurable keys,
labels, and valid scopes. `User.permission_overrides` stores one tri-state
record per key: `inherit`, `allow`, or `deny`, with an optional scope. Existing
`capability_grants` remain additive compatibility grants.

`authorization_service.authorize` resolves tenant isolation first, then user
deny, user allow, department/role policy, and default deny. Scope checks cover
self, creator, assignee, project membership, reporting team, department, and
company contexts. The Admin UI consumes the catalog and writes overrides by a
separate API from module access. Permission changes are recorded using the
existing timeline audit event service.

## Consequences

Projects and task creation/assignment now consult the central resolver before
their legacy project/hierarchy policies. Existing contextual project rules
remain as a compatibility fallback where a route has not yet been migrated.
Protected platform roles and cross-company access are not configurable.
