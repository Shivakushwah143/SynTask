from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.leave import LeaveStatus
from app.models.user import UserRole
from app.api.v1.endpoints import leaves as leave_endpoints
from app.services import leave_service


def user(user_id, role, *, company_id="company-1", reports_to=None, ancestors=None):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        reports_to=reports_to,
        ancestors=ancestors or [],
    )


def leave(employee_id, *, pending_with=None, status=LeaveStatus.PENDING, forwarded_by=None):
    return SimpleNamespace(
        id="leave-1",
        employee_id=employee_id,
        company_id="company-1",
        employee_role=UserRole.EMPLOYEE.value,
        leave_type=SimpleNamespace(value="full_day"),
        start_date=None,
        end_date=None,
        reason="Need leave",
        attachment_url=None,
        reviewed_by=None,
        reviewed_at=None,
        review_comment=None,
        forwarded_at=None,
        forwarded_to_admin=False,
        forwarded_to_user_id=None,
        approval_history=[],
        cancelled_at=None,
        created_at=None,
        updated_at=None,
        status=status,
        pending_with_user_ids=pending_with or [],
        forwarded_by=forwarded_by,
    )


def test_manager_can_only_approve_pending_reports_assigned_to_them():
    manager = user("manager-1", UserRole.MANAGER)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="lead-1", ancestors=["manager-1", "lead-1"])
    request = leave("employee-1", pending_with=["manager-1"])

    assert leave_service.can_approve_leave(manager, employee, request) is True


def test_manager_loses_approval_after_forwarding_to_admins():
    manager = user("manager-1", UserRole.MANAGER)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    admin = user("admin-1", UserRole.ADMIN)

    # Before forwarding, the manager is the assigned pending reviewer.
    assert leave_service.can_approve_leave(manager, employee, leave("employee-1", pending_with=["manager-1"])) is True
    # After forwarding to an admin, only the selected reviewer can approve/reject.
    assert leave_service.can_approve_leave(manager, employee, leave("employee-1", pending_with=["admin-1"], forwarded_by="manager-1")) is False
    assert leave_service.can_approve_leave(admin, employee, leave("employee-1", pending_with=["admin-1"], forwarded_by="manager-1")) is True


def test_manager_reviews_legacy_employee_leave_without_pending_with_field():
    manager = user("manager-1", UserRole.MANAGER)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    admin = user("admin-1", UserRole.ADMIN)

    # Requests created before pending_with_user_ids existed have an empty list;
    # the manager must still be able to approve/reject/forward them.
    assert leave_service.can_approve_leave(manager, employee, leave("employee-1")) is True
    # Once such a request is forwarded to admins, only the selected reviewer decides.
    assert leave_service.can_approve_leave(manager, employee, leave("employee-1", pending_with=["admin-1"], forwarded_by="manager-1")) is False


def test_self_approval_and_manager_leave_in_manager_inbox_are_impossible():
    manager = user("manager-1", UserRole.MANAGER)
    manager_request = leave("manager-1", pending_with=["manager-1"])

    assert leave_service.can_approve_leave(manager, manager, manager_request) is False
    query = leave_service.leave_visibility_query(manager)
    assert query == {
        "company_id": "company-1",
        "employee_id": {"$ne": "manager-1"},
    }


def test_admin_sees_all_company_leaves_but_can_only_approve_assigned_ones():
    admin = user("admin-1", UserRole.ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="lead-1", ancestors=["manager-1", "lead-1"])

    # Admins (and sub-admins) can VIEW every company leave except their own,
    # including forwarded leaves.
    assert leave_service.leave_visibility_query(admin) == {
        "company_id": "company-1",
        "employee_id": {"$ne": "admin-1"},
    }
    # Approve/reject is still limited to the pending reviewers (the members the
    # manager selected when forwarding).
    assert leave_service.can_approve_leave(admin, employee, leave("employee-1", pending_with=["admin-1"])) is False
    assert leave_service.can_approve_leave(admin, employee, leave("employee-1", pending_with=["admin-1"], forwarded_by="manager-1")) is True
    # A leave forwarded to a different reviewer cannot be approved by this admin.
    assert leave_service.can_approve_leave(admin, employee, leave("employee-1", pending_with=["subadmin-1"], forwarded_by="manager-1")) is False


def test_admin_can_approve_forwarded_employee_leave_when_pending_with_admin():
    admin = user("admin-1", UserRole.ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    request = leave(
        "employee-1",
        pending_with=["admin-1"],
        status=LeaveStatus.FORWARDED,
        forwarded_by="manager-1",
    )

    assert leave_service.can_approve_leave(admin, employee, request) is True


def test_serialized_leave_includes_reviewer_and_history_fields_for_ui_permissions():
    request = leave("employee-1", pending_with=["manager-1"], forwarded_by="manager-2")
    request.forwarded_to_user_id = "manager-1"
    request.approval_history = [{"action": "submitted"}]

    data = leave_service.serialize_leave(request)

    assert data["pending_with_user_ids"] == ["manager-1"]
    assert data["forwarded_to_user_id"] == "manager-1"
    assert data["approval_history"] == [{"action": "submitted"}]


def test_admin_can_approve_manager_leave_but_superadmin_is_audit_only():
    admin = user("admin-1", UserRole.ADMIN)
    super_admin = user("super-1", UserRole.SUPER_ADMIN, company_id=None)
    manager = user("manager-1", UserRole.MANAGER, reports_to="admin-1", ancestors=["admin-1"])
    request = leave("manager-1", pending_with=["admin-1"])

    assert leave_service.can_approve_leave(admin, manager, request) is True
    assert leave_service.can_approve_leave(super_admin, manager, request) is False
    assert leave_service.leave_visibility_query(super_admin) == {}


@pytest.mark.asyncio
async def test_forward_preserves_manager_scope_and_rejects_invalid_targets():
    manager = user("manager-1", UserRole.MANAGER)
    other_manager = user("manager-2", UserRole.MANAGER)
    admin = user("admin-1", UserRole.ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="lead-1", ancestors=["manager-1", "lead-1"])
    request = leave("employee-1", pending_with=["manager-1"])

    await leave_service.assert_forward_target(manager, request, employee, admin)

    with pytest.raises(HTTPException) as exc_info:
        await leave_service.assert_forward_target(manager, request, employee, other_manager)
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Forward target must be Admin or Sub Admin"


@pytest.mark.asyncio
async def test_forward_target_must_be_admin():
    manager = user("manager-1", UserRole.MANAGER)
    admin = user("admin-1", UserRole.ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    request = leave("employee-1", pending_with=["manager-1"])

    await leave_service.assert_forward_target(manager, request, employee, admin)


def test_terminal_leave_is_immutable():
    with pytest.raises(HTTPException) as exc_info:
        leave_service.assert_leave_mutable(leave("employee-1", status=LeaveStatus.CANCELLED))

    assert exc_info.value.status_code == 400


def test_required_action_comment_rejects_blank_values():
    with pytest.raises(HTTPException) as exc_info:
        leave_service.require_action_comment("   ", "Forwarding reason")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Forwarding reason is required"


def test_explicit_self_view_is_blocked():
    employee = user("employee-1", UserRole.EMPLOYEE)

    with pytest.raises(HTTPException) as exc_info:
        leave_service.leave_visibility_query(employee, "employee-1")

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_manager_lists_subordinate_employee_and_lead_leave_but_lead_has_no_approval_inbox():
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="lead-1", ancestors=["manager-1", "lead-1"])
    lead = user("lead-1", UserRole.LEAD, reports_to="manager-1", ancestors=["manager-1"])
    manager = user("manager-1", UserRole.MANAGER)

    # Leads now see all company leaves except their own
    assert await leave_endpoints._base_query(lead, None) == {
        "company_id": "company-1",
        "employee_id": {"$ne": "lead-1"},
    }
    # Managers see all company leaves except their own
    assert await leave_endpoints._base_query(manager, None) == {
        "company_id": "company-1",
        "employee_id": {"$ne": "manager-1"},
    }


@pytest.mark.asyncio
async def test_sub_admin_sees_all_company_leaves_but_can_only_approve_assigned_ones():
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    expected = {
        "company_id": "company-1",
        "employee_id": {"$ne": "subadmin-1"},
    }

    assert await leave_endpoints._base_query(sub_admin, None) == expected
    assert leave_service.leave_visibility_query(sub_admin) == expected


def test_sub_admin_approval_mirrors_admin():
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    manager = user("manager-1", UserRole.MANAGER, reports_to="admin-1", ancestors=["admin-1"])
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])

    # Sub Admin can approve manager leaves (same as Admin)
    assert leave_service.can_approve_leave(sub_admin, manager, leave("manager-1", pending_with=["subadmin-1"])) is True
    # Sub Admin cannot approve unforwarded employee leaves (same as Admin)
    assert leave_service.can_approve_leave(sub_admin, employee, leave("employee-1", pending_with=["subadmin-1"])) is False
    # Sub Admin can approve forwarded employee leaves (same as Admin)
    assert leave_service.can_approve_leave(sub_admin, employee, leave("employee-1", pending_with=["subadmin-1"], forwarded_by="manager-1")) is True


@pytest.mark.asyncio
async def test_manager_can_forward_to_sub_admin():
    manager = user("manager-1", UserRole.MANAGER)
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    request = leave("employee-1", pending_with=["manager-1"])

    await leave_service.assert_forward_target(manager, request, employee, sub_admin)


@pytest.mark.asyncio
async def test_forward_leave_request_supports_multiple_targets(monkeypatch):
    manager = user("manager-1", UserRole.MANAGER)
    admin = user("admin-1", UserRole.ADMIN)
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    request = leave("employee-1", pending_with=["manager-1"])

    async def fake_load(leave_id, current_user):
        return request, employee

    async def fake_get(uid):
        return {"admin-1": admin, "subadmin-1": sub_admin}.get(uid)

    async def fake_forward_target(current_user, leave, employee, target):
        return None

    async def fake_timeline(**kwargs):
        return None

    async def fake_notify(*args, **kwargs):
        return None

    async def fake_save():
        return None

    employee.full_name = lambda: "Employee One"
    request.save = fake_save
    request.forwarded_to_user_ids = []

    monkeypatch.setattr(leave_endpoints, "_load_manageable_leave", fake_load)
    monkeypatch.setattr(leave_endpoints.User, "get", staticmethod(fake_get))
    monkeypatch.setattr(leave_endpoints, "assert_forward_target", fake_forward_target)
    monkeypatch.setattr(leave_endpoints, "create_timeline_event", fake_timeline)
    monkeypatch.setattr(leave_endpoints, "notify_user", fake_notify)
    monkeypatch.setattr(leave_endpoints, "serialize_leave", lambda l, e=None: {"id": str(l.id)})

    result = await leave_endpoints.forward_leave_request(
        leave_id="leave-1",
        target_user_ids=["admin-1", "subadmin-1"],
        comment="Please review",
        current_user=manager,
    )
    assert result["message"] == "Leave forwarded"
    assert request.pending_with_user_ids == ["admin-1", "subadmin-1"]
    assert request.forwarded_to_user_ids == ["admin-1", "subadmin-1"]
    assert request.forwarded_to_user_id == "admin-1"
    assert request.forwarded_by == "manager-1"
    assert request.forwarded_to_admin is True


@pytest.mark.asyncio
async def test_forward_leave_request_requires_at_least_one_reviewer(monkeypatch):
    manager = user("manager-1", UserRole.MANAGER)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    request = leave("employee-1", pending_with=["manager-1"])

    async def fake_load(leave_id, current_user):
        return request, employee

    async def fake_timeline(**kwargs):
        return None

    async def fake_save():
        return None

    request.save = fake_save

    monkeypatch.setattr(leave_endpoints, "_load_manageable_leave", fake_load)
    monkeypatch.setattr(leave_endpoints, "create_timeline_event", fake_timeline)

    with pytest.raises(HTTPException) as exc_info:
        await leave_endpoints.forward_leave_request(
            leave_id="leave-1",
            target_user_ids=[],
            comment="Please review",
            current_user=manager,
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Select at least one reviewer"


@pytest.mark.asyncio
async def test_forward_targets_include_admins_and_sub_admins(monkeypatch):
    admin = SimpleNamespace(
        id="admin-1", email="admin@test.com", first_name="Admin", last_name="One",
        role=UserRole.ADMIN, company_id="company-1",
    )
    sub_admin = SimpleNamespace(
        id="subadmin-1", email="subadmin@test.com", first_name="Sub", last_name="Admin",
        role=UserRole.SUB_ADMIN, company_id="company-1",
    )
    manager = user("manager-1", UserRole.MANAGER)

    class FakeQuery:
        def __init__(self, users):
            self.users = users

        async def to_list(self):
            return self.users

    def fake_find(query):
        return FakeQuery([admin, sub_admin])

    monkeypatch.setattr(leave_endpoints.User, "find", staticmethod(fake_find))
    result = await leave_endpoints.get_leave_forward_targets(manager)
    assert {item["role"] for item in result["users"]} == {UserRole.ADMIN.value, UserRole.SUB_ADMIN.value}


@pytest.mark.asyncio
async def test_company_admin_ids_include_sub_admins(monkeypatch):
    admin = SimpleNamespace(id="admin-1", role=UserRole.ADMIN, company_id="company-1")
    sub_admin = SimpleNamespace(id="subadmin-1", role=UserRole.SUB_ADMIN, company_id="company-1")

    class FakeQuery:
        def __init__(self, users):
            self.users = users

        async def to_list(self):
            return self.users

    def fake_find(query):
        roles = query.get("role", {}).get("$in", [])
        return FakeQuery([u for u in [admin, sub_admin] if u.role.value in roles])

    monkeypatch.setattr(leave_service.User, "find", staticmethod(fake_find))
    result = await leave_service.company_admin_ids("company-1")
    assert set(result) == {"admin-1", "subadmin-1"}


@pytest.mark.asyncio
async def test_forward_to_multiple_targets_assigns_all_selected_reviewers(monkeypatch):
    manager = user("manager-1", UserRole.MANAGER)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    employee.full_name = lambda: "Employee One"
    request = leave("employee-1", pending_with=["manager-1"])

    async def fake_save():
        return None

    request.save = fake_save
    admin = user("admin-1", UserRole.ADMIN)
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    targets = {"admin-1": admin, "subadmin-1": sub_admin}

    async def fake_load(leave_id, current_user):
        return request, employee

    async def fake_user_get(user_id):
        return targets.get(user_id)

    async def fake_timeline(**kwargs):
        return None

    async def fake_notify(*args, **kwargs):
        return None

    monkeypatch.setattr(leave_endpoints, "_load_manageable_leave", fake_load)
    monkeypatch.setattr(leave_endpoints.User, "get", staticmethod(fake_user_get))
    monkeypatch.setattr(leave_endpoints, "create_timeline_event", fake_timeline)
    monkeypatch.setattr(leave_endpoints, "notify_user", fake_notify)

    result = await leave_endpoints.forward_leave_request(
        "leave-1",
        ["admin-1", "subadmin-1"],
        "Needs admin review",
        manager,
    )

    # Every selected reviewer is assigned and only those reviewers are assigned.
    assert set(request.pending_with_user_ids) == {"admin-1", "subadmin-1"}
    assert request.forwarded_to_user_id == "admin-1"
    assert request.forwarded_to_admin is True
    assert request.approval_history[-1]["action"] == "forwarded"
    assert request.approval_history[-1]["target_user_id"] == "admin-1,subadmin-1"
    assert result["message"] == "Leave forwarded"
    assert result["leave"]["pending_with_user_ids"] == ["admin-1", "subadmin-1"]


@pytest.mark.asyncio
async def test_forward_with_no_reviewers_is_rejected(monkeypatch):
    manager = user("manager-1", UserRole.MANAGER)
    employee = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    employee.full_name = lambda: "Employee One"
    request = leave("employee-1", pending_with=["manager-1"])

    async def fake_load(leave_id, current_user):
        return request, employee

    async def fake_user_get(user_id):
        return None

    async def fake_timeline(**kwargs):
        return None

    async def fake_notify(*args, **kwargs):
        return None

    monkeypatch.setattr(leave_endpoints, "_load_manageable_leave", fake_load)
    monkeypatch.setattr(leave_endpoints.User, "get", staticmethod(fake_user_get))
    monkeypatch.setattr(leave_endpoints, "create_timeline_event", fake_timeline)
    monkeypatch.setattr(leave_endpoints, "notify_user", fake_notify)

    with pytest.raises(HTTPException) as exc_info:
        await leave_endpoints.forward_leave_request("leave-1", [], "Needs admin review", manager)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Select at least one reviewer"
