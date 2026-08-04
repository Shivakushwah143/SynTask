"""Regression tests for ticket assignment permission rules.

Employees may assign tickets to Leads, Sub Admins, and Admins. Sub Admins manage
tickets alongside Admins (they can view/update all company tickets) and were
previously rejected with 403. Assigning to an Employee or Manager is still blocked,
and the assigned user must belong to the same company (tenant isolation preserved).
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.tickets import _employee_can_assign_to, create_ticket
from app.models.user import UserRole


@pytest.mark.parametrize(
    "assignee_role, expected",
    [
        (UserRole.LEAD, True),
        (UserRole.ADMIN, True),
        (UserRole.SUB_ADMIN, True),  # regression: sub admins are assignable by employees
        (UserRole.EMPLOYEE, False),
        (UserRole.MANAGER, False),
        (UserRole.SUPER_ADMIN, False),
    ],
)
def test_employee_can_assign_to_role(assignee_role, expected):
    assert _employee_can_assign_to(assignee_role) is expected


def _employee(role=UserRole.EMPLOYEE, company_id="company-1"):
    return SimpleNamespace(
        id="emp-1",
        role=role,
        company_id=company_id,
        full_name=lambda: "Emp One",
        email="emp@example.com",
    )


def _fake_user(role, company_id="company-1"):
    return SimpleNamespace(id=f"{role}-1", role=role, company_id=company_id)


class FakeTicket:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "ticket-1")
        self.ticket_number = kwargs.get("ticket_number", "TKT-2026-0001")
        self.title = kwargs.get("title")
        self.description = kwargs.get("description")
        self.type = SimpleNamespace(value="support")
        self.priority = SimpleNamespace(value="medium")
        self.status = SimpleNamespace(value="open")
        self.created_by = kwargs.get("created_by")
        self.created_by_name = kwargs.get("created_by_name")
        self.assigned_to = kwargs.get("assigned_to")
        self.created_at = kwargs.get("created_at", "2026-01-01T00:00:00")
        self.saved = False

    async def save(self):
        self.saved = True


def _install_ticket_creation_mocks(monkeypatch):
    async def fake_generate_ticket_number(company_id):
        return "TKT-2026-0001"

    async def fake_cache_delete(pattern):
        return None

    created = []

    class RecordingTicket(FakeTicket):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            created.append(self)

    monkeypatch.setattr("app.api.v1.endpoints.tickets.generate_ticket_number", fake_generate_ticket_number)
    monkeypatch.setattr("app.api.v1.endpoints.tickets.cache_delete_pattern", fake_cache_delete)
    monkeypatch.setattr("app.api.v1.endpoints.tickets.Ticket", RecordingTicket)
    return created


@pytest.mark.asyncio
async def test_employee_can_assign_ticket_to_sub_admin(monkeypatch):
    """Regression: an employee can create a ticket assigned to a Sub Admin (no 403)."""
    async def fake_user_get(user_id):
        return _fake_user(UserRole.SUB_ADMIN)

    monkeypatch.setattr("app.api.v1.endpoints.tickets.User.get", fake_user_get)
    created = _install_ticket_creation_mocks(monkeypatch)

    result = await create_ticket(
        title="Broken printer",
        description="Please fix the printer",
        type="support",
        priority="medium",
        assigned_to="sub_admin-1",
        current_user=_employee(),
    )

    assert result["assigned_to"] == "sub_admin-1"
    assert len(created) == 1
    assert created[0].saved is True


@pytest.mark.asyncio
async def test_employee_can_assign_ticket_to_lead_and_admin(monkeypatch):
    for role in (UserRole.LEAD, UserRole.ADMIN):
        async def fake_user_get(user_id, _role=role):
            return _fake_user(_role)

        monkeypatch.setattr("app.api.v1.endpoints.tickets.User.get", fake_user_get)
        created = _install_ticket_creation_mocks(monkeypatch)

        result = await create_ticket(
            title="T", description="D", type="support", priority="medium",
            assigned_to=f"{role}-1", current_user=_employee(),
        )
        assert result["assigned_to"] == f"{role}-1"
        assert created[0].saved is True


@pytest.mark.asyncio
async def test_employee_cannot_assign_ticket_to_another_employee(monkeypatch):
    async def fake_user_get(user_id):
        return _fake_user(UserRole.EMPLOYEE)

    monkeypatch.setattr("app.api.v1.endpoints.tickets.User.get", fake_user_get)

    with pytest.raises(HTTPException) as excinfo:
        await create_ticket(
            title="T", description="D", type="support", priority="medium",
            assigned_to="employee-2", current_user=_employee(),
        )
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_employee_cannot_assign_ticket_to_manager(monkeypatch):
    async def fake_user_get(user_id):
        return _fake_user(UserRole.MANAGER)

    monkeypatch.setattr("app.api.v1.endpoints.tickets.User.get", fake_user_get)

    with pytest.raises(HTTPException) as excinfo:
        await create_ticket(
            title="T", description="D", type="support", priority="medium",
            assigned_to="manager-1", current_user=_employee(),
        )
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_assignment_is_rejected(monkeypatch):
    """Tenant isolation: an employee cannot assign to a user in another company."""
    async def fake_user_get(user_id):
        return _fake_user(UserRole.ADMIN, company_id="company-2")

    monkeypatch.setattr("app.api.v1.endpoints.tickets.User.get", fake_user_get)

    with pytest.raises(HTTPException) as excinfo:
        await create_ticket(
            title="T", description="D", type="support", priority="medium",
            assigned_to="admin-2", current_user=_employee(),
        )
    assert excinfo.value.status_code == 400
