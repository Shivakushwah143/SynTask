from types import SimpleNamespace

import pytest

from app.crm import application


def test_build_crm_workspace_manifest_returns_workspace_metadata():
    user = SimpleNamespace(role=application.UserRole.ADMIN)

    manifest = application.build_crm_workspace_manifest(user)

    assert manifest["workspace"]["key"] == "crm"
    assert manifest["navigation"][0]["path"] == "/crm/dashboard"
    assert manifest["feature_flags"]["dashboard"] is True
    assert manifest["capabilities"]["can_manage_settings"] is True


@pytest.mark.asyncio
async def test_build_crm_dashboard_composes_sales_summary(monkeypatch):
    async def fake_sales_summary(current_user):
        return {"summary": {"prospect_count": 3}, "pipeline": {"stage_breakdown": []}, "meta": {}}

    monkeypatch.setattr(application, "build_sales_dashboard_summary", fake_sales_summary)

    user = SimpleNamespace(role=application.UserRole.ADMIN)
    dashboard = await application.build_crm_dashboard(user)

    assert dashboard["workspace"]["key"] == "crm"
    assert dashboard["sales"]["summary"]["prospect_count"] == 3
    assert dashboard["permissions"]["can_manage_settings"] is True
