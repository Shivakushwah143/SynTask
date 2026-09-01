from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.crm.models import SalesProspect
from app.models.client import Client
from app.core.clock import utc_now
from app.models.crm_company import CRMCompany
from app.models.sales_contact import SalesContact


@dataclass
class ClientCompanyResolution:
    crm_company: Optional[CRMCompany]
    status: str
    reason: str


def _exact_regex(value: str) -> dict:
    return {"$regex": f"^{re.escape(value)}$", "$options": "i"}


async def resolve_crm_company_for_lead(lead: SalesProspect) -> ClientCompanyResolution:
    tenant_id = str(getattr(lead, "company_id", "") or "")
    crm_company_id = str(getattr(lead, "crm_company_id", "") or "").strip()
    if crm_company_id:
        company = await CRMCompany.get(crm_company_id)
        if company and not company.deleted and company.company_id == tenant_id:
            return ClientCompanyResolution(company, "resolved", "lead.crm_company_id")
        return ClientCompanyResolution(None, "unresolved", "lead.crm_company_id_invalid_or_cross_tenant")

    contact_id = str(getattr(lead, "contact_id", "") or "").strip()
    if contact_id:
        contact = await SalesContact.get(contact_id)
        if contact and not contact.deleted and contact.company_id == tenant_id and contact.crm_company_id:
            company = await CRMCompany.get(str(contact.crm_company_id))
            if company and not company.deleted and company.company_id == tenant_id:
                return ClientCompanyResolution(company, "resolved", "lead.contact.crm_company_id")

    company_name = str(getattr(lead, "company_name", "") or "").strip()
    if company_name:
        matches = await CRMCompany.find(
            {"company_id": tenant_id, "deleted": False, "name": _exact_regex(company_name)}
        ).to_list()
        if len(matches) == 1:
            return ClientCompanyResolution(matches[0], "resolved", "lead.company_name_exact")
        if len(matches) > 1:
            return ClientCompanyResolution(None, "ambiguous", "lead.company_name_exact_multiple")

    return ClientCompanyResolution(None, "unresolved", "no_strong_lead_company_match")


async def ensure_crm_company_for_won_lead(lead: SalesProspect, actor_id: str | None = None) -> ClientCompanyResolution:
    resolution = await resolve_crm_company_for_lead(lead)
    if resolution.crm_company:
        canonical_id = str(resolution.crm_company.id)
        if getattr(lead, "crm_company_id", None) != canonical_id:
            lead.crm_company_id = canonical_id
            lead.updated_at = utc_now()
            await lead.save()
        return ClientCompanyResolution(resolution.crm_company, "resolved", resolution.reason)
    if resolution.status == "ambiguous":
        return resolution

    tenant_id = str(getattr(lead, "company_id", "") or "")
    company_name = str(getattr(lead, "company_name", "") or "").strip()
    if not tenant_id or not company_name:
        return resolution

    company = CRMCompany(
        name=company_name,
        company_id=tenant_id,
        email=getattr(lead, "email", None),
        phone=getattr(lead, "phone", None),
        industry=getattr(lead, "industry", None),
        notes=getattr(lead, "remark", None),
        created_by=actor_id,
        updated_by=actor_id,
    )
    try:
        await company.insert()
    except Exception:
        matches = await CRMCompany.find(
            {"company_id": tenant_id, "deleted": False, "name": _exact_regex(company_name)}
        ).to_list()
        if len(matches) == 1:
            company = matches[0]
        else:
            return ClientCompanyResolution(None, "ambiguous" if len(matches) > 1 else "unresolved", "lead.company_create_race_unresolved")

    lead.crm_company_id = str(company.id)
    lead.updated_at = utc_now()
    await lead.save()
    return ClientCompanyResolution(company, "resolved", "lead.company_created")


async def persist_resolved_crm_company_for_client(client: Client, resolution: ClientCompanyResolution) -> bool:
    if not resolution.crm_company:
        return False
    canonical_id = str(resolution.crm_company.id)
    changed = False
    if getattr(client, "crm_company_id", None) != canonical_id:
        client.crm_company_id = canonical_id
        client.updated_at = utc_now()
        changed = True

    source_lead_id = str(getattr(client, "source_lead_id", "") or "").strip()
    if source_lead_id:
        lead = await SalesProspect.get(source_lead_id)
        if lead and not getattr(lead, "deleted", False) and lead.company_id == client.company_id and getattr(lead, "crm_company_id", None) != canonical_id:
            lead.crm_company_id = canonical_id
            lead.updated_at = utc_now()
            await lead.save()

    if changed:
        await client.save()
    return changed


async def resolve_crm_company_for_client(client: Client) -> ClientCompanyResolution:
    tenant_id = str(getattr(client, "company_id", "") or "")
    crm_company_id = str(getattr(client, "crm_company_id", "") or "").strip()
    if crm_company_id:
        company = await CRMCompany.get(crm_company_id)
        if company and not company.deleted and company.company_id == tenant_id:
            return ClientCompanyResolution(company, "resolved", "client.crm_company_id")
        return ClientCompanyResolution(None, "unresolved", "client.crm_company_id_invalid_or_cross_tenant")

    source_lead_id = str(getattr(client, "source_lead_id", "") or "").strip()
    if source_lead_id:
        lead = await SalesProspect.get(source_lead_id)
        if lead and not getattr(lead, "deleted", False) and lead.company_id == tenant_id:
            return await ensure_crm_company_for_won_lead(lead)

    linked_leads = await SalesProspect.find(
        {"company_id": tenant_id, "deleted": False, "client_id": str(client.id)}
    ).to_list()
    linked_company_ids = {
        str(getattr(lead, "crm_company_id", "") or "")
        for lead in linked_leads
        if getattr(lead, "crm_company_id", None)
    }
    linked_company_ids.discard("")
    if len(linked_company_ids) == 1:
        company = await CRMCompany.get(next(iter(linked_company_ids)))
        if company and not company.deleted and company.company_id == tenant_id:
            return ClientCompanyResolution(company, "resolved", "linked_lead.crm_company_id")
    if len(linked_company_ids) > 1:
        return ClientCompanyResolution(None, "ambiguous", "linked_leads_multiple_crm_companies")
    if len(linked_leads) == 1:
        linked_resolution = await ensure_crm_company_for_won_lead(linked_leads[0])
        if linked_resolution.crm_company:
            return linked_resolution
        if linked_resolution.status == "ambiguous":
            return linked_resolution

    account_name = str(getattr(client, "company_name", None) or getattr(client, "name", "") or "").strip()
    if account_name:
        matches = await CRMCompany.find(
            {"company_id": tenant_id, "deleted": False, "name": _exact_regex(account_name)}
        ).to_list()
        if len(matches) == 1:
            return ClientCompanyResolution(matches[0], "resolved", "client.company_name_exact")
        if len(matches) > 1:
            return ClientCompanyResolution(None, "ambiguous", "client.company_name_exact_multiple")

    email = str(getattr(client, "email", "") or "").strip().lower()
    domain = email.split("@", 1)[1] if "@" in email else ""
    if domain:
        matches = await CRMCompany.find(
            {
                "company_id": tenant_id,
                "deleted": False,
                "$or": [
                    {"email": {"$regex": f"@{re.escape(domain)}$", "$options": "i"}},
                    {"website": {"$regex": re.escape(domain), "$options": "i"}},
                ],
            }
        ).to_list()
        if len(matches) == 1:
            return ClientCompanyResolution(matches[0], "resolved", "client.email_domain")
        if len(matches) > 1:
            return ClientCompanyResolution(None, "ambiguous", "client.email_domain_multiple")

    return ClientCompanyResolution(None, "unresolved", "no_safe_client_company_match")


async def load_contacts_for_client(client: Client) -> list[SalesContact]:
    resolution = await resolve_crm_company_for_client(client)
    if not resolution.crm_company:
        return []
    await persist_resolved_crm_company_for_client(client, resolution)
    return await SalesContact.find(
        {
            "company_id": client.company_id,
            "crm_company_id": str(resolution.crm_company.id),
            "deleted": False,
        }
    ).sort("-updated_at").to_list()

