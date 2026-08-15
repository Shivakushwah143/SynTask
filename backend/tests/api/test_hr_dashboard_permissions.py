"""
Phase 10/11 — HR Dashboard & Reports authorization regression tests.

Verifies:
- Every report/export endpoint is gated by the correct company capability
  (backend-authoritative — frontend hiding is not security).
- Payroll reports require payroll.view.
- The manager/lead report scope is resolved server-side.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1.endpoints.hr_dashboard import router as hr_dashboard_router
from app.models.department import DepartmentType
from app.models.user import UserRole


def _capability_gates(route):
    """Return the capability strings enforced on a route via require_capability."""
    gates = []
    for dep in route.dependant.dependencies:
        if getattr(dep.call, "__name__", None) == "_checker":
            closure = getattr(dep.call, "__closure__", None)
            if closure:
                gates.append(closure[0].cell_contents)
    return gates


def _all_routes():
    for route in hr_dashboard_router.routes:
        yield route


def _find_route(path):
    for route in _all_routes():
        if getattr(route, "path", None) == path:
            return route
    return None


REPORT_EXPECTED_GATES = {
    "/reports/employees/directory": {"employee_management.view"},
    "/reports/employees/headcount": {"employee_management.view"},
    "/reports/employees/joining-exit": {"employee_management.view"},
    "/reports/attendance/summary": {"attendance_policy.view"},
    "/reports/attendance/late": {"attendance_policy.view"},
    "/reports/attendance/absence": {"attendance_policy.view"},
    "/reports/leave/balances": {"leave_management.view"},
    "/reports/leave/usage": {"leave_management.view"},
    "/reports/documents/expiry": {"employee_management.view"},
    "/reports/lifecycle/events": {"employee_lifecycle.view"},
    "/reports/lifecycle/probation": {"employee_lifecycle.view"},
    "/reports/lifecycle/notice": {"employee_lifecycle.view"},
    "/reports/payroll/summary": {"payroll.view"},
    "/reports/payroll/employees": {"payroll.view"},
    "/reports/employees/directory/export": {"employee_management.view"},
    "/reports/attendance/summary/export": {"attendance_policy.view"},
    "/reports/leave/balances/export": {"leave_management.view"},
    "/reports/payroll/summary/export": {"payroll.view"},
    "/reports/documents/expiry/export": {"employee_management.view"},
}


def test_every_report_endpoint_enforces_its_capability():
    """No company-wide HR report may depend on get_current_user alone."""
    for path, expected in REPORT_EXPECTED_GATES.items():
        route = _find_route(path)
        assert route is not None, f"route {path} not found"
        gates = set(_capability_gates(route))
        assert expected & gates, f"{path} missing capability gate (expected {expected}, got {gates})"


def test_payroll_reports_require_payroll_view():
    for path in ("/reports/payroll/summary", "/reports/payroll/employees", "/reports/payroll/summary/export"):
        gates = set(_capability_gates(_find_route(path)))
        assert "payroll.view" in gates, f"{path} must require payroll.view"


@pytest.mark.asyncio
async def test_manager_scope_resolves_to_team():
    """A manager's report scope is the server-side monitorable team, not company-wide."""
    from app.api.v1.endpoints import hr_dashboard as mod
    from unittest.mock import AsyncMock, patch

    manager = MagicMock()
    manager.id = "mgr-1"
    manager.company_id = "company-1"
    manager.role = MagicMock(value="manager")

    team = [
        MagicMock(id="emp-1"),
        MagicMock(id="emp-2"),
    ]
    with patch("app.api.v1.endpoints.attendance.get_monitorable_users", AsyncMock(return_value=team)):
        scope = await mod._report_scope_user_ids(manager)

    assert scope == ["emp-1", "emp-2"]


@pytest.mark.asyncio
async def test_admin_scope_is_company_wide():
    from app.api.v1.endpoints import hr_dashboard as mod

    admin = MagicMock()
    admin.role = MagicMock(value="admin")

    scope = await mod._report_scope_user_ids(admin)
    assert scope is None


@pytest.mark.asyncio
async def test_plain_employee_scope_is_empty():
    from app.api.v1.endpoints import hr_dashboard as mod

    employee = MagicMock()
    employee.role = MagicMock(value="employee")

    scope = await mod._report_scope_user_ids(employee)
    assert scope == []


@pytest.mark.asyncio
async def test_manager_without_team_gets_empty_scope():
    from app.api.v1.endpoints import hr_dashboard as mod
    from unittest.mock import AsyncMock, patch

    manager = MagicMock()
    manager.role = MagicMock(value="manager")
    manager.id = "mgr-1"
    manager.company_id = "company-1"

    with patch("app.api.v1.endpoints.attendance.get_monitorable_users", AsyncMock(return_value=[])):
        scope = await mod._report_scope_user_ids(manager)

    assert scope == []


@pytest.mark.asyncio
async def test_dashboard_capability_uses_department_capability_source(monkeypatch):
    from app.api.v1.endpoints import hr_dashboard as mod

    user = MagicMock()
    user.role = UserRole.MANAGER
    user.company_id = "company-1"
    user.department_id = "dept-1"

    department = MagicMock()
    department.company_id = "company-1"
    department.deleted_at = None
    department.department_type = DepartmentType.HR

    monkeypatch.setattr(mod.Department, "get", AsyncMock(return_value=department))
    get_caps = AsyncMock(return_value=["employee_management.view"])
    monkeypatch.setattr(mod, "get_capabilities_for_role", get_caps)

    assert await mod._has_capability(user, "employee_management.view") is True
    get_caps.assert_awaited_once_with(DepartmentType.HR, UserRole.MANAGER, "company-1")


@pytest.mark.asyncio
async def test_dashboard_capability_denies_cross_company_department(monkeypatch):
    from app.api.v1.endpoints import hr_dashboard as mod

    user = MagicMock()
    user.role = UserRole.MANAGER
    user.company_id = "company-1"
    user.department_id = "dept-1"

    department = MagicMock()
    department.company_id = "company-2"
    department.deleted_at = None
    department.department_type = DepartmentType.HR

    monkeypatch.setattr(mod.Department, "get", AsyncMock(return_value=department))
    get_caps = AsyncMock(return_value=["employee_management.view"])
    monkeypatch.setattr(mod, "get_capabilities_for_role", get_caps)

    assert await mod._has_capability(user, "employee_management.view") is False
    get_caps.assert_not_awaited()


@pytest.mark.asyncio
async def test_hr_dashboard_endpoint_does_not_read_user_capabilities(monkeypatch):
    from app.api.v1.endpoints import hr_dashboard as mod
    from app.services import hr_reporting_service as reporting

    user = MagicMock(spec=["id", "role", "company_id", "department_id"])
    user.id = "mgr-1"
    user.role = UserRole.MANAGER
    user.company_id = "company-1"
    user.department_id = None

    monkeypatch.setattr(reporting, "get_attention_items", AsyncMock(return_value=[]))
    monkeypatch.setattr(reporting, "get_recruitment_summary", AsyncMock(return_value={
        "open_jobs": 0,
        "candidates": 0,
        "interviews_today": 0,
        "offers_pending": 0,
    }))

    response = await mod.get_hr_dashboard(user)

    assert response.attention_items == []


@pytest.mark.asyncio
async def test_my_hr_summary_endpoint_success(monkeypatch):
    from app.api.v1.endpoints import ess

    user = MagicMock()
    user.company_id = "company-1"

    monkeypatch.setattr(ess, "build_my_summary", AsyncMock(return_value={"profile": {"id": "profile-1"}}))

    response = await ess.my_hr_summary(user)

    assert response == {"success": True, "data": {"profile": {"id": "profile-1"}}}
