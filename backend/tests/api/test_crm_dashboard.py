import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.services import crm_dashboard_service as service


def make_canvas(**overrides):
    """A minimal canonical sales canvas with every key the builders read."""
    canvas = {
        "prospects": [],
        "activities": [],
        "deals": [],
        "products": [],
        "contacts": [],
        "users": [],
        "contact_count": 0,
        "today_leads": 0,
        "follow_up_today": 0,
        "active_prospects": 0,
        "won_prospects": 0,
        "total_prospects": 0,
        "today_calls": 0,
        "today_meetings": 0,
        "follow_up_activities_today": 0,
        "proposals_pending": 0,
        "proposals_accepted_today": 0,
        "forecast_value": 0.0,
    }
    canvas.update(overrides)
    return canvas


@pytest.mark.asyncio
async def test_build_sales_dashboard_summary_aggregates_sales_data(monkeypatch):
    now = datetime.now()
    prospects = [
        {
            "_id": "prospect-1",
            "current_stage": "Discovery",
            "status": "active",
            "closed_date": None,
            "created_at": now - timedelta(days=8),
            "won_amount": None,
            "product_ids": ["product-1"],
            "assigned_to": "owner-1",
            "prospect_name": "Alpha Co",
            "company_name": "Alpha Co",
        },
        {
            "_id": "prospect-2",
            "current_stage": "Proposal",
            "status": "won",
            "closed_date": now - timedelta(days=2),
            "created_at": now - timedelta(days=10),
            "won_amount": 5000,
            "product_ids": ["product-2"],
            "assigned_to": "owner-1",
            "prospect_name": "Beta Co",
            "company_name": "Beta Co",
        },
    ]
    canvas = make_canvas(
        prospects=prospects,
        products=[
            {"_id": "product-1", "rate": 1200},
            {"_id": "product-2", "rate": 1800},
        ],
        contact_count=1,
        active_prospects=1,
        won_prospects=1,
        total_prospects=2,
    )

    async def fake_load_canvas(current_user):
        return canvas

    monkeypatch.setattr(service, "_load_sales_canvas", fake_load_canvas)

    user = SimpleNamespace(company_id="company-1", role=service.UserRole.ADMIN)
    summary = await service.build_sales_dashboard_summary(user)

    assert summary["summary"]["prospect_count"] == 2
    assert summary["summary"]["pipeline_value"] == 1200
    assert summary["summary"]["total_active_prospect_value"] == 1200
    assert summary["summary"]["contact_count"] == 1
    assert summary["spotlight"]["highest_amount"] == 5000
    assert summary["pipeline"]["stage_breakdown"][0]["count"] == 1
    assert len(summary["closed_vs_target"]["months"]) == 12


@pytest.mark.asyncio
async def test_build_sales_summary_pair_derives_both_contracts_from_one_canvas(monkeypatch):
    now = datetime.now()
    canvas = make_canvas(
        prospects=[
            {
                "_id": "prospect-1",
                "status": "won",
                "closed_date": now,
                "created_at": now - timedelta(days=3),
                "won_amount": 2000,
                "product_ids": [],
                "assigned_to": "owner-1",
                "created_by": None,
                "crm_company_id": None,
                "channel": None,
                "category_id": None,
                "company_name": None,
                "current_stage": "Won",
                "prospect_name": "Gamma Co",
            }
        ],
        deals=[{"_id": "deal-1", "lead_id": "prospect-1", "value": 2000.0, "stage": "Won", "updated_at": now, "expected_close_date": None}],
        total_prospects=1,
        won_prospects=1,
        active_prospects=0,
    )

    async def fake_load_canvas(current_user):
        return canvas

    monkeypatch.setattr(service, "_load_sales_canvas", fake_load_canvas)

    user = SimpleNamespace(company_id="company-1", role=service.UserRole.ADMIN)
    sales_summary, sales_analytics = await service.build_sales_summary_pair(user)

    assert sales_summary["summary"]["prospect_count"] == 1
    assert sales_analytics["kpis"]["total_deals"] == 1
    assert sales_analytics["revenue"]["total_revenue"] == 2000


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


@pytest.mark.asyncio
async def test_sales_analytics_leaderboard_resolves_object_id_owner_names(monkeypatch):
    now = datetime.now()
    owner_id = ObjectId()
    canvas = make_canvas(
        prospects=[
            {
                "_id": "prospect-1",
                "current_stage": "Proposal",
                "status": "won",
                "closed_date": now,
                "created_at": now - timedelta(days=4),
                "won_amount": 7500,
                "product_ids": [],
                "assigned_to": str(owner_id),
                "created_by": None,
                "prospect_name": "Delta Co",
                "crm_company_id": None,
                "channel": None,
                "category_id": None,
                "company_name": None,
            }
        ],
        users=[
            {
                "_id": owner_id,
                "first_name": "Asha",
                "last_name": "Mehta",
                "email": "asha@example.com",
            }
        ],
    )

    async def fake_load_canvas(current_user):
        return canvas

    monkeypatch.setattr(service, "_load_sales_canvas", fake_load_canvas)

    user = SimpleNamespace(company_id="company-1", role=service.UserRole.ADMIN)
    summary = await service.build_sales_analytics_summary(user)

    assert summary["leaderboards"][0]["salesperson"] == "Asha Mehta"


def test_canvas_cache_json_round_trips_datetimes_and_object_ids():
    now = datetime(2026, 9, 3, 10, 0, 0)
    owner_id = ObjectId()
    canvas = {
        "prospects": [{"_id": owner_id, "closed_date": now}],
        "deals": [],
        "contact_count": 3,
    }
    raw = json.dumps(canvas, default=service._canvas_json_default)
    loaded = json.loads(raw, object_hook=service._canvas_json_object_hook)

    assert loaded["prospects"][0]["_id"] == str(owner_id)
    assert loaded["prospects"][0]["closed_date"] == now
    assert loaded["contact_count"] == 3


def test_sales_canvas_cache_key_is_company_scoped():
    assert service._sales_canvas_cache_key("company-1") == "dashboard:data:company-1:canvas"
    assert service._sales_canvas_cache_key(None) == "dashboard:data:platform:canvas"