"""
Sales Reports API - Prospect, Team Activity, Sales, Target, Lost, Inventory Reports
"""
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from fastapi.responses import StreamingResponse
import csv
import io

from app.api.dependencies import get_current_user, require_module
from app.models.user import User, UserRole
from app.crm.models import SalesProspect, ProspectStatus, InterestLevel
from app.models.sales_contact import SalesContact
from app.models.sales_product import SalesProduct
from app.models.sales_category import SalesCategory
from app.core.hierarchy import get_team_member_ids
from app.api.deps import Pagination50, PaginationParams


router = APIRouter(dependencies=[Depends(require_module("sales"))])


async def _get_user_accessible_prospects(user: User, query: dict):
    """Apply role-based filtering to prospect queries"""
    if user.role == UserRole.SUPER_ADMIN:
        return query
    
    query["company_id"] = user.company_id
    
    if user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return query
    
    if user.role in [UserRole.MANAGER, UserRole.LEAD]:
        # Get team member IDs
        team_ids = await get_team_member_ids(user)
        team_ids.append(str(user.id))
        query["assigned_to"] = {"$in": team_ids}
        return query
    
    # Sales Executive - only own prospects
    query["assigned_to"] = str(user.id)
    return query


@router.get("/prospect")
async def prospect_report(
    assigned_date_from: Optional[str] = None,
    assigned_date_to: Optional[str] = None,
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
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    export: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Prospect Report with comprehensive filters"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    query = await _get_user_accessible_prospects(current_user, query)
    
    # Date filters
    if assigned_date_from:
        try:
            date_from = datetime.strptime(assigned_date_from, "%Y-%m-%d")
            query["created_at"] = {"$gte": date_from}
        except:
            pass
    
    if assigned_date_to:
        try:
            date_to = datetime.strptime(assigned_date_to, "%Y-%m-%d")
            date_to = date_to.replace(hour=23, minute=59, second=59)
            if "created_at" in query:
                query["created_at"]["$lte"] = date_to
            else:
                query["created_at"] = {"$lte": date_to}
        except:
            pass
    
    # Other filters
    if assigned_to:
        query["assigned_to"] = assigned_to
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
    
    # Search
    if search:
        query["$or"] = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    
    total = await SalesProspect.find(query).count()
    
    if export:
        # Export all matching records
        prospects = await SalesProspect.find(query).sort(-SalesProspect.created_at).to_list()
        return _export_prospect_report(prospects)
    
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    
    return {
        "total": total,
        "items": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "phone": f"{p.country_code} {p.phone}",
                "email": p.email,
                "assigned_to": p.assigned_to,
                "assigned_by": p.assigned_by,
                "category_id": p.category_id,
                "product_ids": p.product_ids,
                "current_stage": p.current_stage,
                "status": p.status.value,
                "interest_level": p.interest_level.value,
                "channel": p.channel,
                "tag": p.tag,
                "reason_for_lost": p.reason_for_lost,
                "created_at": p.created_at.isoformat(),
            }
            for p in prospects
        ]
    }


@router.get("/team-activity")
async def team_activity_report(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    status: Optional[str] = None,
    reason_for_lost: Optional[str] = None,
    channel: Optional[str] = None,
    team_member: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    export: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Team Member Activity Report"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    query = await _get_user_accessible_prospects(current_user, query)
    
    # Date filters
    if from_date:
        try:
            date_from = datetime.strptime(from_date, "%Y-%m-%d")
            query["created_at"] = {"$gte": date_from}
        except:
            pass
    
    if to_date:
        try:
            date_to = datetime.strptime(to_date, "%Y-%m-%d")
            date_to = date_to.replace(hour=23, minute=59, second=59)
            if "created_at" in query:
                query["created_at"]["$lte"] = date_to
            else:
                query["created_at"] = {"$lte": date_to}
        except:
            pass
    
    if status:
        query["status"] = status
    if reason_for_lost:
        query["reason_for_lost"] = reason_for_lost
    if channel:
        query["channel"] = channel
    if team_member:
        query["assigned_to"] = team_member
    
    if search:
        query["$or"] = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    
    total = await SalesProspect.find(query).count()
    
    if export:
        prospects = await SalesProspect.find(query).sort(-SalesProspect.created_at).to_list()
        return _export_team_activity_report(prospects)
    
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    
    return {
        "total": total,
        "items": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "phone": f"{p.country_code} {p.phone}",
                "assigned_to": p.assigned_to,
                "current_stage": p.current_stage,
                "status": p.status.value,
                "channel": p.channel,
                "reason_for_lost": p.reason_for_lost,
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat(),
            }
            for p in prospects
        ]
    }


@router.get("/sales")
async def sales_report(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    status: Optional[str] = None,
    reason_for_lost: Optional[str] = None,
    channel: Optional[str] = None,
    team_member: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    export: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Sales Report with summary metrics"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    query = await _get_user_accessible_prospects(current_user, query)
    
    # Date filters
    if from_date:
        try:
            date_from = datetime.strptime(from_date, "%Y-%m-%d")
            query["created_at"] = {"$gte": date_from}
        except:
            pass
    
    if to_date:
        try:
            date_to = datetime.strptime(to_date, "%Y-%m-%d")
            date_to = date_to.replace(hour=23, minute=59, second=59)
            if "created_at" in query:
                query["created_at"]["$lte"] = date_to
            else:
                query["created_at"] = {"$lte": date_to}
        except:
            pass
    
    if status:
        query["status"] = status
    if reason_for_lost:
        query["reason_for_lost"] = reason_for_lost
    if channel:
        query["channel"] = channel
    if team_member:
        query["assigned_to"] = team_member
    
    if search:
        query["$or"] = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    
    # Calculate summary metrics
    all_prospects = await SalesProspect.find(query).to_list()
    
    total_active = len([p for p in all_prospects if p.status == ProspectStatus.ACTIVE])
    total_closed = len([p for p in all_prospects if p.status == ProspectStatus.WON])
    total_lost = len([p for p in all_prospects if p.status == ProspectStatus.LOST])
    won_amount = sum([p.won_amount or 0 for p in all_prospects if p.status == ProspectStatus.WON])
    total_prospects = len(all_prospects)
    won_percentage = (total_closed / total_prospects * 100) if total_prospects > 0 else 0
    
    # New prospects generated (in date range)
    new_prospects_query = query.copy()
    if from_date:
        new_prospects_query["created_at"] = {"$gte": datetime.strptime(from_date, "%Y-%m-%d")}
    new_prospects_count = await SalesProspect.find(new_prospects_query).count()
    
    if export:
        return _export_sales_report(all_prospects)
    
    # Paginated list
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    
    return {
        "summary": {
            "total_active": total_active,
            "total_closed": total_closed,
            "total_lost": total_lost,
            "won_amount": won_amount,
            "won_percentage": round(won_percentage, 2),
            "new_prospects_generated": new_prospects_count,
        },
        "total": len(all_prospects),
        "items": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "phone": f"{p.country_code} {p.phone}",
                "assigned_to": p.assigned_to,
                "current_stage": p.current_stage,
                "status": p.status.value,
                "won_amount": p.won_amount,
                "channel": p.channel,
                "created_at": p.created_at.isoformat(),
            }
            for p in prospects
        ]
    }


@router.get("/target")
async def team_target_report(
    from_month: Optional[str] = None,  # YYYY-MM format
    to_month: Optional[str] = None,
    team_member: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    export: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Team Member Target Report"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    query = await _get_user_accessible_prospects(current_user, query)
    
    # Month filters
    if from_month:
        try:
            year, month = map(int, from_month.split("-"))
            date_from = datetime(year, month, 1)
            query["created_at"] = {"$gte": date_from}
        except:
            pass
    
    if to_month:
        try:
            year, month = map(int, to_month.split("-"))
            # Last day of month
            if month == 12:
                date_to = datetime(year + 1, 1, 1) - timedelta(days=1)
            else:
                date_to = datetime(year, month + 1, 1) - timedelta(days=1)
            date_to = date_to.replace(hour=23, minute=59, second=59)
            if "created_at" in query:
                query["created_at"]["$lte"] = date_to
            else:
                query["created_at"] = {"$lte": date_to}
        except:
            pass
    
    if team_member:
        query["assigned_to"] = team_member
    
    if search:
        query["$or"] = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    
    total = await SalesProspect.find(query).count()
    
    if export:
        prospects = await SalesProspect.find(query).sort(-SalesProspect.created_at).to_list()
        return _export_target_report(prospects)
    
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    
    return {
        "total": total,
        "items": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "assigned_to": p.assigned_to,
                "current_stage": p.current_stage,
                "status": p.status.value,
                "won_amount": p.won_amount,
                "created_at": p.created_at.isoformat(),
            }
            for p in prospects
        ]
    }


@router.get("/lost")
async def lost_prospect_report(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    team_member: Optional[str] = None,
    reason_for_lost: Optional[str] = None,
    channel: Optional[str] = None,
    category_id: Optional[str] = None,
    product_id: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    export: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Lost Prospect Report"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False, "status": ProspectStatus.LOST.value}
    query = _get_user_accessible_prospects(current_user, query)
    
    # Date filters
    if from_date:
        try:
            date_from = datetime.strptime(from_date, "%Y-%m-%d")
            query["closed_date"] = {"$gte": date_from}
        except:
            pass
    
    if to_date:
        try:
            date_to = datetime.strptime(to_date, "%Y-%m-%d")
            date_to = date_to.replace(hour=23, minute=59, second=59)
            if "closed_date" in query:
                query["closed_date"]["$lte"] = date_to
            else:
                query["closed_date"] = {"$lte": date_to}
        except:
            pass
    
    if team_member:
        query["assigned_to"] = team_member
    if reason_for_lost:
        query["reason_for_lost"] = reason_for_lost
    if channel:
        query["channel"] = channel
    if category_id:
        query["category_id"] = category_id
    if product_id:
        query["product_ids"] = product_id
    
    if search:
        query["$or"] = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    
    total = await SalesProspect.find(query).count()
    
    if export:
        prospects = await SalesProspect.find(query).sort(-SalesProspect.closed_date).to_list()
        return _export_lost_report(prospects)
    
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.closed_date).to_list()
    
    return {
        "total": total,
        "items": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "phone": f"{p.country_code} {p.phone}",
                "assigned_to": p.assigned_to,
                "category_id": p.category_id,
                "product_ids": p.product_ids,
                "reason_for_lost": p.reason_for_lost,
                "channel": p.channel,
                "closed_date": p.closed_date.isoformat() if p.closed_date else None,
                "created_at": p.created_at.isoformat(),
            }
            for p in prospects
        ]
    }


@router.get("/inventory")
async def inventory_report(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    category_id: Optional[str] = None,
    product_id: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    export: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Inventory Report - Products and Categories usage"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    # Get products used in prospects
    prospect_query = {"deleted": False}
    prospect_query = await _get_user_accessible_prospects(current_user, prospect_query)
    
    if from_date:
        try:
            date_from = datetime.strptime(from_date, "%Y-%m-%d")
            prospect_query["created_at"] = {"$gte": date_from}
        except:
            pass
    
    if to_date:
        try:
            date_to = datetime.strptime(to_date, "%Y-%m-%d")
            date_to = date_to.replace(hour=23, minute=59, second=59)
            if "created_at" in prospect_query:
                prospect_query["created_at"]["$lte"] = date_to
            else:
                prospect_query["created_at"] = {"$lte": date_to}
        except:
            pass
    
    if category_id:
        prospect_query["category_id"] = category_id
    if product_id:
        prospect_query["product_ids"] = product_id
    
    # Get all products
    products = await SalesProduct.find(query).to_list()
    
    # Count usage in prospects
    product_usage = {}
    prospects = await SalesProspect.find(prospect_query).to_list()
    
    for prospect in prospects:
        for prod_id in prospect.product_ids:
            if prod_id not in product_usage:
                product_usage[prod_id] = 0
            product_usage[prod_id] += 1
    
    # Filter products
    filtered_products = []
    for prod in products:
        if category_id and prod.category_id != category_id:
            continue
        if product_id and str(prod.id) != product_id:
            continue
        if search:
            if search.lower() not in prod.name.lower():
                continue
        
        filtered_products.append({
            "id": str(prod.id),
            "name": prod.name,
            "category_id": prod.category_id,
            "rate": prod.rate,
            "unit": prod.unit,
            "state": prod.state,
            "city": prod.city,
            "usage_count": product_usage.get(str(prod.id), 0),
            "created_at": prod.created_at.isoformat(),
        })
    
    total = len(filtered_products)
    
    if export:
        return _export_inventory_report(filtered_products)
    
    # Pagination
    start_idx = skip
    end_idx = skip + limit
    paginated_products = filtered_products[start_idx:end_idx]
    
    return {
        "total": total,
        "items": paginated_products
    }


# Export helper functions
def _export_prospect_report(prospects):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sr. No", "Prospect Name", "Phone", "Email", "Assigned To", "Assigned By",
        "Category", "Products", "Stage", "Status", "Interest Level", "Channel", "Tag", "Reason For Lost", "Created At"
    ])
    
    for idx, p in enumerate(prospects, 1):
        writer.writerow([
            idx, p.prospect_name, f"{p.country_code} {p.phone}", p.email or "",
            p.assigned_to, p.assigned_by or "", p.category_id or "", ", ".join(p.product_ids),
            p.current_stage, p.status.value, p.interest_level.value, p.channel or "",
            ", ".join(p.tag) if p.tag else "", p.reason_for_lost or "", p.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prospect_report.csv"}
    )


def _export_team_activity_report(prospects):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sr. No", "Prospect Name", "Phone", "Assigned To", "Stage", "Status",
        "Channel", "Reason For Lost", "Created At", "Updated At"
    ])
    
    for idx, p in enumerate(prospects, 1):
        writer.writerow([
            idx, p.prospect_name, f"{p.country_code} {p.phone}", p.assigned_to,
            p.current_stage, p.status.value, p.channel or "", p.reason_for_lost or "",
            p.created_at.strftime("%Y-%m-%d %H:%M:%S"), p.updated_at.strftime("%Y-%m-%d %H:%M:%S")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=team_activity_report.csv"}
    )


def _export_sales_report(prospects):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sr. No", "Prospect Name", "Phone", "Assigned To", "Stage", "Status",
        "Won Amount", "Channel", "Created At"
    ])
    
    for idx, p in enumerate(prospects, 1):
        writer.writerow([
            idx, p.prospect_name, f"{p.country_code} {p.phone}", p.assigned_to,
            p.current_stage, p.status.value, p.won_amount or 0, p.channel or "",
            p.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sales_report.csv"}
    )


def _export_target_report(prospects):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sr. No", "Prospect Name", "Assigned To", "Stage", "Status", "Won Amount", "Created At"
    ])
    
    for idx, p in enumerate(prospects, 1):
        writer.writerow([
            idx, p.prospect_name, p.assigned_to, p.current_stage, p.status.value,
            p.won_amount or 0, p.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=target_report.csv"}
    )


def _export_lost_report(prospects):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sr. No", "Prospect Name", "Phone", "Assigned To", "Category", "Products",
        "Reason For Lost", "Channel", "Closed Date", "Created At"
    ])
    
    for idx, p in enumerate(prospects, 1):
        writer.writerow([
            idx, p.prospect_name, f"{p.country_code} {p.phone}", p.assigned_to,
            p.category_id or "", ", ".join(p.product_ids), p.reason_for_lost or "",
            p.channel or "", p.closed_date.strftime("%Y-%m-%d") if p.closed_date else "",
            p.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=lost_prospect_report.csv"}
    )


def _export_inventory_report(products):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sr. No", "Product Name", "Category", "Rate", "Unit", "State", "City", "Usage Count", "Created At"
    ])
    
    for idx, p in enumerate(products, 1):
        writer.writerow([
            idx, p["name"], p["category_id"] or "", p["rate"], p["unit"], p["state"] or "",
            p["city"] or "", p["usage_count"], p["created_at"]
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_report.csv"}
    )
