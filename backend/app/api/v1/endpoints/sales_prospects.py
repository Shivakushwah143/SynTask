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

from app.api.dependencies import get_current_company_admin_or_lead, get_current_user, require_capability, require_module
from app.models.user import User, UserRole, UserStatus
from app.models.department import Department
from app.models.crm_company import CRMCompany
from app.crm.models import SalesProspect, InterestLevel, ProspectStatus
from app.models.sales_contact import SalesContact
from app.models.sales_category import SalesCategory
from app.models.sales_product import SalesProduct
from app.models.sales_masters import SalesStage
from app.models.sales_import_job import SalesImportJob
from app.crm.lead_engine import LeadEngine


router = APIRouter()


class LeadMergeRequest(BaseModel):
    source_lead_id: str
    target_lead_id: str


class BulkLeadMergeRequest(BaseModel):
    target_lead_id: str
    source_lead_ids: List[str]


async def bulk_merge_prospects(payload: BulkLeadMergeRequest, current_user: User):
    target = await SalesProspect.get(payload.target_lead_id)
    if not target or target.deleted:
        raise HTTPException(status_code=404, detail="Target prospect not found")

    if current_user.role != UserRole.SUPER_ADMIN and target.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    total_requested = len(payload.source_lead_ids or [])
    total_merged = 0
    total_failed = 0
    total_skipped = 0
    errors = []

    for source_id in payload.source_lead_ids or []:
        if source_id == payload.target_lead_id:
            total_skipped += 1
            errors.append({"lead_id": source_id, "reason": "Cannot merge a prospect into itself"})
            continue

        source = await SalesProspect.get(source_id)
        if not source or source.deleted:
            total_failed += 1
            errors.append({"lead_id": source_id, "reason": "Source prospect not found"})
            continue

        if current_user.role != UserRole.SUPER_ADMIN and source.company_id != current_user.company_id:
            total_failed += 1
            errors.append({"lead_id": source_id, "reason": "Access denied"})
            continue

        merged_tags = list({*(target.tag or []), *(source.tag or [])})
        merged_products = list({*(target.product_ids or []), *(source.product_ids or [])})
        target.tag = merged_tags
        target.product_ids = merged_products
        target.updated_at = datetime.utcnow()
        await target.save()

        source.deleted = True
        source.updated_at = datetime.utcnow()
        await source.save()

        total_merged += 1

    return {
        "summary": {
            "total_requested": total_requested,
            "total_merged": total_merged,
            "total_failed": total_failed,
            "total_skipped": total_skipped,
        },
        "errors": errors,
        "target_lead_id": payload.target_lead_id,
    }


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


def _parse_tabular_preview(file_name: str, content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    lowered = file_name.lower()
    if lowered.endswith(".xlsx"):
        from app.crm.lead_engine import _load_xlsx_rows
        return _load_xlsx_rows(content)
    text = content.decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = [{str(key): (value or "") for key, value in row.items() if key is not None} for row in reader]
    return headers, rows

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


@router.get("/duplicates")
async def get_duplicate_prospects(search: Optional[str] = None, current_user: User = Depends(get_current_user)):
    prospects = await _get_company_prospects(current_user)
    groups_by_key: dict[str, list[dict]] = {}
    for prospect in prospects:
        email, phone, name = _lead_identity_score(prospect)
        if search:
            query = search.strip().lower()
            if query not in email and query not in phone and query not in name:
                continue
        for key in [f"email:{email}" if email else "", f"phone:{phone}" if phone else "", f"name:{name}" if name else ""]:
            if key:
                groups_by_key.setdefault(key, []).append(_serialize_prospect_identity(prospect))

    groups = [
        {"match_key": key, "prospects": items, "leads": items}
        for key, items in groups_by_key.items()
        if len(items) > 1
    ]
    return {"total_groups": len(groups), "groups": groups}


@router.get("/imports")
async def list_import_history(current_user: User = Depends(get_current_user)):
    query = {"company_id": current_user.company_id}
    jobs = await SalesImportJob.find(query).sort(-SalesImportJob.created_at).limit(50).to_list()
    return {
        "items": [
            {
                "id": str(job.id),
                "filename": job.filename,
                "strategy": job.strategy,
                "status": job.status,
                "total_rows": job.total_rows,
                "total_uploaded": job.total_uploaded,
                "skipped_rows": job.skipped_rows,
                "failed_rows": job.failed_rows,
                "created_at": job.created_at,
                "completed_at": job.completed_at,
            }
            for job in jobs
        ]
    }


@router.get("/search/contact")
async def search_contact_for_prospect(
    phone: Optional[str] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Search existing contact to convert to prospect."""
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


@router.post("/", dependencies=[Depends(require_capability("import_leads"))])
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
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": first_name,
            "last_name": last_name,
            "country_code": country_code,
            "phone": phone,
            "category_id": category_id,
            "product_ids": _parse_multi_value(product_ids),
            "interest_level": interest_level,
            "estimated_close_date": estimated_close_date,
            "assigned_to": assigned_to,
            "current_stage": current_stage,
            "email": email,
            "contact_id": contact_id,
            "due_date": due_date,
            "due_time": due_time,
            "remark": remark,
            "company_name": company_name,
            "crm_company_id": crm_company_id,
            "relationship_type": relationship_type,
            "channel": channel,
            "designation": designation,
            "nationality": _parse_multi_value(nationality) if nationality else [],
            "language": _parse_multi_value(language) if language else [],
            "owner_name": owner_name,
            "owner_contact_no": owner_contact_no,
            "tag": _parse_multi_value(tag) if tag else [],
            "greeting_preference": greeting_preference,
            "custom_fields": _parse_custom_fields(custom_fields),
        },
    )
    return {"id": result["id"], "message": result["message"]}


@router.put("/{prospect_id}")
async def update_prospect(
    prospect_id: str,
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
    """Update prospect fields without mutating pipeline stage or status."""
    result = await LeadEngine.update_lead(
        current_user,
        prospect_id,
        {
            "remark": remark,
            "due_date": due_date,
            "due_time": due_time,
            "assigned_to": assigned_to,
            "category_id": category_id,
            "product_ids": _parse_multi_value(product_ids) if product_ids else None,
            "interest_level": interest_level,
            "estimated_close_date": estimated_close_date,
            "reason_for_lost": reason_for_lost,
            "won_amount": won_amount,
            "crm_company_id": crm_company_id,
            "custom_fields": _parse_custom_fields(custom_fields),
        },
    )
    return {"message": result["message"]}


@router.post("/merge")
async def merge_prospects(payload: BulkLeadMergeRequest | LeadMergeRequest, current_user: User = Depends(get_current_user)):
    if isinstance(payload, LeadMergeRequest):
        merge_payload = BulkLeadMergeRequest(
            target_lead_id=payload.target_lead_id,
            source_lead_ids=[payload.source_lead_id],
        )
    else:
        merge_payload = payload
    return await bulk_merge_prospects(merge_payload, current_user)


@router.post("/bulk-upload", dependencies=[Depends(require_capability("import_leads")), Depends(require_module("sales"))])
async def bulk_upload_prospects(
    strategy: str = Form(...),
    file: UploadFile = File(...),
    target_user_id: Optional[str] = Form(None),
    target_department_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Bulk upload prospects from CSV with assignment strategies."""
    return await LeadEngine.import_leads(
        current_user,
        file,
        strategy=strategy,
        target_user_id=target_user_id,
        target_department_id=target_department_id,
    )


@router.post("/bulk-upload/preview", dependencies=[Depends(require_capability("import_leads")), Depends(require_module("sales"))])
async def preview_bulk_upload_prospects(
    strategy: str = Form(...),
    file: UploadFile = File(...),
    target_user_id: Optional[str] = Form(None),
    target_department_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    return await LeadEngine.preview_import(
        current_user,
        file,
        strategy=strategy,
        target_user_id=target_user_id,
        target_department_id=target_department_id,
    )


@router.post("/imports/{job_id}/retry")
async def retry_import_job(job_id: str, current_user: User = Depends(get_current_company_admin_or_lead)):
    return await LeadEngine.retry_import_job(current_user, job_id)
