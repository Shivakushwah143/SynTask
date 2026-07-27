import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.v1.endpoints import admin_permissions as admin_permissions_module
from app.main import app
from app.models.user import UserRole, UserStatus


client = TestClient(app)


class FakeQuery:
    def __init__(self, items):
        self.items = items

    async def to_list(self):
        return list(self.items)

    def count(self):
        async def _count():
            return len(self.items)
        return _count()

    def sort(self, *args, **kwargs):
        return self


class FakeUser:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "user-1")
        self.email = kwargs.get("email", "user@example.com")
        self.first_name = kwargs.get("first_name", "Demo")
        self.last_name = kwargs.get("last_name", "User")
        self.role = kwargs.get("role", UserRole.EMPLOYEE)
        self.company_id = kwargs.get("company_id", "company-1")
        self.modules = kwargs.get("modules", ["task"])
        self.department_id = kwargs.get("department_id")
        self.previous_role = kwargs.get("previous_role")
        self.status = kwargs.get("status", UserStatus.ACTIVE)
        self.created_at = kwargs.get("created_at")
        self.updated_at = kwargs.get("updated_at")
        self.deleted_at = None

    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    async def save(self):
        return self


class FakeDepartment:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "dept-1")
        self.name = kwargs.get("name", "Engineering")
        self.company_id = kwargs.get("company_id", "company-1")
        self.enabled_modules = kwargs.get("enabled_modules", [])
        self.deleted_at = None
        self.department_type = kwargs.get("department_type", "operations")

    async def save(self):
        return self


@pytest.fixture(autouse=True)
def reset_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_non_admin_is_forbidden_on_admin_permissions_overview(monkeypatch):
    async def fake_get_current_user():
        return FakeUser(id="actor-1", role=UserRole.EMPLOYEE, company_id="company-1")

    app.dependency_overrides[admin_permissions_module.get_current_user] = fake_get_current_user

    response = client.get("/api/v1/admin/permissions/overview")

    assert response.status_code == 403


def test_promote_sets_previous_role_and_admin_role(monkeypatch):
    actor = FakeUser(id="actor-1", role=UserRole.ADMIN, company_id="company-1")
    target = FakeUser(id="target-1", role=UserRole.EMPLOYEE, company_id="company-1", modules=["task", "tickets"])

    async def fake_get_current_user():
        return actor

    async def fake_user_get(user_id):
        return target if user_id == str(target.id) else None

    async def fake_timeline(*args, **kwargs):
        return None

    app.dependency_overrides[admin_permissions_module.get_current_user] = fake_get_current_user
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.User.get", fake_user_get)
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.create_timeline_event", fake_timeline)

    response = client.post(f"/api/v1/admin/permissions/users/{target.id}/promote")

    assert response.status_code == 200
    assert target.role == UserRole.ADMIN
    assert target.previous_role == UserRole.EMPLOYEE


def test_demote_last_admin_is_rejected(monkeypatch):
    actor = FakeUser(id="actor-1", role=UserRole.ADMIN, company_id="company-1")
    target = FakeUser(id="target-1", role=UserRole.ADMIN, company_id="company-1", previous_role=UserRole.EMPLOYEE)

    async def fake_get_current_user():
        return actor

    async def fake_user_get(user_id):
        return target if user_id == str(target.id) else None

    def fake_user_find(*args, **kwargs):
        return FakeQuery([target])

    async def fake_timeline(*args, **kwargs):
        return None

    app.dependency_overrides[admin_permissions_module.get_current_user] = fake_get_current_user
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.User.get", fake_user_get)
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.User.find", fake_user_find)
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.create_timeline_event", fake_timeline)

    response = client.post(f"/api/v1/admin/permissions/users/{target.id}/demote")

    assert response.status_code == 400
    assert target.role == UserRole.ADMIN


def test_user_modules_update_allows_admin_with_string_role(monkeypatch):
    actor = FakeUser(id="actor-1", role="admin", company_id="company-1")
    target = FakeUser(id="target-1", role=UserRole.EMPLOYEE, company_id="company-1", modules=["task"])

    async def fake_get_current_user():
        return actor

    async def fake_user_get(user_id):
        return target if user_id == str(target.id) else None

    async def fake_timeline(*args, **kwargs):
        return None

    app.dependency_overrides[admin_permissions_module.get_current_user] = fake_get_current_user
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.User.get", fake_user_get)
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.create_timeline_event", fake_timeline)

    response = client.put(
        f"/api/v1/admin/permissions/users/{target.id}/modules",
        json={"modules": ["task", "tickets"]},
    )

    assert response.status_code == 200
    assert response.json()["modules"] == ["tasks_projects", "tickets"]
    assert target.modules == ["tasks_projects", "tickets"]


def test_require_module_allows_tasks_or_tasks_projects(monkeypatch):
    import asyncio
    from app.api.dependencies import require_module

    user_with_task = FakeUser(modules=["task"])
    user_with_tasks_projects = FakeUser(modules=["tasks_projects"])

    checker_task = require_module("task")
    checker_tasks_projects = require_module("tasks_projects")

    async def fake_current_user():
        return user_with_task

    async def fake_current_user_tasks_projects():
        return user_with_tasks_projects

    async def run_checks():
        assert await checker_task(current_user=await fake_current_user()) == user_with_task
        assert await checker_task(current_user=await fake_current_user_tasks_projects()) == user_with_tasks_projects
        assert await checker_tasks_projects(current_user=await fake_current_user()) == user_with_task
        assert await checker_tasks_projects(current_user=await fake_current_user_tasks_projects()) == user_with_tasks_projects

    asyncio.run(run_checks())


def test_require_module_allows_chat_for_task_workspace_users(monkeypatch):
    import asyncio
    from app.api.dependencies import require_module

    user_with_task = FakeUser(modules=["task"])
    user_with_tasks_projects = FakeUser(modules=["tasks_projects"])

    checker_chat = require_module("chat")

    async def run_checks():
        assert await checker_chat(current_user=user_with_task) == user_with_task
        assert await checker_chat(current_user=user_with_tasks_projects) == user_with_tasks_projects

    asyncio.run(run_checks())


def test_require_module_allows_sales_or_sales_crm(monkeypatch):
    import asyncio
    from app.api.dependencies import require_module

    user_with_sales = FakeUser(modules=["sales"])
    user_with_sales_crm = FakeUser(modules=["sales_crm"])

    checker_sales = require_module("sales")
    checker_sales_crm = require_module("sales_crm")

    async def run_checks():
        assert await checker_sales(current_user=user_with_sales) == user_with_sales
        assert await checker_sales(current_user=user_with_sales_crm) == user_with_sales_crm
        assert await checker_sales_crm(current_user=user_with_sales) == user_with_sales
        assert await checker_sales_crm(current_user=user_with_sales_crm) == user_with_sales_crm

    asyncio.run(run_checks())


def test_overview_allows_admin_with_string_role(monkeypatch):
    actor = FakeUser(id="actor-1", role="admin", company_id="company-1")
    department = FakeDepartment(id="dept-1", name="Engineering", company_id="company-1", enabled_modules=["tasks_projects"])
    employee = FakeUser(id="employee-1", role=UserRole.EMPLOYEE, company_id="company-1", modules=["tasks_projects"], first_name="Jane", last_name="Doe")
    admin = FakeUser(id="admin-1", role=UserRole.ADMIN, company_id="company-1")

    class FakeDepartmentModel:
        company_id = object()
        deleted_at = object()

        @classmethod
        def find(cls, *args, **kwargs):
            return FakeQuery([department])

    async def fake_get_current_user():
        return actor

    def fake_user_find(query):
        if query.get("role") == {"$in": [UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.EMPLOYEE.value]}:
            return FakeQuery([employee])
        if query.get("role") == UserRole.ADMIN.value:
            return FakeQuery([admin])
        return FakeQuery([])

    app.dependency_overrides[admin_permissions_module.get_current_user] = fake_get_current_user
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.Department", FakeDepartmentModel)
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.User.find", fake_user_find)

    response = client.get("/api/v1/admin/permissions/overview")

    assert response.status_code == 200
    assert response.json()["departments"][0]["id"] == "dept-1"
    assert response.json()["employees"][0]["id"] == "employee-1"
    assert response.json()["admins"][0]["id"] == "admin-1"


def test_cross_tenant_target_returns_not_found(monkeypatch):
    actor = FakeUser(id="actor-1", role=UserRole.ADMIN, company_id="company-1")

    async def fake_get_current_user():
        return actor

    async def fake_user_get(user_id):
        return None

    app.dependency_overrides[admin_permissions_module.get_current_user] = fake_get_current_user
    monkeypatch.setattr("app.api.v1.endpoints.admin_permissions.User.get", fake_user_get)

    response = client.post("/api/v1/admin/permissions/users/other-user/promote")

    assert response.status_code == 404
