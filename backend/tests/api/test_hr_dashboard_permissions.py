"""
Phase 10/11 — HR Dashboard & Reports authorization regression tests.

Verifies:
- Every report/export endpoint is gated by the correct company capability
  (backend-authoritative — frontend hiding is not security).
- Payroll reports require payroll.view.
- The manager/lead report scope is resolved server-side.
"""
from unittest.mock import MagicMock

import pytest

from app.api.v1.endpoints.hr_dashboard import router as hr_dashboard_router


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
