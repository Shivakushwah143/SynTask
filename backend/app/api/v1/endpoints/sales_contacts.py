"""
Sales Contacts API - CRUD, bulk upload, sharing
"""
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form, Body, status as http_status
import csv
import io
from pydantic import BaseModel

from app.api.dependencies import get_current_user, require_module
from app.core.rbac_visibility import build_visibility_query, can_view_owned_record, require_owned_record_access
from app.models.user import User, UserRole
from app.models.sales_contact import SalesContact, ContactSharing, ContactSharingAccess
from app.api.deps import Pagination50, PaginationParams


router = APIRouter(dependencies=[Depends(require_module("sales"))])


def _ensure_create_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add contacts"
        )


def _ensure_delete_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Delete not allowed for your role"
        )


def _parse_multi_value(value: str) -> List[str]:
    """Parse pipe-separated values: 'Value1 | Value2' -> ['Value1', 'Value2']"""
    if not value or not value.strip():
        return []
    return [v.strip() for v in value.split("|") if v.strip()]


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse DD-MM-YYYY format"""
    if not date_str or not date_str.strip():
        return None
    try:
        parts = date_str.strip().split("-")
        if len(parts) == 3:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            return datetime(year, month, day)
    except:
        pass
    return None


@router.get("/")
async def list_contacts(
    search: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    channel: Optional[str] = None,
    tag: Optional[str] = None,
    created_by: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List contacts with role-based filtering"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    
    # Filters
    if search:
        query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"company_name": {"$regex": search, "$options": "i"}},
        ]
    if channel:
        query["channel"] = channel
    if tag:
        query["tag"] = tag
    if created_by:
        query["created_by"] = created_by
    if from_date:
        try:
            from_dt = _parse_date(from_date)
            if from_dt:
                query["created_at"] = {"$gte": from_dt}
        except:
            pass

    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query=query,
    )
    if to_date:
        try:
            to_dt = _parse_date(to_date)
            if to_dt:
                if "created_at" in query:
                    query["created_at"]["$lte"] = to_dt
                else:
                    query["created_at"] = {"$lte": to_dt}
        except:
            pass
    
    total = await SalesContact.find(query).count()
    contacts = await SalesContact.find(query).skip(skip).limit(limit).sort(-SalesContact.created_at).to_list()
    
    return {
        "total": total,
        "items": [
            {
                "id": str(c.id),
                "first_name": c.first_name,
                "last_name": c.last_name,
                "full_name": c.full_name(),
                "phone": c.phone,
                "country_code": c.country_code,
                "email": c.email,
                "company_name": c.company_name,
                "channel": c.channel,
                "tag": c.tag,
                "created_by": c.created_by,
                "created_at": c.created_at,
            }
            for c in contacts
        ]
    }


@router.get("/shared-with-me")
async def list_shared_contacts(
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List contacts shared with current user"""
    skip, limit = pagination.skip, pagination.limit
    sharing_query = {"shared_with_user_id": str(current_user.id)}
    if current_user.role != UserRole.SUPER_ADMIN:
        sharing_query["company_id"] = current_user.company_id
    sharing_records = await ContactSharing.find(sharing_query).skip(skip).limit(limit).to_list()
    
    contact_ids = [s.contact_id for s in sharing_records]
    if not contact_ids:
        return {"total": 0, "items": []}
    
    contact_query = {"_id": {"$in": contact_ids}, "deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        contact_query["company_id"] = current_user.company_id
    contacts = await SalesContact.find(contact_query).to_list()
    
    return {
        "total": len(contacts),
        "items": [
            {
                "id": str(c.id),
                "first_name": c.first_name,
                "last_name": c.last_name,
                "full_name": c.full_name(),
                "phone": c.phone,
                "country_code": c.country_code,
                "email": c.email,
                "company_name": c.company_name,
                "channel": c.channel,
                "tag": c.tag,
                "created_by": c.created_by,
                "created_at": c.created_at,
            }
            for c in contacts
        ]
    }


@router.get("/{contact_id}")
async def get_contact(
    contact_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get contact details"""
    contact = await SalesContact.get(contact_id)
    if not contact or contact.deleted:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    if not await can_view_owned_record(current_user, contact, ownership_fields=("created_by",)):
        sharing = await ContactSharing.find_one(
            {"contact_id": contact_id, "shared_with_user_id": str(current_user.id)}
        )
        if not sharing:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "id": str(contact.id),
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "country_code": contact.country_code,
        "phone": contact.phone,
        "email": contact.email,
        "company_name": contact.company_name,
        "gst_no": contact.gst_no,
        "brand_name": contact.brand_name,
        "business_category": contact.business_category,
        "area": contact.area,
        "address": contact.address,
        "landmark": contact.landmark,
        "google_map_link": contact.google_map_link,
        "city": contact.city,
        "state": contact.state,
        "country": contact.country,
        "zipcode": contact.zipcode,
        "designation": contact.designation,
        "channel": contact.channel,
        "relationship_type": contact.relationship_type,
        "nationality": contact.nationality,
        "language": contact.language,
        "owner_name": contact.owner_name,
        "owner_contact_no": contact.owner_contact_no,
        "tag": contact.tag,
        "greeting_preference": contact.greeting_preference,
        "birthday": contact.birthday.isoformat() if contact.birthday else None,
        "anniversary": contact.anniversary.isoformat() if contact.anniversary else None,
        "created_by": contact.created_by,
        "created_at": contact.created_at,
    }


@router.post("/")
async def create_contact(
    first_name: str = Form(...),
    last_name: str = Form(...),
    country_code: str = Form(...),
    phone: str = Form(...),
    email: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    gst_no: Optional[str] = Form(None),
    brand_name: Optional[str] = Form(None),  # Pipe-separated
    business_category: Optional[str] = Form(None),  # Pipe-separated
    area: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    landmark: Optional[str] = Form(None),
    google_map_link: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    zipcode: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    channel: Optional[str] = Form(None),
    relationship_type: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),  # Pipe-separated
    language: Optional[str] = Form(None),  # Pipe-separated
    owner_name: Optional[str] = Form(None),
    owner_contact_no: Optional[str] = Form(None),
    tag: Optional[str] = Form(None),  # Pipe-separated
    greeting_preference: Optional[str] = Form(None),
    birthday: Optional[str] = Form(None),  # DD-MM-YYYY
    anniversary: Optional[str] = Form(None),  # DD-MM-YYYY
    current_user: User = Depends(get_current_user)
):
    """Create a new contact"""
    _ensure_create_permission(current_user)
    
    # Check duplicate: country_code + phone
    existing = await SalesContact.find_one(
        {
            "country_code": country_code,
            "phone": phone,
            "deleted": False,
            "company_id": current_user.company_id,
        }
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Contact with this phone number already exists"
        )
    
    contact = SalesContact(
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        country_code=country_code,
        phone=phone.strip(),
        email=email.strip().lower() if email else None,
        company_name=company_name.strip() if company_name else None,
        gst_no=gst_no.strip() if gst_no else None,
        brand_name=_parse_multi_value(brand_name) if brand_name else [],
        business_category=_parse_multi_value(business_category) if business_category else [],
        area=area.strip() if area else None,
        address=address.strip() if address else None,
        landmark=landmark.strip() if landmark else None,
        google_map_link=google_map_link.strip() if google_map_link else None,
        city=city.strip() if city else None,
        state=state.strip() if state else None,
        country=country.strip() if country else None,
        zipcode=zipcode.strip() if zipcode else None,
        designation=designation.strip() if designation else None,
        channel=channel,
        relationship_type=relationship_type,
        nationality=_parse_multi_value(nationality) if nationality else [],
        language=_parse_multi_value(language) if language else [],
        owner_name=owner_name.strip() if owner_name else None,
        owner_contact_no=owner_contact_no.strip() if owner_contact_no else None,
        tag=_parse_multi_value(tag) if tag else [],
        greeting_preference=greeting_preference,
        birthday=_parse_date(birthday) if birthday else None,
        anniversary=_parse_date(anniversary) if anniversary else None,
        company_id=current_user.company_id,
        created_by=str(current_user.id),
    )
    
    await contact.insert()
    return {"id": str(contact.id), "message": "Contact created successfully"}


@router.put("/{contact_id}")
async def update_contact(
    contact_id: str,
    first_name: Optional[str] = Form(None),
    last_name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    # ... (all other fields optional)
    current_user: User = Depends(get_current_user)
):
    """Update contact"""
    contact = await SalesContact.get(contact_id)
    if not contact or contact.deleted:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Check edit permission
    if not await can_view_owned_record(current_user, contact, ownership_fields=("created_by",)):
        sharing = await ContactSharing.find_one(
            {"contact_id": contact_id, "shared_with_user_id": str(current_user.id), "access_level": ContactSharingAccess.EDIT}
        )
        if not sharing:
            raise HTTPException(status_code=403, detail="Edit not allowed")
    
    if first_name:
        contact.first_name = first_name.strip()
    if last_name:
        contact.last_name = last_name.strip()
    if email:
        contact.email = email.strip().lower()
    if company_name is not None:
        contact.company_name = company_name.strip() if company_name else None
    
    contact.updated_at = datetime.now()
    await contact.save()
    return {"message": "Contact updated successfully"}


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete contact"""
    _ensure_delete_permission(current_user)
    
    contact = await SalesContact.get(contact_id)
    if not contact or contact.deleted:
        raise HTTPException(status_code=404, detail="Contact not found")
    await require_owned_record_access(current_user, contact, ownership_fields=("created_by",))
    
    contact.deleted = True
    contact.updated_at = datetime.now()
    await contact.save()
    return {"message": "Contact deleted successfully"}


@router.post("/bulk-upload")
async def bulk_upload_contacts(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Bulk upload contacts from CSV/Excel"""
    _ensure_create_permission(current_user)
    
    content = await file.read()
    text = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(text))
    
    required_cols = ["Country Code", "Phone", "First Name", "Last Name"]
    headers = reader.fieldnames or []
    missing = [c for c in required_cols if c not in headers]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")
    
    success_count = 0
    failed_rows = []
    
    for idx, row in enumerate(reader, start=2):  # Start at 2 (row 1 is header)
        try:
            country_code = (row.get("Country Code") or "").strip()
            phone = (row.get("Phone") or "").strip()
            first_name = (row.get("First Name") or "").strip()
            last_name = (row.get("Last Name") or "").strip()
            
            if not all([country_code, phone, first_name, last_name]):
                failed_rows.append({"row": idx, "error": "Missing mandatory fields"})
                continue
            
            # Check duplicate
            existing = await SalesContact.find_one(
                {
                    "country_code": country_code,
                    "phone": phone,
                    "deleted": False,
                    "company_id": current_user.company_id,
                }
            )
            if existing:
                failed_rows.append({"row": idx, "error": "Duplicate phone number"})
                continue
            
            contact = SalesContact(
                first_name=first_name,
                last_name=last_name,
                country_code=country_code,
                phone=phone,
                email=(row.get("Email Address") or "").strip().lower() or None,
                company_name=(row.get("Company Name") or "").strip() or None,
                gst_no=(row.get("GST No") or "").strip() or None,
                brand_name=_parse_multi_value(row.get("Brand Name", "")),
                business_category=_parse_multi_value(row.get("Business Category", "")),
                area=(row.get("Area") or "").strip() or None,
                address=(row.get("Address") or "").strip() or None,
                landmark=(row.get("Landmark") or "").strip() or None,
                google_map_link=(row.get("Google Map Link") or "").strip() or None,
                city=(row.get("City") or "").strip() or None,
                state=(row.get("State") or "").strip() or None,
                country=(row.get("Country") or "").strip() or None,
                zipcode=(row.get("Zipcode/PO Box") or "").strip() or None,
                designation=(row.get("Designation") or "").strip() or None,
                channel=(row.get("Channel") or "").strip() or None,
                relationship_type=(row.get("Relationship Type") or "").strip() or None,
                nationality=_parse_multi_value(row.get("Nationality", "")),
                language=_parse_multi_value(row.get("Language", "")),
                owner_name=(row.get("Owner Name") or "").strip() or None,
                owner_contact_no=(row.get("Owner Contact No") or "").strip() or None,
                tag=_parse_multi_value(row.get("Tag", "")),
                greeting_preference=(row.get("Greeting Preference") or "").strip() or None,
                birthday=_parse_date(row.get("Birthday", "")),
                anniversary=_parse_date(row.get("Anniversary", "")),
                company_id=current_user.company_id,
                created_by=str(current_user.id),
            )
            await contact.insert()
            success_count += 1
        except Exception as e:
            failed_rows.append({"row": idx, "error": str(e)})
    
    return {
        "success_count": success_count,
        "failed_count": len(failed_rows),
        "failed_rows": failed_rows[:100]  # Limit to first 100 errors
    }


class ShareContactsRequest(BaseModel):
    contact_ids: List[str]
    shared_with_user_ids: List[str]
    access_level: str = "view"


@router.post("/share")
async def share_contacts(
    request: ShareContactsRequest = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Share contacts with other users"""
    if request.access_level not in [ContactSharingAccess.VIEW, ContactSharingAccess.EDIT]:
        raise HTTPException(status_code=400, detail="Invalid access_level")
    
    shared_count = 0
    for contact_id in request.contact_ids:
        contact = await SalesContact.get(contact_id)
        if not contact or contact.deleted:
            continue
        if not await can_view_owned_record(current_user, contact, ownership_fields=("created_by",)):
            continue
        
        for user_id in request.shared_with_user_ids:
            target_user = await User.get(user_id)
            if not target_user or target_user.company_id != contact.company_id:
                continue
            existing = await ContactSharing.find_one(
                {"contact_id": contact_id, "shared_with_user_id": user_id}
            )
            if not existing:
                sharing = ContactSharing(
                    contact_id=contact_id,
                    shared_with_user_id=user_id,
                    shared_by_user_id=str(current_user.id),
                    access_level=request.access_level,
                    company_id=current_user.company_id,
                )
                await sharing.insert()
                shared_count += 1
    
    return {"message": f"Shared {shared_count} contact(s) successfully"}


@router.get("/search")
async def search_contact(
    phone: Optional[str] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Search existing contact by phone/email/name"""
    query = {"deleted": False}
    
    if phone:
        query["phone"] = phone
    if email:
        query["email"] = email.lower()
    if name:
        parts = name.split()
        if len(parts) >= 2:
            query["first_name"] = {"$regex": parts[0], "$options": "i"}
            query["last_name"] = {"$regex": parts[1], "$options": "i"}
        else:
            query["$or"] = [
                {"first_name": {"$regex": name, "$options": "i"}},
                {"last_name": {"$regex": name, "$options": "i"}},
            ]

    query = await build_visibility_query(
        current_user,
        ownership_fields=("created_by",),
        base_query=query,
    )
    
    contacts = await SalesContact.find(query).limit(10).to_list()
    return {
        "contacts": [
            {
                "id": str(c.id),
                "first_name": c.first_name,
                "last_name": c.last_name,
                "full_name": c.full_name(),
                "phone": c.phone,
                "country_code": c.country_code,
                "email": c.email,
                "company_name": c.company_name,
            }
            for c in contacts
        ]
    }


