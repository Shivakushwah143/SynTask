"""Regression tests for the /crm/leads serializer.

Ensures deal value (won_amount) and company_name are returned so the CRM leads
list shows real values instead of zeros.
"""
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints.crm import crm_leads
from app.models.user import UserRole


class FakeProspectQuery:
    def __init__(self, prospects):
        self._prospects = prospects

    async def count(self):
        return len(self._prospects)

    def skip(self, value):
        return self

    def limit(self, value):
        return self

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self):
        return self._prospects


class FakeProspect:
    def __init__(self, **kwargs):
        self.id = "lead-1"
        self.status = SimpleNamespace(value="active")
        self.interest_level = SimpleNamespace(value="warm")
        self.created_at = None
        self.updated_at = None
        self.due_date = None
        self.estimated_close_date = None
        self.tag = []
        self.custom_fields = {}
        for key, value in kwargs.items():
            setattr(self, key, value)


@pytest.mark.asyncio
async def test_crm_leads_serializer_includes_won_amount_and_company_name(monkeypatch):
    prospect = FakeProspect(
        prospect_name="John Doe",
        company_name="Acme Corp",
        phone="9999999999",
        country_code="+91",
        email="john@acme.com",
        assigned_to="user-1",
        assigned_by="user-2",
        category_id=None,
        product_ids=[],
        crm_company_id=None,
        current_stage="New",
        won_amount=555222.0,
        reason_for_lost=None,
        owner_name=None,
        remark=None,
    )

    def fake_find(query):
        assert query["deleted"] is False
        assert query["company_id"] == "company-1"
        return FakeProspectQuery([prospect])

    # The endpoint uses `-SalesProspect.created_at` in the sort expression, which
    # triggers pydantic class-attribute access, so swap the whole reference.
    fake_prospect_model = SimpleNamespace(
        find=fake_find,
        created_at=0,
    )
    monkeypatch.setattr("app.api.v1.endpoints.crm.SalesProspect", fake_prospect_model)

    current_user = SimpleNamespace(company_id="company-1", role=UserRole.ADMIN)
    pagination = SimpleNamespace(skip=0, limit=50)
    response = await crm_leads(current_user=current_user, pagination=pagination)

    assert response["total"] == 1
    serialized = response["prospects"][0]
    assert serialized["won_amount"] == 555222.0
    assert serialized["company_name"] == "Acme Corp"
    assert serialized["prospect_name"] == "John Doe"
