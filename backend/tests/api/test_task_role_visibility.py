from types import SimpleNamespace

from app.api.v1.endpoints import tasks as task_endpoints
from app.models.user import UserRole


def user(user_id, role, *, company_id="company-1", department_id=None):
    async def get_all_subordinates():
        return []

    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        department_id=department_id,
        get_all_subordinates=get_all_subordinates,
    )


def task(**overrides):
    data = {
        "id": "task-1",
        "company_id": "company-1",
        "created_by": "admin-1",
        "assigned_to": "employee-1",
        "department_id": "delivery",
        "project_id": "project-1",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


async def no_scope_ids(_current_user):
    return []


def test_admin_task_list_query_is_company_wide(monkeypatch):
    monkeypatch.setattr(task_endpoints, "_get_user_scope_ids", no_scope_ids)

    query = task_endpoints.build_task_list_query(user("admin-1", UserRole.ADMIN))

    assert query == {"company_id": "company-1"}


def test_manager_task_list_query_is_company_wide(monkeypatch):
    monkeypatch.setattr(task_endpoints, "_get_user_scope_ids", no_scope_ids)

    query = task_endpoints.build_task_list_query(user("manager-1", UserRole.MANAGER, department_id="delivery"))

    assert query == {"company_id": "company-1"}


def test_employee_task_list_query_is_assigned_only(monkeypatch):
    monkeypatch.setattr(task_endpoints, "_get_user_scope_ids", no_scope_ids)

    query = task_endpoints.build_task_list_query(user("employee-1", UserRole.EMPLOYEE))

    assert query == {"company_id": "company-1", "assigned_to": "employee-1"}


def test_employee_can_only_edit_progress_fields():
    assert task_endpoints.can_update_task_field(user("employee-1", UserRole.EMPLOYEE), task(), "status") is True
    assert task_endpoints.can_update_task_field(user("employee-1", UserRole.EMPLOYEE), task(), "description") is False


def test_manager_can_edit_only_own_department_task():
    manager = user("manager-1", UserRole.MANAGER, department_id="delivery")

    assert task_endpoints.can_update_task_field(manager, task(department_id="delivery"), "assigned_to") is True
    assert task_endpoints.can_update_task_field(manager, task(department_id="sales"), "assigned_to") is False


def test_employee_project_visibility_includes_assigned_task_projects():
    query = task_endpoints.build_employee_project_visibility_query(
        user("employee-1", UserRole.EMPLOYEE),
        ["mongo-project-1", "KEY-2"],
    )

    assert query == {
        "$or": [
            {"team_member_ids": "employee-1"},
            {"project_id": {"$in": ["mongo-project-1", "KEY-2"]}},
            {"_id": {"$in": ["mongo-project-1", "KEY-2"]}},
        ]
    }
