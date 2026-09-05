"""
eTimeOffice biometric attendance integration endpoints.

Mounted under ``/attendance/integrations/etimeoffice``. Server-side only — the
frontend never talks to eTimeOffice directly and never receives provider
credentials, cookies, or session identifiers.

RBAC:
- POST /sync       — company admin/sub-admin only (triggers a provider read).
- GET /status      — any authenticated user of the company (safe metadata only).
- GET /mappings    — company admin/sub-admin only (directory + mapping list,
                      employee PII; suggestions are never assignments).
- PUT /mappings/x  — company admin/sub-admin only (confirm/change mapping).
- DELETE /mappings/x — company admin/sub-admin only (remove mapping).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_company_admin, get_current_user
from app.integrations.etimeoffice.client import ETimeOfficeError
from app.models.user import User
from app.services.etimeoffice_mapping_service import (
    ETimeOfficeMappingError,
    list_etimeoffice_mappings,
    set_etimeoffice_mapping,
)
from app.services.etimeoffice_sync_service import (
    ETimeOfficeNotConfigured,
    ETimeOfficeSyncInProgress,
    get_etimeoffice_status,
    sync_etimeoffice_for_company,
)

router = APIRouter()

SAFE_PROVIDER_MESSAGE = (
    "eTimeOffice synchronization failed. Existing attendance data remains available."
)

MAX_SYNC_WINDOW_DAYS = 62  # provider is a download API; keep windows bounded


def _require_company(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=400, detail="User does not belong to any company")
    return user.company_id


def _parse_date_param(value: Optional[str], field: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}. Use YYYY-MM-DD format.",
        )


class MappingUpdateRequest(BaseModel):
    """Employee assignment for one eTimeOffice external code. Pass null to
    remove an existing mapping (row stays listed as unmapped)."""

    employee_id: Optional[str] = Field(None, description="SynTask user id to map, or null to unmap")


@router.post("/sync")
async def etimeoffice_sync(
    from_date: Optional[str] = Query(None, description="Inclusive start date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Inclusive end date YYYY-MM-DD"),
    current_user: User = Depends(get_current_company_admin),
):
    """Run a manual read-only eTimeOffice attendance sync for the company."""
    company_id = _require_company(current_user)
    start = _parse_date_param(from_date, "from_date")
    end = _parse_date_param(to_date, "to_date")

    if start and end and (end - start).days + 1 > MAX_SYNC_WINDOW_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date window too wide (max {MAX_SYNC_WINDOW_DAYS} days).",
        )

    try:
        summary = await sync_etimeoffice_for_company(
            company_id, from_date=start, to_date=end
        )
    except ETimeOfficeNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ETimeOfficeSyncInProgress as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ETimeOfficeError:
        raise HTTPException(status_code=502, detail=SAFE_PROVIDER_MESSAGE)

    return {"success": True, "data": summary}


@router.get("/status")
async def etimeoffice_status(current_user: User = Depends(get_current_user)):
    """Company-scoped integration status (connection + last sync summary)."""
    company_id = _require_company(current_user)
    status_payload = await get_etimeoffice_status(company_id)
    return {"success": True, "data": status_payload}


@router.get("/mappings")
async def etimeoffice_mappings(
    refresh: bool = Query(False, description="Download the current eTimeOffice directory before listing"),
    current_user: User = Depends(get_current_company_admin),
):
    """List the company's eTimeOffice directory with mapping status.

    Each external employee shows its provider name, the mapped SynTask
    employee (if any) and a *suggestion* only — never an auto-assignment.
    """
    company_id = _require_company(current_user)
    try:
        payload = await list_etimeoffice_mappings(
            company_id, refresh=refresh, actor_id=str(current_user.id)
        )
    except ETimeOfficeNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ETimeOfficeError:
        raise HTTPException(status_code=502, detail=SAFE_PROVIDER_MESSAGE)
    return {"success": True, "data": payload}


@router.put("/mappings/{external_code}")
async def etimeoffice_upsert_mapping(
    external_code: str,
    payload: MappingUpdateRequest,
    current_user: User = Depends(get_current_company_admin),
):
    """Confirm or change which SynTask employee owns an eTimeOffice code."""
    company_id = _require_company(current_user)
    try:
        result = await set_etimeoffice_mapping(
            company_id,
            external_code,
            payload.employee_id,
            actor_id=str(current_user.id),
        )
    except ETimeOfficeMappingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "data": result}


@router.delete("/mappings/{external_code}")
async def etimeoffice_remove_mapping(
    external_code: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Remove the mapping for an eTimeOffice code (row stays listed)."""
    company_id = _require_company(current_user)
    try:
        result = await set_etimeoffice_mapping(company_id, external_code, None)
    except ETimeOfficeMappingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "data": result}
