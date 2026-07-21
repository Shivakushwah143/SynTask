from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.timeline.publisher import publish_crm_timeline_event
from app.models.crm_company import CRMCompany
from app.models.sales_contact import SalesContact
from app.models.user import User, UserRole
from app.core.clock import utc_now


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def _tenant_company_id(current_user: User) -> str:
    if current_user.role == UserRole.SUPER_ADMIN:
        return str(current_user.company_id or "")
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return str(current_user.company_id)


async def _contact_or_404(current_user: User, contact_id: str) -> SalesContact:
    contact = await SalesContact.get(contact_id)
    if not contact or contact.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    if current_user.role != UserRole.SUPER_ADMIN and contact.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return contact


async def _load_company(company_id: str, current_user: User) -> CRMCompany:
    company = await CRMCompany.get(company_id)
    if not company or company.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if current_user.role != UserRole.SUPER_ADMIN and company.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return company


async def _load_company_map(company_ids: List[str], tenant_id: str) -> Dict[str, CRMCompany]:
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


async def _ensure_primary_contact(company_id: str, tenant_id: str) -> Optional[SalesContact]:
    contacts = await SalesContact.find(
        {
            "company_id": tenant_id,
            "crm_company_id": company_id,
            "deleted": False,
        }
    ).sort(SalesContact.created_at).to_list()
    if not contacts:
        company = await CRMCompany.get(company_id)
        if company and not company.deleted:
            company.primary_contact_id = None
            company.updated_at = utc_now()
            await company.save()
        return None

    primary = next((contact for contact in contacts if contact.is_primary_contact), None)
    if not primary:
        primary = contacts[0]
        primary.is_primary_contact = True
        primary.updated_at = utc_now()
        await primary.save()

    company = await CRMCompany.get(company_id)
    if company and not company.deleted:
        company.primary_contact_id = str(primary.id)
        company.updated_at = utc_now()
        await company.save()
    for contact in contacts:
        if str(contact.id) != str(primary.id) and contact.is_primary_contact:
            contact.is_primary_contact = False
            contact.updated_at = utc_now()
            await contact.save()
    return primary


class CRMContactService:
    @staticmethod
    async def list_contacts(current_user: User, search: Optional[str] = None, company_id: Optional[str] = None, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        tenant_id = await _tenant_company_id(current_user)
        query: Dict[str, Any] = {"deleted": False}
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = tenant_id
        if company_id:
            query["crm_company_id"] = company_id
        if search:
            query["$or"] = [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}},
                {"designation": {"$regex": search, "$options": "i"}},
            ]

        contacts = await SalesContact.find(query).sort("-updated_at").skip(skip).limit(limit).to_list()
        company_ids = [contact.crm_company_id for contact in contacts if contact.crm_company_id]
        company_map = await _load_company_map([cid for cid in company_ids if cid], tenant_id)

        return {
            "contacts": [
                {
                    "id": str(contact.id),
                    "first_name": contact.first_name,
                    "last_name": contact.last_name,
                    "full_name": f"{contact.first_name} {contact.last_name}".strip(),
                    "country_code": contact.country_code,
                    "phone": contact.phone,
                    "email": contact.email,
                    "designation": contact.designation,
                    "channel": contact.channel,
                    "relationship_type": contact.relationship_type,
                    "owner_name": contact.owner_name,
                    "owner_contact_no": contact.owner_contact_no,
                    "tag": contact.tag or [],
                    "crm_company_id": contact.crm_company_id,
                    "company_name": company_map.get(str(contact.crm_company_id), None).name if contact.crm_company_id and company_map.get(str(contact.crm_company_id)) else contact.company_name,
                    "is_primary_contact": contact.is_primary_contact,
                    "created_by": contact.created_by,
                    "updated_by": contact.updated_by,
                    "deleted": contact.deleted,
                    "created_at": contact.created_at,
                    "updated_at": contact.updated_at,
                }
                for contact in contacts
            ],
            "total": await SalesContact.find(query).count(),
            "skip": skip,
            "limit": limit,
        }

    @staticmethod
    async def get_contact(current_user: User, contact_id: str) -> Dict[str, Any]:
        contact = await _contact_or_404(current_user, contact_id)
        company = None
        if contact.crm_company_id:
            company = await _load_company(contact.crm_company_id, current_user)
        return {
            "contact": {
                "id": str(contact.id),
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "full_name": f"{contact.first_name} {contact.last_name}".strip(),
                "country_code": contact.country_code,
                "phone": contact.phone,
                "email": contact.email,
                "designation": contact.designation,
                "channel": contact.channel,
                "relationship_type": contact.relationship_type,
                "owner_name": contact.owner_name,
                "owner_contact_no": contact.owner_contact_no,
                "tag": contact.tag or [],
                "crm_company_id": contact.crm_company_id,
                "company_name": company.name if company else contact.company_name,
                "is_primary_contact": contact.is_primary_contact,
                "created_by": contact.created_by,
                "updated_by": contact.updated_by,
                "deleted": contact.deleted,
                "created_at": contact.created_at,
                "updated_at": contact.updated_at,
            }
        }

    @staticmethod
    async def create_contact(current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        tenant_id = await _tenant_company_id(current_user)
        company_id = payload.get("crm_company_id")
        if not company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="crm_company_id is required")
        company = await _load_company(company_id, current_user)

        first_name = (payload.get("first_name") or "").strip()
        last_name = (payload.get("last_name") or "").strip()
        country_code = (payload.get("country_code") or "").strip() or "+91"
        phone = (payload.get("phone") or "").strip()
        if not first_name or not last_name or not phone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="First name, last name and phone are required")

        duplicate = await SalesContact.find_one(
            {
                "company_id": tenant_id,
                "country_code": country_code,
                "phone": phone,
                "deleted": False,
            }
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact with this phone number already exists")

        now = utc_now()
        contact = SalesContact(
            first_name=first_name,
            last_name=last_name,
            country_code=country_code,
            phone=phone,
            email=(payload.get("email") or None),
            company_name=company.name,
            designation=payload.get("designation"),
            channel=payload.get("channel"),
            relationship_type=payload.get("relationship_type"),
            owner_name=payload.get("owner_name"),
            owner_contact_no=payload.get("owner_contact_no"),
            tag=list(payload.get("tag") or []),
            crm_company_id=str(company.id),
            is_primary_contact=bool(payload.get("is_primary_contact", False)),
            company_id=tenant_id,
            created_by=str(getattr(current_user, "id", "")),
            updated_by=str(getattr(current_user, "id", "")),
            created_at=now,
            updated_at=now,
        )
        await contact.insert()

        primary_contact = await _ensure_primary_contact(str(company.id), tenant_id)
        if primary_contact and str(primary_contact.id) == str(contact.id):
            contact = primary_contact

        await publish_crm_timeline_event(
            event_name="ContactCreated",
            aggregate_type="crm_company",
            aggregate_id=str(company.id),
            company_id=tenant_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "company_id": str(company.id),
                "contact_id": str(contact.id),
                "contact_name": f"{contact.first_name} {contact.last_name}".strip(),
                "is_primary_contact": contact.is_primary_contact,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "contacts"},
        )

        return {
            "message": "Contact created successfully",
            "contact": {
                "id": str(contact.id),
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "full_name": f"{contact.first_name} {contact.last_name}".strip(),
                "crm_company_id": contact.crm_company_id,
                "company_name": company.name,
                "is_primary_contact": contact.is_primary_contact,
            },
        }

    @staticmethod
    async def update_contact(current_user: User, contact_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        contact = await _contact_or_404(current_user, contact_id)
        tenant_id = await _tenant_company_id(current_user)
        now = utc_now()
        previous_company_id = contact.crm_company_id

        if "first_name" in payload and payload["first_name"] is not None:
            contact.first_name = payload["first_name"].strip()
        if "last_name" in payload and payload["last_name"] is not None:
            contact.last_name = payload["last_name"].strip()
        if "country_code" in payload and payload["country_code"] is not None:
            contact.country_code = payload["country_code"].strip() or contact.country_code
        if "phone" in payload and payload["phone"] is not None:
            contact.phone = payload["phone"].strip()
        if "email" in payload:
            contact.email = payload["email"] or None
        if "designation" in payload:
            contact.designation = payload["designation"] or None
        if "channel" in payload:
            contact.channel = payload["channel"] or None
        if "relationship_type" in payload:
            contact.relationship_type = payload["relationship_type"] or None
        if "owner_name" in payload:
            contact.owner_name = payload["owner_name"] or None
        if "owner_contact_no" in payload:
            contact.owner_contact_no = payload["owner_contact_no"] or None
        if "tag" in payload:
            contact.tag = list(payload.get("tag") or [])
        if "crm_company_id" in payload and payload["crm_company_id"]:
            company = await _load_company(payload["crm_company_id"], current_user)
            contact.crm_company_id = str(company.id)
            contact.company_name = company.name
        if "is_primary_contact" in payload:
            contact.is_primary_contact = bool(payload["is_primary_contact"])

        contact.updated_by = str(getattr(current_user, "id", ""))
        contact.updated_at = now

        duplicate = await SalesContact.find_one(
            {
                "company_id": tenant_id,
                "country_code": contact.country_code,
                "phone": contact.phone,
                "deleted": False,
                "_id": {"$ne": contact.id},
            }
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact with this phone number already exists")

        await contact.save()

        if previous_company_id and previous_company_id != contact.crm_company_id:
            await _ensure_primary_contact(previous_company_id, tenant_id)
        if contact.crm_company_id:
            if contact.is_primary_contact:
                others = await SalesContact.find(
                    {
                        "company_id": tenant_id,
                        "crm_company_id": contact.crm_company_id,
                        "deleted": False,
                        "_id": {"$ne": contact.id},
                    }
                ).to_list()
                for other in others:
                    if other.is_primary_contact:
                        other.is_primary_contact = False
                        other.updated_by = str(getattr(current_user, "id", ""))
                        other.updated_at = now
                        await other.save()
            await _ensure_primary_contact(contact.crm_company_id, tenant_id)

        await publish_crm_timeline_event(
            event_name="ContactUpdated",
            aggregate_type="crm_company",
            aggregate_id=str(contact.crm_company_id or previous_company_id or contact.id),
            company_id=tenant_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "contact_id": str(contact.id),
                "contact_name": f"{contact.first_name} {contact.last_name}".strip(),
                "company_id": contact.crm_company_id,
                "previous_company_id": previous_company_id,
                "is_primary_contact": contact.is_primary_contact,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "contacts"},
        )

        return {
            "message": "Contact updated successfully",
            "contact": {
                "id": str(contact.id),
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "full_name": f"{contact.first_name} {contact.last_name}".strip(),
                "crm_company_id": contact.crm_company_id,
                "company_name": contact.company_name,
                "is_primary_contact": contact.is_primary_contact,
            },
        }

    @staticmethod
    async def delete_contact(current_user: User, contact_id: str) -> Dict[str, Any]:
        contact = await _contact_or_404(current_user, contact_id)
        tenant_id = await _tenant_company_id(current_user)
        now = utc_now()
        contact.deleted = True
        contact.deleted_by = str(getattr(current_user, "id", ""))
        contact.deleted_at = now
        contact.updated_by = str(getattr(current_user, "id", ""))
        contact.updated_at = now
        contact.is_primary_contact = False
        await contact.save()

        if contact.crm_company_id:
            await _ensure_primary_contact(contact.crm_company_id, tenant_id)

        await publish_crm_timeline_event(
            event_name="ContactDeleted",
            aggregate_type="crm_company",
            aggregate_id=str(contact.crm_company_id or contact.id),
            company_id=tenant_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "contact_id": str(contact.id),
                "contact_name": f"{contact.first_name} {contact.last_name}".strip(),
                "company_id": contact.crm_company_id,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "contacts"},
        )

        return {"message": "Contact deleted successfully"}

