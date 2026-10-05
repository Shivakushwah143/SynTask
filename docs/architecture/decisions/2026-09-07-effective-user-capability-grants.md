# ADR: Effective user capability grants

## Status

Accepted

## Context

SynTask previously used modules for navigation while many APIs used only
department-role capabilities or direct role checks. An explicitly enabled
workspace could therefore load while its nested API rejected the same member.

## Decision

`User.capability_grants` stores additive explicit capability keys. Backend
`get_effective_permissions(user)` combines valid department-role defaults and
these grants. `has_capability` and `require_capability` are action
authorization entry points. Modules remain workspace gates, not action grants.
Every grant is evaluated only for authenticated user's company; resource
lookups still validate `company_id`.

Company Admins can assign grants. Non-admin delegates may only assign
capabilities they themselves effectively hold. Admin targets remain protected.

## Consequences

Existing users keep role defaults because grants are additive and default to an
empty list. `/auth/me` exposes effective capabilities so frontend visibility
can match API behavior. Salary retains separate capability checks and
self-service exception.
