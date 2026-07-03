from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.crm.company_timeline import CRMCompanyTimelineService
from app.crm.timeline import publish_crm_timeline_event
from app.models.crm_company import CRMCompany
from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def _company_or_403(current_user: User, company_id: str) -> CRMCompany:
    company = await CRMCompany.get(company_id)
    if not company or company.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if current_user.role != UserRole.SUPER_ADMIN and company.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return company


async def _load_company_maps(company_ids: List[str], tenant_id: str) -> Dict[str, CRMCompany]:
    if not company_ids:
        return {}
    companies = await CRMCompany.find(
        {
            "_id": {"$in": company_ids},
            "company_id": tenant_id,
            "deleted": False,
        }
    ).to_list()
    return {str(company.id): company for company in companies}


async def _load_contact_counts(company_ids: List[str], tenant_id: str) -> Dict[str, int]:
    if not company_ids:
        return {}
    contacts = await SalesContact.find(
        {
            "company_id": tenant_id,
            "crm_company_id": {"$in": company_ids},
            "deleted": False,
        }
    ).to_list()
    counts: Dict[str, int] = defaultdict(int)
    for contact in contacts:
        if contact.crm_company_id:
            counts[str(contact.crm_company_id)] += 1
    return counts


async def _load_lead_counts(company_ids: List[str], tenant_id: str) -> Dict[str, int]:
    if not company_ids:
        return {}
    leads = await SalesProspect.find(
        {
            "company_id": tenant_id,
            "crm_company_id": {"$in": company_ids},
            "deleted": False,
        }
    ).to_list()
    counts: Dict[str, int] = defaultdict(int)
    for lead in leads:
        if lead.crm_company_id:
            counts[str(lead.crm_company_id)] += 1
    return counts


def _serialize_company(company: CRMCompany, contact_count: int = 0, lead_count: int = 0, primary_contact: Optional[SalesContact] = None) -> Dict[str, Any]:
    return {
        "id": str(company.id),
        "name": company.name,
        "email": company.email,
        "phone": company.phone,
        "website": company.website,
        "industry": company.industry,
        "company_size": company.company_size,
        "notes": company.notes,
        "primary_contact_id": company.primary_contact_id,
        "primary_contact_name": f"{primary_contact.first_name} {primary_contact.last_name}".strip() if primary_contact else None,
        "contact_count": contact_count,
        "lead_count": lead_count,
        "created_by": company.created_by,
        "updated_by": company.updated_by,
        "created_at": company.created_at,
        "updated_at": company.updated_at,
    }


def _company_match_filter(company: CRMCompany) -> Dict[str, Any]:
    escaped_name = re.escape(company.name or "")
    filters = [
        {"crm_company_id": str(company.id)},
    ]
    if company.name:
        filters.append({"company_name": {"$regex": f"^{escaped_name}$", "$options": "i"}})
    return {"$or": filters}


class CRMCompanyService:
    @staticmethod
    async def list_companies(current_user: User, search: Optional[str] = None, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        tenant_id = str(current_user.company_id or "")
        if current_user.role != UserRole.SUPER_ADMIN and not tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")

        query: Dict[str, Any] = {"deleted": False}
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = tenant_id
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"industry": {"$regex": search, "$options": "i"}},
                {"website": {"$regex": search, "$options": "i"}},
            ]

        companies = await CRMCompany.find(query).sort("-updated_at").skip(skip).limit(limit).to_list()
        company_ids = [str(company.id) for company in companies]
        contact_counts = await _load_contact_counts(company_ids, tenant_id)
        lead_counts = await _load_lead_counts(company_ids, tenant_id)
        primary_contact_ids = [company.primary_contact_id for company in companies if company.primary_contact_id]
        primary_contact_query: Dict[str, Any] = {"_id": {"$in": [cid for cid in primary_contact_ids if cid]}, "deleted": False}
        if current_user.role != UserRole.SUPER_ADMIN:
            primary_contact_query["company_id"] = tenant_id
        primary_contacts = await SalesContact.find(primary_contact_query).to_list() if primary_contact_ids else []
        primary_contact_map = {str(contact.id): contact for contact in primary_contacts}

        return {
            "companies": [
                _serialize_company(
                    company,
                    contact_count=contact_counts.get(str(company.id), 0),
                    lead_count=lead_counts.get(str(company.id), 0),
                    primary_contact=primary_contact_map.get(str(company.primary_contact_id)) if company.primary_contact_id else None,
                )
                for company in companies
            ],
            "total": await CRMCompany.find(query).count(),
            "skip": skip,
            "limit": limit,
        }

    @staticmethod
    async def create_company(current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        tenant_id = str(current_user.company_id or "")
        if current_user.role != UserRole.SUPER_ADMIN and not tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")

        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is required")

        query = {"name": name, "deleted": False}
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = tenant_id
        existing = await CRMCompany.find_one(query)
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company already exists")

        now = datetime.utcnow()
        company = CRMCompany(
            name=name,
            company_id=tenant_id if current_user.role != UserRole.SUPER_ADMIN else str(payload.get("company_id") or ""),
            email=payload.get("email"),
            phone=payload.get("phone"),
            website=payload.get("website"),
            industry=payload.get("industry"),
            company_size=payload.get("company_size"),
            notes=payload.get("notes"),
            primary_contact_id=None,
            created_by=str(getattr(current_user, "id", "")),
            updated_by=str(getattr(current_user, "id", "")),
            created_at=now,
            updated_at=now,
        )
        if current_user.role == UserRole.SUPER_ADMIN and not company.company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant company context is required")
        await company.insert()

        if payload.get("primary_contact_id"):
            contact = await SalesContact.get(payload["primary_contact_id"])
            if not contact or contact.deleted or contact.company_id != company.company_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primary contact must belong to this company")
            contact.crm_company_id = str(company.id)
            contact.company_name = company.name
            contact.is_primary_contact = True
            contact.updated_by = str(getattr(current_user, "id", ""))
            contact.updated_at = now
            await contact.save()
            company.primary_contact_id = str(contact.id)
            company.updated_at = now
            await company.save()

        await publish_crm_timeline_event(
            event_name="CompanyCreated",
            aggregate_type="crm_company",
            aggregate_id=str(company.id),
            company_id=company.company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "company_id": str(company.id),
                "company_name": company.name,
                "primary_contact_id": company.primary_contact_id,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "companies"},
        )

        return {
            "message": "Company created successfully",
            "company": _serialize_company(company),
        }

    @staticmethod
    async def get_company(current_user: User, company_id: str) -> Dict[str, Any]:
        company = await _company_or_403(current_user, company_id)
        contacts = await SalesContact.find(
            {
                "company_id": company.company_id,
                "deleted": False,
                "$or": [
                    {"crm_company_id": str(company.id)},
                    {"company_name": {"$regex": f"^{re.escape(company.name)}$", "$options": "i"}},
                ],
            }
        ).sort("-updated_at").to_list()
        leads = await SalesProspect.find(
            {
                "company_id": company.company_id,
                "deleted": False,
                "$or": [
                    {"crm_company_id": str(company.id)},
                    {"company_name": {"$regex": f"^{re.escape(company.name)}$", "$options": "i"}},
                ],
            }
        ).sort("-updated_at").to_list()
        timeline = await CRMCompanyTimelineService.load_timeline(current_user, company)

        primary_contact = None
        if company.primary_contact_id:
            primary_contact = next((contact for contact in contacts if str(contact.id) == str(company.primary_contact_id)), None)

        return {
            "company": _serialize_company(
                company,
                contact_count=len(contacts),
                lead_count=len(leads),
                primary_contact=primary_contact,
            ),
            "contacts": [
                {
                    "id": str(contact.id),
                    "first_name": contact.first_name,
                    "last_name": contact.last_name,
                    "full_name": f"{contact.first_name} {contact.last_name}".strip(),
                    "email": contact.email,
                    "country_code": contact.country_code,
                    "phone": contact.phone,
                    "designation": contact.designation,
                    "channel": contact.channel,
                    "relationship_type": contact.relationship_type,
                    "tag": contact.tag or [],
                    "crm_company_id": contact.crm_company_id,
                    "is_primary_contact": contact.is_primary_contact,
                    "created_at": contact.created_at,
                    "updated_at": contact.updated_at,
                }
                for contact in contacts
            ],
            "leads": [
                {
                    "id": str(lead.id),
                    "prospect_name": lead.prospect_name,
                    "company_name": lead.company_name,
                    "crm_company_id": lead.crm_company_id,
                    "crm_contact_id": lead.contact_id,
                    "country_code": lead.country_code,
                    "phone": lead.phone,
                    "email": lead.email,
                    "current_stage": lead.current_stage,
                    "status": lead.status.value if getattr(lead, "status", None) else None,
                    "interest_level": lead.interest_level.value if getattr(lead, "interest_level", None) else None,
                    "assigned_to": lead.assigned_to,
                    "owner_name": lead.owner_name,
                    "tag": lead.tag or [],
                    "won_amount": lead.won_amount,
                    "created_at": lead.created_at,
                    "updated_at": lead.updated_at,
                }
                for lead in leads
            ],
            "timeline": timeline,
        }

    @staticmethod
    async def update_company(current_user: User, company_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        company = await _company_or_403(current_user, company_id)
        previous_name = company.name
        previous_primary_contact_id = company.primary_contact_id
        now = datetime.utcnow()

        if "name" in payload and payload["name"] is not None:
            name = payload["name"].strip()
            if not name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is required")
            company.name = name
        if "email" in payload:
            company.email = payload["email"] or None
        if "phone" in payload:
            company.phone = payload["phone"] or None
        if "website" in payload:
            company.website = payload["website"] or None
        if "industry" in payload:
            company.industry = payload["industry"] or None
        if "company_size" in payload:
            company.company_size = payload["company_size"] or None
        if "notes" in payload:
            company.notes = payload["notes"] or None
        if "primary_contact_id" in payload:
            primary_contact_id = payload["primary_contact_id"] or None
            if primary_contact_id:
                contact = await SalesContact.get(primary_contact_id)
                if not contact or contact.deleted or contact.company_id != company.company_id or str(contact.crm_company_id) != str(company.id):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primary contact must belong to this company")
                contact.crm_company_id = str(company.id)
                contact.company_name = company.name
                contact.is_primary_contact = True
                contact.updated_by = str(getattr(current_user, "id", ""))
                contact.updated_at = now
                await contact.save()
            company.primary_contact_id = primary_contact_id
        company.updated_by = str(getattr(current_user, "id", ""))
        company.updated_at = now
        await company.save()

        if not company.primary_contact_id:
            fallback_contacts = await SalesContact.find(
                {
                    "company_id": company.company_id,
                    "deleted": False,
                    "$or": [
                        {"crm_company_id": str(company.id)},
                        {"company_name": {"$regex": f"^{re.escape(company.name)}$", "$options": "i"}},
                        {"company_name": {"$regex": f"^{re.escape(previous_name)}$", "$options": "i"}},
                    ],
                }
            ).sort(SalesContact.created_at).to_list()
            if fallback_contacts:
                fallback_contact = fallback_contacts[0]
                fallback_contact.crm_company_id = str(company.id)
                fallback_contact.company_name = company.name
                fallback_contact.is_primary_contact = True
                fallback_contact.updated_by = str(getattr(current_user, "id", ""))
                fallback_contact.updated_at = now
                await fallback_contact.save()
                company.primary_contact_id = str(fallback_contact.id)
                await company.save()

        if previous_name != company.name:
            related_contacts = await SalesContact.find(
                {
                    "company_id": company.company_id,
                    "deleted": False,
                    "$or": [
                        {"crm_company_id": str(company.id)},
                        {"company_name": {"$regex": f"^{re.escape(previous_name)}$", "$options": "i"}},
                    ],
                }
            ).to_list()
            for contact in related_contacts:
                contact.company_name = company.name
                contact.updated_by = str(getattr(current_user, "id", ""))
                contact.updated_at = now
                await contact.save()

            related_leads = await SalesProspect.find(
                {
                    "company_id": company.company_id,
                    "deleted": False,
                    "$or": [
                        {"crm_company_id": str(company.id)},
                        {"company_name": {"$regex": f"^{re.escape(previous_name)}$", "$options": "i"}},
                    ],
                }
            ).to_list()
            for lead in related_leads:
                lead.company_name = company.name
                lead.updated_at = now
                await lead.save()

        if company.primary_contact_id and company.primary_contact_id != previous_primary_contact_id:
            contacts = await SalesContact.find(
                {
                    "company_id": company.company_id,
                    "crm_company_id": str(company.id),
                    "deleted": False,
                }
            ).to_list()
            for contact in contacts:
                contact.is_primary_contact = str(contact.id) == str(company.primary_contact_id)
                contact.updated_by = str(getattr(current_user, "id", ""))
                contact.updated_at = now
                await contact.save()

        await publish_crm_timeline_event(
            event_name="CompanyUpdated",
            aggregate_type="crm_company",
            aggregate_id=str(company.id),
            company_id=company.company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "company_id": str(company.id),
                "company_name": company.name,
                "previous_name": previous_name,
                "primary_contact_id": company.primary_contact_id,
                "previous_primary_contact_id": previous_primary_contact_id,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "companies"},
        )

        return {
            "message": "Company updated successfully",
            "company": _serialize_company(company),
        }

    @staticmethod
    async def delete_company(current_user: User, company_id: str) -> Dict[str, Any]:
        company = await _company_or_403(current_user, company_id)
        now = datetime.utcnow()
        company.deleted = True
        company.deleted_by = str(getattr(current_user, "id", ""))
        company.deleted_at = now
        company.updated_by = str(getattr(current_user, "id", ""))
        company.updated_at = now
        await company.save()

        await publish_crm_timeline_event(
            event_name="CompanyDeleted",
            aggregate_type="crm_company",
            aggregate_id=str(company.id),
            company_id=company.company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "company_id": str(company.id),
                "company_name": company.name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "companies"},
        )

        return {"message": "Company deleted successfully"}
