from types import SimpleNamespace

import pytest

from app.models.user import UserRole


class FakeUserQuery:
    def __init__(self, users):
        self.users = users

    async def to_list(self):
        return self.users


def user(user_id, role, company_id="company-1", **kwargs):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id, **kwargs)


@pytest.mark.asyncio
async def test_admin_scope_is_company_only():
    from app.core.rbac_visibility import build_visibility_query

    current_user = user("admin-1", UserRole.ADMIN)

    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query={"deleted": False},
    )

    assert query == {"deleted": False, "company_id": "company-1"}


@pytest.mark.asyncio
async def test_sub_admin_scope_is_company_only():
    from app.core.rbac_visibility import build_visibility_query

    current_user = user("subadmin-1", UserRole.SUB_ADMIN)

    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query={"deleted": False},
    )

    assert query == {"deleted": False, "company_id": "company-1"}


@pytest.mark.asyncio
async def test_manager_scope_includes_self_and_reporting_hierarchy(monkeypatch):
    from app.core.rbac_visibility import build_visibility_query

    captured = {}

    def fake_find(query):
        captured["query"] = query
        return FakeUserQuery([
            user("lead-1", UserRole.LEAD),
            user("employee-1", UserRole.EMPLOYEE),
        ])

    monkeypatch.setattr("app.services.user_service.User.find", fake_find)

    current_user = user("manager-1", UserRole.MANAGER)
    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by", "assigned_to"),
        base_query={"deleted": False},
    )

    assert captured["query"] == {"ancestors": "manager-1", "company_id": "company-1"}
    assert query == {
        "deleted": False,
        "company_id": "company-1",
        "$or": [
            {"created_by": {"$in": ["manager-1", "lead-1", "employee-1"]}},
            {"assigned_to": {"$in": ["manager-1", "lead-1", "employee-1"]}},
        ],
    }


@pytest.mark.asyncio
async def test_employee_scope_only_self_even_with_requested_foreign_owner():
    from app.core.rbac_visibility import build_visibility_query

    current_user = user("employee-1", UserRole.EMPLOYEE)
    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query={"deleted": False, "created_by": "employee-2"},
    )

    assert query == {
        "deleted": False,
        "created_by": "employee-2",
        "company_id": "company-1",
        "$and": [{"created_by": {"$in": ["employee-1"]}}],
    }


@pytest.mark.asyncio
async def test_existing_search_or_is_preserved_and_scoped(monkeypatch):
    from app.core.rbac_visibility import build_visibility_query

    monkeypatch.setattr(
        "app.services.user_service.User.find",
        lambda query: FakeUserQuery([user("employee-1", UserRole.EMPLOYEE)]),
    )

    current_user = user("manager-1", UserRole.MANAGER)
    search_or = [{"first_name": {"$regex": "ada", "$options": "i"}}]
    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query={"deleted": False, "$or": search_or},
    )

    assert query == {
        "deleted": False,
        "company_id": "company-1",
        "$and": [
            {"$or": search_or},
            {"created_by": {"$in": ["manager-1", "employee-1"]}},
        ],
    }


@pytest.mark.asyncio
async def test_empty_manager_team_still_sees_own_records(monkeypatch):
    from app.core.rbac_visibility import build_visibility_query

    monkeypatch.setattr(
        "app.services.user_service.User.find",
        lambda query: FakeUserQuery([]),
    )

    current_user = user("manager-1", UserRole.MANAGER)
    query = await build_visibility_query(current_user, ownership_fields=("created_by",))

    assert query == {
        "company_id": "company-1",
        "created_by": {"$in": ["manager-1"]},
    }


@pytest.mark.asyncio
async def test_super_admin_has_no_company_or_owner_scope():
    from app.core.rbac_visibility import build_visibility_query

    current_user = user("super-1", UserRole.SUPER_ADMIN, company_id=None)
    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query={"deleted": False},
    )

    assert query == {"deleted": False}
