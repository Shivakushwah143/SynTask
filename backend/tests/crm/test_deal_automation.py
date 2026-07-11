from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest

import app.crm.deal_automation as deal_automation


@pytest.mark.asyncio
async def test_resolve_project_reuses_existing_project_without_nameerror(monkeypatch):
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        category_id="seo",
        source="manual",
        relationship_type=None,
        assigned_to="user-1",
    )
    current_user = SimpleNamespace(id="user-2", company_id="company-1")
    client = SimpleNamespace(id="client-1", name="Client One")
    existing_project = SimpleNamespace(
        id="project-1",
        company_id="company-1",
        deleted=False,
        lead_id="lead-1",
        folders=None,
        milestones=None,
        board_columns=None,
        team_member_ids=[],
        assigned_to=None,
        updated_at=None,
        save=lambda: None,
    )

    async def fake_find_one(query):
        return existing_project

    async def fake_save():
        existing_project.saved = True

    existing_project.save = fake_save

    monkeypatch.setattr(deal_automation.Project, "find_one", fake_find_one)

    project = await deal_automation._resolve_project(current_user, lead, client, None)

    assert project is existing_project
    assert project.folders is not None
    assert project.milestones is not None
    assert project.board_columns is not None
