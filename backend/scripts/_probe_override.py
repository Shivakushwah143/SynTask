import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from types import SimpleNamespace

from app.main import app
from app.api.dependencies import get_current_company_admin_or_lead
from app.api.v1.endpoints import invoices as m
from app.models.user import UserRole


async def fake():
    return SimpleNamespace(id="u1", company_id="c1", role=UserRole.ADMIN, full_name=lambda: "x")


app.dependency_overrides[get_current_company_admin_or_lead] = fake

print("same object:", get_current_company_admin_or_lead is m.get_current_company_admin_or_lead)
print("override keys:", [k.__module__ + "." + k.__name__ for k in app.dependency_overrides])

# Discover the route's dependency callables
for route in app.routes:
    if getattr(route, "path", None) == "/api/v1/invoices/{invoice_id}/pdf":
        print("route found:", route)
        for dep in getattr(route.dependant, "dependencies", []):
            print("  dep:", dep.call.__module__ + "." + dep.call.__name__)

r = TestClient(app).get("/api/v1/invoices/foo/pdf")
print("status:", r.status_code)
