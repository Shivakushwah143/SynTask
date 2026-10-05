"""
Project deletion cascade tests.

Covers the full delete contract:
  - empty project deletion
  - project with tasks (any status) deletion cascades tasks + dependent records
  - strict project/organization isolation (no other project touched)
  - RBAC: org managers only (project leads/employees get 403 per the existing model)
  - cross-organization attempts are rejected and delete nothing
  - idempotency: deleting an already-deleted project returns 404
  - the frontend's real identifier (Mongo _id string) resolves correctly
  - best-effort event publish failure never fails a successful delete
"""
from datetime import datetime
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.api.v1.endpoints.projects import project_delete
from app.models.project import ProjectStatus
from app.models.task import TaskPriority, TaskStatus
from app.models.user import UserRole


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def user(user_id="admin-1", role=UserRole.ADMIN, company_id="company-1"):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        full_name=lambda: "Test User",
    )


def project(**overrides):
    data = {
        "id": "6a705d6e32b37e4355c08587",
        "project_id": "PROJ-1",
        "name": "Delete Me",
        "key": "PROJ",
        "description": "",
        "type": "software",
        "status": ProjectStatus.ACTIVE,
        "company_id": "company-1",
        "client_id": None,
        "lead_id": "lead-1",
        "assigned_to": "manager-1",
        "assigned_user_ids": ["manager-1"],
        "team_member_ids": [],
        "created_by": "admin-1",
        "assignment_history": [],
        "assigned_by": None,
        "assigned_at": None,
        "start_date": None,
        "delivery_date": None,
        "end_date": None,
        "files": [],
        "created_at": datetime(2026, 8, 1),
        "updated_at": datetime(2026, 8, 1),
        "board_columns": [],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def task(**overrides):
    data = {
        "id": "507f1f77bcf86cd799439011",
        "title": "Task",
        "description": "",
        "status": TaskStatus.TODO,
        "priority": TaskPriority.MEDIUM,
        "assigned_to": "employee-1",
        "created_by": "admin-1",
        "due_date": None,
        "created_at": datetime(2026, 8, 1),
        "tags": [],
        "story_points": None,
        "attachments": [],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class FakeTaskQuery:
    def __init__(self, tasks):
        self.tasks = tasks

    async def to_list(self):
        return self.tasks


class FakeTaskModel:
    """Records the last filter passed to find() so tests can assert scope."""

    def __init__(self, tasks):
        self.tasks = tasks
        self.last_filter = None

    def find(self, filt, *_args, **_kwargs):
        self.last_filter = filt
        return FakeTaskQuery(self.tasks)

    async def find_one(self, *_args, **_kwargs):
        return None


class FakeDeleteResult:
    def __init__(self, deleted_count=0):
        self.deleted_count = deleted_count


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.calls = []

    async def delete_many(self, filt, session=None):
        self.calls.append((filt, session is not None))
        return FakeDeleteResult(0)


class FakeDatabase:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = FakeCollection(name)
        return self.collections[name]


def install_service_fakes(monkeypatch, project_obj, tasks):
    """Wire the cascade service against fakes: no live DB, no live client."""
    import app.core.database as database_module
    from app.services import project_service

    fake_db = FakeDatabase()
    fake_task_model = FakeTaskModel(tasks)

    monkeypatch.setattr(database_module, "get_database", lambda: fake_db)
    monkeypatch.setattr(database_module, "client", None)
    monkeypatch.setattr(project_service.Task, "find", fake_task_model.find)
    monkeypatch.setattr(project_service.Task, "find_one", fake_task_model.find_one)

    return fake_db, fake_task_model


async def run_cascade(monkeypatch, project_obj, tasks):
    from app.services.project_service import ProjectService

    fake_db, fake_task_model = install_service_fakes(monkeypatch, project_obj, tasks)
    summary = await ProjectService.delete_project_cascade(
        project=project_obj,
        current_user=user(),
    )
    return summary, fake_db, fake_task_model


class FakeSession:
    def __init__(self):
        self.started = False
        self.aborted = False
        self.committed = False
        self.ended = False

    def start_transaction(self):
        self.started = True

    async def abort_transaction(self):
        self.aborted = True

    async def commit_transaction(self):
        self.committed = True

    def end_session(self):
        self.ended = True


class FakeClient:
    def __init__(self):
        self.session = FakeSession()

    async def start_session(self):
        return self.session


class StandaloneMongodCollection(FakeCollection):
    """Rejects the first session-bearing write with the exact pymongo error a
    standalone mongod raises (start_transaction is lazy - the failure only
    surfaces when the first operation with the session executes)."""

    def __init__(self, name):
        super().__init__(name)
        self.raised = False

    async def delete_many(self, filt, session=None):
        if session is not None and not self.raised:
            self.raised = True
            from pymongo.errors import OperationFailure
            raise OperationFailure(
                "Transaction numbers are only allowed on a replica set member or mongos",
                20,
                {"ok": 0.0, "errmsg": "Transaction numbers are only allowed on a replica set member or mongos", "code": 20, "codeName": "IllegalOperation"},
            )
        return await super().delete_many(filt, session=session)


class StandaloneMongodDatabase(FakeDatabase):
    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = StandaloneMongodCollection(name)
        return self.collections[name]


# ---------------------------------------------------------------------------
# Cascade service tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cascade_falls_back_when_transaction_rejected_at_first_write(monkeypatch):
    """
    Regression test for the production 500: on a standalone mongod,
    start_transaction() succeeds locally but the first delete_many(session=...)
    raises OperationFailure code 20. The cascade must detect it, abort the dead
    transaction, and re-run WITHOUT a session - returning a normal success.
    """
    import app.core.database as database_module
    from app.services import project_service as project_service_module
    from app.services.project_service import ProjectService

    p = project()
    t = task()
    fake_db = StandaloneMongodDatabase()
    fake_task_model = FakeTaskModel([t])
    fake_client = FakeClient()

    monkeypatch.setattr(database_module, "get_database", lambda: fake_db)
    monkeypatch.setattr(database_module, "client", fake_client)
    monkeypatch.setattr(project_service_module.Task, "find", fake_task_model.find)
    monkeypatch.setattr(project_service_module.Task, "find_one", fake_task_model.find_one)

    summary = await ProjectService.delete_project_cascade(project=p, current_user=user())

    assert summary["deleted_tasks"] == 1
    # The transaction was attempted and the fallback re-ran everything.
    assert fake_client.session.started is True
    assert fake_client.session.aborted is True
    assert fake_client.session.committed is False
    # Every stage ended up deleted (fallback passed session=None everywhere).
    for name, collection in fake_db.collections.items():
        assert collection.calls, f"collection {name} was never written in the fallback"
        for _filt, used_session in collection.calls:
            assert used_session is False

@pytest.mark.asyncio
async def test_delete_empty_project_deletes_project_document(monkeypatch):
    p = project()
    summary, fake_db, fake_task_model = await run_cascade(monkeypatch, p, tasks=[])

    assert summary["deleted_tasks"] == 0
    project_calls = fake_db.collections["projects"].calls
    assert len(project_calls) == 1
    assert project_calls[0][0] == {"_id": ObjectId(p.id)}


@pytest.mark.asyncio
async def test_delete_project_with_tasks_deletes_all_tasks_any_status(monkeypatch):
    p = project()
    tasks = [
        task(id="507f1f77bcf86cd799439011", status=TaskStatus.TODO),
        task(id="507f1f77bcf86cd799439012", status=TaskStatus.IN_PROGRESS),
        task(id="507f1f77bcf86cd799439013", status=TaskStatus.COMPLETED),
        task(id="507f1f77bcf86cd799439014", status=TaskStatus.CANCELLED),
    ]
    summary, fake_db, fake_task_model = await run_cascade(monkeypatch, p, tasks)

    assert summary["deleted_tasks"] == 4
    task_deletes = fake_db.collections["tasks"].calls
    assert len(task_deletes) == 1
    task_filter = task_deletes[0][0]
    assert task_filter["company_id"] == "company-1"
    assert len(task_filter["_id"]["$in"]) == 4
    assert task_filter["_id"]["$in"] == [ObjectId(t.id) for t in tasks]


@pytest.mark.asyncio
async def test_cascade_task_query_is_strictly_scoped_to_this_project(monkeypatch):
    p = project()
    other_project_task = task(id="507f1f77bcf86cd799439099")
    summary, fake_db, fake_task_model = await run_cascade(monkeypatch, p, tasks=[other_project_task])

    task_filter = fake_task_model.last_filter
    assert task_filter["company_id"] == "company-1"
    matched_ids = task_filter["$or"][0]["project_id"]["$in"]
    assert str(p.id) in matched_ids
    assert p.project_id in matched_ids
    # The only object-id link is THIS project - another project's id must never
    # match, and the fake task (from another project) must not be deleted.
    assert "other-project-id" not in matched_ids
    assert task_filter["$or"][1] == {"project_object_id": str(p.id)}
    # The tasks delete stage is keyed by the discovered task ids only.
    task_delete_filter = fake_db.collections["tasks"].calls[0][0]
    assert task_delete_filter["company_id"] == "company-1"
    deleted_oids = task_delete_filter["_id"]["$in"]
    assert ObjectId(other_project_task.id) in deleted_oids  # discovered via the query
    assert len(deleted_oids) == 1
    assert summary["deleted_tasks"] == 1


@pytest.mark.asyncio
async def test_cascade_cleans_dependent_records_and_project_last(monkeypatch):
    p = project()
    t = task()
    summary, fake_db, _ = await run_cascade(monkeypatch, p, tasks=[t])

    by_name = {name: col for name, col in fake_db.collections.items()}

    # Task-dependent records are targeted with company + task scoping.
    assert by_name["task_comments"].calls[0][0] == {
        "task_id": {"$in": [t.id]},
        "company_id": "company-1",
    }
    assert by_name["watchers"].calls[0][0] == {
        "task_id": {"$in": [t.id]},
        "company_id": "company-1",
    }
    assert by_name["time_logs"].calls[0][0] == {"task_id": {"$in": [t.id]}}
    issue_links_filter = by_name["issue_links"].calls[0][0]["$or"]
    assert {"source_task_id": {"$in": [t.id]}} in issue_links_filter
    assert {"destination_task_id": {"$in": [t.id]}} in issue_links_filter

    # Project-scoped records are targeted with project + company scoping.
    assert by_name["epics"].calls[0][0] == {
        "project_id": {"$in": [str(p.id), p.project_id]},
        "company_id": "company-1",
    }
    assert by_name["sprints"].calls[0][0]["company_id"] == "company-1"
    assert by_name["pages"].calls[0][0]["company_id"] == "company-1"
    assert by_name["content_calendar_items"].calls[0][0]["company_id"] == "company-1"
    assert by_name["project_memory"].calls[0][0]["company_id"] == "company-1"
    assert by_name["knowledge_records"].calls[0][0]["company_id"] == "company-1"
    assert by_name["automation_rules"].calls[0][0]["company_id"] == "company-1"

    # Scheduled jobs that would recreate the project or its tasks are removed,
    # scoped to the company so a same-id job in another org is never touched.
    scheduled_filter = by_name["scheduled_jobs"].calls[0][0]
    assert scheduled_filter["company_id"] == "company-1"
    assert scheduled_filter["action_type"]["$in"] == ["CREATE_TASK", "CREATE_PROJECT"]
    assert scheduled_filter["payload.project_id"]["$in"] == [str(p.id), p.project_id]

    # Notifications referencing the project's tasks/project are cleaned.
    notification_filter = by_name["notifications"].calls[0][0]
    assert notification_filter["company_id"] == "company-1"

    # The project document itself is deleted LAST (after every child stage).
    stage_names = [name for name in fake_db.collections.keys() if fake_db.collections[name].calls]
    assert stage_names[-1] == "projects"


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------

async def _noop_event(*_args, **_kwargs):
    return None


def _install_endpoint_fakes(monkeypatch, resolved_project=None, manage=True):
    """Monkeypatch the endpoint's dependencies and return a recorder."""
    state = {"resolved_with": None, "cascade_called": False, "cascade_args": None}

    async def fake_get_project_by_id(project_identifier, company_id=None):
        state["resolved_with"] = (project_identifier, company_id)
        if resolved_project is None:
            return None, None
        return resolved_project, getattr(resolved_project, "project_id", None)

    async def fake_can_manage_project(_project, _current_user):
        return manage

    async def fake_cascade(**kwargs):
        state["cascade_called"] = True
        state["cascade_args"] = kwargs
        return {"deleted_tasks": 3, "deleted_records": {"tasks": 3, "epics": 1}}

    monkeypatch.setattr(project_delete, "get_project_by_id", fake_get_project_by_id)
    monkeypatch.setattr(project_delete, "can_manage_project", fake_can_manage_project)
    monkeypatch.setattr(project_delete.ProjectService, "delete_project_cascade", staticmethod(fake_cascade))
    monkeypatch.setattr(project_delete, "publish_event", _noop_event)
    return state


@pytest.mark.asyncio
async def test_delete_empty_project_endpoint_succeeds(monkeypatch):
    p = project()
    state = _install_endpoint_fakes(monkeypatch, resolved_project=p)

    response = await project_delete.delete_project(p.id, current_user=user())

    assert response["message"] == "Project deleted successfully"
    assert state["cascade_called"] is True


@pytest.mark.asyncio
async def test_delete_project_with_tasks_endpoint_returns_summary(monkeypatch):
    p = project()
    state = _install_endpoint_fakes(monkeypatch, resolved_project=p)

    response = await project_delete.delete_project(p.id, current_user=user())

    assert state["cascade_called"] is True
    assert response["deleted_tasks"] == 3
    assert response["deleted_records"] == {"tasks": 3, "epics": 1}
    # The resolved project object is passed through to the cascade service.
    assert state["cascade_args"]["project"] is p
    assert state["cascade_args"]["current_user"].id == "admin-1"


@pytest.mark.asyncio
async def test_endpoint_resolves_frontend_mongo_id_with_company_scope(monkeypatch):
    p = project()
    state = _install_endpoint_fakes(monkeypatch, resolved_project=p)

    # Frontend sends the Mongo _id string it renders in cards/routes.
    await project_delete.delete_project("6a705d6e32b37e4355c08587", current_user=user())

    assert state["resolved_with"] == ("6a705d6e32b37e4355c08587", "company-1")


@pytest.mark.asyncio
async def test_unauthorized_employee_gets_403_and_nothing_deleted(monkeypatch):
    p = project()
    state = _install_endpoint_fakes(monkeypatch, resolved_project=p, manage=False)

    with pytest.raises(HTTPException) as exc_info:
        await project_delete.delete_project(p.id, current_user=user("employee-1", UserRole.EMPLOYEE))

    assert exc_info.value.status_code == 403
    assert state["cascade_called"] is False


@pytest.mark.asyncio
async def test_project_lead_without_manage_permission_gets_403(monkeypatch):
    # Existing RBAC model: PROJECT_LEAD does not hold MANAGE_PROJECT, so a lead
    # must not delete projects - matching the frontend (no delete button).
    p = project(lead_id="lead-1")
    state = _install_endpoint_fakes(monkeypatch, resolved_project=p, manage=False)

    with pytest.raises(HTTPException) as exc_info:
        await project_delete.delete_project(p.id, current_user=user("lead-1", UserRole.LEAD))

    assert exc_info.value.status_code == 403
    assert state["cascade_called"] is False


@pytest.mark.asyncio
async def test_cross_organization_project_is_not_found(monkeypatch):
    # Company-scoped lookup resolves nothing for a foreign project.
    state = _install_endpoint_fakes(monkeypatch, resolved_project=None)

    with pytest.raises(HTTPException) as exc_info:
        await project_delete.delete_project("6a705d6e32b37e4355c08587", current_user=user())

    assert exc_info.value.status_code == 404
    assert state["cascade_called"] is False


@pytest.mark.asyncio
async def test_cross_organization_project_directly_resolved_gets_403(monkeypatch):
    # Even if a foreign project somehow resolves, company access is enforced.
    foreign = project(company_id="company-2")
    state = _install_endpoint_fakes(monkeypatch, resolved_project=foreign)

    with pytest.raises(HTTPException) as exc_info:
        await project_delete.delete_project(foreign.id, current_user=user("admin-1", UserRole.ADMIN, "company-1"))

    assert exc_info.value.status_code == 403
    assert state["cascade_called"] is False


@pytest.mark.asyncio
async def test_deleting_already_deleted_project_returns_404(monkeypatch):
    # Second delete attempt on a missing project: clean 404, no cascade.
    state = _install_endpoint_fakes(monkeypatch, resolved_project=None)

    with pytest.raises(HTTPException) as exc_info:
        await project_delete.delete_project("6a705d6e32b37e4355c08587", current_user=user())

    assert exc_info.value.status_code == 404
    assert state["cascade_called"] is False


@pytest.mark.asyncio
async def test_event_publish_failure_does_not_fail_successful_delete(monkeypatch):
    p = project()

    async def failing_event(*_args, **_kwargs):
        raise RuntimeError("downstream event bus down")

    monkeypatch.setattr(project_delete, "get_project_by_id", lambda *_a, **_k: _async_tuple(p))
    monkeypatch.setattr(project_delete, "can_manage_project", _async_true)

    async def fake_cascade(**kwargs):
        return {"deleted_tasks": 2, "deleted_records": {}}

    monkeypatch.setattr(project_delete.ProjectService, "delete_project_cascade", staticmethod(fake_cascade))
    monkeypatch.setattr(project_delete, "publish_event", failing_event)

    response = await project_delete.delete_project(p.id, current_user=user())

    assert response["message"] == "Project deleted successfully"


async def _async_tuple(value):
    return value, value.project_id


async def _async_true(*_args, **_kwargs):
    return True
