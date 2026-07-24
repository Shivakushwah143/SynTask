# Google Workspace Module Boundary

## Status
Accepted

## Date
2026-07-22

## Owners
SynTask platform engineering

## Context
SynTask already authenticates users with Google identity, but the product needed a native Google Workspace module for Gmail, Calendar, Meet, and workspace settings without introducing a second login system or replacing existing task/calendar/meeting flows.

## Decision
Implement Google Workspace as a first-class SynTask module under `backend/app/integrations/google_workspace` and `frontend/src/pages/GoogleWorkspace.jsx`. The module reuses the existing Google OAuth login flow, stores connected-account state in company-scoped documents, and exposes workspace APIs for dashboard, Gmail, Calendar, Meet, token refresh, reconnect, disconnect, and diagnostics. Task and calendar sync features reuse existing SynTask records so workspace actions remain native to the product.

## Alternatives considered
- A separate Google-only application shell outside SynTask.
- A second login flow dedicated to Workspace accounts.
- Direct client-side calls to Google APIs without a backend service boundary.

## Consequences and risks
- The module stays consistent with SynTask routing, authorization, and tenant boundaries.
- Workspace functionality can evolve independently of auth without duplicating identity handling.
- Google API-specific retries, token handling, and error logging are centralized in one backend service.
- Actual Google API calls still depend on connected credentials and the final provider setup.

## Migration and rollback
If the module must be removed, the app can drop the route, sidebar item, and integration router while preserving the existing Google sign-in flow and all non-Workspace functionality.

## Verification
Validated route wiring, sidebar entry, frontend syntax, and backend syntax for the new module files. Native task/calendar/meeting integration remains backward compatible.