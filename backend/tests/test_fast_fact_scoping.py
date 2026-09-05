"""Tests for entity-scoped fast facts (Executive Agent).

Proves the scope-loss bug is fixed: "Gaurav ke kitne task pending hain?"
must count ONLY Gaurav's pending tasks, not the whole company's.

Covers the required scenarios:
- "how many tasks are pending?"           -> company-wide pending count
- "Gaurav ke kitne task pending hain?"    -> Gaurav-only pending count
- "Riya completed how many today?"        -> Riya-only completed-today count
- "Project Alpha ke pending tasks?"       -> project-only pending count

Plus audit coverage: employee-scoped leave/meetings handlers and the
unresolved-entity route (never falls back to company-wide data).

The fast-fact handlers import their Beanie models lazily inside each
function, so the fixtures patch the *model modules* (e.g.
``app.models.task.Task``) rather than the handler module.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest

from app.agents.fast_facts import (
    FAST_FACT_HANDLERS,
    execute_fast_fact,
    handle_completed_today_count,
    handle_pending_leave_count,
    handle_pending_task_count,
    handle_today_meetings,
)
from app.agents.fast_fact_scope import extract_fast_fact_scope
from app.core.clock import utc_now


# ---------------------------------------------------------------------------
# Test doubles — minimal stand-ins for Beanie models
# ---------------------------------------------------------------------------

def _matches(doc, query):
    """Small query matcher: $and / $or / $in / $lt / $gte / $ne and array
    containment (Mongo semantics: {field: x} matches arrays containing x)."""
    if "$and" in query:
        return all(_matches(doc, part) for part in query["$and"])
    if "$or" in query:
        return any(_matches(doc, part) for part in query["$or"])
    for key, cond in query.items():
        if key.startswith("$"):
            continue
        value = getattr(doc, key, None)
        if isinstance(cond, dict):
            if "$in" in cond and value not in cond["$in"]:
                return False
            if "$ne" in cond and value == cond["$ne"]:
                return False
            if "$lt" in cond and not (value is not None and value < cond["$lt"]):
                return False
            if "$gte" in cond and not (value is not None and value >= cond["$gte"]):
                return False
        elif isinstance(value, list) and not isinstance(cond, (dict, list)):
            if cond not in value:
                return False
        elif value != cond:
            return False
    return True


class _FakeCursor:
    """Chained find(...).sort(...).limit(...).skip(...) -> to_list()/count()."""

    def __init__(self, docs, sort=None, limit=None):
        self._docs = list(docs)
        self._limit = limit

    def sort(self, *args, **kwargs):
        return self

    def limit(self, n):
        return _FakeCursor(self._docs, limit=n)

    def skip(self, n):
        return _FakeCursor(self._docs[n:], limit=self._limit)

    async def to_list(self, length=None):
        docs = self._docs
        if self._limit:
            docs = docs[: self._limit]
        return docs

    async def count(self):
        docs = self._docs
        if self._limit:
            docs = docs[: self._limit]
        return len(docs)


def _as_dict(doc):
    out = dict(getattr(doc, "__dict__", {}))
    if getattr(doc, "_id", None) is not None:
        out["_id"] = doc._id
    elif getattr(doc, "id", None) is not None:
        out["_id"] = doc.id
    return out


class _FakeCollection:
    """Minimal pymongo-collection stand-in used by the scope resolvers
    (``Model.get_pymongo_collection().find(...)`` returns dict docs).

    ``find`` is synchronous like pymongo: callers chain
    ``find(...).limit(...).to_list(...)`` and await only ``to_list``."""

    def __init__(self, model):
        self._model = model

    def find(self, query=None, projection=None):
        docs = self._model.docs
        if query:
            docs = [d for d in docs if _matches(d, query)]
        return _FakeCursor([_as_dict(d) for d in docs])

    def find_one(self, query=None, projection=None):
        return None


class _FakeModel:
    """Base stand-in for a Beanie Document: find() filters cls.docs."""

    docs: list = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    @classmethod
    def find(cls, query=None, *args, **kwargs):
        docs = cls.docs
        if query:
            docs = [d for d in docs if _matches(d, query)]
        return _FakeCursor(docs)

    @classmethod
    def find_one(cls, query=None, *args, **kwargs):
        for d in cls.docs:
            if query and _matches(d, query):
                return d
        return None

    @classmethod
    def get_pymongo_collection(cls):
        return _FakeCollection(cls)


class _FakeTask(_FakeModel):
    docs: list = []

    def __init__(self, title, status, company_id="company-1", assigned_to=None,
                 project_id=None, project_object_id=None, due_date=None,
                 completed_at=None):
        self.title = title
        self.status = status
        self.company_id = company_id
        self.assigned_to = assigned_to
        self.project_id = project_id
        self.project_object_id = project_object_id
        self.due_date = due_date
        self.completed_at = completed_at


class _FakeUser(_FakeModel):
    docs: list = []

    def __init__(self, id, first_name, last_name, email, company_id):
        self.id = id
        self.first_name = first_name
        self.last_name = last_name
        self.email = email
        self.company_id = company_id

    @property
    def _id(self):
        return self.id


class _FakeProject(_FakeModel):
    docs: list = []


class _FakeClient(_FakeModel):
    docs: list = []


class _FakeProspect(_FakeModel):
    docs: list = []


class _FakeJob(_FakeModel):
    docs: list = []


class _FakeLeave(_FakeModel):
    docs: list = []


class _FakeMeeting(_FakeModel):
    docs: list = []


# ---------------------------------------------------------------------------
# Fixture: fake company data (patches the model modules the handlers and
# scope resolvers import lazily)
# ---------------------------------------------------------------------------

@pytest.fixture
def company_data(monkeypatch):
    # Enum classes stay real; only the model classes are faked.
    from app.models.task import TaskStatus
    from app.models.leave import LeaveStatus
    from app.models.meeting import MeetingStatus

    gaurav_id = "gaurav-user-id"
    riya_id = "riya-user-id"
    alpha_project = "PROJ-ALPHA"
    alpha_oid = "alpha-object-id"

    now = utc_now()
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Company-wide pending (TODO) tasks = 3 unassigned + 2 Riya + 3 Alpha = 8.
    _FakeTask.docs = []
    for i in range(3):
        _FakeTask.docs.append(_FakeTask(f"Task {i}", TaskStatus.TODO.value))
    # Gaurav has NO pending tasks; one completed task (today).
    _FakeTask.docs.append(_FakeTask(
        "Gaurav done", TaskStatus.COMPLETED.value,
        assigned_to=gaurav_id, completed_at=today0,
    ))
    # Riya: 2 pending + 3 completed today.
    for i in range(2):
        _FakeTask.docs.append(_FakeTask(f"Riya pending {i}", TaskStatus.TODO.value, assigned_to=riya_id))
    for i in range(3):
        _FakeTask.docs.append(_FakeTask(
            f"Riya done {i}", TaskStatus.COMPLETED.value,
            assigned_to=riya_id, completed_at=today0,
        ))
    # Project Alpha: 3 pending tasks (none assigned to Gaurav/Riya).
    for i in range(3):
        _FakeTask.docs.append(_FakeTask(
            f"Alpha task {i}", TaskStatus.TODO.value,
            project_id=alpha_project, project_object_id=alpha_oid,
        ))

    _FakeUser.docs = [
        _FakeUser(gaurav_id, "Gaurav", "Sharma", "gaurav@syn.com", "company-1"),
        _FakeUser(riya_id, "Riya", "Jain", "riya@syn.com", "company-1"),
    ]

    _FakeProject.docs = [
        _FakeModel(_id=alpha_oid, company_id="company-1", name="Alpha",
                   key="ALPHA", project_id=alpha_project, status="active"),
    ]

    _FakeLeave.docs = [
        _FakeModel(company_id="company-1", employee_id=gaurav_id,
                   status=LeaveStatus.PENDING.value, start_date=now,
                   leave_type_id="sick"),
        _FakeModel(company_id="company-1", employee_id=riya_id,
                   status=LeaveStatus.PENDING.value, start_date=now,
                   leave_type_id="casual"),
    ]

    _FakeMeeting.docs = [
        _FakeModel(company_id="company-1", title="All hands", meeting_date=now,
                   meeting_time="10:00", status=MeetingStatus.SCHEDULED.value,
                   participant_ids=[gaurav_id, riya_id]),
        _FakeModel(company_id="company-1", title="Board review", meeting_date=now,
                   meeting_time="12:00", status=MeetingStatus.SCHEDULED.value,
                   participant_ids=[riya_id]),
    ]

    _FakeClient.docs = []
    _FakeProspect.docs = []
    _FakeJob.docs = []

    # Patch the model modules: handlers and scope resolvers import these
    # lazily at call time, so the patched classes are what they see.
    monkeypatch.setattr("app.models.task.Task", _FakeTask)
    monkeypatch.setattr("app.models.user.User", _FakeUser)
    monkeypatch.setattr("app.models.project.Project", _FakeProject)
    monkeypatch.setattr("app.models.client.Client", _FakeClient)
    monkeypatch.setattr("app.models.sales_prospect.SalesProspect", _FakeProspect)
    monkeypatch.setattr("app.recruitment.models.RecruitmentJob", _FakeJob)
    monkeypatch.setattr("app.models.leave.LeaveRequest", _FakeLeave)
    monkeypatch.setattr("app.models.meeting.Meeting", _FakeMeeting)

    return {
        "gaurav_id": gaurav_id,
        "riya_id": riya_id,
        "alpha_project": alpha_project,
    }


# ---------------------------------------------------------------------------
# Required scenarios
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_company_wide_pending_count(company_data):
    """\"how many tasks are pending?\" -> company-wide count (8)."""
    result = await handle_pending_task_count("company-1", scope=None)
    assert "8" in result["answer"]
    assert result["facts"][0]["value"] == 8


@pytest.mark.asyncio
async def test_gaurav_pending_count_is_scoped(company_data):
    """\"Gaurav ke kitne task pending hain?\" -> Gaurav-only count (0)."""
    scope = await extract_fast_fact_scope("Gaurav ke kitne task pending hain?", "company-1")
    assert scope.employee_user_id == company_data["gaurav_id"]
    assert not scope.must_route_to_executive

    result = await handle_pending_task_count("company-1", scope=scope)
    assert "Gaurav" in result["answer"]
    assert result["facts"][0]["value"] == 0


@pytest.mark.asyncio
async def test_riya_completed_today_is_scoped(company_data):
    """\"Riya completed how many today?\" -> Riya-only count (3)."""
    scope = await extract_fast_fact_scope("Riya completed how many today?", "company-1")
    assert scope.employee_user_id == company_data["riya_id"]

    result = await handle_completed_today_count("company-1", scope=scope)
    assert "Riya" in result["answer"]
    assert result["facts"][0]["value"] == 3


@pytest.mark.asyncio
async def test_project_alpha_pending_is_scoped(company_data):
    """\"Project Alpha ke pending tasks?\" -> project-only count (3)."""
    scope = await extract_fast_fact_scope("Project Alpha ke pending tasks?", "company-1")
    assert scope.project_id == company_data["alpha_project"]
    assert not scope.must_route_to_executive

    result = await handle_pending_task_count("company-1", scope=scope)
    assert result["facts"][0]["value"] == 3


# ---------------------------------------------------------------------------
# Unresolved entity never falls back to company-wide data
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unknown_employee_routes_to_executive(company_data):
    """Mentioned employee that does not exist -> unresolved (route to Executive)."""
    scope = await extract_fast_fact_scope("Vivek ke kitne task pending hain?", "company-1")
    assert scope.must_route_to_executive
    assert not scope.employee_user_id


# ---------------------------------------------------------------------------
# Audit coverage: employee-scoped leave / meetings handlers
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pending_leave_count_scoped_to_employee(company_data):
    """\"Gaurav ke kitne leaves pending?\" -> only Gaurav's leave requests."""
    scope = await extract_fast_fact_scope("Gaurav ke kitne leaves pending hain?", "company-1")
    assert scope.employee_user_id == company_data["gaurav_id"]

    result = await handle_pending_leave_count("company-1", scope=scope)
    assert result["facts"][0]["value"] == 1


@pytest.mark.asyncio
async def test_today_meetings_scoped_to_participant(company_data):
    """\"Gaurav ki aaj kitni meetings?\" -> only meetings Gaurav attends."""
    scope = await extract_fast_fact_scope("Gaurav ki aaj kitni meetings hain?", "company-1")
    assert scope.employee_user_id == company_data["gaurav_id"]

    result = await handle_today_meetings("company-1", scope=scope)
    assert "Gaurav" in result["answer"]
    assert len(result["facts"][0]["value"]) == 1


# ---------------------------------------------------------------------------
# Registry integrity
# ---------------------------------------------------------------------------

def test_all_handlers_accept_scope():
    """Every registered handler accepts an optional scope argument."""
    import inspect
    for name, handler in FAST_FACT_HANDLERS.items():
        params = inspect.signature(handler).parameters
        assert "scope" in params, f"{name} must accept scope="