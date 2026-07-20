"""Tenant-safe Meta Lead Ads ingestion through the CRM lead boundary."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Callable, Dict, Optional

from beanie import PydanticObjectId
from bson.errors import InvalidId
from app.crm.lead_engine import LeadEngine
from app.integrations.meta.client import MetaGraphClient
from app.integrations.meta.config_service import MetaIntegrationConfigService
from app.integrations.meta.models import MetaIntegrationSettings
from app.integrations.meta.transformers import transform_meta_lead
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole, UserStatus
from app.timeline.publisher import publish_crm_timeline_event


class MetaLeadQuarantined(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class MetaLeadService:
    def __init__(self, *, client_factory: Callable[..., MetaGraphClient] = MetaGraphClient) -> None:
        self._client_factory = client_factory

    async def process_event(self, event: Any) -> Dict[str, str]:
        value = ((getattr(event, "payload", {}) or {}).get("change") or {}).get("value") or {}
        lead_id = str(value.get("leadgen_id") or "")
        if not lead_id:
            raise MetaLeadQuarantined("missing_lead_id")
        settings = await self._load_settings(str(event.company_id))
        owner = await self._validate_owner(settings, str(event.company_id))
        graph_lead = await self._fetch_lead(settings, lead_id)
        mapped = transform_meta_lead(graph_lead)
        mapped["meta_form_id"] = mapped.get("meta_form_id") or value.get("form_id")
        mapped["meta_attribution"] = dict(mapped.get("meta_attribution") or {})
        mapped["meta_attribution"]["form_id"] = mapped["meta_form_id"]
        for field in ("country_code", "phone", "first_name", "last_name"):
            if not mapped.get(field):
                raise MetaLeadQuarantined(f"missing_{field}")
        existing = await self._find_existing(str(event.company_id), mapped)
        if existing:
            await self._link_existing(existing, mapped, str(event.correlation_id))
            return {"outcome": "linked", "lead_id": str(existing.id)}
        lead = await self._create_with_lead_engine(str(event.company_id), owner, mapped, str(event.correlation_id))
        return {"outcome": "created", "lead_id": str(lead.id)}

    async def _load_settings(self, company_id: str) -> MetaIntegrationSettings:
        settings = await MetaIntegrationSettings.find_one({
            "company_id": company_id, "enabled": True, "lead_sync_enabled": True,
        })
        if not settings:
            raise MetaLeadQuarantined("lead_sync_disabled")
        return settings

    async def _validate_owner(self, settings: MetaIntegrationSettings, company_id: str) -> User:
        owner_id = getattr(settings, "default_lead_owner_id", None)
        if not owner_id:
            raise MetaLeadQuarantined("invalid_default_owner")
        try:
            owner_object_id = PydanticObjectId(str(owner_id))
        except (TypeError, ValueError, InvalidId):
            raise MetaLeadQuarantined("invalid_default_owner") from None
        owner = await User.find_one({
            "_id": owner_object_id, "company_id": company_id, "status": UserStatus.ACTIVE.value,
        })
        if not owner or str(getattr(owner, "company_id", "")) != company_id:
            raise MetaLeadQuarantined("invalid_default_owner")
        return owner

    async def _fetch_lead(self, settings: MetaIntegrationSettings, lead_id: str) -> Dict[str, Any]:
        token = MetaIntegrationConfigService.reveal_secret(settings.page_access_token_encrypted)
        if not token:
            raise MetaLeadQuarantined("missing_page_access_token")
        client = self._client_factory(access_token=token)
        try:
            return await client.get_lead(lead_id)
        finally:
            close = getattr(client, "aclose", None)
            if close:
                await close()

    async def _find_existing(self, company_id: str, mapped: Dict[str, Any]) -> Optional[SalesProspect]:
        lead_id = mapped.get("meta_lead_id")
        if lead_id:
            existing = await SalesProspect.find_one({
                "company_id": company_id, "deleted": False, "meta_lead_id": lead_id,
            })
            if existing:
                return existing
        phone = mapped.get("phone")
        if phone:
            existing = await SalesProspect.find_one({
                "company_id": company_id, "deleted": False,
                "country_code": mapped.get("country_code"), "phone": phone,
            })
            if existing:
                return existing
        email = mapped.get("email")
        if email:
            return await SalesProspect.find_one({
                "company_id": company_id, "deleted": False, "email": email.lower(),
            })
        return None

    async def _link_existing(self, lead: SalesProspect, mapped: Dict[str, Any], correlation_id: str) -> None:
        for field in (
            "meta_lead_id", "meta_campaign_id", "meta_adset_id", "meta_ad_id", "meta_form_id",
            "meta_created_time", "meta_consent",
        ):
            if mapped.get(field) is not None:
                setattr(lead, field, mapped[field])
        lead.meta_attribution = dict(mapped.get("meta_attribution") or {})
        lead.source = "meta_lead_ads"
        await lead.save()
        await self._publish_meta_timeline(lead, "MetaAttributionUpdated", correlation_id)

    async def _create_with_lead_engine(self, company_id: str, owner: User, payload: Dict[str, Any], correlation_id: str) -> SalesProspect:
        system_actor = SimpleNamespace(
            id=str(owner.id), company_id=company_id, role=UserRole.ADMIN,
            department_id=getattr(owner, "department_id", None),
        )
        result = await LeadEngine.create_lead(
            system_actor,
            {**payload, "company_id": company_id, "assigned_to": str(owner.id)},
            source="meta_lead_ads",
        )
        lead = await SalesProspect.find_one({"_id": result["id"], "company_id": company_id, "deleted": False})
        if not lead:
            raise MetaLeadQuarantined("crm_write_failed")
        await self._publish_meta_timeline(lead, "LeadReceivedFromMeta", correlation_id)
        return lead

    async def _publish_meta_timeline(self, lead: SalesProspect, event_name: str, correlation_id: str) -> None:
        await publish_crm_timeline_event(
            event_name=event_name,
            aggregate_type="sales_prospect",
            aggregate_id=str(lead.id),
            company_id=str(lead.company_id),
            actor_id=None,
            correlation_id=correlation_id,
            payload={"lead_id": str(lead.id), "source": "meta_lead_ads", "meta_lead_id": getattr(lead, "meta_lead_id", None)},
            metadata={"surface": "crm", "workflow": "meta_lead_ads"},
        )
