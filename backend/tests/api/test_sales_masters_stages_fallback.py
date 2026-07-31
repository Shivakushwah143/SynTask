"""Regression tests: GET /sales/masters/stages falls back to the fixed CRM
pipeline catalog when a company has no configured stages, so stage selectors
(lead sidebar, bulk update, pipeline create, settings) are never empty.
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.deps import PaginationParams
from app.api.v1.endpoints import sales_masters
from app.models.user import UserRole

EXPECTED_ORDER = [
    ("New", "new"),
    ("Contacted", "contacted"),
    ("Qualified", "qualified"),
    ("Discovery", "discovery"),
    ("Proposal", "proposal"),
    ("Negotiation", "negotiation"),
    ("Won", "won"),
    ("Lost", "lost"),
]


class _DummySalesStage:
    """Plain stand-in for the Beanie model so class-attribute access in the
    endpoint (SalesStage.order) works without a live DB/event loop."""
    order = "order"


def admin():
    return SimpleNamespace(id="admin-1", role=UserRole.ADMIN, company_id="company-1")


def _patch_stages(monkeypatch, stages):
    find = MagicMock()
    find.return_value.count = AsyncMock(return_value=len(stages))
    find.return_value.sort.return_value.skip.return_value.limit.return_value.to_list = AsyncMock(return_value=stages)
    _DummySalesStage.find = find
    monkeypatch.setattr(sales_masters, "SalesStage", _DummySalesStage)
    return find


def test_list_stages_falls_back_to_fixed_catalog_when_collection_empty(monkeypatch):
    _patch_stages(monkeypatch, [])

    result = asyncio.run(
        sales_masters.list_stages(
            pagination=PaginationParams(skip=0, limit=50),
            current_user=admin(),
        )
    )

    assert result["total"] == 8
    assert [(item["name"], item["key"]) for item in result["items"]] == EXPECTED_ORDER
    assert all(item["source"] == "fixed" for item in result["items"])
    assert all(item["id"] is None for item in result["items"])
    assert all(not item["is_terminal"] for item in result["items"][:-2])
    assert all(item["is_terminal"] for item in result["items"][-2:])


def test_list_stages_fallback_respects_search(monkeypatch):
    _patch_stages(monkeypatch, [])

    result = asyncio.run(
        sales_masters.list_stages(
            search="con",
            pagination=PaginationParams(skip=0, limit=50),
            current_user=admin(),
        )
    )

    names = [item["name"] for item in result["items"]]
    assert "Contacted" in names
    assert "New" not in names


def test_list_stages_returns_configured_stages_when_present(monkeypatch):
    _patch_stages(
        monkeypatch,
        [
            SimpleNamespace(
                id="stage-1", name="Custom A", order=0, is_default=True,
                key=None, description=None, category=None, is_terminal=False,
            ),
            SimpleNamespace(
                id="stage-2", name="Custom B", order=1, is_default=False,
                key=None, description=None, category=None, is_terminal=False,
            ),
        ],
    )

    result = asyncio.run(
        sales_masters.list_stages(
            pagination=PaginationParams(skip=0, limit=50),
            current_user=admin(),
        )
    )

    assert result["total"] == 2
    assert [item["name"] for item in result["items"]] == ["Custom A", "Custom B"]
    assert all(item["source"] == "custom" for item in result["items"])
    assert [item["id"] for item in result["items"]] == ["stage-1", "stage-2"]
