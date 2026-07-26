from types import SimpleNamespace

import pytest


class FakeLead:
    def __init__(self, **values):
        self.id = values.pop("id", "crm-lead-1")
        self.__dict__.update(values)
        self.saved = 0

    async def save(self):
        self.saved += 1


def _settings(company_id="tenant-1", owner_id="owner-1"):
    return SimpleNamespace(
        company_id=company_id,
        enabled=True,
        lead_sync_enabled=True,
        default_lead_owner_id=owner_id,
        page_access_token_encrypted="encrypted-token",
    )


def _event(company_id="tenant-1", lead_id="meta-lead-1"):
    return SimpleNamespace(
        company_id=company_id,
        correlation_id="corr-1",
        payload={"change": {"value": {"leadgen_id": lead_id, "form_id": "form-1"}}},
    )


@pytest.mark.asyncio
async def test_meta_id_replay_links_the_existing_tenant_lead_without_creating(monkeypatch):
    from app.integrations.meta import lead_service

    existing = FakeLead(company_id="tenant-1", meta_lead_id="meta-lead-1", meta_attribution={})
    service = lead_service.MetaLeadService(client_factory=lambda **_: SimpleNamespace(get_lead=lambda _: None))
    monkeypatch.setattr(service, "_load_settings", lambda _: _async(_settings()))
    monkeypatch.setattr(service, "_validate_owner", lambda *_: _async(SimpleNamespace(id="owner-1")))
    monkeypatch.setattr(service, "_fetch_lead", lambda *_: _async({"id": "meta-lead-1", "field_data": []}))
    monkeypatch.setattr(service, "_find_existing", lambda *_: _async(existing))
    monkeypatch.setattr(lead_service, "transform_meta_lead", lambda _: {"meta_lead_id": "meta-lead-1", "country_code": "+1", "phone": "5551234", "first_name": "Ada", "last_name": "Lovelace", "meta_attribution": {"form_id": "form-1"}})
    created = []
    monkeypatch.setattr(service, "_create_with_lead_engine", lambda *_: created.append(True))

    result = await service.process_event(_event())

    assert result["outcome"] == "linked"
    assert existing.saved == 1
    assert created == []


@pytest.mark.asyncio
async def test_existing_phone_lead_is_linked_using_an_explicit_tenant_query(monkeypatch):
    from app.integrations.meta import lead_service

    existing = FakeLead(company_id="tenant-1", meta_lead_id=None, meta_attribution={})
    service = lead_service.MetaLeadService()
    captured = []
    monkeypatch.setattr(service, "_load_settings", lambda _: _async(_settings()))
    monkeypatch.setattr(service, "_validate_owner", lambda *_: _async(SimpleNamespace(id="owner-1")))
    monkeypatch.setattr(service, "_fetch_lead", lambda *_: _async({"id": "meta-lead-1", "field_data": []}))
    monkeypatch.setattr(lead_service, "transform_meta_lead", lambda _: {"meta_lead_id": "meta-lead-1", "country_code": "+1", "phone": "5551234", "first_name": "Ada", "last_name": "Lovelace", "meta_attribution": {}})

    async def find_one(query):
        captured.append(query)
        if "meta_lead_id" in query:
            return None
        return existing

    monkeypatch.setattr(lead_service.SalesProspect, "find_one", find_one)
    monkeypatch.setattr(service, "_create_with_lead_engine", lambda *_: (_ for _ in ()).throw(AssertionError("must link")))

    result = await service.process_event(_event())

    assert result["outcome"] == "linked"
    assert all(query["company_id"] == "tenant-1" for query in captured)
    assert existing.meta_lead_id == "meta-lead-1"


@pytest.mark.asyncio
async def test_new_lead_is_created_through_the_lead_engine_adapter(monkeypatch):
    from app.integrations.meta import lead_service

    service = lead_service.MetaLeadService()
    monkeypatch.setattr(service, "_load_settings", lambda _: _async(_settings()))
    monkeypatch.setattr(service, "_validate_owner", lambda *_: _async(SimpleNamespace(id="owner-1")))
    monkeypatch.setattr(service, "_fetch_lead", lambda *_: _async({"id": "meta-lead-1", "field_data": []}))
    monkeypatch.setattr(service, "_find_existing", lambda *_: _async(None))
    mapped = {"meta_lead_id": "meta-lead-1", "country_code": "+1", "phone": "5551234", "first_name": "Ada", "last_name": "Lovelace", "meta_attribution": {}}
    monkeypatch.setattr(lead_service, "transform_meta_lead", lambda _: mapped)
    created = FakeLead(id="crm-lead-1", company_id="tenant-1")
    monkeypatch.setattr(service, "_create_with_lead_engine", lambda *_: _async(created))

    result = await service.process_event(_event())

    assert result == {"outcome": "created", "lead_id": "crm-lead-1"}


@pytest.mark.asyncio
async def test_missing_phone_quarantines_without_creating_a_crm_lead(monkeypatch):
    from app.integrations.meta import lead_service

    service = lead_service.MetaLeadService()
    monkeypatch.setattr(service, "_load_settings", lambda _: _async(_settings()))
    monkeypatch.setattr(service, "_validate_owner", lambda *_: _async(SimpleNamespace(id="owner-1")))
    monkeypatch.setattr(service, "_fetch_lead", lambda *_: _async({"id": "meta-lead-1", "field_data": []}))
    monkeypatch.setattr(lead_service, "transform_meta_lead", lambda _: {"meta_lead_id": "meta-lead-1", "country_code": "+1", "phone": None, "first_name": "Ada", "last_name": "Lovelace"})

    with pytest.raises(lead_service.MetaLeadQuarantined) as exc:
        await service.process_event(_event())

    assert exc.value.code == "missing_phone"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "code"),
    [
        ("country_code", "missing_country_code"),
        ("first_name", "missing_first_name"),
        ("last_name", "missing_last_name"),
    ],
)
async def test_missing_required_crm_fields_quarantine_before_any_crm_write(monkeypatch, field, code):
    from app.integrations.meta import lead_service

    service = lead_service.MetaLeadService()
    monkeypatch.setattr(service, "_load_settings", lambda _: _async(_settings()))
    monkeypatch.setattr(service, "_validate_owner", lambda *_: _async(SimpleNamespace(id="owner-1")))
    monkeypatch.setattr(service, "_fetch_lead", lambda *_: _async({"id": "meta-lead-1", "field_data": []}))
    mapped = {
        "meta_lead_id": "meta-lead-1",
        "meta_attribution": {},
        "country_code": "+1",
        "phone": "5551234",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "prospect_name": "Ada Lovelace",
    }
    mapped[field] = None
    monkeypatch.setattr(lead_service, "transform_meta_lead", lambda _: mapped)
    monkeypatch.setattr(service, "_find_existing", lambda *_: (_ for _ in ()).throw(AssertionError("must quarantine first")))
    monkeypatch.setattr(service, "_create_with_lead_engine", lambda *_: (_ for _ in ()).throw(AssertionError("must not create")))

    with pytest.raises(lead_service.MetaLeadQuarantined) as exc:
        await service.process_event(_event())

    assert exc.value.code == code


@pytest.mark.asyncio
async def test_invalid_or_cross_tenant_default_owner_is_rejected(monkeypatch):
    from app.integrations.meta import lead_service

    service = lead_service.MetaLeadService()
    monkeypatch.setattr(service, "_load_settings", lambda _: _async(_settings()))
    monkeypatch.setattr(lead_service.User, "find_one", lambda query: _async(None))

    with pytest.raises(lead_service.MetaLeadQuarantined) as exc:
        await service.process_event(_event())

    assert exc.value.code == "invalid_default_owner"


def _async(value):
    async def result():
        return value
    return result()
