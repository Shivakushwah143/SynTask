from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import sales_prospects
from app.models.user import UserRole

# Every Form parameter of update_prospect. Calling the endpoint directly in a
# test bypasses FastAPI's request parsing, so each param is explicitly set to
# None — exactly how FastAPI resolves an omitted form field in a real request.
PROSPECT_UPDATE_PARAMS = [
    "prospect_name", "company_name", "email", "country_code", "phone", "channel",
    "remark", "due_date", "due_time", "assigned_to", "category_id", "product_ids",
    "interest_level", "estimated_close_date", "reason_for_lost", "won_amount",
    "crm_company_id", "custom_fields", "source", "industry", "requirement", "budget",
    "timeline", "decision_maker", "location", "pain_points", "current_agency",
    "num_employees", "qualify_status", "discovery_outcome", "discovery_notes",
    "proposal_status", "negotiation_status", "negotiation_notes", "agreement_status",
    "next_action", "first_contact_at", "last_contacted_at", "next_follow_up_at",
    "agreement_expiry_date", "agreement_signed_at",
]


class FakeRequest:
    """Minimal Request stand-in exposing the multipart form keys the client sent."""

    def __init__(self, keys):
        self._keys = list(keys or [])

    async def form(self):
        return {key: "" for key in self._keys}


def _update_call(lead_id, **overrides):
    kwargs = {name: None for name in PROSPECT_UPDATE_PARAMS}
    kwargs.update(overrides)
    # Mirror the real multipart form: only params the client provided (explicit
    # non-None values, including empty strings) appear as submitted keys.
    form_keys = [key for key, value in kwargs.items() if value is not None]
    kwargs["request"] = FakeRequest(form_keys)
    return sales_prospects.update_prospect(lead_id, **kwargs)


@pytest.mark.asyncio
async def test_update_prospect_omits_absent_form_fields(monkeypatch):
    """PUT /sales/prospects/<id> must forward only the fields the client sent.

    Regression for the reported pipeline bug: the stage-transition dialog saves
    just the missing field (e.g. decision_maker), and the endpoint used to
    forward every Form parameter — None when omitted — which update_lead
    interpreted as "clear this field". Saving decision_maker silently wiped
    budget in the DB, the pipeline Value column then showed Rs 0, and the
    Qualify -> Discovery gate re-asked for the already-defined budget.
    """
    captured = {}

    class FakeEngine:
        @staticmethod
        async def update_lead(current_user, prospect_id, payload):
            captured["payload"] = payload
            return {"message": "Prospect updated successfully"}

    monkeypatch.setattr(sales_prospects, "LeadEngine", FakeEngine)

    result = await _update_call(
        "lead-1",
        decision_maker="Rahul Sharma",
        current_user=SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
    )

    assert result["message"] == "Prospect updated successfully"
    assert captured["payload"] == {"decision_maker": "Rahul Sharma"}
    # Absent form fields must never reach update_lead (or they would clear them).
    for key in ("budget", "won_amount", "phone", "qualify_status", "timeline", "company_name", "email", "product_ids", "custom_fields"):
        assert key not in captured["payload"]


@pytest.mark.asyncio
async def test_update_prospect_forwards_explicit_empty_string_clear(monkeypatch):
    """A field submitted as an explicit empty string still clears the stored value."""
    captured = {}

    class FakeEngine:
        @staticmethod
        async def update_lead(current_user, prospect_id, payload):
            captured["payload"] = payload
            return {"message": "Prospect updated successfully"}

    monkeypatch.setattr(sales_prospects, "LeadEngine", FakeEngine)

    await _update_call(
        "lead-1",
        decision_maker="Rahul Sharma",
        timeline="",
        current_user=SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
    )

    assert captured["payload"]["decision_maker"] == "Rahul Sharma"
    # An explicit empty string is a deliberate clear and passes through.
    assert captured["payload"]["timeline"] == ""
    # budget was not submitted -> treated as absent (preserved, never cleared).
    assert "budget" not in captured["payload"]


def test_update_prospect_http_partial_update_preserves_absent_fields(monkeypatch):
    """End-to-end PUT with only decision_maker must forward just that field.

    Exercises the real FastAPI form parsing (empty-string -> None resolution and
    request.form() key detection) that the direct-call tests can only simulate.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.dependencies import get_current_user

    captured = {}

    class FakeEngine:
        @staticmethod
        async def update_lead(current_user, prospect_id, payload):
            captured["payload"] = payload
            return {"message": "Prospect updated successfully"}

    monkeypatch.setattr(sales_prospects, "LeadEngine", FakeEngine)

    test_app = FastAPI()
    test_app.include_router(sales_prospects.router)
    test_app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="manager-1", company_id="company-1", role=UserRole.MANAGER
    )

    client = TestClient(test_app)
    response = client.put("/lead-1", data={"decision_maker": "Rahul Sharma"})

    assert response.status_code == 200
    assert response.json() == {"message": "Prospect updated successfully"}
    assert captured["payload"] == {"decision_maker": "Rahul Sharma"}
