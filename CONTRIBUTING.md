# Contributing to SynTask

## Development Setup
Follow the Quick Start in [README.md](README.md).

## Branch Strategy
- `main`: production-ready code only.
- `develop`: integration branch.
- `feature/ISSUE-description`: feature work.
- `fix/ISSUE-description`: bug fixes.
- `security/ISSUE-description`: security hardening.

## Commit Messages
Format: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `security`.

Examples:
- `security(auth): add Redis token blacklist`
- `docs(api): document sales endpoints`
- `fix(tasks): preserve logical project id lookup`

## Pull Request Process
1. Branch from `develop`.
2. Keep changes scoped to one concern.
3. Add or update tests for changed behavior.
4. Run backend checks: `cd backend && .\.venv\Scripts\python.exe -m pytest tests/ -v` when tests exist.
5. Run frontend build: `cd frontend && npm run build`.
6. Update documentation when routes, models, config, deployment, or security behavior changes.
7. Request at least one review.

## Code Standards
### Backend
- Follow FastAPI conventions.
- New endpoints should use Pydantic request/response schemas.
- New business logic should go in `app/services/` as Phase 3 introduces the service layer.
- Endpoints should remain thin: validate, authorize, call service, return response.
- Type hints are required for new function signatures.
- All tenant-owned queries must scope by `company_id` unless the caller is a super admin.

### Frontend
- Use functional React components and hooks.
- Use API client modules under `frontend/src/api`.
- Use React Query for server state where practical.
- Use Zustand for lightweight client state.
- Prefer Tailwind utility classes and existing components.
- Do not persist JWTs in localStorage.

## Adding a New API Endpoint
1. Create or update schema in `backend/app/schemas/`.
2. Add business logic to `backend/app/services/` once the service layer exists.
3. Add endpoint handler in `backend/app/api/v1/endpoints/`.
4. Register the router in `backend/app/api/v1/router.py`.
5. Add auth, role, company, and module dependencies.
6. Update [backend/API_DOCUMENTATION.md](backend/API_DOCUMENTATION.md).
7. Add tests.

## Adding a New Frontend Page
1. Create a page component in `frontend/src/pages/`.
2. Add or update API client functions in `frontend/src/api/`.
3. Add routes in `frontend/src/App.jsx`.
4. Add navigation in `Sidebar.jsx` if the page should be visible.
5. Handle loading, error, and empty states.

## Documentation Maintenance
Architecture, API, database schema, deployment, and security docs are living documents. Every PR that changes these areas should update the relevant document.
