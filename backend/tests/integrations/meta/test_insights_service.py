from datetime import datetime, timezone

import httpx
import pytest


@pytest.mark.asyncio
async def test_graph_client_reads_paginated_insights_with_get_only():
    from app.integrations.meta.client import MetaGraphClient

    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "data": [{"campaign_id": "campaign-1"}],
                "paging": {"next": "https://graph.example/next", "cursors": {"after": "next-page"}},
            },
        )

    client = MetaGraphClient(
        access_token="token",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    try:
        page = await client.get_insights(
            ad_account_id="act_123", after="cursor-1", since="2026-07-01", until="2026-07-20"
        )
    finally:
        await client.aclose()

    assert page["data"] == [{"campaign_id": "campaign-1"}]
    assert page["next_cursor"] == "next-page"
    assert requests[0].method == "GET"
    assert requests[0].url.path.endswith("/act_123/insights")
    assert requests[0].url.params["after"] == "cursor-1"
    assert requests[0].url.params["time_range"] == '{"since":"2026-07-01","until":"2026-07-20"}'


@pytest.mark.asyncio
async def test_graph_client_classifies_rate_limit_without_provider_body_leakage():
    from app.integrations.meta.client import MetaGraphClient, MetaGraphRateLimitError

    client = MetaGraphClient(
        access_token="token",
        http_client=httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(429, json={"error": {"message": "token=secret"}})
            )
        ),
    )
    try:
        with pytest.raises(MetaGraphRateLimitError) as captured:
            await client.get_insights(ad_account_id="act_123")
    finally:
        await client.aclose()

    assert str(captured.value) == "Meta Graph rate limit reached"


@pytest.mark.asyncio
async def test_graph_client_terminates_pagination_when_after_cursor_has_no_next_link():
    from app.integrations.meta.client import MetaGraphClient

    client = MetaGraphClient(
        access_token="token",
        http_client=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={"data": []}))
        ),
    )
    try:
        page = await client.get_insights(ad_account_id="act_123", after="last-cursor")
    finally:
        await client.aclose()

    assert page["next_cursor"] is None


def test_normalize_insight_calculates_cpl_and_roas_only_with_nonzero_denominators():
    from app.integrations.meta.insights_service import normalize_insight

    insight = normalize_insight(
        company_id="company-1",
        ad_account_id="act_123",
        payload={
            "campaign_id": "campaign-1",
            "date_start": "2026-07-20",
            "date_stop": "2026-07-20",
            "spend": "25.5",
            "impressions": "120",
            "clicks": "10",
            "actions": [
                {"action_type": "lead", "value": "2"},
                {"action_type": "purchase", "value": "3"},
            ],
            "action_values": [{"action_type": "purchase", "value": "102"}],
        },
        fetched_at=datetime(2026, 7, 20, tzinfo=timezone.utc),
    )

    assert insight["company_id"] == "company-1"
    assert insight["leads"] == 2
    assert insight["conversions"] == 3
    assert insight["cpl"] == 12.75
    assert insight["roas"] == 4.0

    zero_denominator = normalize_insight(
        company_id="company-1",
        ad_account_id="act_123",
        payload={
            "campaign_id": "campaign-2",
            "date_start": "2026-07-20",
            "date_stop": "2026-07-20",
            "spend": "0",
        },
        fetched_at=datetime(2026, 7, 20, tzinfo=timezone.utc),
    )

    assert zero_denominator["cpl"] is None
    assert zero_denominator["roas"] is None


@pytest.mark.asyncio
async def test_upsert_snapshot_scopes_the_unique_lookup_to_company_id(monkeypatch):
    from app.integrations.meta.insights_service import upsert_insight_snapshot
    from app.integrations.meta.models import MetaMarketingInsight

    captured = {}

    class Query:
        async def update(self, *args, **kwargs):
            captured["update"] = (args, kwargs)

    def find_one(query):
        captured["query"] = query
        return Query()

    monkeypatch.setattr(MetaMarketingInsight, "find_one", find_one)

    await upsert_insight_snapshot(
        {
            "company_id": "company-1",
            "ad_account_id": "act_123",
            "campaign_id": "campaign-1",
            "adset_id": None,
            "ad_id": None,
            "date_start": datetime(2026, 7, 20, tzinfo=timezone.utc),
            "date_stop": datetime(2026, 7, 20, tzinfo=timezone.utc),
        }
    )

    assert captured["query"]["company_id"] == "company-1"
    assert captured["query"]["ad_account_id"] == "act_123"
    assert captured["query"]["campaign_id"] == "campaign-1"
    assert captured["update"][1]["upsert"] is True


@pytest.mark.asyncio
async def test_enabled_config_performs_real_tenant_scoped_lookup(monkeypatch):
    from app.integrations.meta.insights_service import MetaInsightsService
    from app.integrations.meta.models import MetaIntegrationSettings

    captured = {}

    async def find_one(query):
        captured["query"] = query
        return "config"

    monkeypatch.setattr(MetaIntegrationSettings, "find_one", find_one)

    assert await MetaInsightsService()._enabled_config("company-1") == "config"
    assert captured["query"] == {
        "company_id": "company-1",
        "enabled": True,
        "insights_sync_enabled": True,
    }


def test_sync_run_has_atomic_active_key_and_immutable_window_fields():
    from app.integrations.meta.models import MetaSyncRun

    for field in ("active_key", "window_since", "window_until", "next_dispatch_at", "dispatch_queued_at"):
        assert field in MetaSyncRun.model_fields
    assert any(
        index.document.get("key") == {"active_key": 1}
        and index.document.get("unique") is True
        and index.document.get("partialFilterExpression") == {"active_key": {"$type": "string"}}
        for index in MetaSyncRun.Settings.indexes
    )


def test_insights_run_migration_dry_run_is_additive():
    from pathlib import Path
    import os
    import subprocess
    import sys

    backend_dir = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        [sys.executable, "scripts/migrate_meta_insights_runs.py", "--dry-run"],
        cwd=backend_dir,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "active_key" in result.stdout


@pytest.mark.asyncio
async def test_sync_keeps_its_persisted_window_and_rejects_a_repeated_cursor(monkeypatch):
    from app.integrations.meta import insights_service

    class Config:
        system_user_token_encrypted = "encrypted"
        ad_account_id = "act_123"

    class Run:
        company_id = "company-1"
        cursor = None
        window_since = "2026-07-01"
        window_until = "2026-07-02"
        records_processed = 0
        saves = 0

        async def save(self):
            self.saves += 1

    class Client:
        calls = []

        def __init__(self, *, access_token):
            assert access_token == "token"

        async def get_insights(self, **kwargs):
            self.calls.append(kwargs)
            return {"data": [], "next_cursor": "repeated"}

        async def aclose(self):
            pass

    async def config(_company_id):
        return Config()

    monkeypatch.setattr(insights_service.MetaInsightsService, "_enabled_config", lambda _self, company_id: config(company_id))
    monkeypatch.setattr(insights_service.MetaIntegrationConfigService, "reveal_secret", lambda _value: "token")
    monkeypatch.setattr(insights_service, "MetaGraphClient", Client)

    with pytest.raises(insights_service.MetaInsightsConfigurationError, match="repeated"):
        await insights_service.MetaInsightsService().sync(Run())

    assert Client.calls[0]["since"] == "2026-07-01"
    assert Client.calls[0]["until"] == "2026-07-02"


@pytest.mark.asyncio
async def test_manual_sync_persists_an_enabled_tenant_run_before_enqueuing_only_its_id(monkeypatch):
    from app.integrations.meta import tasks

    class Config:
        enabled = True
        insights_sync_enabled = True
        ad_account_id = "act_123"

    class Run:
        id = "run-1"

        async def insert(self):
            order.append("insert")

    order = []
    delayed = []

    async def find_config(query):
        assert query == {
            "company_id": "company-1",
            "enabled": True,
            "insights_sync_enabled": True,
        }
        return Config()

    async def no_active_run(query):
        assert query["company_id"] == "company-1"
        return None

    class FakeRuns:
        find_one = staticmethod(no_active_run)

        def __new__(cls, **_kwargs):
            return Run()

    monkeypatch.setattr(tasks.MetaIntegrationSettings, "find_one", find_config)
    monkeypatch.setattr(tasks, "MetaSyncRun", FakeRuns)
    monkeypatch.setattr(tasks.process_meta_insights_sync_run, "delay", lambda run_id: delayed.append(run_id))
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    run = await tasks.create_and_enqueue_insights_sync_run(
        company_id="company-1", requested_by="admin-1"
    )

    assert run.id == "run-1"
    assert order == ["insert"]
    assert delayed == ["run-1"]


@pytest.mark.asyncio
async def test_scheduled_sync_enumerates_only_enabled_insights_tenants_and_never_passes_tokens(monkeypatch):
    from app.integrations.meta import tasks

    class Config:
        def __init__(self, company_id):
            self.company_id = company_id

    captured = {}
    enqueued = []

    class Query:
        async def to_list(self):
            return [Config("company-1"), Config("company-2")]

    def find(query):
        captured["query"] = query
        return Query()

    async def create_and_enqueue(*, company_id, requested_by):
        enqueued.append((company_id, requested_by))

    monkeypatch.setattr(tasks.MetaIntegrationSettings, "find", find)
    monkeypatch.setattr(tasks, "create_and_enqueue_insights_sync_run", create_and_enqueue)
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    assert await tasks.schedule_meta_insights_sync_runs() == 2
    assert captured["query"] == {"enabled": True, "insights_sync_enabled": True}
    assert enqueued == [("company-1", "scheduler"), ("company-2", "scheduler")]


@pytest.mark.asyncio
async def test_sync_now_resolves_tenant_from_role_enum_and_enqueues_no_secret(monkeypatch):
    from app.integrations.meta import api

    class Role:
        value = "super_admin"

    class User:
        role = Role()
        company_id = None
        id = "admin-1"

    class Run:
        id = "run-1"

    captured = {}

    async def create_and_enqueue(*, company_id, requested_by):
        captured["company_id"] = company_id
        captured["requested_by"] = requested_by
        return Run()

    monkeypatch.setattr(api, "create_and_enqueue_insights_sync_run", create_and_enqueue)

    assert await api.sync_meta_insights(company_id="company-1", current_user=User()) == {
        "status": "queued",
        "run_id": "run-1",
    }
    assert captured == {"company_id": "company-1", "requested_by": "admin-1"}


@pytest.mark.asyncio
async def test_claim_allows_broker_queued_dispatch_but_refuses_an_early_retry(monkeypatch):
    from app.integrations.meta import tasks

    captured = {}

    class Query:
        async def update(self, *args, **kwargs):
            captured["update"] = (args, kwargs)
            return None

    def find_one(query):
        captured["query"] = query
        return Query()

    monkeypatch.setattr(tasks.MetaSyncRun, "find_one", find_one)
    await tasks.claim_meta_insights_sync_run("507f1f77bcf86cd799439011", "company-1")

    claim_filter = captured["query"]
    assert claim_filter["company_id"] == "company-1"
    assert claim_filter["$or"][0] == {"dispatch_queued_at": {"$ne": None}}
    assert claim_filter["$or"][1]["dispatch_queued_at"] is None
    assert claim_filter["$or"][1]["next_dispatch_at"]["$lte"] <= datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_initial_delay_failure_uses_conditional_restore_and_cannot_overwrite_claim(monkeypatch):
    from app.integrations.meta import tasks

    captured = {}

    class Query:
        async def update(self, *args, **kwargs):
            captured["update"] = (args, kwargs)
            return None

    def find_one(query):
        captured["query"] = query
        return Query()

    monkeypatch.setattr(tasks.MetaSyncRun, "find_one", find_one)
    observed_queued_at = datetime(2026, 7, 20, tzinfo=timezone.utc)
    await tasks.restore_initial_meta_insights_dispatch(
        "507f1f77bcf86cd799439011", "company-1", "company-1:insights", observed_queued_at, observed_queued_at
    )

    assert captured["query"] == {
        "_id": tasks.PydanticObjectId("507f1f77bcf86cd799439011"),
        "company_id": "company-1",
        "sync_type": "insights",
        "status": "pending",
        "active_key": "company-1:insights",
        "dispatch_queued_at": observed_queued_at,
    }
    update = captured["update"][0][0]["$set"]
    assert update["dispatch_queued_at"] is None
    assert update["next_dispatch_at"] > observed_queued_at
