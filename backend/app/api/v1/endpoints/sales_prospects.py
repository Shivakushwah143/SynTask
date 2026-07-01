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

from app.api.dependencies import get_current_user, require_module
from app.models.user import User, UserRole
from app.models.sales_prospect import SalesProspect, InterestLevel, ProspectStatus
from app.models.sales_contact import SalesContact
from app.models.sales_category import SalesCategory
from app.models.sales_product import SalesProduct
from app.models.sales_masters import SalesStage


router = APIRouter(dependencies=[Depends(require_module("sales"))])


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
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """List prospects with role-based filtering"""
    query = {"deleted": False}
    
    # Role-based access
    employee_or_condition = None
    if current_user.role == UserRole.SUPER_ADMIN:
        pass
    elif current_user.role == UserRole.ADMIN:
        query["company_id"] = current_user.company_id
    elif current_user.role in [UserRole.MANAGER, UserRole.LEAD]:
        # See own + team prospects
        query["company_id"] = current_user.company_id
        # TODO: Add team filter
    else:  # Employee - can see prospects assigned to them OR assigned by them
        query["company_id"] = current_user.company_id
        employee_or_condition = [
            {"assigned_to": str(current_user.id)},
            {"assigned_by": str(current_user.id)}
        ]
    
    # Filters
    search_or_condition = None
    if search:
        search_or_condition = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    
    # Combine $or conditions if both exist (for employees with search)
    if employee_or_condition and search_or_condition:
        # Need to combine: (assigned_to OR assigned_by) AND (name OR phone OR email matches)
        # Use $and with nested $or
        query["$and"] = [
            {"$or": employee_or_condition},
            {"$or": search_or_condition}
        ]
    elif employee_or_condition:
        query["$or"] = employee_or_condition
    elif search_or_condition:
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
        "items": [
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
    relationship_type: Optional[str] = Form(None),
    channel: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),  # Pipe-separated
    language: Optional[str] = Form(None),  # Pipe-separated
    owner_name: Optional[str] = Form(None),
    owner_contact_no: Optional[str] = Form(None),
    tag: Optional[str] = Form(None),  # Pipe-separated
    greeting_preference: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Create a new prospect"""
    _ensure_create_permission(current_user)
    
    # Check duplicate: country_code + phone
    existing = await SalesProspect.find_one(
        {
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
        interest_level=InterestLevel(interest_level.lower()),
        estimated_close_date=_parse_datetime(estimated_close_date),
        assigned_to=assigned_to,
        assigned_by=str(current_user.id),
        current_stage=current_stage,
        due_date=_parse_datetime(due_date, due_time) if due_date else None,
        due_time=due_time,
        remark=remark.strip() if remark else None,
        company_name=company_name.strip() if company_name else None,
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
        prospect.interest_level = InterestLevel(interest_level.lower())
    if estimated_close_date:
        prospect.estimated_close_date = _parse_datetime(estimated_close_date)
    if reason_for_lost is not None:
        prospect.reason_for_lost = reason_for_lost.strip() if reason_for_lost else None
    if won_amount is not None:
        prospect.won_amount = float(won_amount) if won_amount else None
    
    prospect.updated_at = datetime.utcnow()
    await prospect.save()
    return {"message": "Prospect updated successfully"}


@router.post("/bulk-upload")
async def bulk_upload_prospects(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Create prospects in the database from the CSV used by the prospects page."""
    _ensure_create_permission(current_user)
    
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="The CSV file must use UTF-8 encoding")
    reader = csv.DictReader(io.StringIO(text))
    
    required_cols = [
        "First Name", "Last Name", "Phone", "Category", "Stage",
        "Owner", "Interest Level", "Estimated Close Date", "Products"
    ]
    headers = reader.fieldnames or []
    missing = [c for c in required_cols if c not in headers]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")
    
    success_count = 0
    failed_rows = []
    
    for idx, row in enumerate(reader, start=2):
        try:
            country_code = (row.get("Country Code") or "+91").strip()
            phone = (row.get("Phone") or "").strip()
            first_name = (row.get("First Name") or "").strip()
            last_name = (row.get("Last Name") or "").strip()
            category = (row.get("Category") or "").strip()
            product_names = [
                value.strip() for value in (row.get("Products") or "").split("|") if value.strip()
            ]
            stage_name = (row.get("Stage") or "").strip()
            owner_name = (row.get("Owner") or "").strip()
            interest_level = (row.get("Interest Level") or "").strip().lower()
            estimated_close_date = (row.get("Estimated Close Date") or "").strip()
            
            if not all([
                phone, first_name, last_name, category, product_names, stage_name,
                owner_name, interest_level, estimated_close_date
            ]):
                failed_rows.append({"row": idx, "error": "Missing mandatory fields"})
                continue
            
            # Check duplicate
            existing = await SalesProspect.find_one(
                {"country_code": country_code, "phone": phone, "deleted": False}
            )
            if existing:
                failed_rows.append({"row": idx, "error": "Duplicate phone number"})
                continue
            
            # Find category by name
            company_filter = {} if current_user.role == UserRole.SUPER_ADMIN else {
                "company_id": current_user.company_id
            }
            category_obj = await SalesCategory.find_one({
                **company_filter,
                "name": {"$regex": f"^{re.escape(category)}$", "$options": "i"},
                "deleted": False,
            })
            if not category_obj:
                failed_rows.append({"row": idx, "error": f"Category '{category}' not found"})
                continue
            
            product_ids = []
            missing_product = None
            for product_name in product_names:
                product_obj = await SalesProduct.find_one({
                    **company_filter,
                    "name": {"$regex": f"^{re.escape(product_name)}$", "$options": "i"},
                    "deleted": False,
                })
                if not product_obj:
                    missing_product = product_name
                    break
                product_ids.append(str(product_obj.id))
            if missing_product:
                failed_rows.append({"row": idx, "error": f"Product '{missing_product}' not found"})
                continue

            stage_obj = await SalesStage.find_one({
                **company_filter,
                "name": {"$regex": f"^{re.escape(stage_name)}$", "$options": "i"},
                "deleted": False,
            })
            if not stage_obj:
                failed_rows.append({"row": idx, "error": f"Stage '{stage_name}' not found"})
                continue

            owner_parts = owner_name.split(maxsplit=1)
            owner_query = {
                **company_filter,
                "first_name": {"$regex": f"^{re.escape(owner_parts[0])}$", "$options": "i"},
                "status": "active",
            }
            if len(owner_parts) > 1:
                owner_query["last_name"] = {
                    "$regex": f"^{re.escape(owner_parts[1])}$", "$options": "i"
                }
            owner_obj = await User.find_one(owner_query)
            if not owner_obj:
                failed_rows.append({"row": idx, "error": f"Owner '{owner_name}' not found"})
                continue
            
            prospect = SalesProspect(
                first_name=first_name,
                last_name=last_name,
                prospect_name=f"{first_name} {last_name}",
                country_code=country_code,
                phone=phone,
                email=(row.get("Email") or "").strip().lower() or None,
                category_id=str(category_obj.id),
                product_ids=product_ids,
                interest_level=InterestLevel(interest_level),
                estimated_close_date=_parse_datetime(estimated_close_date),
                assigned_to=str(owner_obj.id),
                assigned_by=str(current_user.id),
                current_stage=str(stage_obj.id),
                company_name=(row.get("Company") or "").strip() or None,
                remark=(row.get("Remark") or "").strip() or None,
                channel=(row.get("Channel") or "").strip() or None,
                nationality=_parse_multi_value(row.get("Nationality", "")),
                language=_parse_multi_value(row.get("Language", "")),
                tag=_parse_multi_value(row.get("Tag", "")),
                company_id=current_user.company_id,
                created_by=str(current_user.id),
            )
            await prospect.insert()
            success_count += 1
        except Exception as e:
            failed_rows.append({"row": idx, "error": str(e)})
    
    return {
        "success_count": success_count,
        "failed_count": len(failed_rows),
        "failed_rows": failed_rows[:100]
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

