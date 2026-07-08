"""
Sales Prospects API - CRUD, bulk upload, contact conversion
"""
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form, Body, status as http_status
import csv
import io
import re
from pydantic import BaseModel

from app.api.dependencies import get_current_company_admin_or_lead, get_current_user, require_module
from app.models.user import User, UserRole, UserStatus
from app.models.department import Department
from app.models.crm_company import CRMCompany
from app.models.sales_prospect import SalesProspect, InterestLevel, ProspectStatus
from app.models.sales_contact import SalesContact
from app.models.sales_category import SalesCategory
from app.models.sales_product import SalesProduct
from app.models.sales_masters import SalesStage
from app.crm.lead_engine import LeadEngine


router = APIRouter()


class LeadMergeRequest(BaseModel):
    source_lead_id: str
    target_lead_id: str


class BulkLeadMergeRequest(BaseModel):
    target_lead_id: str
    source_lead_ids: List[str]


def _normalize_lead_csv_header(header: str) -> str:
    normalized = (
        str(header or "")
        .lstrip("\ufeff")
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )
    while "__" in normalized:
        normalized = normalized.replace("__", "_")
    if normalized in {"email_address", "email_id", "e_mail"}:
        return "email"
    return normalized


def _ensure_create_permission(user: User):
    # Allow all roles including EMPLOYEE to create prospects
    if user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add prospects"
        )


def _parse_multi_value(value: str) -> List[str]:
    """Parse pipe-separated values"""
    if not value or not value.strip():
        return []
    return [v.strip() for v in value.split("|") if v.strip()]


def _parse_custom_fields(value: Optional[str]) -> dict:
    if not value or not str(value).strip():
        return {}
    try:
        import json
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}

def _parse_interest_level(value: str) -> InterestLevel:
    normalized = (value or "").strip().lower()
    legacy_values = {"high": "hot", "medium": "warm", "low": "cold"}
    return InterestLevel(legacy_values.get(normalized, normalized))


def _parse_import_status(value: Optional[str]) -> str:
    normalized = (value or "").strip().lower().replace("_", " ")
    status_map = {
        "new": ProspectStatus.ACTIVE.value,
        "open": ProspectStatus.ACTIVE.value,
        "active": ProspectStatus.ACTIVE.value,
        "contacted": ProspectStatus.ACTIVE.value,
        "qualified": ProspectStatus.ACTIVE.value,
        "proposal sent": ProspectStatus.ACTIVE.value,
        "proposal": ProspectStatus.ACTIVE.value,
        "negotiation": ProspectStatus.ACTIVE.value,
        "won": ProspectStatus.WON.value,
        "closed won": ProspectStatus.WON.value,
        "lost": ProspectStatus.LOST.value,
        "closed lost": ProspectStatus.LOST.value,
        "closed": ProspectStatus.CLOSED.value,
        "dead": ProspectStatus.CLOSED.value,
    }
    return status_map.get(normalized, ProspectStatus.ACTIVE.value)


def _parse_datetime(date_str: str, time_str: Optional[str] = None) -> Optional[datetime]:
    """Parse DD-MM-YYYY or YYYY-MM-DD and optional HH:MM AM/PM or HH:MM"""
    if not date_str or not date_str.strip():
        return None
    try:
        parts = date_str.strip().split("-")
        if len(parts) == 3:
            # Try YYYY-MM-DD format first (from HTML date input)
            if len(parts[0]) == 4:
                year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
            else:
                # DD-MM-YYYY format
                day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            dt = datetime(year, month, day)
            if time_str:
                # Parse HH:MM (24-hour) or HH:MM AM/PM
                time_str_clean = time_str.strip().upper()
                if "AM" in time_str_clean or "PM" in time_str_clean:
                    # HH:MM AM/PM format
                    time_parts = time_str_clean.split()
                    if len(time_parts) >= 2:
                        time_val = time_parts[0]
                        am_pm = time_parts[1]
                        h, m = map(int, time_val.split(":"))
                        if am_pm == "PM" and h != 12:
                            h += 12
                        elif am_pm == "AM" and h == 12:
                            h = 0
                        dt = dt.replace(hour=h, minute=m)
                else:
                    # HH:MM format (24-hour)
                    h, m = map(int, time_str_clean.split(":"))
                    dt = dt.replace(hour=h, minute=m)
            return dt
    except Exception as e:
        pass
    return None


def _lead_identity_score(prospect: SalesProspect) -> tuple[str, str, str]:
    email = (prospect.email or "").strip().lower() if prospect.email else ""
    phone = (prospect.phone or "").strip()
    name = (prospect.prospect_name or f"{prospect.first_name} {prospect.last_name}").strip().lower()
    return email, phone, name


def _serialize_prospect_identity(prospect: SalesProspect):
    email, phone, name = _lead_identity_score(prospect)
    return {
        "id": str(prospect.id),
        "prospect_name": prospect.prospect_name,
        "email": email or None,
        "phone": phone or None,
        "country_code": prospect.country_code,
        "current_stage": prospect.current_stage,
        "status": prospect.status.value,
        "assigned_to": prospect.assigned_to,
        "company_name": prospect.company_name,
        "tag": prospect.tag or [],
        "updated_at": prospect.updated_at.isoformat() if prospect.updated_at else None,
    }


async def _get_company_prospects(current_user: User, include_deleted: bool = False) -> List[SalesProspect]:
    query = {"company_id": current_user.company_id}
    if not include_deleted:
        query["deleted"] = False
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(current_user.id)
        query["$or"] = [{"assigned_to": current_user_id}, {"assigned_by": current_user_id}]
    return await SalesProspect.find(query).sort(-SalesProspect.updated_at).to_list()


@router.get("/")
async def list_prospects(
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    category_id: Optional[str] = None,
    product_id: Optional[str] = None,
    current_stage: Optional[str] = None,
    status: Optional[str] = None,
    reason_for_lost: Optional[str] = None,
    tag: Optional[str] = None,
    assigned_by: Optional[str] = None,
    channel: Optional[str] = None,
    interest_level: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1),
    current_user: User = Depends(get_current_user)
):
    """List prospects with role-based filtering"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"list_prospects START: user={current_user.id}, role={current_user.role}, limit={limit}, skip={skip}")
    
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    if current_user.role == UserRole.EMPLOYEE:
        query["$or"] = [
            {"assigned_to": str(current_user.id)},
            {"assigned_by": str(current_user.id)}
        ]
    if search:
        search_or_condition = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
        if "$or" in query:
            query["$and"] = [{"$or": query.pop("$or")}, {"$or": search_or_condition}]
        else:
            query["$or"] = search_or_condition
    
    # Handle assigned_to filter for employees
    if assigned_to:
        if current_user.role == UserRole.EMPLOYEE:
            # Employee can only filter by their own ID
            if assigned_to != str(current_user.id):
                return {"total": 0, "items": []}
        query["assigned_to"] = assigned_to
    
    if assigned_by:
        if current_user.role == UserRole.EMPLOYEE:
            # Employee can only filter by their own ID
            if assigned_by != str(current_user.id):
                return {"total": 0, "items": []}
        query["assigned_by"] = assigned_by
    
    if category_id:
        query["category_id"] = category_id
    if product_id:
        query["product_ids"] = product_id
    if current_stage:
        query["current_stage"] = current_stage
    if status:
        query["status"] = status
    if reason_for_lost:
        query["reason_for_lost"] = reason_for_lost
    if tag:
        query["tag"] = tag
    if assigned_by:
        query["assigned_by"] = assigned_by
    if channel:
        query["channel"] = channel
    if interest_level:
        query["interest_level"] = interest_level
    
    total = await SalesProspect.find(query).count()
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    
    return {
        "total": total,
        "prospects": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "phone": p.phone,
                "country_code": p.country_code,
                "email": p.email,
                "assigned_to": p.assigned_to,
                "assigned_by": p.assigned_by,
                "category_id": p.category_id,
                "product_ids": p.product_ids,
                "crm_company_id": p.crm_company_id,
                "current_stage": p.current_stage,
                "status": p.status.value,
                "interest_level": p.interest_level.value,
                "estimated_close_date": p.estimated_close_date.isoformat() if p.estimated_close_date else None,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "due_time": p.due_time,
                "tag": p.tag or [],
                "remark": p.remark,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in prospects
        ]
    }


@router.get("/{prospect_id}")
async def get_prospect(
    prospect_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get prospect details"""
    prospect = await SalesProspect.get(prospect_id)
    if not prospect or prospect.deleted:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN:
        if prospect.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if current_user.role == UserRole.EMPLOYEE:
            # Employee can view if assigned to them OR assigned by them
            if prospect.assigned_to != str(current_user.id) and prospect.assigned_by != str(current_user.id):
                raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "id": str(prospect.id),
        "first_name": prospect.first_name,
        "last_name": prospect.last_name,
        "prospect_name": prospect.prospect_name,
        "country_code": prospect.country_code,
        "phone": prospect.phone,
        "email": prospect.email,
        "contact_id": prospect.contact_id,
        "crm_company_id": prospect.crm_company_id,
        "category_id": prospect.category_id,
        "product_ids": prospect.product_ids,
        "interest_level": prospect.interest_level.value,
        "estimated_close_date": prospect.estimated_close_date.isoformat() if prospect.estimated_close_date else None,
        "assigned_to": prospect.assigned_to,
        "assigned_by": prospect.assigned_by,
        "current_stage": prospect.current_stage,
        "due_date": prospect.due_date.isoformat() if prospect.due_date else None,
        "due_time": prospect.due_time,
        "remark": prospect.remark,
        "company_name": prospect.company_name,
        "relationship_type": prospect.relationship_type,
        "channel": prospect.channel,
        "designation": prospect.designation,
        "nationality": prospect.nationality,
        "language": prospect.language,
        "owner_name": prospect.owner_name,
        "owner_contact_no": prospect.owner_contact_no,
        "tag": prospect.tag,
        "greeting_preference": prospect.greeting_preference,
        "custom_fields": getattr(prospect, "custom_fields", {}) or {},
        "status": prospect.status.value,
        "closed_date": prospect.closed_date.isoformat() if prospect.closed_date else None,
        "closed_by": prospect.closed_by,
        "reason_for_lost": prospect.reason_for_lost,
        "won_amount": prospect.won_amount,
        "created_at": prospect.created_at,
    }


@router.post("/")
async def create_prospect(
    first_name: str = Form(...),
    last_name: str = Form(...),
    country_code: str = Form(...),
    phone: str = Form(...),
    category_id: str = Form(...),
    product_ids: str = Form(...),  # Comma-separated or pipe-separated
    interest_level: str = Form(...),
    estimated_close_date: str = Form(...),  # DD-MM-YYYY
    assigned_to: str = Form(...),
    current_stage: str = Form(...),
    email: Optional[str] = Form(None),
    contact_id: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),  # DD-MM-YYYY
    due_time: Optional[str] = Form(None),  # HH:MM AM/PM
    remark: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    crm_company_id: Optional[str] = Form(None),
    relationship_type: Optional[str] = Form(None),
    channel: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),  # Pipe-separated
    language: Optional[str] = Form(None),  # Pipe-separated
    owner_name: Optional[str] = Form(None),
    owner_contact_no: Optional[str] = Form(None),
    tag: Optional[str] = Form(None),  # Pipe-separated
    greeting_preference: Optional[str] = Form(None),
    custom_fields: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create a new prospect"""
    _ensure_create_permission(current_user)
    
    # Check duplicate: country_code + phone
    existing = await SalesProspect.find_one(
        {
            "company_id": current_user.company_id,
            "country_code": country_code,
            "phone": phone,
            "deleted": False
        }
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Prospect with this phone number already exists"
        )
    
    # Parse product_ids
    product_list = [p.strip() for p in product_ids.replace(",", "|").split("|") if p.strip()]
    resolved_company_name = company_name.strip() if company_name else None
    if crm_company_id:
        company = await CRMCompany.get(crm_company_id)
        if not company or company.deleted:
            raise HTTPException(status_code=400, detail="Company not found")
        if current_user.role != UserRole.SUPER_ADMIN and company.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Access denied")
        resolved_company_name = company.name
    
    prospect = SalesProspect(
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        prospect_name=f"{first_name.strip()} {last_name.strip()}",
        country_code=country_code,
        phone=phone.strip(),
        email=email.strip().lower() if email else None,
        contact_id=contact_id,
        category_id=category_id,
        product_ids=product_list,
        interest_level=_parse_interest_level(interest_level),
        estimated_close_date=_parse_datetime(estimated_close_date),
        assigned_to=assigned_to,
        assigned_by=str(current_user.id),
        current_stage=current_stage,
        due_date=_parse_datetime(due_date, due_time) if due_date else None,
        due_time=due_time,
        remark=remark.strip() if remark else None,
        company_name=resolved_company_name,
        crm_company_id=crm_company_id,
        relationship_type=relationship_type,
        channel=channel,
        designation=designation.strip() if designation else None,
        nationality=_parse_multi_value(nationality) if nationality else [],
        language=_parse_multi_value(language) if language else [],
        owner_name=owner_name.strip() if owner_name else None,
        owner_contact_no=owner_contact_no.strip() if owner_contact_no else None,
        tag=_parse_multi_value(tag) if tag else [],
        greeting_preference=greeting_preference,
        company_id=current_user.company_id,
        created_by=str(current_user.id),
    )
    
    await prospect.insert()
    return {"id": str(prospect.id), "message": "Prospect created successfully"}


@router.put("/{prospect_id}")
async def update_prospect(
    prospect_id: str,
    current_stage: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    remark: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    due_time: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    product_ids: Optional[str] = Form(None),
    interest_level: Optional[str] = Form(None),
    estimated_close_date: Optional[str] = Form(None),
    reason_for_lost: Optional[str] = Form(None),
    won_amount: Optional[float] = Form(None),
    crm_company_id: Optional[str] = Form(None),
    custom_fields: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update prospect (stage, status, etc.)"""
    prospect = await SalesProspect.get(prospect_id)
    if not prospect or prospect.deleted:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    # Check access
    if current_user.role == UserRole.EMPLOYEE:
        # Employee can update if assigned to them OR assigned by them
        if prospect.assigned_to != str(current_user.id) and prospect.assigned_by != str(current_user.id):
            raise HTTPException(status_code=403, detail="Access denied")
    
    if current_stage:
        prospect.current_stage = current_stage
    if status:
        prospect.status = ProspectStatus(status.lower())
        # Set closed_date and closed_by when status changes to won/lost
        if prospect.status in [ProspectStatus.WON, ProspectStatus.LOST]:
            prospect.closed_date = datetime.utcnow()
            prospect.closed_by = str(current_user.id)
    if remark is not None:
        prospect.remark = remark.strip()
    if due_date:
        prospect.due_date = _parse_datetime(due_date, due_time)
        prospect.due_time = due_time
    if assigned_to:
        prospect.assigned_to = assigned_to
    if category_id:
        prospect.category_id = category_id
    if product_ids:
        # Parse product_ids (can be comma or pipe separated)
        product_list = [p.strip() for p in product_ids.replace(",", "|").split("|") if p.strip()]
        prospect.product_ids = product_list
    if interest_level:
        prospect.interest_level = _parse_interest_level(interest_level)
    if estimated_close_date:
        prospect.estimated_close_date = _parse_datetime(estimated_close_date)
    if crm_company_id is not None:
        company = await CRMCompany.get(crm_company_id) if crm_company_id else None
        if crm_company_id and (not company or company.deleted):
            raise HTTPException(status_code=400, detail="Company not found")
        if company and current_user.role != UserRole.SUPER_ADMIN and company.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Access denied")
        prospect.crm_company_id = crm_company_id
        prospect.company_name = company.name if company else prospect.company_name
    if reason_for_lost is not None:
        prospect.reason_for_lost = reason_for_lost.strip() if reason_for_lost else None
    if won_amount is not None:
        prospect.won_amount = float(won_amount) if won_amount else None
    
    prospect.updated_at = datetime.utcnow()
    await prospect.save()
    return {"message": "Prospect updated successfully"}


@router.post("/bulk-upload", dependencies=[Depends(require_module("sales"))])
async def bulk_upload_prospects(
    strategy: str = Form(...),
    file: UploadFile = File(...),
    target_user_id: Optional[str] = Form(None),
    target_department_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Bulk upload prospects from CSV with assignment strategies."""
    if not file.filename.lower().endswith('.csv') and file.content_type != 'text/csv':
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Only CSV files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded")

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="File too large. Max size is 10 MB")

    text = content.decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    normalized_headers = [_normalize_lead_csv_header(header) for header in headers]

    if 'email' not in normalized_headers:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="CSV must include an 'email' column")
    if not any(h in normalized_headers for h in ['name', 'first_name']):
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="CSV must include either 'name' or 'first_name' column")

    assignable_users = await User.find(
        {
            "company_id": current_user.company_id,
            "role": {"$in": [UserRole.LEAD.value, UserRole.EMPLOYEE.value]},
            "status": UserStatus.ACTIVE,
        }
    ).to_list()

    if not assignable_users:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="No employees or leads found in your company. Add employees before uploading leads."
        )

    employee_ids = [str(user.id) for user in assignable_users]
    assigned_counts = {user_id: 0 for user_id in employee_ids}

    if strategy not in ['round-robin', 'evenly', 'manual']:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid strategy")

    if strategy == 'manual':
        if not target_user_id:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="target_user_id is required for manual assignment")
        if target_user_id not in employee_ids:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Target user must be an active Lead or Employee in your company")

    rows = []
    skipped_rows = []
    warnings = []
    seen_emails = set()
    all_emails = set()
    total_input_rows = 0
    for idx, row in enumerate(reader, start=2):
        total_input_rows += 1
        row_norm = {
            _normalize_lead_csv_header(key): (value or '').strip()
            for key, value in row.items()
            if key is not None
        }
        email = (row_norm.get('email') or '').lower()
        if not email:
            skipped_rows.append({"row": idx, "reason": "Missing email"})
            continue
        if email in seen_emails:
            skipped_rows.append({"row": idx, "reason": "Duplicate email in CSV"})
            continue
        seen_emails.add(email)
        all_emails.add(email)
        rows.append((idx, row_norm))

    existing_leads = []
    if all_emails:
        existing_leads = await SalesProspect.find(
            {
                "company_id": current_user.company_id,
                "email": {"$in": list(all_emails)},
                "deleted": False,
            }
        ).to_list()
    existing_emails = {lead.email.lower() for lead in existing_leads if lead.email}

    parsed_rows = []
    for idx, row_norm in rows:
        email = row_norm.get('email', '').lower()
        if email in existing_emails:
            skipped_rows.append({"row": idx, "reason": "Duplicate email already exists"})
            continue

        name = row_norm.get('name', '')
        first_name = row_norm.get('first_name', '')
        last_name = row_norm.get('last_name', '')
        if not first_name and name:
            parts = name.split()
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
        if not first_name:
            skipped_rows.append({"row": idx, "reason": "Missing name"})
            continue

        status_value = (row_norm.get('status') or ProspectStatus.ACTIVE.value).lower()
        if status_value not in {status.value for status in ProspectStatus}:
            skipped_rows.append({
                "row": idx,
                "reason": f"Invalid status '{status_value}'. Use active, won, lost, or closed",
            })
            continue

        interest_value = row_norm.get('interest_level') or InterestLevel.WARM.value
        try:
            parsed_interest_level = _parse_interest_level(interest_value)
        except ValueError:
            skipped_rows.append({
                "row": idx,
                "reason": (
                    f"Invalid interest_level '{interest_value}'. "
                    "Use hot, warm, cold, high, medium, or low"
                ),
            })
            continue

        estimated_close_date_value = row_norm.get('estimated_close_date')
        estimated_close_date = (
            _parse_datetime(estimated_close_date_value)
            if estimated_close_date_value
            else None
        )
        if estimated_close_date_value and estimated_close_date is None:
            skipped_rows.append({
                "row": idx,
                "reason": "Invalid estimated_close_date. Use YYYY-MM-DD or DD-MM-YYYY",
            })
            continue

        product_ids_value = row_norm.get('product_ids') or ''
        parsed_rows.append(
            {
                "row": idx,
                "first_name": first_name,
                "last_name": last_name,
                "prospect_name": f"{first_name} {last_name}".strip(),
                "country_code": row_norm.get('country_code') or '+91',
                "email": email,
                "company_name": row_norm.get('company') or row_norm.get('company_name') or None,
                "phone": row_norm.get('phone') or '',
                "category_id": row_norm.get('category_id') or None,
                "product_ids": _parse_multi_value(product_ids_value),
                "interest_level": parsed_interest_level,
                "estimated_close_date": estimated_close_date,
                "status": status_value,
                "source": row_norm.get('source') or 'bulk_upload',
                "assigned_to": None,
                "assigned_by": str(current_user.id),
                "current_stage": row_norm.get('stage') or row_norm.get('current_stage') or 'new',
                "remark": row_norm.get('remark') or None,
                "company_id": current_user.company_id,
                "created_by": str(current_user.id),
            }
        )

    if not parsed_rows:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="No valid leads found in the uploaded CSV"
        )

    if strategy == 'manual':
        assigned_user_id = target_user_id
        for row in parsed_rows:
            row['assigned_to'] = assigned_user_id
            assigned_counts[assigned_user_id] += 1
    else:
        total = len(parsed_rows)
        assign_count = len(employee_ids)
        if assign_count == 0:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="No assignable employees or leads available"
            )

        if strategy == 'round-robin':
            for idx, row in enumerate(parsed_rows):
                assignee = employee_ids[idx % assign_count]
                row['assigned_to'] = assignee
                assigned_counts[assignee] += 1
        elif strategy == 'evenly':
            base = total // assign_count
            remainder = total % assign_count
            assignment_list = []
            for idx_user, user_id in enumerate(employee_ids):
                count = base + (1 if idx_user < remainder else 0)
                assignment_list.extend([user_id] * count)
            for row, assignee in zip(parsed_rows, assignment_list):
                row['assigned_to'] = assignee
                assigned_counts[assignee] += 1

    # Build model instances before writing so bulk-created records receive the
    # same validation and default fields as prospects created by POST /.
    valid_prospects = []
    for row in parsed_rows:
        row_number = row.pop("row")
        try:
            valid_prospects.append(SalesProspect(**row))
        except Exception as exc:
            skipped_rows.append({
                "row": row_number,
                "reason": f"Invalid prospect data: {str(exc)[:300]}",
            })

    if not valid_prospects:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="No valid leads found after database-model validation",
        )

    await SalesProspect.insert_many(valid_prospects)

    assigned_breakdown = {}
    for prospect in valid_prospects:
        assigned_breakdown[prospect.assigned_to] = (
            assigned_breakdown.get(prospect.assigned_to, 0) + 1
        )
    return {
        "total_rows": total_input_rows,
        "total_uploaded": len(valid_prospects),
        "skipped_rows": len(skipped_rows),
        "assigned_breakdown": assigned_breakdown,
        "warnings": skipped_rows[:50],
    }


@router.get("/search/contact")
async def search_contact_for_prospect(
    phone: Optional[str] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Search existing contact to convert to prospect"""
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
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
