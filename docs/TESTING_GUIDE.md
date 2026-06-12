# Testing Guide - SynTask

## Backend Tests
### Setup
```powershell
cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### Run All Tests
```powershell
pytest tests/ -v
```

The repository currently has ad hoc test scripts and does not yet contain a complete `backend/tests/` suite. Phase 7 should add pytest coverage for auth, users, tasks, projects, tickets, sales, invoices, MSA, and tenant isolation.

### Suggested Test Structure
```text
backend/tests/
  conftest.py
  test_auth.py
  test_users.py
  test_tasks.py
  test_projects.py
  test_tickets.py
  test_sales.py
```

### Example Test Shape
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
```

## Phase 1 Manual Security QA
Run backend and Redis first:
```powershell
docker start syntask-redis
cd backend
.\.venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Checks:
- `GET /health` returns `200`.
- Login succeeds for a valid active user.
- `/auth/logout` blacklists the token.
- Reusing the old token returns `401`.
- Bad login returns `429` after 10 attempts/minute.
- Forgot password returns `429` after 5 attempts/minute.
- Production CORS blocks unknown origins.
- Spoofed file uploads are rejected by byte-signature validation.

## Frontend Tests
No React Testing Library or Playwright suite is configured yet. Phase 7 should add:
- Component tests for auth, sidebar, task detail, ticket detail, forms.
- E2E tests for login, project board, task create/update, ticket flow, sales CRM, invoice and MSA flows.

### Current Frontend Checks
```powershell
cd frontend
npm install
npm run build
npm run lint
```

## Test Database
Use a separate database for automated tests, e.g. `TEST_MONGODB_URL` and `DATABASE_NAME=syntask_test`. Tests should create and remove their own data and must never run against production.

## Manual Regression Areas
- Authentication and token refresh
- Tenant isolation
- Role hierarchy and user creation
- Task board movement
- Ticket assignment and comments
- Client document uploads
- Invoice PDF generation
- MSA public signing links
- Sales imports and reports
- Calendar and meetings
