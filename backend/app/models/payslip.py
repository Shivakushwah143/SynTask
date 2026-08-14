"""
Phase 7 — Payslip PDF model.

A ``Payslip`` is the presentation + secure-distribution artifact of ONE
PROCESSED ``PayrollRecord``. It never recalculates payroll: every value printed
on the PDF comes from the payroll record's stored snapshots (employee, salary,
attendance, earnings, deductions, gross/net).

Design decisions (see docs/HRMS_IMPLEMENTATION_MASTER.md §14 — Phase 7):

- **Dedicated model** (Option B): a Payroll Record may have several Payslip
  *versions* (V1 → V2 after regeneration). One ``(company, record, version)``
  row is unique; the current payslip is the highest version. Historical
  versions are preserved (regeneration never deletes the old file).
- **Storage conventions** mirror ``HRDocumentVersion`` / ``Resume``:
  ``storage_provider`` (local | cloudinary), ``storage_reference`` (relative
  upload path or Cloudinary public_id), plus resource/delivery fields. No
  second storage system is introduced — the existing ``FileService`` /
  Cloudinary pipeline stores the file.
- **No unrestricted public URL** is ever exposed: preview/download go through
  authorized backend endpoints only.
- Amounts/history stay immutable — regeneration re-renders from the SAME
  processed payroll snapshot. Only presentation/branding (company name/logo)
  is allowed to reflect current company data.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.core.clock import utc_now


class PayslipStatus(str, Enum):
    """Stored lifecycle status of a payslip file version.

    Only successful generations persist a metadata row (a failed storage write
    never leaves metadata pointing at a missing file), so ``GENERATED`` is the
    only status produced by the current implementation.
    """

    GENERATED = "generated"


class Payslip(Document):
    """One stored payslip PDF version for one processed payroll record."""

    company_id: Indexed(str)
    payroll_record_id: Indexed(str)
    payroll_period_id: Indexed(str)
    # The employee's User id (same value as PayrollRecord.employee_id).
    employee_id: Indexed(str)

    version: int = 1

    # File metadata
    file_name: str
    mime_type: str = "application/pdf"
    file_size: int = 0

    # Storage references — same conventions as HRDocumentVersion / Resume.
    storage_provider: str = "local"  # "local" | "cloudinary"
    storage_reference: Optional[str] = None  # relative path under UPLOAD_DIR, or Cloudinary public_id
    storage_url: Optional[str] = None
    storage_resource_type: Optional[str] = None
    storage_delivery_type: Optional[str] = None
    checksum: Optional[str] = None

    generated_by: Optional[str] = None  # User id of the generator
    generated_at: datetime = Field(default_factory=utc_now)
    status: PayslipStatus = PayslipStatus.GENERATED

    # Optional integrity marker — hash of the payroll snapshot used to render
    # this version. Stored for auditability; never used to override values.
    payroll_snapshot_hash: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "payslips"
        indexes = [
            # One version chain per company+record (V1, V2, ... never duplicates).
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("payroll_record_id", ASCENDING),
                    ("version", ASCENDING),
                ],
                unique=True,
                name="payslips_company_record_version_uniq",
            ),
            IndexModel(
                [("company_id", ASCENDING), ("payroll_period_id", ASCENDING), ("employee_id", ASCENDING)]
            ),
            IndexModel([("employee_id", ASCENDING), ("generated_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("payroll_record_id", ASCENDING)]),
        ]
