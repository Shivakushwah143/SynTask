from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
import csv
import io

from app.api.dependencies import get_current_user, require_module
from app.models.user import User, UserRole
from app.models.sales_category import SalesCategory
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


def _ensure_create_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add categories"
        )


def _ensure_delete_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Delete not allowed for your role"
        )


@router.get("/")
async def list_categories(
    search: Optional[str] = None,
    name: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    # Support both `search` and legacy `name` query parameter (UI sometimes uses `name`)
    q = search or name
    if q:
        query["name"] = {"$regex": q, "$options": "i"}

    total = await SalesCategory.find(query).count()
    categories = await SalesCategory.find(query).skip(skip).limit(limit).to_list()

    return {
        "total": total,
        "items": [
            {
                "id": str(cat.id),
                "name": cat.name,
                "company_id": cat.company_id,
            }
            for cat in categories
        ]
    }


@router.post("/")
async def create_category(
    name: str,
    current_user: User = Depends(require_module("sales_crm"))
):
    _ensure_create_permission(current_user)
    normalized = name.strip()
    query = {
        "deleted": False,
        "name": normalized,
    }
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id

    existing = await SalesCategory.find_one(query)
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    cat = SalesCategory(
        name=normalized,
        company_id=None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id,
        created_by=str(current_user.id),
    )
    await cat.insert()
    return {"id": str(cat.id), "name": cat.name}


@router.put("/{category_id}")
async def update_category(
    category_id: str,
    name: str,
    current_user: User = Depends(require_module("sales_crm"))
):
    _ensure_create_permission(current_user)
    cat = await SalesCategory.get(category_id)
    if not cat or cat.deleted:
        raise HTTPException(status_code=404, detail="Category not found")
    if current_user.role != UserRole.SUPER_ADMIN and cat.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    normalized = name.strip()
    dup_query = {
        "deleted": False,
        "name": normalized,
    }
    if current_user.role != UserRole.SUPER_ADMIN:
        dup_query["company_id"] = current_user.company_id

    existing = await SalesCategory.find_one(dup_query)
    if existing and existing.id != cat.id:
        raise HTTPException(status_code=400, detail="Category already exists")

    cat.name = normalized
    await cat.save()
    return {"id": str(cat.id), "name": cat.name}


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    current_user: User = Depends(require_module("sales_crm"))
):
    _ensure_delete_permission(current_user)
    cat = await SalesCategory.get(category_id)
    if not cat or cat.deleted:
        raise HTTPException(status_code=404, detail="Category not found")
    if current_user.role != UserRole.SUPER_ADMIN and cat.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    cat.deleted = True
    await cat.save()
    return {"message": "Category deleted"}


@router.post("/bulk-upload")
async def bulk_upload_categories(
    file: UploadFile = File(...),
    current_user: User = Depends(require_module("sales_crm"))
):
    _ensure_create_permission(current_user)
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    required_columns = ["Category Name"]
    if reader.fieldnames is None or any(col not in reader.fieldnames for col in required_columns):
        raise HTTPException(status_code=400, detail="Invalid columns. Required: Category Name")

    created = 0
    skipped = 0
    for row in reader:
        name = (row.get("Category Name") or "").strip()
        if not name:
            skipped += 1
            continue
        query = {"deleted": False, "name": name}
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = current_user.company_id
        existing = await SalesCategory.find_one(query)
        if existing:
            skipped += 1
            continue
        cat = SalesCategory(
            name=name,
            company_id=None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id,
            created_by=str(current_user.id),
        )
        await cat.insert()
        created += 1
    return {"created": created, "skipped": skipped}

