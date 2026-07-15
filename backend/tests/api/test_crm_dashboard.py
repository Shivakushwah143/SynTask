from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services import crm_dashboard_service as service


class FakeQuery:
    def __init__(self, items):
        self._items = items

    async def to_list(self):
        return self._items

    async def count(self):
        return len(self._items)


@pytest.mark.asyncio
async def test_build_sales_dashboard_summary_aggregates_sales_data(monkeypatch):
    now = datetime.now()
    active_prospect = SimpleNamespace(
        id="prospect-1",
        current_stage="Discovery",
        status=service.ProspectStatus.ACTIVE,
        closed_date=None,
        created_at=now - timedelta(days=8),
        won_amount=None,
        product_ids=["product-1"],
        assigned_to="owner-1",
        prospect_name="Alpha Co",
    )
    won_prospect = SimpleNamespace(
        id="prospect-2",
        current_stage="Proposal",
        status=service.ProspectStatus.WON,
        closed_date=now - timedelta(days=2),
        created_at=now - timedelta(days=10),
        won_amount=5000,
        product_ids=["product-2"],
        assigned_to="owner-1",
        prospect_name="Beta Co",
    )
    products = [
        SimpleNamespace(id="product-1", rate=1200),
        SimpleNamespace(id="product-2", rate=1800),
    ]

    monkeypatch.setattr(service.SalesProspect, "find", lambda *args, **kwargs: FakeQuery([active_prospect, won_prospect]))
    monkeypatch.setattr(service.SalesContact, "find", lambda *args, **kwargs: FakeQuery([SimpleNamespace(id="contact-1")]))
    monkeypatch.setattr(service.SalesProduct, "find", lambda *args, **kwargs: FakeQuery(products))

    async def fake_user_get(*args, **kwargs):
        return None

    monkeypatch.setattr(service.User, "get", fake_user_get)

    user = SimpleNamespace(company_id="company-1", role=service.UserRole.ADMIN)
    summary = await service.build_sales_dashboard_summary(user)

    assert summary["summary"]["prospect_count"] == 2
    assert summary["summary"]["pipeline_value"] == 1200
    assert summary["summary"]["total_active_prospect_value"] == 1200
    assert summary["spotlight"]["highest_amount"] == 5000
    assert summary["pipeline"]["stage_breakdown"][0]["count"] == 1
    assert len(summary["closed_vs_target"]["months"]) == 12


@pytest.mark.asyncio
async def test_build_crm_dashboard_payload_includes_workspace_metadata(monkeypatch):
    async def fake_summary(current_user):
        return {
            "summary": {"prospect_count": 0, "pipeline_value": 0, "total_active_prospect_value": 0},
            "pipeline": {"stage_breakdown": []},
            "closed_vs_target": {"months": [], "target": [], "closed": []},
            "spotlight": {},
            "meta": {"currency": "INR"},
        }

    monkeypatch.setattr(service, "build_sales_dashboard_summary", fake_summary)

    payload = await service.build_crm_dashboard_payload(SimpleNamespace(role=service.UserRole.ADMIN))

    assert payload["workspace"]["key"] == "crm"
    assert payload["workspace"]["feature_flags"]["dashboard"] is True
    assert payload["navigation"][0]["path"] == "/crm/dashboard"
    assert payload["sales"]["summary"]["prospect_count"] == 0

