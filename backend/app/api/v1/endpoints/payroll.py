"""
Phase 6/7 — Payroll API endpoints.

Payroll period management, lifecycle transitions, employee records, payroll
workspace, and (Phase 7) payslip generation/preview/download/history.

Phase 7 invariant: a payslip is a presentation artifact of an already
PROCESSED payroll record — generation never recalculates payroll. All payslip
file access is authorized on the backend (company scope + payroll permission
or employee self-ownership); no unrestricted storage URL is exposed.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status

from app.api.dependencies import get_current_user, require_capability
from app.models.payroll import PayrollPeriod, PayrollPeriodStatus
from app.models.user import User
from app.services.payroll_service import (
    approve_payroll,
    calculate_payroll,
    create_payroll_period,
    get_payroll_period,
    get_period_records,
    get_record,
    list_payroll_periods,
    move_to_review,
    process_payroll,
    serialize_period,
    serialize_record,
)
from app.services.payslip_service import (
    _require_payslip_access,
    build_payslip_file_response,
    current_payslip_for_records,
    generate_payslip,
    generate_period_payslips,
    get_my_payslips,
    get_payslip,
    has_payroll_manage,
    has_payroll_view,
    list_record_payslips,
    payslip_state_for_record,
    regenerate_payslip,
    serialize_payslip,
)

router = APIRouter()


def _require_company(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return user.company_id


# =============================================================================
# Payroll Periods
# =============================================================================

@router.get("/periods")
async def list_periods(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_capability("payroll.view")),
):
    company_id = _require_company(current_user)
    periods = await list_payroll_periods(company_id, status_filter=status_filter)
    return {"success": True, "data": [serialize_period(p) for p in periods]}


@router.post("/periods", status_code=http_status.HTTP_201_CREATED)
async def create_period(
    payload: dict,
    current_user: User = Depends(require_capability("payroll.manage")),
):
    company_id = _require_company(current_user)
    period = await create_payroll_period(company_id, current_user, payload)
    return {"success": True, "data": serialize_period(period)}


@router.get("/periods/{period_id}")
async def get_period(
    period_id: str,
    current_user: User = Depends(require_capability("payroll.view")),
):
    company_id = _require_company(current_user)
    period = await get_payroll_period(company_id, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    return {"success": True, "data": serialize_period(period)}


# =============================================================================
# Lifecycle Transitions
# =============================================================================

@router.post("/periods/{period_id}/calculate")
async def calculate_period(
    period_id: str,
    current_user: User = Depends(require_capability("payroll.manage")),
):
    company_id = _require_company(current_user)
    period = await calculate_payroll(company_id, period_id, current_user)
    return {"success": True, "data": serialize_period(period)}


@router.post("/periods/{period_id}/review")
async def review_period(
    period_id: str,
    current_user: User = Depends(require_capability("payroll.manage")),
):
    company_id = _require_company(current_user)
    period = await move_to_review(company_id, period_id, current_user)
    return {"success": True, "data": serialize_period(period)}


@router.post("/periods/{period_id}/approve")
async def approve_period(
    period_id: str,
    current_user: User = Depends(require_capability("payroll.approve")),
):
    company_id = _require_company(current_user)
    period = await approve_payroll(company_id, period_id, current_user)
    return {"success": True, "data": serialize_period(period)}


@router.post("/periods/{period_id}/process")
async def process_period(
    period_id: str,
    current_user: User = Depends(require_capability("payroll.approve")),
):
    company_id = _require_company(current_user)
    period = await process_payroll(company_id, period_id, current_user)
    return {"success": True, "data": serialize_period(period)}


# =============================================================================
# Payroll Records
# =============================================================================

async def _record_permission_flags(
    actor: User,
    period: PayrollPeriod,
    payslip_by_record: dict,
):
    """Compute payslip permission flags shared by list/detail responses."""
    can_manage = await has_payroll_manage(actor)
    can_view = await has_payroll_view(actor)
    period_processed = period.status == PayrollPeriodStatus.PROCESSED

    flags = {}
    for record_id, payslip in payslip_by_record.items():
        flags[record_id] = {
            "can_generate": can_manage and period_processed and payslip is None,
            "can_preview": bool(payslip) and (can_view or str(actor.id) == payslip.employee_id),
            "can_download": bool(payslip) and (can_view or str(actor.id) == payslip.employee_id),
            "can_regenerate": bool(payslip) and can_manage and period_processed,
        }
    return flags


@router.get("/periods/{period_id}/records")
async def list_records(
    period_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_capability("payroll.view")),
):
    company_id = _require_company(current_user)
    period = await get_payroll_period(company_id, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    records = await get_period_records(
        company_id, period_id,
        status_filter=status_filter, skip=skip, limit=limit,
    )
    record_ids = [str(r.id) for r in records]
    payslip_by_record = await current_payslip_for_records(company_id, record_ids)
    flags = await _record_permission_flags(current_user, period, payslip_by_record)
    items = []
    for record in records:
        record_id = str(record.id)
        payslip = payslip_by_record.get(record_id)
        items.append(serialize_record(
            record,
            payslip=payslip_state_for_record(payslip),
            **flags.get(record_id, {}),
        ))
    return {"success": True, "data": items}


@router.get("/records/{record_id}")
async def get_payroll_record(
    record_id: str,
    current_user: User = Depends(require_capability("payroll.view")),
):
    company_id = _require_company(current_user)
    record = await get_record(company_id, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    period = await get_payroll_period(company_id, record.payroll_period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    payslip_by_record = await current_payslip_for_records(company_id, [record_id])
    flags = await _record_permission_flags(current_user, period, payslip_by_record)
    return {
        "success": True,
        "data": serialize_record(
            record,
            payslip=payslip_state_for_record(payslip_by_record.get(record_id)),
            **flags.get(record_id, {}),
        ),
    }


# =============================================================================
# Phase 7 — Payslips
# =============================================================================

@router.post("/records/{record_id}/payslip", status_code=http_status.HTTP_201_CREATED)
async def create_record_payslip(
    record_id: str,
    current_user: User = Depends(require_capability("payroll.manage")),
):
    """Generate the payslip for one processed payroll record (idempotent)."""
    company_id = _require_company(current_user)
    payslip = await generate_payslip(company_id, record_id, current_user)
    return {"success": True, "data": await serialize_payslip(payslip, actor=current_user)}


@router.post("/periods/{period_id}/payslips/generate")
async def generate_period_payslips_endpoint(
    period_id: str,
    regenerate: bool = Query(False),
    current_user: User = Depends(require_capability("payroll.manage")),
):
    """Bulk-generate payslips for all eligible records of a processed period."""
    company_id = _require_company(current_user)
    summary = await generate_period_payslips(
        company_id, period_id, current_user, regenerate=regenerate
    )
    return {"success": True, "data": summary}


@router.get("/records/{record_id}/payslips")
async def get_record_payslips(
    record_id: str,
    current_user: User = Depends(require_capability("payroll.view")),
):
    """Version history for one payroll record (newest first)."""
    company_id = _require_company(current_user)
    items = await list_record_payslips(company_id, record_id, current_user)
    return {"success": True, "data": items}


@router.get("/payslips/{payslip_id}")
async def get_payslip_metadata(
    payslip_id: str,
    current_user: User = Depends(get_current_user),
):
    """Payslip metadata (payroll permission OR the payslip's own employee)."""
    company_id = _require_company(current_user)
    payslip = await get_payslip(company_id, payslip_id)
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    await _require_payslip_access(company_id, payslip, current_user)
    return {"success": True, "data": await serialize_payslip(payslip, actor=current_user)}


@router.get("/payslips/{payslip_id}/preview")
async def preview_payslip(
    payslip_id: str,
    current_user: User = Depends(get_current_user),
):
    """Inline preview of a payslip PDF (authorized, never a raw storage URL)."""
    company_id = _require_company(current_user)
    payslip = await get_payslip(company_id, payslip_id)
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    await _require_payslip_access(company_id, payslip, current_user)
    return await build_payslip_file_response(payslip, download=False)


@router.get("/payslips/{payslip_id}/download")
async def download_payslip(
    payslip_id: str,
    current_user: User = Depends(get_current_user),
):
    """Secure payslip download (authorized, attachment disposition)."""
    company_id = _require_company(current_user)
    payslip = await get_payslip(company_id, payslip_id)
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    await _require_payslip_access(company_id, payslip, current_user)
    return await build_payslip_file_response(payslip, download=True)


@router.post("/payslips/{payslip_id}/regenerate")
async def regenerate_payslip_endpoint(
    payslip_id: str,
    current_user: User = Depends(require_capability("payroll.manage")),
):
    """Regenerate the next payslip version from the SAME processed snapshot."""
    company_id = _require_company(current_user)
    payslip = await regenerate_payslip(company_id, payslip_id, current_user)
    return {"success": True, "data": await serialize_payslip(payslip, actor=current_user)}


@router.get("/me/payslips")
async def my_payslips(
    current_user: User = Depends(get_current_user),
):
    """The current user's own payslips (Phase 8 self-service readiness).

    Only ever returns the caller's own payslips — the query is scoped to the
    caller's user id and company, never to values from the request path.
    """
    items = await get_my_payslips(current_user)
    return {"success": True, "data": items}
