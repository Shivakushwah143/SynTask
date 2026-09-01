"""
Phase 7 — Payslip service.

The Payslip domain is a *presentation + secure-distribution* layer over an
already finalized (PROCESSED) PayrollRecord:

    Processed PayrollRecord
            ↓
    PayslipDataBuilder  (snapshot → presentation DTO — never recalculates)
            ↓
    PayslipPDFRenderer  (pure ReportLab render → bytes)
            ↓
    Existing FileService / Cloudinary storage
            ↓
    Payslip metadata (versioned, company-scoped)
            ↓
    Authorized preview / download (backend re-checks every time)

Security invariants (backend authoritative — the frontend can never bypass
them by constructing storage URLs):
- company scoping on every operation;
- payslip generation/regeneration requires ``payroll.manage`` (company admin
  or HR-department capability);
- preview/download/metadata require ``payroll.view`` OR the payslip's own
  employee (employee A can never access employee B's payslip);
- managers without payroll permission are denied — reporting relationship
  does not grant salary access;
- no unrestricted public storage URL is ever returned to clients.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, UploadFile, status

from app.core.clock import utc_now
from app.models.company import Company
from app.models.department import Department, DepartmentType
from app.models.payroll import (
    PayrollPeriod,
    PayrollPeriodStatus,
    PayrollRecord,
    PayrollRecordStatus,
)
from app.models.payslip import Payslip, PayslipStatus
from app.models.user import User, UserRole
from app.services.cloudinary_storage import CloudinaryStorage
from app.services.file_service import FileService
from app.services.invoice_pdf import safe_text, to_decimal
from app.services.payslip_pdf import render_payslip_pdf

logger = logging.getLogger(__name__)

# Storage scope/folder for payslips — same FileService pipeline as HR documents.
PAYSLIP_STORAGE_SCOPE = "payslips"
PAYSLIP_STORAGE_URL_PREFIX = "/uploads/payslips"

_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
_FILENAME_UNSAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")

# Tolerance for the stored consistency check (gross − deductions ≈ net).
_TOLERANCE = "0.011"


# =============================================================================
# Permission helpers (mirror the endpoint dependencies + HR document service)
# =============================================================================


def _role(user: User) -> UserRole:
    return user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))


async def _is_company_admin(user: User) -> bool:
    return _role(user) in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN)


async def _is_hr_department(user: User) -> bool:
    if not user.company_id or not user.department_id:
        return False
    department = await Department.get(user.department_id)
    return bool(
        department
        and department.company_id == user.company_id
        and department.deleted_at is None
        and department.department_type == DepartmentType.HR
    )


async def _has_capability(user: User, capability: str) -> bool:
    from app.models.capability import get_capabilities_for_role

    if not user.company_id or not user.department_id:
        return False
    department = await Department.get(user.department_id)
    if not department or department.company_id != user.company_id or department.deleted_at is not None:
        return False
    allowed = await get_capabilities_for_role(
        department.department_type, user.role, user.company_id
    )
    return capability in allowed


async def has_payroll_view(user: User) -> bool:
    """View access to payroll/payslips: company admins + HR staff with payroll.view."""
    if await _is_company_admin(user):
        return True
    if await _is_hr_department(user):
        return await _has_capability(user, "payroll.view")
    return False


async def has_payroll_manage(user: User) -> bool:
    """Generation/regeneration access: company admins + HR staff with payroll.manage."""
    if await _is_company_admin(user):
        return True
    if await _is_hr_department(user):
        return await _has_capability(user, "payroll.manage")
    return False


# =============================================================================
# Payslip data builder — snapshot → presentation DTO (no recalculation)
# =============================================================================


async def _stored_department_name(company_id: str, department_id: str) -> Optional[str]:
    department = await Department.get(department_id)
    if department and department.company_id == company_id and department.deleted_at is None:
        return department.name
    return None


def _snapshot_hash(record: PayrollRecord) -> str:
    """Canonical integrity marker for the snapshot used to render a payslip."""
    payload = {
        "employee_name": record.employee_name,
        "employee_number": record.employee_number,
        "department": record.department,
        "designation": record.designation,
        "payable_days": record.payable_days,
        "attendance": record.attendance_snapshot,
        "earnings": [
            {
                "component_code": e.component_code,
                "component_name": e.component_name,
                "configured_amount": e.configured_amount,
                "proration_factor": e.proration_factor,
                "calculated_amount": e.calculated_amount,
            }
            for e in (record.earnings or [])
        ],
        "deductions": [
            {
                "component_code": d.component_code,
                "component_name": d.component_name,
                "configured_amount": d.configured_amount,
                "calculated_amount": d.calculated_amount,
            }
            for d in (record.deductions or [])
        ],
        "gross_salary": record.gross_salary,
        "total_deductions": record.total_deductions,
        "net_salary": record.net_salary,
        "currency": record.currency,
    }
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _assert_snapshot_consistent(record: PayrollRecord) -> None:
    """Block payslip generation for an inconsistent processed snapshot.

    Uses stored values only — never recomputes or overrides anything. If the
    snapshot itself is inconsistent the root cause belongs to Phase 6.
    """
    gross = to_decimal(record.gross_salary, "gross_salary")
    deductions = to_decimal(record.total_deductions, "total_deductions")
    net = to_decimal(record.net_salary, "net_salary")
    if abs((gross - deductions) - net) > to_decimal(_TOLERANCE, "tolerance"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Payslip cannot be generated because the payroll record snapshot is "
                "inconsistent (gross salary − total deductions ≠ net salary). "
                "Review the payroll record before generating the payslip."
            ),
        )


def _company_dict(company: Optional[Company]) -> Dict[str, Any]:
    if company is None:
        return {}
    return {
        "name": company.name,
        # No per-company logo exists in the Company model; the renderer falls
        # back to the shared SynTask logo asset. Kept as a hook for future use.
        "logo_url": None,
        "address": company.address,
        "city": company.city,
        "state": company.state,
        "zip_code": company.zip_code,
        "country": company.country,
        "phone": company.phone,
        "email": company.email,
        "website": company.website,
        "registration_number": company.registration_number,
    }


def payslip_file_name(record: PayrollRecord, period: PayrollPeriod) -> str:
    """Deterministic, sanitized, safe file name (never leaks Mongo ids)."""
    employee_number = safe_text(record.employee_number).strip() or "EMP"
    safe_emp = _FILENAME_UNSAFE_RE.sub("-", employee_number).strip("-._") or "EMP"
    return f"PAYSLIP-{safe_emp}-{period.year:04d}-{period.month:02d}.pdf"


async def build_payslip_data(
    company_id: str,
    record: PayrollRecord,
    period: PayrollPeriod,
    *,
    generated_at: Optional[datetime] = None,
    version: int = 1,
    file_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert a PROCESSED payroll record snapshot into the PDF presentation DTO.

    Strictly reads stored snapshot fields. It never calls attendance, salary,
    leave, or payroll calculation services.
    """
    # Critical missing data blocks generation with a clear error.
    if not record.employee_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payslip cannot be generated because the payroll record is missing the employee name snapshot.",
        )
    if not period or not period.year or not period.month:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payslip cannot be generated because the payroll period snapshot is missing.",
        )
    try:
        to_decimal(record.gross_salary, "gross_salary")
        to_decimal(record.net_salary, "net_salary")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payslip cannot be generated because the payroll record is missing gross/net salary values.",
        ) from None

    _assert_snapshot_consistent(record)

    company = await Company.get(company_id)
    department_id = record.department
    department_name = await _stored_department_name(company_id, department_id) if department_id and ObjectId.is_valid(str(department_id)) else (department_id or None)

    attendance = record.attendance_snapshot or {}
    earnings = [
        {
            "component_code": item.component_code,
            "component_name": item.component_name,
            "configured_amount": item.configured_amount,
            "calculated_amount": item.calculated_amount,
            "source": item.source,
        }
        for item in (record.earnings or [])
    ]
    deductions = [
        {
            "component_code": item.component_code,
            "component_name": item.component_name,
            "configured_amount": item.configured_amount,
            "calculated_amount": item.calculated_amount,
            "source": item.source,
        }
        for item in (record.deductions or [])
    ]

    period_start = period.period_start.date() if isinstance(period.period_start, datetime) else period.period_start
    period_end = period.period_end.date() if isinstance(period.period_end, datetime) else period.period_end
    period_label = f"{_MONTHS[period.month - 1]} {period.year}"

    return {
        "company": _company_dict(company),
        "employee": {
            "name": record.employee_name,
            "employee_number": record.employee_number,
            "department": department_name,
            "designation": record.designation,
        },
        "period": {
            "year": period.year,
            "month": period.month,
            "label": period_label,
            "period_start": period_start,
            "period_end": period_end,
            "period_range": f"{_fmt_date(period_start)} – {_fmt_date(period_end)}",
        },
        "attendance": {
            "working_days": attendance.get("working_days", 0),
            "present_days": attendance.get("present_days", 0),
            "paid_leave_days": attendance.get("paid_leave_days", 0),
            "unpaid_leave_days": attendance.get("unpaid_leave_days", 0),
            "absent_days": attendance.get("absent_days", 0),
            "half_days": attendance.get("half_days", 0),
            "holiday_days": attendance.get("holiday_days", 0),
            "week_off_days": attendance.get("week_off_days", 0),
        },
        "payable_days": record.payable_days,
        "earnings": earnings,
        "deductions": deductions,
        "totals": {
            "gross": record.gross_salary,
            "total_deductions": record.total_deductions,
            "net": record.net_salary,
        },
        "currency": record.currency or "INR",
        "generated_at": generated_at or utc_now(),
        "version": version,
        "file_name": file_name or payslip_file_name(record, period),
    }


def _fmt_date(value) -> str:
    if value is None:
        return "-"
    try:
        return value.strftime("%d %b %Y")
    except Exception:
        return safe_text(value)


# =============================================================================
# Storage (reuses existing FileService — no new storage subsystem)
# =============================================================================


async def _store_payslip_pdf(content: bytes, file_name: str) -> dict:
    """Store payslip PDF through the existing FileService pipeline.

    When Cloudinary is configured, sensitive=True uploads as authenticated.
    Delivery still goes only through backend-authorized preview/download
    endpoints, so raw Cloudinary URLs are never exposed to clients.
    """
    upload_dir = FileService.resolve_upload_dir() / "payslips"
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", file_name).strip("-._") or "payslip.pdf"
    upload = UploadFile(filename=safe_name, file=BytesIO(content))
    stored = await FileService.store_uploaded_file(
        upload,
        upload_dir=upload_dir,
        url_prefix=PAYSLIP_STORAGE_URL_PREFIX,
        scope=PAYSLIP_STORAGE_SCOPE,
        sensitive=True,
    )
    stored["file_size"] = stored.get("size", len(content))
    return stored


async def _delete_stored_by_payload(stored: dict) -> None:
    """Best-effort storage cleanup when metadata write fails after upload."""
    try:
        if stored.get("cloudinary_public_id"):
            CloudinaryStorage.delete(
                stored["cloudinary_public_id"],
                stored.get("cloudinary_resource_type") or "auto",
                stored.get("cloudinary_delivery_type") or "authenticated",
            )
        else:
            path = stored.get("file_path")
            if path and Path(path).is_file():
                Path(path).unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to clean up stored payslip file")


def _build_payslip_from_stored(
    stored: dict,
    *,
    company_id: str,
    record_id: str,
    period_id: str,
    employee_id: str,
    version: int,
    generated_by: str,
    file_name: str,
    snapshot_hash: str,
) -> Payslip:
    if stored.get("cloudinary_public_id"):
        provider = "cloudinary"
        reference = stored["cloudinary_public_id"]
        resource_type = stored.get("cloudinary_resource_type")
        delivery_type = stored.get("cloudinary_delivery_type")
    else:
        provider = "local"
        upload_dir = FileService.resolve_upload_dir()
        try:
            reference = str(Path(stored["file_path"]).resolve().relative_to(upload_dir.resolve()))
        except ValueError:
            reference = Path(stored["file_path"]).name
        resource_type = None
        delivery_type = None
    return Payslip(
        company_id=company_id,
        payroll_record_id=record_id,
        payroll_period_id=period_id,
        employee_id=employee_id,
        version=version,
        file_name=file_name,
        mime_type="application/pdf",
        file_size=stored["file_size"],
        storage_provider=provider,
        storage_reference=reference,
        storage_url=stored.get("file_url"),
        storage_resource_type=resource_type,
        storage_delivery_type=delivery_type,
        checksum=stored.get("checksum"),
        generated_by=generated_by,
        generated_at=utc_now(),
        status=PayslipStatus.GENERATED,
        payroll_snapshot_hash=snapshot_hash,
    )


def _validate_pdf(pdf: bytes) -> None:
    """Never persist an empty/corrupt 'PDF' as a successful payslip."""
    if not pdf or len(pdf) < 4 or not pdf.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payslip PDF generation produced an invalid file.",
        )


# =============================================================================
# Queries
# =============================================================================


async def current_payslip(company_id: str, record_id: str) -> Optional[Payslip]:
    """The current (highest-version) payslip for one payroll record, if any."""
    docs = await Payslip.find(
        {"company_id": company_id, "payroll_record_id": record_id}
    ).sort("-version").limit(1).to_list()
    return docs[0] if docs else None


async def current_payslip_for_records(company_id: str, record_ids: List[str]) -> Dict[str, Payslip]:
    """Batch: current payslip per payroll record (one DB query)."""
    if not record_ids:
        return {}
    payslips = await Payslip.find(
        {"company_id": company_id, "payroll_record_id": {"$in": list(record_ids)}}
    ).to_list()
    best: Dict[str, Payslip] = {}
    for payslip in payslips:
        current = best.get(payslip.payroll_record_id)
        if current is None or payslip.version > current.version:
            best[payslip.payroll_record_id] = payslip
    return best


async def get_payslip(company_id: str, payslip_id: str) -> Optional[Payslip]:
    payslip = await Payslip.get(payslip_id)
    if not payslip or payslip.company_id != company_id:
        return None
    return payslip


# =============================================================================
# Authorization (backend authoritative)
# =============================================================================


async def _require_payslip_access(company_id: str, payslip: Payslip, actor: User, *, manage: bool = False) -> None:
    if payslip.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")
    if manage:
        if not await has_payroll_manage(actor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage this payslip",
            )
        return
    if await has_payroll_view(actor):
        return
    if payslip.employee_id and str(actor.id) == payslip.employee_id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access this payslip",
    )


async def _require_generation_access(actor: User) -> None:
    if not await has_payroll_manage(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to generate payslips",
        )


# =============================================================================
# Generation
# =============================================================================


async def _load_processed_record(company_id: str, record_id: str) -> PayrollRecord:
    record = await PayrollRecord.get(record_id)
    if not record or record.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")
    period = await PayrollPeriod.get(record.payroll_period_id)
    if not period or period.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payroll record is missing its payroll period.",
        )
    if period.status != PayrollPeriodStatus.PROCESSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payslip can only be generated after payroll is processed.",
        )
    return record


async def _next_version(company_id: str, record_id: str) -> int:
    payslips = await Payslip.find(
        {"company_id": company_id, "payroll_record_id": record_id}
    ).to_list()
    return max((p.version for p in payslips), default=0) + 1


async def generate_payslip(
    company_id: str,
    record_id: str,
    actor: User,
    *,
    force: bool = False,
) -> Payslip:
    """Generate (or return the existing) payslip for one processed record.

    Idempotent: without ``force`` an existing current payslip is returned
    instead of producing a duplicate. With ``force`` a new version is created.
    """
    await _require_generation_access(actor)
    await _load_processed_record(company_id, record_id)

    if not force:
        existing = await current_payslip(company_id, record_id)
        if existing:
            return existing

    record = await PayrollRecord.get(record_id)
    period = await PayrollPeriod.get(record.payroll_period_id)
    file_name = payslip_file_name(record, period)
    snapshot_hash = _snapshot_hash(record)
    data = await build_payslip_data(
        company_id, record, period,
        generated_at=utc_now(), version=1, file_name=file_name,
    )
    version = await _next_version(company_id, record_id)
    data["version"] = version

    try:
        pdf = render_payslip_pdf(data)
    except Exception:
        logger.exception("Payslip PDF rendering failed for record %s", record_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payslip could not be generated because the payroll snapshot could not be rendered.",
        ) from None
    _validate_pdf(pdf)

    stored = await _store_payslip_pdf(pdf, file_name)
    payslip = _build_payslip_from_stored(
        stored,
        company_id=company_id,
        record_id=str(record.id),
        period_id=str(period.id),
        employee_id=record.employee_id,
        version=version,
        generated_by=str(actor.id),
        file_name=file_name,
        snapshot_hash=snapshot_hash,
    )
    try:
        await payslip.insert()
    except Exception:
        # Storage succeeded but metadata failed — never leave an orphan file
        # with no metadata pointing at it.
        await _delete_stored_by_payload(stored)
        raise

    await _record_payslip_event(company_id, "payslip_generated", actor, payslip, data)
    return payslip


async def regenerate_payslip(company_id: str, payslip_id: str, actor: User) -> Payslip:
    """Create the next version from the SAME processed snapshot.

    Never alters payroll values — only re-renders presentation from the stored
    snapshot. Historical files are preserved (versioning), not deleted.
    """
    await _require_generation_access(actor)
    payslip = await get_payslip(company_id, payslip_id)
    if not payslip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payslip not found")

    record = await PayrollRecord.get(payslip.payroll_record_id)
    if not record or record.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")
    period = await PayrollPeriod.get(record.payroll_period_id)
    if not period or period.company_id != company_id or period.status != PayrollPeriodStatus.PROCESSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payslip can only be regenerated while the payroll period remains processed.",
        )

    file_name = payslip_file_name(record, period)
    snapshot_hash = _snapshot_hash(record)
    data = await build_payslip_data(
        company_id, record, period,
        generated_at=utc_now(), version=1, file_name=file_name,
    )
    version = await _next_version(company_id, str(record.id))
    data["version"] = version

    try:
        pdf = render_payslip_pdf(data)
    except Exception:
        logger.exception("Payslip PDF re-rendering failed for record %s", record.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payslip regeneration failed because the payroll snapshot could not be rendered.",
        ) from None
    _validate_pdf(pdf)

    stored = await _store_payslip_pdf(pdf, file_name)
    new_payslip = _build_payslip_from_stored(
        stored,
        company_id=company_id,
        record_id=str(record.id),
        period_id=str(period.id),
        employee_id=record.employee_id,
        version=version,
        generated_by=str(actor.id),
        file_name=file_name,
        snapshot_hash=snapshot_hash,
    )
    try:
        await new_payslip.insert()
    except Exception:
        await _delete_stored_by_payload(stored)
        raise

    await _record_payslip_event(company_id, "payslip_regenerated", actor, new_payslip, data)
    return new_payslip


async def generate_period_payslips(
    company_id: str,
    period_id: str,
    actor: User,
    *,
    regenerate: bool = False,
) -> Dict[str, Any]:
    """Bulk generation for every eligible record of a processed period.

    Never fails the whole batch because one record errors: per-record failures
    are collected and returned. Repeated runs are idempotent unless
    ``regenerate`` is set.
    """
    await _require_generation_access(actor)
    period = await PayrollPeriod.get(period_id)
    if not period or period.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")
    if period.status != PayrollPeriodStatus.PROCESSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payslips can only be generated after payroll is processed.",
        )

    records = await PayrollRecord.find(
        {"company_id": company_id, "payroll_period_id": period_id}
    ).to_list()

    summary: Dict[str, Any] = {"generated": [], "already_existing": [], "failed": [], "skipped": []}
    for record in records:
        record_label = {"record_id": str(record.id), "employee_name": record.employee_name or record.employee_id}
        if record.status == PayrollRecordStatus.BLOCKED:
            summary["skipped"].append({**record_label, "reason": "blocked record"})
            continue
        existing = await current_payslip(company_id, str(record.id))
        if existing and not regenerate:
            summary["already_existing"].append(
                {**record_label, "payslip_id": str(existing.id), "version": existing.version}
            )
            continue
        try:
            payslip = await generate_payslip(company_id, str(record.id), actor, force=regenerate)
            summary["generated"].append(
                {**record_label, "payslip_id": str(payslip.id), "version": payslip.version}
            )
        except HTTPException as exc:
            summary["failed"].append({**record_label, "error": str(exc.detail)})
        except Exception as exc:
            logger.exception("Payslip generation failed for record %s", record.id)
            summary["failed"].append({**record_label, "error": f"Unexpected error: {type(exc).__name__}"})

    return summary


# =============================================================================
# History / self-service
# =============================================================================


async def list_record_payslips(company_id: str, record_id: str, actor: User) -> List[dict]:
    """Version history for one record (newest first)."""
    if not await has_payroll_view(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view payslips",
        )
    record = await PayrollRecord.get(record_id)
    if not record or record.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    payslips = await Payslip.find(
        {"company_id": company_id, "payroll_record_id": record_id}
    ).sort("-version").to_list()
    items = []
    for payslip in payslips:
        items.append(await serialize_payslip(payslip, actor=actor))
    return items


async def get_my_payslips(user: User) -> List[dict]:
    """The current user's own payslips (latest version per record).

    Directly powers Phase 8 (Employee Self-Service → My Salary / Payslips).
    Employee A can only ever see their own payslips.
    """
    if not user.company_id:
        return []
    payslips = await Payslip.find(
        {"company_id": user.company_id, "employee_id": str(user.id)}
    ).sort("-generated_at").to_list()

    # Keep only the latest version per payroll record.
    by_record: Dict[str, Payslip] = {}
    for payslip in payslips:
        current = by_record.get(payslip.payroll_record_id)
        if current is None or payslip.version > current.version:
            by_record[payslip.payroll_record_id] = payslip

    record_ids = list(by_record.keys())
    records = await PayrollRecord.find(
        {"company_id": user.company_id, "employee_id": str(user.id)}
    ).to_list()
    record_by_id = {str(record.id): record for record in records}

    period_ids = {record.payroll_period_id for record in records}
    valid_period_ids = [ObjectId(pid) for pid in period_ids if ObjectId.is_valid(pid)]
    periods = (
        await PayrollPeriod.find({"company_id": user.company_id, "_id": {"$in": valid_period_ids}}).to_list()
        if valid_period_ids
        else []
    )
    period_by_id = {str(period.id): period for period in periods}

    items = []
    for record_id, payslip in by_record.items():
        record = record_by_id.get(record_id)
        period = period_by_id.get(record.payroll_period_id) if record else None
        period_payload = None
        if period:
            period_payload = {
                "year": period.year,
                "month": period.month,
                "label": f"{_MONTHS[period.month - 1]} {period.year}",
            }
        items.append({
            "payslip_id": str(payslip.id),
            "payroll_record_id": record_id,
            "version": payslip.version,
            "generated_at": payslip.generated_at,
            "period": period_payload,
            "year": period.year if period else None,
            "month": period.month if period else None,
            "gross": record.gross_salary if record else None,
            "deductions": record.total_deductions if record else None,
            "net": record.net_salary if record else None,
            "currency": record.currency if record else "INR",
            "can_download": True,
        })
    return items


# =============================================================================
# File response / serialization
# =============================================================================


async def build_payslip_file_response(payslip: Payslip, *, download: bool = False):
    """Secure payslip PDF delivery — authorization happens BEFORE this.

    Follows the same pattern as the Invoice PDF endpoint: the PDF is
    re-rendered on the fly from the stored payroll record snapshot and
    streamed directly to the client.  Cloudinary URLs are never exposed.

    Flow:
    1. Try local disk cache (fast, no extra DB queries).
    2. Re-render from the PayrollRecord snapshot (always works).
    """
    from fastapi.responses import FileResponse, Response

    def _pdf_response(pdf_bytes: bytes):
        disposition = "attachment" if download else "inline"
        return Response(
            content=pdf_bytes,
            media_type=payslip.mime_type or "application/pdf",
            headers={
                "Content-Disposition": f'{disposition}; filename="{payslip.file_name or "payslip.pdf"}"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    # ── Fast path: local disk cache ─────────────────────────────────────
    if payslip.storage_provider == "local" and payslip.storage_reference:
        from app.api.v1.endpoints.files import resolve_upload_path

        try:
            path = resolve_upload_path(FileService.resolve_upload_dir(), payslip.storage_reference)
        except HTTPException:
            path = None
        if path and path.exists() and path.is_file():
            return FileResponse(
                path=path,
                media_type=payslip.mime_type or "application/pdf",
                filename=payslip.file_name,
                content_disposition_type="attachment" if download else "inline",
            )

    # ── Re-render from stored payroll snapshot (Invoice pattern) ─────────
    if payslip.storage_provider == "cloudinary" and payslip.storage_reference:
        pdf_bytes = CloudinaryStorage.download_content(
            payslip.storage_reference,
            resource_type=payslip.storage_resource_type or "auto",
            delivery_type=payslip.storage_delivery_type or "authenticated",
            storage_url=payslip.storage_url,
        )
        if pdf_bytes and pdf_bytes.startswith(b"%PDF"):
            return _pdf_response(pdf_bytes)

    record = await PayrollRecord.get(payslip.payroll_record_id)
    if not record or record.company_id != payslip.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The stored payslip file is unavailable. The payroll record is missing.",
        )
    period = await PayrollPeriod.get(record.payroll_period_id)
    if not period or period.company_id != payslip.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The stored payslip file is unavailable. The payroll period is missing.",
        )
    try:
        data = await build_payslip_data(
            payslip.company_id, record, period,
            generated_at=payslip.generated_at,
            version=payslip.version,
            file_name=payslip.file_name,
        )
        pdf_bytes = render_payslip_pdf(data)
    except Exception:
        logger.exception(
            "Payslip re-render failed | payslip_id=%s record_id=%s",
            payslip.id,
            payslip.payroll_record_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The payslip PDF could not be generated.",
        ) from None

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The payslip PDF could not be generated.",
        )

    return _pdf_response(pdf_bytes)


async def serialize_payslip(payslip: Payslip, *, actor: Optional[User] = None, period: Optional[PayrollPeriod] = None) -> dict:
    view = await has_payroll_view(actor) if actor else False
    own = bool(actor) and payslip.employee_id and str(actor.id) == payslip.employee_id
    manage = await has_payroll_manage(actor) if actor else False

    period_payload = None
    if period:
        period_payload = {
            "year": period.year,
            "month": period.month,
            "label": f"{_MONTHS[period.month - 1]} {period.year}",
            "period_start": period.period_start,
            "period_end": period.period_end,
        }

    return {
        "id": str(payslip.id),
        "payroll_record_id": payslip.payroll_record_id,
        "payroll_period_id": payslip.payroll_period_id,
        "employee_id": payslip.employee_id,
        "version": payslip.version,
        "file_name": payslip.file_name,
        "file_size": payslip.file_size,
        "mime_type": payslip.mime_type,
        "status": payslip.status.value if isinstance(payslip.status, PayslipStatus) else payslip.status,
        "generated_by": payslip.generated_by,
        "generated_at": payslip.generated_at,
        "period": period_payload,
        "can_preview": view or own,
        "can_download": view or own,
        "can_regenerate": manage,
    }


def payslip_state_for_record(payslip: Optional[Payslip]) -> dict:
    """Compact payslip state embedded in payroll record responses."""
    if not payslip:
        return {"generated": False}
    return {
        "generated": True,
        "payslip_id": str(payslip.id),
        "version": payslip.version,
        "generated_at": payslip.generated_at,
        "file_name": payslip.file_name,
        "file_size": payslip.file_size,
    }


# =============================================================================
# Audit / timeline (generation + regeneration only)
# =============================================================================


async def _record_payslip_event(
    company_id: str,
    event_name: str,
    actor: User,
    payslip: Payslip,
    data: dict,
) -> None:
    from app.services.timeline_service import create_timeline_event

    try:
        period_label = ((data.get("period") or {}).get("label")) or ""
        await create_timeline_event(
            user_id=payslip.employee_id,
            company_id=company_id,
            event_type=event_name,
            title="Payslip Generated" if event_name == "payslip_generated" else "Payslip Regenerated",
            description=period_label or None,
            related_module="payroll",
            related_record_id=str(payslip.id),
            actor_id=str(actor.id),
            metadata={
                "payslip_id": str(payslip.id),
                "payroll_record_id": payslip.payroll_record_id,
                "version": payslip.version,
            },
            idempotency_key=f"payslip:{payslip.id}:{event_name}",
        )
    except Exception:
        # Audit publishing must never break the payslip operation.
        logger.exception("Failed to publish payslip timeline event")
