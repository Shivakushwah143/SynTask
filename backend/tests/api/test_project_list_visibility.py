from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.projects.project_list import build_project_list_query
from app.models.user import UserRole


def user(user_id, role, *, company_id="company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id)


@pytest.mark.asyncio
async def test_super_admin_sees_all_projects_no_company_scope():
    query = await build_project_list_query(user("super-1", UserRole.SUPER_ADMIN, company_id=None))
    assert query == {}


@pytest.mark.asyncio
async def test_admin_sees_all_projects_in_their_company():
    query = await build_project_list_query(user("admin-1", UserRole.ADMIN))
    assert query == {"company_id": "company-1"}
    # No owner filter: admins must not be restricted to assigned projects.
    assert "$or" not in query
    assert "assigned_to" not in query


@pytest.mark.asyncio
async def test_sub_admin_sees_all_projects_in_their_company():
    query = await build_project_list_query(user("subadmin-1", UserRole.SUB_ADMIN))
    assert query == {"company_id": "company-1"}
    assert "$or" not in query
    assert "assigned_to" not in query


@pytest.mark.asyncio
async def test_manager_sees_all_projects_in_their_company():
    query = await build_project_list_query(user("manager-1", UserRole.MANAGER))
    assert query == {"company_id": "company-1"}
    assert "$or" not in query


@pytest.mark.asyncio
async def test_lead_only_sees_assigned_projects():
    query = await build_project_list_query(user("lead-1", UserRole.LEAD))
    assert query["company_id"] == "company-1"
    assert query["$or"] == [
        {"assigned_to": "lead-1"},
        {"assigned_user_ids": "lead-1"},
        {"team_member_ids": "lead-1"},
    ]


@pytest.mark.asyncio
async def test_user_without_company_gets_400():
    with pytest.raises(HTTPException) as exc_info:
        await build_project_list_query(user("lead-1", UserRole.LEAD, company_id=None))
    assert exc_info.value.status_code == 400
