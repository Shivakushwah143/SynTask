"""
Phase 5 — Salary Structure service.

Versioned employee salary structures with effective-date lookup,
overlap prevention, calculation, and payroll snapshot adapter.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.core.clock import utc_now
from app.models.employee_profile import EmployeeProfile, EmploymentStatus
from app.models.salary import (
    CalculationType,
    ComponentType,
    PayFrequency,
    SalaryComponent,
    SalaryStatus,
    SalaryStructure,
    SalaryStructureItem,
)
from app.models.user import User, UserRole
from app.services.salary_component_service import get_component, list_components

logger = logging.getLogger(__name__)


# =============================================================================
# Effective salary lookup — the single source Phase 6 Payroll will reuse
# =============================================================================


async def get_effective_salary_structure(
    company_id: str,
    employee_id: str,
    effective_date: date,
) -> Optional[SalaryStructure]:
    """Return the salary structure effective for the given date.

    Rule: effective_from <= effective_date AND (effective_to is None OR effective_to > effective_date).
    If multiple structures match (shouldn't with overlap prevention), the most recent effective_from wins.

    IMPORTANT (Phase 11 closure): lookup is driven purely by the effective
    date range — the current ``status`` field (ACTIVE/SUPERSEDED) is never used
    as a filter. A historical structure that has been SUPERSEDED must still be
    returned for dates inside its effective range, e.g.:

        V1: 01-Jan-2026 -> 31-Jul-2026  (SUPERSEDED after V2 created)
        V2: 01-Aug-2026 -> open         (ACTIVE)

    July 15 must resolve to V1 and August 15 to V2.
    """
    start_dt = datetime.combine(effective_date, time.min)
    end_dt = datetime.combine(effective_date, time.max)

    structures = await SalaryStructure.find({
        "company_id": company_id,
        "employee_id": employee_id,
        "effective_from": {"$lte": end_dt},
        "$or": [
            {"effective_to": None},
            {"effective_to": {"$gt": start_dt}},
        ],
    }).sort("effective_from", -1).to_list()

    return structures[0] if structures else None


async def get_current_salary(company_id: str, employee_id: str) -> Optional[SalaryStructure]:
    """Return the currently active salary structure (effective now)."""
    return await get_effective_salary_structure(company_id, employee_id, utc_now().date())


async def get_upcoming_salary(company_id: str, employee_id: str) -> Optional[SalaryStructure]:
    """Return the next upcoming salary structure (effective_from > now)."""
    now = utc_now()
    structures = await SalaryStructure.find({
        "company_id": company_id,
        "employee_id": employee_id,
        "effective_from": {"$gt": now},
        "status": SalaryStatus.ACTIVE.value,
    }).sort("effective_from", 1).limit(1).to_list()
    return structures[0] if structures else None


async def get_salary_history(
    company_id: str, employee_id: str
) -> List[SalaryStructure]:
    """Return all salary structures for an employee, ordered by effective date descending."""
    return await SalaryStructure.find({
        "company_id": company_id,
        "employee_id": employee_id,
    }).sort("effective_from", -1).to_list()


# =============================================================================
# Calculation helpers
# =============================================================================


async def _build_items_with_calculations(
    company_id: str,
    raw_items: List[Dict[str, Any]],
) -> Tuple[List[SalaryStructureItem], float, float]:
    """Validate components, resolve percentages, calculate amounts, and return items + totals.

    Returns (items, total_earnings, total_deductions).
    """
    if not raw_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one salary component is required")

    # Batch-fetch all active components for the company
    all_components = await list_components(company_id, include_inactive=False)
    comp_map = {str(c.id): c for c in all_components}
    comp_map_by_code = {c.code: c for c in all_components}

    seen_ids = set()
    items: List[SalaryStructureItem] = []
    total_earnings = 0.0
    total_deductions = 0.0

    for raw in raw_items:
        comp_id = raw.get("component_id")
        if not comp_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="component_id is required for each item")

        comp = comp_map.get(comp_id)
        if not comp:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Salary component {comp_id} not found or inactive")

        if comp_id in seen_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Duplicate component: {comp.name}")
        seen_ids.add(comp_id)

        value = float(raw.get("value", 0))
        if value < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Value for {comp.name} cannot be negative")

        percentage = None
        base_component_id = None
        calculated_amount = value

        if comp.calculation_type == CalculationType.PERCENTAGE:
            pct_rate = raw.get("percentage") or comp.percentage_rate
            if not pct_rate or pct_rate <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Percentage rate required for {comp.name}",
                )
            base_id = raw.get("base_component_id") or comp.base_component_id
            if not base_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Base component required for percentage component {comp.name}",
                )
            base_comp = comp_map.get(base_id)
            if not base_comp:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Base component {base_id} not found for {comp.name}",
                )
            # Find the base component's calculated amount from already-processed items
            base_amount = None
            for existing_item in items:
                if existing_item.component_id == base_id:
                    base_amount = existing_item.calculated_amount
                    break
            if base_amount is None:
                # Base component not yet processed — resolve it
                base_amount = float(raw.get("base_value", 0))
            percentage = pct_rate
            base_component_id = base_id
            calculated_amount = round(base_amount * pct_rate / 100.0, 2)

        item = SalaryStructureItem(
            component_id=comp_id,
            component_name=comp.name,
            component_code=comp.code,
            component_type=comp.component_type,
            calculation_type=comp.calculation_type,
            value=value,
            percentage=percentage,
            base_component_id=base_component_id,
            calculated_amount=calculated_amount,
        )
        items.append(item)

        if comp.component_type == ComponentType.EARNING:
            total_earnings += calculated_amount
        else:
            total_deductions += calculated_amount

    return items, round(total_earnings, 2), round(total_deductions, 2)


def _check_overlap(
    existing_structures: List[SalaryStructure],
    new_from: datetime,
    new_id: Optional[str] = None,
) -> Optional[SalaryStructure]:
    """Check if a revision effective date conflicts with existing structures.

    Revision semantics (Phase 11 closure): a new version takes effect on
    ``new_from`` and the previous version is CLOSED (effective_to = new_from - 1s,
    status SUPERSEDED). Therefore an open-ended structure that starts BEFORE
    ``new_from`` is NOT a conflict — it is the structure this revision replaces.

    Conflicts:
      - any structure whose effective_from is >= new_from (a same-day duplicate
        or a future-dated structure already scheduled);
      - any closed structure whose range [s_from, s_to) contains new_from
        (inserting a revision in the middle of history).

    Returns the conflicting structure or None.
    """
    for s in existing_structures:
        if new_id and str(s.id) == new_id:
            continue
        s_from = s.effective_from
        s_to = s.effective_to
        if new_from <= s_from:
            # Same-day duplicate or new revision before an existing structure.
            return s
        if s_to is not None and new_from < s_to:
            # New date falls inside an already-closed range.
            return s
    return None


# =============================================================================
# Create / Revision
# =============================================================================


async def create_initial_salary(
    company_id: str,
    employee_id: str,
    actor: User,
    payload: Dict[str, Any],
) -> SalaryStructure:
    """Create the first salary structure for an employee."""
    # Validate employee exists and belongs to company
    profile = await EmployeeProfile.find_one({
        "company_id": company_id,
        "user_id": employee_id,
    })
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")

    if profile.employment_status in (EmploymentStatus.EXITED,):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign salary to an exited employee")

    # Check no existing structure
    existing = await SalaryStructure.find({
        "company_id": company_id,
        "employee_id": employee_id,
    }).to_list()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This employee already has a salary structure. Use revision instead.",
        )

    # Parse effective_from
    effective_from_str = payload.get("effective_from")
    if not effective_from_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="effective_from is required")

    effective_from = _parse_date(effective_from_str)
    if effective_from.date() > utc_now().date() + timedelta(days=365):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="effective_from cannot be more than 1 year in the future")

    currency = payload.get("currency", "INR")
    pay_frequency = payload.get("pay_frequency", "monthly")
    notes = payload.get("notes")
    source = payload.get("source", "manual")
    source_reference_id = payload.get("source_reference_id")

    items, total_earnings, total_deductions = await _build_items_with_calculations(
        company_id, payload.get("items", [])
    )

    structure = SalaryStructure(
        company_id=company_id,
        employee_id=employee_id,
        effective_from=effective_from,
        currency=currency,
        pay_frequency=PayFrequency(pay_frequency),
        status=SalaryStatus.ACTIVE,
        items=items,
        total_earnings=total_earnings,
        total_configured_deductions=total_deductions,
        configured_net=round(total_earnings - total_deductions, 2),
        source=source,
        source_reference_id=source_reference_id,
        notes=notes,
        created_by=str(actor.id),
    )
    await structure.insert()
    return structure


async def create_salary_revision(
    company_id: str,
    employee_id: str,
    actor: User,
    payload: Dict[str, Any],
) -> SalaryStructure:
    """Create a new salary revision (new effective version)."""
    # Validate employee
    profile = await EmployeeProfile.find_one({
        "company_id": company_id,
        "user_id": employee_id,
    })
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")

    if profile.employment_status in (EmploymentStatus.EXITED,):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot revise salary for an exited employee")

    # Must have existing structure
    existing_structures = await SalaryStructure.find({
        "company_id": company_id,
        "employee_id": employee_id,
    }).to_list()
    if not existing_structures:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No existing salary structure. Create initial salary first.",
        )

    # Parse effective_from
    effective_from_str = payload.get("effective_from")
    if not effective_from_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="effective_from is required")

    effective_from = _parse_date(effective_from_str)

    # Conflict validation (service-level, mandatory — the frontend disable is
    # never the security boundary). A normal revision of an open-ended structure
    # (e.g. V1 01-Jan-2026 -> open, V2 effective 01-Aug-2026) is VALID: the
    # previous version is closed and this one takes over.
    conflict = _check_overlap(existing_structures, effective_from)
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A salary structure already exists effective from {conflict.effective_from.strftime('%Y-%m-%d')}. "
            f"Choose an effective date after {conflict.effective_from.strftime('%Y-%m-%d')}.",
        )

    currency = payload.get("currency", "INR")
    pay_frequency = payload.get("pay_frequency", "monthly")
    notes = payload.get("notes")

    items, total_earnings, total_deductions = await _build_items_with_calculations(
        company_id, payload.get("items", [])
    )

    structure = SalaryStructure(
        company_id=company_id,
        employee_id=employee_id,
        effective_from=effective_from,
        currency=currency,
        pay_frequency=PayFrequency(pay_frequency),
        status=SalaryStatus.ACTIVE,
        items=items,
        total_earnings=total_earnings,
        total_configured_deductions=total_deductions,
        configured_net=round(total_earnings - total_deductions, 2),
        source="revision",
        notes=notes,
        created_by=str(actor.id),
    )
    await structure.insert()

    # Safety net for concurrent revisions (HR A + HR B on the same effective
    # date): re-check after insert — if another ACTIVE structure with the same
    # (company, employee, effective_from) slipped in, remove this one and fail.
    try:
        duplicate = await SalaryStructure.find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "effective_from": effective_from,
            "_id": {"$ne": structure.id},
            "status": SalaryStatus.ACTIVE.value,
        })
        if duplicate:
            await structure.delete()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A salary revision with the same effective date was created concurrently. "
                "Please refresh and retry with a different effective date.",
            )
    except HTTPException:
        raise
    except Exception:
        # Best-effort cleanup — never mask the insert result.
        logger.exception("Duplicate-revision safety check failed for employee %s", employee_id)

    # Close the previous open-ended structure (effective_to = new_from - 1s,
    # SUPERSEDED) so the timeline is contiguous:
    #   V1: 01-Jan-2026 -> 31-Jul-2026
    #   V2: 01-Aug-2026 -> open
    now = utc_now()
    for s in existing_structures:
        if s.effective_to is None and s.effective_from < effective_from:
            s.effective_to = effective_from - timedelta(seconds=1)
            s.status = SalaryStatus.SUPERSEDED
            s.updated_at = now
            await s.save()

    return structure


# =============================================================================
# Payroll snapshot adapter
# =============================================================================


async def get_salary_snapshot_for_payroll(
    company_id: str,
    employee_id: str,
    effective_date: date,
) -> Optional[Dict[str, Any]]:
    """Return a deterministic, serializable salary snapshot for Phase 6 Payroll.

    This is the integration boundary — Payroll calls this instead of
    directly querying salary structures.
    """
    structure = await get_effective_salary_structure(company_id, employee_id, effective_date)
    if not structure:
        return None

    return {
        "salary_structure_id": str(structure.id),
        "employee_id": structure.employee_id,
        "effective_from": structure.effective_from.isoformat(),
        "effective_to": structure.effective_to.isoformat() if structure.effective_to else None,
        "currency": structure.currency,
        "pay_frequency": structure.pay_frequency.value,
        "items": [
            {
                "component_id": item.component_id,
                "component_code": item.component_code,
                "component_name": item.component_name,
                "component_type": item.component_type.value,
                "calculation_type": item.calculation_type.value,
                "value": item.value,
                "percentage": item.percentage,
                "base_component_id": item.base_component_id,
                "calculated_amount": item.calculated_amount,
            }
            for item in structure.items
        ],
        "total_earnings": structure.total_earnings,
        "total_configured_deductions": structure.total_configured_deductions,
        "configured_net": structure.configured_net,
    }


# =============================================================================
# Serialization
# =============================================================================


def serialize_structure(structure: SalaryStructure, status_label: Optional[str] = None) -> Dict[str, Any]:
    now = utc_now()
    effective_date = structure.effective_from.date() if isinstance(structure.effective_from, datetime) else structure.effective_from
    today = now.date()

    if status_label is None:
        if structure.effective_to is None and effective_date <= today:
            status_label = "current"
        elif effective_date > today:
            status_label = "upcoming"
        else:
            status_label = "historical"

    return {
        "id": str(structure.id),
        "company_id": structure.company_id,
        "employee_id": structure.employee_id,
        "effective_from": structure.effective_from,
        "effective_to": structure.effective_to,
        "currency": structure.currency,
        "pay_frequency": structure.pay_frequency.value,
        "status": structure.status.value,
        "status_label": status_label,
        "items": [
            {
                "component_id": item.component_id,
                "component_name": item.component_name,
                "component_code": item.component_code,
                "component_type": item.component_type.value,
                "calculation_type": item.calculation_type.value,
                "value": item.value,
                "percentage": item.percentage,
                "base_component_id": item.base_component_id,
                "calculated_amount": item.calculated_amount,
            }
            for item in structure.items
        ],
        "total_earnings": structure.total_earnings,
        "total_configured_deductions": structure.total_configured_deductions,
        "configured_net": structure.configured_net,
        "source": structure.source,
        "source_reference_id": structure.source_reference_id,
        "notes": structure.notes,
        "created_by": structure.created_by,
        "created_at": structure.created_at,
        "updated_at": structure.updated_at,
    }


# =============================================================================
# Helpers
# =============================================================================


def _parse_date(value: Any) -> datetime:
    """Parse a date string to a datetime at midnight."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            except (ValueError, TypeError):
                pass
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Expected YYYY-MM-DD.")
