from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
import csv
import io

from app.api.dependencies import get_current_user, require_module
from app.models.user import User, UserRole
from app.models.sales_product import SalesProduct
from app.models.sales_category import SalesCategory

router = APIRouter(dependencies=[Depends(require_module("sales"))])


def _ensure_create_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add products"
        )


def _ensure_delete_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Delete not allowed for your role"
        )


async def _validate_category(category_id: str, user: User):
    cat = await SalesCategory.get(category_id)
    if not cat or cat.deleted:
        raise HTTPException(status_code=400, detail="Invalid category")
    if user.role != UserRole.SUPER_ADMIN and cat.company_id != user.company_id:
        raise HTTPException(status_code=403, detail="Access denied to category")
    return cat


@router.get("/")
async def list_products(
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if category_id:
        query["category_id"] = category_id
    if state:
        query["state"] = state
    if city:
        query["city"] = city

    total = await SalesProduct.find(query).count()
    products = await SalesProduct.find(query).skip(skip).limit(limit).to_list()

    return {
        "total": total,
        "items": [
            {
                "id": str(p.id),
                "name": p.name,
                "category_id": p.category_id,
                "rate": p.rate,
                "unit": p.unit,
                "state": p.state,
                "city": p.city,
                "company_id": p.company_id,
            }
            for p in products
        ]
    }


@router.post("/")
async def create_products(
    products: List[dict],
    current_user: User = Depends(get_current_user)
):
    _ensure_create_permission(current_user)
    if not products:
        raise HTTPException(status_code=400, detail="No products provided")

    created = []
    for item in products:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        category_id = item.get("category_id")
        if not category_id:
            raise HTTPException(status_code=400, detail="category_id is required")
        await _validate_category(category_id, current_user)

        rate = float(item.get("rate", 0) or 0)
        unit = (item.get("unit") or "").strip()
        state = item.get("state")
        city = item.get("city")

        query = {
            "deleted": False,
            "category_id": category_id,
            "name": name,
        }
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = current_user.company_id

        existing = await SalesProduct.find_one(query)
        if existing:
            continue

        prod = SalesProduct(
            name=name,
            category_id=category_id,
            rate=rate,
            unit=unit,
            state=state,
            city=city,
            company_id=None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id,
            created_by=str(current_user.id),
        )
        await prod.insert()
        created.append(str(prod.id))
    return {"created": len(created), "ids": created}


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    current_user: User = Depends(get_current_user)
):
    _ensure_delete_permission(current_user)
    prod = await SalesProduct.get(product_id)
    if not prod or prod.deleted:
        raise HTTPException(status_code=404, detail="Product not found")
    if current_user.role != UserRole.SUPER_ADMIN and prod.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    prod.deleted = True
    await prod.save()
    return {"message": "Product deleted"}


@router.post("/bulk-upload")
async def bulk_upload_products(
    file: UploadFile = File(...),
    category_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    _ensure_create_permission(current_user)
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    required_columns = ["Product Name", "Rate", "Units", "State", "City"]
    if reader.fieldnames is None or any(col not in reader.fieldnames for col in required_columns):
        raise HTTPException(status_code=400, detail="Invalid columns. Required: Product Name, Rate, Units, State, City")

    created = 0
    skipped = 0
    for row in reader:
        name = (row.get("Product Name") or "").strip()
        if not name:
            skipped += 1
            continue
        rate = float(row.get("Rate") or 0)
        unit = (row.get("Units") or "").strip()
        state = (row.get("State") or "").strip() or None
        city = (row.get("City") or "").strip() or None

        cid = category_id or (row.get("Category") or "").strip()
        if not cid:
            skipped += 1
            continue
        try:
            await _validate_category(cid, current_user)
        except HTTPException:
            skipped += 1
            continue

        query = {
            "deleted": False,
            "category_id": cid,
            "name": name,
        }
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = current_user.company_id

        existing = await SalesProduct.find_one(query)
        if existing:
            skipped += 1
            continue

        prod = SalesProduct(
            name=name,
            category_id=cid,
            rate=rate,
            unit=unit,
            state=state,
            city=city,
            company_id=None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id,
            created_by=str(current_user.id),
        )
        await prod.insert()
        created += 1

    return {"created": created, "skipped": skipped}

