"""Content architecture governance validation tests.

Covers the required validations for the Content → Publishing boundary,
relationships, action-level RBAC, and company isolation.

These tests exercise the service layer directly (no MongoDB required) using
fakes, following the repo's existing service-test conventions (see
tests/test_rbac_visibility.py, tests/api/test_effective_capabilities.py).
"""
from __future__ import annotations

import re
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest
from fastapi import HTTPException

from app.models.user import UserRole


# ── Fakes ──────────────────────────────────────────────────────────────────

def make_user(role=UserRole.EMPLOYEE, company_id="company-1", user_id="user-1", capability_grants=None, **extra):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        first_name="Test",
        last_name="User",
        email="test@example.com",
        department_id=None,
        capability_grants=list(capability_grants or []),
        **extra,
    )


def make_project(company_id="company-1", project_id="proj-1", lead_id="lead-1"):
    return SimpleNamespace(
        id=project_id,
        project_id=project_id,
        company_id=company_id,
        name="September Social Media",
        deleted=False,
        lead_id=lead_id,
        client_id="client-1",
    )


def make_item(company_id="company-1", project_id="proj-1", status="approved", **extra):
    from app.models.content_calendar import ContentItemStatus

    defaults: Dict[str, Any] = dict(
        id="cnt-101",
        company_id=company_id,
        project_id=project_id,
        client_id="client-1",
        service_id="service-1",
        deliverable_id="deliverable-1",
        content_id="CNT-101",
        campaign=None,
        platform="Instagram",
        title="Reel: new product",
        content_type=None,
        category=None,
        description=None,
        objective=None,
        target_audience=None,
        key_message=None,
        hook=None,
        cta=None,
        tone=None,
        caption="caption",
        script=None,
        creative_brief=None,
        assignee_id="creator-1",
        assignee_name="Creator",
        owner_id="creator-1",
        team=[],
        due_date=None,
        publish_date=None,
        start_date=None,
        end_date=None,
        time=None,
        deadline=None,
        priority=None,
        status=ContentItemStatus(status) if isinstance(status, str) else status,
        completed=False,
        shoot_date=None,
        location=None,
        photographer=None,
        assets_required=[],
        references=[],
        file_ids=[],
        file_urls=["http://files/a.jpg"],
        attachment=None,
        tags=[],
        notes=None,
        assigned_person=None,
        reminder=None,
        color=None,
        deliverable_target=None,
        metadata={},
        current_version=2,
        versions=[],
        internal_reviews=[],
        client_approvals=[],
        publishing=None,
        history=[],
        draft_at=None,
        planned_at=None,
        shoot_scheduled_at=None,
        shot_at=None,
        editing_started_at=None,
        internal_review_at=None,
        client_review_at=None,
        approved_at=None,
        scheduled_at=None,
        published_at=None,
        deadline_missed_at=None,
        idea_at=None,
        briefing_at=None,
        script_at=None,
        production_at=None,
        revision_required_at=None,
        ready_to_publish_at=None,
        created_by="creator-1",
        updated_by="creator-1",
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 1),
    )
    defaults.update(extra)
    return SimpleNamespace(**defaults)


# ── 1. Publishing boundary: Content must not execute publishing ───────────

def test_ready_to_publish_cannot_transition_directly_to_published():
    """Content stops at Ready to Publish; publishing execution is derived."""
    from app.services.content_production_service import (
        ALLOWED_TRANSITIONS,
        ContentItemStatus,
    )

    assert ContentItemStatus.PUBLISHED not in ALLOWED_TRANSITIONS[ContentItemStatus.READY_TO_PUBLISH]
    assert ALLOWED_TRANSITIONS[ContentItemStatus.PUBLISHED] == set()


def test_calendar_state_machine_also_blocks_ready_to_publish_to_published():
    from app.services.content_calendar_service import (
        ALLOWED_TRANSITIONS as CALENDAR_TRANSITIONS,
        ContentItemStatus,
    )

    assert ContentItemStatus.PUBLISHED not in CALENDAR_TRANSITIONS[ContentItemStatus.READY_TO_PUBLISH]


@pytest.mark.asyncio
async def test_content_item_without_publishing_record_reports_not_handed_off(monkeypatch):
    """GET publishing info with no record → explicit 'not handed off' message."""
    from app.services import content_production_service as svc

    item = make_item(status="idea")
    project = make_project()

    async def fake_get(item_id):
        return item

    async def fake_load_project(user, pid):
        return project

    class FakeExpr:
        def __init__(self, *a, **k):
            pass

        def __bool__(self):
            return True

    class FakePubDoc:
        content_item_id = FakeExpr()
        company_id = FakeExpr()
        status = FakeExpr()

        @staticmethod
        async def find_one(*args, **kwargs):
            return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    monkeypatch.setattr(svc, "ContentPublishingRecordDoc", FakePubDoc)

    result = await svc.ContentProductionService.get_publishing_record(
        make_user(capability_grants=["content.view_publishing"]), "cnt-101"
    )
    assert result["record"] is None
    assert "Not yet handed off" in result["message"]


# ── 2. Ready to Publish handoff creates/reuses one canonical record ────────

@pytest.mark.asyncio
async def test_transition_to_ready_to_publish_refreshes_existing_record(monkeypatch):
    """Re-handoff must refresh references, not duplicate records."""
    from app.services import content_production_service as svc
    from app.models.content_calendar import ContentPublishingStatus

    item = make_item(status="approved")
    project = make_project()
    user = make_user(role=UserRole.ADMIN)

    existing_pub = SimpleNamespace(
        id="pub-1",
        content_item_id="cnt-101",
        company_id="company-1",
        content_id="CNT-101",
        client_id="OLD-client",
        platform="OLD-platform",
        caption="stale caption",
        file_urls=["old"],
        approved_version=1,
        status=ContentPublishingStatus.NOT_STARTED,
        scheduled_date=None,
        published_date=None,
        external_post_id=None,
        external_url=None,
        error_message=None,
        owner_id="creator-1",
        updated_at=datetime(2025, 1, 1),
    )
    saved: Dict[str, Any] = {}

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    async def fake_find_one(*a, **k):
        return existing_pub

    class FakeExpr:
        def __init__(self, *a, **k):
            pass

        def __bool__(self):
            return True

    class FakePubDoc:
        content_item_id = FakeExpr()
        company_id = FakeExpr()
        status = FakeExpr()

        @staticmethod
        async def find_one(*a, **k):
            return existing_pub

    async def fake_pub_save():
        saved["saved"] = True
        return None

    async def fake_item_save():
        return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    monkeypatch.setattr(svc, "ContentPublishingRecordDoc", FakePubDoc)
    existing_pub.save = fake_pub_save
    item.save = fake_item_save

    await svc.ContentProductionService.transition_status(user, "cnt-101", "ready_to_publish")

    # References refreshed from Content — no stale copies, no duplication
    assert existing_pub.client_id == "client-1"
    assert existing_pub.platform == "Instagram"
    assert existing_pub.caption == "caption"
    assert existing_pub.file_urls == ["http://files/a.jpg"]
    assert existing_pub.approved_version == 2  # item.current_version
    assert existing_pub.status == ContentPublishingStatus.NOT_STARTED
    assert saved.get("saved") is True
    # Exactly one history entry for the handoff
    handoffs = [h for h in item.history if getattr(h, "action", "") == "publishing_record_created"]
    assert len(handoffs) == 1


# ── 3. Relationship validation ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_project_from_another_client_is_rejected(monkeypatch):
    """Assigning a Project that belongs to another Client must fail."""
    from app.services import content_production_service as svc

    class FakeClientModel:
        def __init__(self, *a, **k):
            pass

    class FakeProject:
        @staticmethod
        async def get(pid):
            return SimpleNamespace(id="proj-x", company_id="company-1", client_id="client-999")

    async def fake_client_get(cid):
        return SimpleNamespace(id="client-1", company_id="company-1", name="ABC Foods")

    FakeClientModel.get = staticmethod(fake_client_get)

    monkeypatch.setattr(svc, "Project", FakeProject)
    monkeypatch.setattr(svc, "Client", FakeClientModel)

    result = await svc.ContentProductionService.validate_relationships(
        make_user(role=UserRole.ADMIN), client_id="client-1", project_id="proj-x"
    )
    assert result["valid"] is False
    assert any("Project does not belong to the selected client" in e for e in result["errors"])


@pytest.mark.asyncio
async def test_service_from_another_client_is_rejected(monkeypatch):
    from app.services import content_production_service as svc

    class FakeClientModel:
        @staticmethod
        async def get(cid):
            return SimpleNamespace(id="client-1", company_id="company-1", name="ABC Foods")

    class FakeServiceModel:
        @staticmethod
        async def get(sid):
            return SimpleNamespace(id="svc-x", company_id="company-1", client_id="client-999")

    monkeypatch.setattr(svc, "Client", FakeClientModel)
    monkeypatch.setattr(svc, "ClientService", FakeServiceModel)

    result = await svc.ContentProductionService.validate_relationships(
        make_user(role=UserRole.ADMIN), client_id="client-1", service_id="svc-x"
    )
    assert result["valid"] is False
    assert any("Service does not belong to the selected client" in e for e in result["errors"])


@pytest.mark.asyncio
async def test_deliverable_from_another_project_is_rejected(monkeypatch):
    from app.services import content_production_service as svc

    class FakeClientModel:
        @staticmethod
        async def get(cid):
            return SimpleNamespace(id="client-1", company_id="company-1", name="ABC Foods")

    class FakeProjectModel:
        @staticmethod
        async def get(pid):
            return SimpleNamespace(id="proj-1", company_id="company-1", client_id="client-1")

    class FakeDeliverableModel:
        @staticmethod
        async def get(did):
            return SimpleNamespace(
                id="dlv-x", company_id="company-1", client_id="client-1",
                project_id="proj-other", service_id="service-1",
            )

    monkeypatch.setattr(svc, "Client", FakeClientModel)
    monkeypatch.setattr(svc, "Project", FakeProjectModel)
    monkeypatch.setattr(svc, "ClientDeliverable", FakeDeliverableModel)

    result = await svc.ContentProductionService.validate_relationships(
        make_user(role=UserRole.ADMIN),
        client_id="client-1", project_id="proj-1", deliverable_id="dlv-x",
    )
    assert result["valid"] is False
    assert any("Deliverable does not belong to the selected project" in e for e in result["errors"])


@pytest.mark.asyncio
async def test_cross_company_entity_is_rejected(monkeypatch):
    from app.services import content_production_service as svc

    class FakeClientModel:
        @staticmethod
        async def get(cid):
            return SimpleNamespace(id="client-f", company_id="company-2")

    monkeypatch.setattr(svc, "Client", FakeClientModel)

    result = await svc.ContentProductionService.validate_relationships(
        make_user(role=UserRole.ADMIN), client_id="client-f"
    )
    assert result["valid"] is False
    assert any("another company" in e for e in result["errors"])


# ── 4. Action-level RBAC ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_view_only_user_cannot_approve(monkeypatch):
    """A user without content.client_review must not execute client approval."""
    from app.services import content_production_service as svc

    item = make_item(status="client_review")
    project = make_project()
    viewer = make_user(role=UserRole.EMPLOYEE, capability_grants=["content.view"])

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.client_review_action(viewer, "cnt-101", "approve")
    assert excinfo.value.status_code == 403
    assert "content.client_review" in str(excinfo.value.detail)


@pytest.mark.asyncio
async def test_view_only_user_can_view(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(status="idea")
    project = make_project()
    viewer = make_user(role=UserRole.EMPLOYEE, capability_grants=["content.view"])

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    class FakeClient:
        @staticmethod
        async def get(*a, **k):
            return None

    class FakeService:
        @staticmethod
        async def get(*a, **k):
            return None

    class FakeDeliverable:
        @staticmethod
        async def get(*a, **k):
            return None

    class FakeExpr:
        def __init__(self, *a, **k):
            pass

        def __bool__(self):
            return True

    class FakePubDoc:
        content_item_id = FakeExpr()
        company_id = FakeExpr()
        status = FakeExpr()

        @staticmethod
        async def find_one(*a, **k):
            return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    monkeypatch.setattr(svc, "Client", FakeClient)
    monkeypatch.setattr(svc, "ClientService", FakeService)
    monkeypatch.setattr(svc, "ClientDeliverable", FakeDeliverable)
    monkeypatch.setattr(svc, "ContentPublishingRecordDoc", FakePubDoc)

    result = await svc.ContentProductionService.get_item(viewer, "cnt-101")
    assert result["item"]["content_id"] == "CNT-101"


@pytest.mark.asyncio
async def test_creator_with_edit_cannot_perform_internal_review(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(status="internal_review")
    project = make_project()
    creator = make_user(role=UserRole.EMPLOYEE, capability_grants=["content.edit"])

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.internal_review_action(creator, "cnt-101", "approve")
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_reviewer_with_internal_review_capability_can_review(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(status="internal_review")
    project = make_project()
    reviewer = make_user(role=UserRole.EMPLOYEE, capability_grants=["content.internal_review"])

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    async def fake_save():
        return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    item.save = fake_save

    result = await svc.ContentProductionService.internal_review_action(reviewer, "cnt-101", "approve")
    assert "Review recorded" in result["message"]


@pytest.mark.asyncio
async def test_unauthorized_transition_through_generic_path_is_denied(monkeypatch):
    """Manually calling POST /content/:id/transition without capability fails."""
    from app.services import content_production_service as svc

    item = make_item(status="idea")
    project = make_project()
    nobody = make_user(role=UserRole.EMPLOYEE, capability_grants=[])

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.transition_status(nobody, "cnt-101", "briefing")
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_role_keeps_blanket_access(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(status="idea")
    project = make_project()
    admin = make_user(role=UserRole.ADMIN)

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return project

    async def fake_save():
        return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    item.save = fake_save

    # Should not raise a 403 — admins keep existing blanket access
    result = await svc.ContentProductionService.transition_status(admin, "cnt-101", "briefing")
    assert item.status.value == "briefing"
    assert "Transitioned" in result["message"]


# ── 5. Company isolation ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_from_company_b_cannot_get_content_from_company_a(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(company_id="company-a")
    # The item's project really lives in company-a; the caller is from company-b.
    foreign_project = make_project(company_id="company-a")
    outsider = make_user(role=UserRole.MANAGER, company_id="company-b")

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return foreign_project

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.get_item(outsider, "cnt-101")
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_user_from_company_b_cannot_read_allowed_transitions(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(company_id="company-a")
    foreign_project = make_project(company_id="company-a")
    outsider = make_user(role=UserRole.MANAGER, company_id="company-b")

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return foreign_project

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.get_allowed_transitions(outsider, "cnt-101")
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_user_from_company_b_cannot_read_publishing_info(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(company_id="company-a")
    foreign_project = make_project(company_id="company-a")
    outsider = make_user(role=UserRole.ADMIN, company_id="company-b")

    async def fake_get(item_id):
        return item

    async def fake_load_project(u, pid):
        return foreign_project

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.get_publishing_record(outsider, "cnt-101")
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_company_b_sees_company_a_template_as_not_found(monkeypatch):
    """Templates from another company must 404, never leak data."""
    from app.api.v1.endpoints import content_templates as tpl

    foreign_template = SimpleNamespace(
        id="tpl-1", company_id="company-a", name="Secret template",
    )
    outsider = make_user(role=UserRole.ADMIN, company_id="company-b")

    async def fake_get(template_id):
        return foreign_template

    monkeypatch.setattr(tpl.ContentTemplate, "get", staticmethod(fake_get))

    with pytest.raises(HTTPException) as excinfo:
        await tpl.update_template("tpl-1", tpl.TemplateUpdatePayload(name="hijack"), outsider)
    assert excinfo.value.status_code == 404

    with pytest.raises(HTTPException) as excinfo:
        await tpl.delete_template("tpl-1", outsider)
    assert excinfo.value.status_code == 404


# ── 6. Templates route collision ───────────────────────────────────────────

def _first_match(path: str, method: str):
    from app.api.v1.router import api_router

    for route in api_router.routes:
        if method in (getattr(route, "methods", None) or set()) and getattr(route, "path", None):
            pattern = re.sub(r"\{[^}]+\}", "[^/]+", route.path)
            if re.fullmatch(pattern, path):
                return route
    return None


def test_templates_routes_are_matched_before_dynamic_item_route():
    """/content/templates must resolve before /content/{item_id}."""
    route = _first_match("/content/templates", "GET")
    assert route is not None
    assert route.path == "/content/templates", "templates must not be captured as an item id"

    route_id = _first_match("/content/abc123", "GET")
    assert route_id is not None
    assert route_id.path == "/content/{item_id}"


def test_published_route_is_registered_exactly_once():
    from app.api.v1.router import api_router

    published = [
        r for r in api_router.routes
        if getattr(r, "path", None) == "/content/published" and "GET" in (getattr(r, "methods", None) or set())
    ]
    assert len(published) == 1


# ── 7. Notifications ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_notification_uses_canonical_content_link(monkeypatch):
    """Notifications must link to /content/:itemId, not the legacy calendar."""
    from app.services import content_production_service as svc
    from app.models.notification import NotificationType

    captured: Dict[str, Any] = {}

    class FakeNotification:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def insert(self):
            captured["inserted"] = True

    monkeypatch.setitem(
        vars(svc),
        "_send_content_notification",
        svc.__dict__["_send_content_notification"],
    )
    import app.models.notification as notif_module
    monkeypatch.setattr(notif_module, "Notification", FakeNotification)

    item = make_item(status="internal_review")

    await svc._send_content_notification(
        NotificationType.CONTENT_REVIEW_REQUESTED,
        "t", "m", "reviewer-1", "company-1", item,
        dedup_key="dedup-1",
    )
    assert captured.get("action_url") == "/content/cnt-101"
    assert captured.get("related_type") == "content_item"
    assert captured.get("metadata", {}).get("reminder_key") == "dedup-1"


@pytest.mark.asyncio
async def test_overdue_content_escalates_to_project_lead(monkeypatch):
    """Overdue content notifies the owner AND escalates to Project.lead_id."""
    from app.services.reminder_service import ReminderService
    from app.models.notification import NotificationType

    item = make_item()
    item.due_date = datetime(2026, 1, 1)  # in the past → overdue
    item.assignee_id = "creator-1"

    created: List[Dict[str, Any]] = []

    class FakeNotificationRepo:
        async def find_one(self, query):
            return None

        async def insert(self, notification):
            created.append({
                "user_id": notification.user_id,
                "type": notification.type,
                "reminder_key": notification.metadata.get("reminder_key"),
            })

    async def fake_project_get(pid):
        return make_project(lead_id="lead-1")

    import app.projects.models as projects_module
    monkeypatch.setattr(projects_module.Project, "get", staticmethod(fake_project_get))

    service = ReminderService(
        notification_repository=FakeNotificationRepo(),
        now=lambda: datetime(2026, 1, 10),
    )

    await service.generate_content_reminder(item)

    users_notified = {c["user_id"] for c in created}
    assert "creator-1" in users_notified, "owner must be notified"
    assert "lead-1" in users_notified, "project lead must receive escalation"

    types = {c["type"] for c in created}
    assert NotificationType.CONTENT_OVERDUE in types

    keys = [c["reminder_key"] for c in created]
    assert all(keys), "every notification must carry a dedup reminder_key"


@pytest.mark.asyncio
async def test_overdue_escalation_deduplicates_per_day(monkeypatch):
    from app.services.reminder_service import ReminderService

    item = make_item()
    item.due_date = datetime(2026, 1, 1)
    item.assignee_id = "creator-1"

    class FakeNotificationRepo:
        def __init__(self):
            self.existing_keys = set()

        async def find_one(self, query):
            key = query.get("metadata.reminder_key")
            return object() if key in self.existing_keys else None

        async def insert(self, notification):
            self.existing_keys.add(notification.metadata.get("reminder_key"))

    async def fake_project_get(pid):
        return make_project(lead_id="lead-1")

    import app.projects.models as projects_module
    monkeypatch.setattr(projects_module.Project, "get", staticmethod(fake_project_get))

    repo = FakeNotificationRepo()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 1, 10))

    # First pass generates the owner reminder + escalation
    await service.generate_content_reminder(item)
    assert any("content-overdue-escalation" in k for k in repo.existing_keys)

    # Second pass on the same day must not duplicate anything
    await service.generate_content_reminder(item)
    escalation_keys = [k for k in repo.existing_keys if k.startswith("content-overdue-escalation")]
    assert len(escalation_keys) == 1, "escalation must be deduplicated per day"


# ── 8. Final pass: backend-owned next action + brief completeness ──────────

def test_next_action_is_backend_owned_per_stage():
    """Every canonical stage maps to exactly one backend Next Action label."""
    from app.models.content_calendar import ContentItemStatus
    from app.services.content_production_service import NEXT_ACTION_BY_STATUS, next_action_for

    for status in NEXT_ACTION_BY_STATUS:
        item = make_item(status=status)
        assert next_action_for(item) == NEXT_ACTION_BY_STATUS[status]

    assert "reviewer decision" in NEXT_ACTION_BY_STATUS[ContentItemStatus.INTERNAL_REVIEW].lower()
    assert "publishing" in NEXT_ACTION_BY_STATUS[ContentItemStatus.READY_TO_PUBLISH].lower()


def test_brief_completeness_reports_missing_fields():
    from app.services.content_production_service import brief_completeness

    full = make_item(objective="goal", target_audience="audience", key_message="msg", cta="buy", tone="bold")
    result = brief_completeness(full)
    assert result["score"] == 100
    assert result["missing"] == []

    partial = make_item(objective="goal")
    result = brief_completeness(partial)
    assert result["score"] == 20
    assert set(result["missing"]) == {"target_audience", "key_message", "cta", "tone"}


def test_serialized_item_includes_next_action_and_brief_completeness():
    from app.services.content_production_service import _serialize_item

    data = _serialize_item(make_item(status="internal_review"))
    assert data["next_action"] == "Reviewer decision required"
    assert "brief_completeness" in data and "score" in data["brief_completeness"]


# ── 9. Content Overview aggregate ──────────────────────────────────────

def _install_overview_env(monkeypatch, items, projects, pub_docs=None):
    """Wire fakes so content_overview() runs without MongoDB."""
    from app.services import content_production_service as svc

    class FakeProjectModel:
        @staticmethod
        def find(query):
            class _Q:
                async def to_list(self):
                    return projects
            return _Q()

    class FakeItemModel:
        @staticmethod
        def find(query):
            class _Q:
                async def to_list(self):
                    return items
            return _Q()

    class FakePubDoc:
        @staticmethod
        def find(query):
            class _Q:
                async def to_list(self):
                    return pub_docs or []
            return _Q()

    class FakeClientModel:
        @staticmethod
        def find(query):
            class _Q:
                async def to_list(self):
                    return []
            return _Q()

    async def fake_require_capability(user, *caps):
        return None

    monkeypatch.setattr(svc, "Project", FakeProjectModel)
    monkeypatch.setattr(svc, "ContentCalendarItem", FakeItemModel)
    monkeypatch.setattr(svc, "ContentPublishingRecordDoc", FakePubDoc)
    monkeypatch.setattr(svc, "Client", FakeClientModel)
    monkeypatch.setattr(svc, "require_content_capability", fake_require_capability)
    return svc


@pytest.mark.asyncio
async def test_overview_metrics_and_queues_are_consistent(monkeypatch):
    """Queue counts always equal the canonical items behind them; Published
    items are historical, never overdue."""
    svc = _install_overview_env(
        monkeypatch,
        items=[
            make_item(id="a", content_id="CNT-001", status="production", deadline=datetime(2026, 1, 10)),
            make_item(id="b", content_id="CNT-002", status="internal_review"),
            make_item(id="c", content_id="CNT-003", status="client_review"),
            make_item(id="d", content_id="CNT-004", status="revision_required"),
            make_item(id="e", content_id="CNT-005", status="ready_to_publish"),
            make_item(id="f", content_id="CNT-006", status="published", completed=True,
                      deadline=datetime(2025, 1, 1)),
            make_item(id="g", content_id="CNT-007", status="production",
                      deadline=datetime(2026, 1, 10), shoot_date=datetime(2026, 2, 1),
                      location="Client Office", team=["Vishal"], assets_required=["Tripod"]),
            make_item(id="h", content_id="CNT-008", status="briefing", deadline=datetime(2026, 1, 10)),
        ],
        projects=[make_project()],
    )

    now = datetime(2026, 1, 10, 12, 0, 0)  # deadline day for a, g, h
    monkeypatch.setattr(svc, "utc_now", lambda: now)

    result = await svc.ContentProductionService.content_overview(make_user(role=UserRole.ADMIN))

    assert result["metrics"]["due_today"] == 3  # a, g, h
    assert result["metrics"]["overdue"] == 0
    assert len(result["queues"]["due_today"]["items"]) == 3
    assert result["queues"]["due_today"]["count"] == result["metrics"]["due_today"]
    assert result["metrics"]["awaiting_internal_review"] == 1
    assert result["metrics"]["awaiting_client_approval"] == 1
    assert result["metrics"]["revision_required"] == 1
    assert result["metrics"]["ready_to_publish"] == 1
    assert result["metrics"]["in_production"] == 3  # a, g, h
    assert result["metrics"]["total"] == 8

    # Every queue row carries the backend next action
    for row in result["queues"]["due_today"]["items"]:
        assert row["next_action"]

    # Upcoming shoots use canonical production metadata (no new entity)
    assert len(result["upcoming_shoots"]) == 1
    shoot = result["upcoming_shoots"][0]
    assert shoot["shoot"]["location"] == "Client Office"
    assert shoot["shoot"]["team"] == ["Vishal"]
    assert shoot["shoot"]["assets_required"] == ["Tripod"]


@pytest.mark.asyncio
async def test_overdue_excludes_completed_and_published(monkeypatch):
    """deadline < now with status published/completed is historical, not overdue."""
    svc = _install_overview_env(
        monkeypatch,
        items=[
            make_item(id="hist", status="published", completed=True, deadline=datetime(2025, 6, 1)),
            make_item(id="ready", status="ready_to_publish", deadline=datetime(2025, 6, 1)),
            make_item(id="late", status="production", deadline=datetime(2025, 6, 1)),
        ],
        projects=[make_project()],
    )
    monkeypatch.setattr(svc, "utc_now", lambda: datetime(2026, 1, 10))

    result = await svc.ContentProductionService.content_overview(make_user(role=UserRole.ADMIN))
    assert result["metrics"]["overdue"] == 1  # only "late"
    assert result["queues"]["overdue"]["items"][0]["id"] == "late"


@pytest.mark.asyncio
async def test_production_workload_aggregates_real_assignments(monkeypatch):
    svc = _install_overview_env(
        monkeypatch,
        items=[
            make_item(id="w1", status="production", assignee_id="priya", assignee_name="Priya",
                      deadline=datetime(2026, 1, 10)),
            make_item(id="w2", status="production", assignee_id="priya", assignee_name="Priya"),
            make_item(id="w3", status="revision_required", assignee_id="priya", assignee_name="Priya"),
            make_item(id="w4", status="production", deadline=datetime(2025, 1, 1),
                      assignee_id="priya", assignee_name="Priya"),
            make_item(id="w5", status="internal_review", assignee_id="vishal", assignee_name="Vishal"),
            make_item(id="w6", status="idea", assignee_id=None, owner_id=None),
        ],
        projects=[make_project()],
    )
    monkeypatch.setattr(svc, "utc_now", lambda: datetime(2026, 1, 10, 12, 0, 0))

    result = await svc.ContentProductionService.content_overview(make_user(role=UserRole.ADMIN))
    workload = {b["user_id"] or "__unassigned__": b for b in result["production_workload"]}

    priya = workload["priya"]
    assert priya["assigned"] == 4
    assert priya["due_today"] == 1
    assert priya["overdue"] == 1
    assert priya["in_production"] == 3
    assert priya["awaiting_revision"] == 1

    vishal = workload["vishal"]
    assert vishal["assigned"] == 1
    assert vishal["awaiting_review"] == 1

    assert workload["__unassigned__"]["assigned"] == 1


@pytest.mark.asyncio
async def test_overview_recommendations_use_deterministic_signals(monkeypatch):
    """Recommendations derive from deterministic Content data — no LLM calls."""
    svc = _install_overview_env(
        monkeypatch,
        items=[
            make_item(id="r1", status="script", cta=None),
            make_item(id="r2", status="client_review", client_review_at=datetime(2026, 1, 7)),
            make_item(id="r3", status="production",
                      internal_reviews=[object(), object(), object()]),
            make_item(id="r4", status="ready_to_publish", ready_to_publish_at=datetime(2026, 1, 7)),
        ],
        projects=[make_project()],
    )
    monkeypatch.setattr(svc, "utc_now", lambda: datetime(2026, 1, 10))

    result = await svc.ContentProductionService.content_overview(make_user(role=UserRole.ADMIN))
    types = {r["type"] for r in result["recommendations"]}
    assert "missing_cta" in types
    assert "client_review_stale" in types
    assert "revision_loop" in types
    assert "ready_to_publish_stale" in types
    for rec in result["recommendations"]:
        assert rec["item_ids"]


@pytest.mark.asyncio
async def test_overview_company_isolation(monkeypatch):
    """A company-b user without content.view never receives overview data —
    the capability/company check happens before any data leaves the service."""
    from app.services import content_production_service as svc

    async def forbidden(user, *caps):
        raise HTTPException(status_code=403, detail="Missing capability: content.view")

    monkeypatch.setattr(svc, "require_content_capability", forbidden)

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.content_overview(
            make_user(role=UserRole.EMPLOYEE, company_id="company-b", capability_grants=[])
        )
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_overview_empty_company_returns_canonical_shape(monkeypatch):
    svc = _install_overview_env(monkeypatch, items=[], projects=[])
    result = await svc.ContentProductionService.content_overview(make_user(role=UserRole.ADMIN))
    assert result["metrics"]["total"] == 0
    assert result["production_workload"] == []
    assert result["upcoming_shoots"] == []
    assert result["recommendations"] == []
    assert "due_today" in result["queues"]


# ── 10. Contextual AI: permission boundary + advisory-only behavior ───────

@pytest.mark.asyncio
async def test_ai_action_unknown_action_rejected(monkeypatch):
    from app.services import content_production_service as svc

    item = make_item(status="script")
    project = make_project()

    async def fake_get(item_id):
        return item

    async def fake_load_project(user, pid):
        return project

    async def fake_require_capability(user, *caps):
        return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    monkeypatch.setattr(svc, "require_content_capability", fake_require_capability)

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.ai_action(make_user(role=UserRole.ADMIN), "cnt-101", "delete_everything")
    assert excinfo.value.status_code == 400


@pytest.mark.asyncio
async def test_ai_action_stage_gating(monkeypatch):
    """AI actions are gated by lifecycle stage — client summaries only during
    client review/approved, never during idea stage."""
    from app.services import content_production_service as svc

    item = make_item(status="idea")
    project = make_project()

    async def fake_get(item_id):
        return item

    async def fake_load_project(user, pid):
        return project

    async def fake_require_capability(user, *caps):
        return None

    class FakeClient:
        @staticmethod
        async def get(*a, **k):
            return None

    class FakeService:
        @staticmethod
        async def get(*a, **k):
            return None

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    monkeypatch.setattr(svc, "require_content_capability", fake_require_capability)
    monkeypatch.setattr(svc, "Client", FakeClient)
    monkeypatch.setattr(svc, "ClientService", FakeService)

    with pytest.raises(HTTPException) as excinfo:
        await svc.ContentProductionService.ai_action(make_user(role=UserRole.ADMIN), "cnt-101", "client_summary")
    assert excinfo.value.status_code == 400
    assert "not available at stage" in str(excinfo.value.detail)


@pytest.mark.asyncio
async def test_ai_action_returns_suggestion_without_mutating_item(monkeypatch):
    """The AI path NEVER saves the item or changes status — it returns a
    suggestion bound to a target field. Humans write back via the normal
    update path, which lands in the canonical field."""
    from app.services import content_production_service as svc

    item = make_item(status="script", hook=None)
    project = make_project()
    saved = {"count": 0}

    async def fake_get(item_id):
        return item

    async def fake_load_project(user, pid):
        return project

    async def fake_require_capability(user, *caps):
        return None

    class FakeClient:
        @staticmethod
        async def get(*a, **k):
            return None

    class FakeService:
        @staticmethod
        async def get(*a, **k):
            return None

    class FakeProvider:
        async def generate(self, prompt, context, options):
            return SimpleNamespace(content="A killer hook line", model="fake-model",
                                   prompt_tokens=10, completion_tokens=5, total_tokens=15)

    class FakeLogger:
        calls = 0

        @staticmethod
        async def log_interaction(**kwargs):
            FakeLogger.calls += 1

    async def fake_save():
        saved["count"] += 1

    monkeypatch.setattr(svc.ContentCalendarItem, "get", staticmethod(fake_get))
    monkeypatch.setattr(svc, "_load_project", staticmethod(fake_load_project))
    monkeypatch.setattr(svc, "require_content_capability", fake_require_capability)
    monkeypatch.setattr(svc, "Client", FakeClient)
    monkeypatch.setattr(svc, "ClientService", FakeService)

    import app.ai.logger as ai_logger_module
    monkeypatch.setattr(ai_logger_module, "AILogger", FakeLogger)

    import sys
    import types as _types
    groq_module = _types.ModuleType("app.ai.providers.groq")
    groq_module.GroqProvider = FakeProvider
    openai_module = _types.ModuleType("app.ai.providers.openai")
    openai_module.OpenAIProvider = FakeProvider
    monkeypatch.setitem(sys.modules, "app.ai.providers.groq", groq_module)
    monkeypatch.setitem(sys.modules, "app.ai.providers.openai", openai_module)

    import app.core.config as config_module
    monkeypatch.setattr(config_module.settings, "AI_PROVIDER", "groq", raising=False)
    monkeypatch.setattr(config_module.settings, "AI_MAX_TOKENS", 1000, raising=False)

    item.save = fake_save
    result = await svc.ContentProductionService.ai_action(make_user(role=UserRole.ADMIN), "cnt-101", "generate_hook")

    assert result["suggestion"] == "A killer hook line"
    assert result["target_field"] == "hook"
    assert result["status"] == "script"  # status unchanged
    assert item.status.value == "script"  # item untouched
    assert item.hook is None  # canonical field NOT written by AI
    assert saved["count"] == 0  # item never persisted by the AI path
    assert FakeLogger.calls == 1  # AI interaction audited

    # Human-controlled write-back through the normal update path
    await svc.ContentProductionService.update_item(
        make_user(role=UserRole.ADMIN), "cnt-101", {"hook": "A killer hook line"}
    )
    assert item.hook == "A killer hook line"


def test_ai_actions_have_target_fields_and_stage_maps():
    from app.services.content_production_service import AI_ACTIONS, AI_ACTION_STAGES

    assert "generate_script" in AI_ACTIONS
    assert AI_ACTIONS["generate_script"]["target_field"] == "script"
    assert AI_ACTIONS["generate_caption"]["target_field"] == "caption"
    assert AI_ACTIONS["suggest_cta"]["target_field"] == "cta"
    assert AI_ACTIONS["generate_hook"]["target_field"] == "hook"
    # Client summary is only meaningful during client review/approved
    assert set(AI_ACTIONS["client_summary"]["stages"]) <= {"client_review", "approved"}
    # Every action has a stage map entry
    assert set(AI_ACTION_STAGES.keys()) == set(AI_ACTIONS.keys())


def test_ai_context_includes_canonical_fields_only():
    """AI context is built from the item's own fields + references — never a
    copied client profile."""
    from app.services.content_production_service import build_ai_context

    item = make_item(status="production", objective="goal", cta="buy now",
                     hook="existing hook", script="scene one")
    context = build_ai_context(item, make_project())

    assert context["objective"] == "goal"
    assert context["existing_script"] == "scene one"
    assert context["existing_hook"] == "existing hook"
    assert context["existing_cta"] == "buy now"
    assert context["project_name"] == "September Social Media"
    assert "brief_missing_fields" in context
