"""
Phase 5 — Salary Component service.

Company-scoped salary component CRUD with validation, dependency checking,
and default seeding.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.core.clock import utc_now
from app.models.salary import (
    CalculationType,
    ComponentType,
    SalaryComponent,
)

logger = logging.getLogger(__name__)

# Default salary components seeded per company (idempotent).
DEFAULT_COMPONENTS = [
    {"name": "Basic Salary", "code": "basic", "component_type": "earning", "calculation_type": "fixed", "default_value": 0.0, "display_order": 1, "taxable": True},
    {"name": "House Rent Allowance", "code": "hra", "component_type": "earning", "calculation_type": "percentage", "percentage_rate": 40.0, "display_order": 2, "taxable": True},
    {"name": "Special Allowance", "code": "special_allowance", "component_type": "earning", "calculation_type": "fixed", "default_value": 0.0, "display_order": 3, "taxable": True},
    {"name": "Other Allowance", "code": "other_allowance", "component_type": "earning", "calculation_type": "fixed", "default_value": 0.0, "display_order": 4, "taxable": True},
    {"name": "Bonus", "code": "bonus", "component_type": "earning", "calculation_type": "fixed", "default_value": 0.0, "display_order": 5, "taxable": True},
    {"name": "Provident Fund", "code": "pf", "component_type": "deduction", "calculation_type": "fixed", "default_value": 0.0, "display_order": 6, "taxable": False},
    {"name": "Professional Tax", "code": "professional_tax", "component_type": "deduction", "calculation_type": "fixed", "default_value": 0.0, "display_order": 7, "taxable": False},
    {"name": "Other Deduction", "code": "other_deduction", "component_type": "deduction", "calculation_type": "fixed", "default_value": 0.0, "display_order": 8, "taxable": False},
]


async def ensure_default_components(company_id: str, actor_id: Optional[str] = None) -> List[SalaryComponent]:
    """Idempotently seed default salary components for a company."""
    created = []
    for spec in DEFAULT_COMPONENTS:
        existing = await SalaryComponent.find_one({"company_id": company_id, "code": spec["code"]})
        if existing:
            # Merge newly added default display_order into already-seeded rows
            changed = False
            for key in ("display_order", "taxable"):
                if key in spec and getattr(existing, key, None) != spec[key]:
                    setattr(existing, key, spec[key])
                    changed = True
            if changed:
                existing.updated_at = utc_now()
                await existing.save()
            continue
        try:
            doc = SalaryComponent(
                company_id=company_id,
                created_by=actor_id,
                name=spec["name"],
                code=spec["code"],
                component_type=ComponentType(spec["component_type"]),
                calculation_type=CalculationType(spec["calculation_type"]),
                default_value=spec.get("default_value", 0.0),
                percentage_rate=spec.get("percentage_rate"),
                display_order=spec.get("display_order", 0),
                taxable=spec.get("taxable", False),
            )
            await doc.insert()
            created.append(doc)
        except DuplicateKeyError:
            continue
    return created


async def list_components(
    company_id: str,
    include_inactive: bool = False,
    component_type: Optional[str] = None,
) -> List[SalaryComponent]:
    """List salary components for a company."""
    query: Dict[str, Any] = {"company_id": company_id}
    if not include_inactive:
        query["active"] = True
    if component_type:
        query["component_type"] = component_type
    return await SalaryComponent.find(query).sort("display_order", 1).to_list()


async def get_component(company_id: str, component_id: str) -> Optional[SalaryComponent]:
    """Get a salary component by ID, scoped to company."""
    comp = await SalaryComponent.get(component_id)
    if not comp or comp.company_id != company_id:
        return None
    return comp


async def get_component_by_code(company_id: str, code: str) -> Optional[SalaryComponent]:
    """Get a salary component by code, scoped to company."""
    return await SalaryComponent.find_one({"company_id": company_id, "code": code})


async def create_component(company_id: str, actor_id: str, payload: Dict[str, Any]) -> SalaryComponent:
    """Create a new salary component."""
    name = (payload.get("name") or "").strip()
    code = (payload.get("code") or "").strip().lower().replace(" ", "_").replace("-", "_")
    component_type = payload.get("component_type")
    calculation_type = payload.get("calculation_type", "fixed")

    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Component name is required")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Component code is required")
    if component_type not in ("earning", "deduction"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="component_type must be 'earning' or 'deduction'")
    if calculation_type not in ("fixed", "percentage"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="calculation_type must be 'fixed' or 'percentage'")

    # Check duplicate code
    existing = await SalaryComponent.find_one({"company_id": company_id, "code": code})
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A component with code '{code}' already exists")

    # Validate percentage component
    if calculation_type == "percentage":
        pct_rate = payload.get("percentage_rate")
        if pct_rate is None or pct_rate <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="percentage_rate must be positive for percentage components")
        base_id = payload.get("base_component_id")
        if base_id:
            base_comp = await get_component(company_id, base_id)
            if not base_comp:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Referenced base component not found")
            if base_comp.code == code:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Component cannot reference itself as base")

    comp = SalaryComponent(
        company_id=company_id,
        name=name,
        code=code,
        component_type=ComponentType(component_type),
        calculation_type=CalculationType(calculation_type),
        percentage_rate=payload.get("percentage_rate"),
        base_component_id=payload.get("base_component_id"),
        default_value=float(payload.get("default_value", 0.0)),
        taxable=payload.get("taxable", False),
        payroll_enabled=payload.get("payroll_enabled", True),
        display_order=int(payload.get("display_order", 0)),
        created_by=actor_id,
    )
    await comp.insert()
    return comp


async def update_component(company_id: str, component_id: str, payload: Dict[str, Any]) -> SalaryComponent:
    """Update a salary component."""
    comp = await SalaryComponent.get(component_id)
    if not comp or comp.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary component not found")

    allowed = {
        "name", "component_type", "calculation_type", "percentage_rate",
        "base_component_id", "default_value", "taxable", "payroll_enabled",
        "display_order", "active",
    }

    for key, value in payload.items():
        if key in allowed and value is not None:
            if key == "name":
                value = value.strip()
            elif key == "component_type" and value not in ("earning", "deduction"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid component_type")
            elif key == "calculation_type" and value not in ("fixed", "percentage"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid calculation_type")
            elif key == "base_component_id" and value:
                base_comp = await get_component(company_id, value)
                if not base_comp:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Referenced base component not found")
            setattr(comp, key, value)

    comp.updated_at = utc_now()
    await comp.save()
    return comp


async def deactivate_component(company_id: str, component_id: str) -> SalaryComponent:
    """Soft-deactivate a salary component. Historical references remain valid."""
    comp = await SalaryComponent.get(component_id)
    if not comp or comp.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary component not found")
    comp.active = False
    comp.updated_at = utc_now()
    await comp.save()
    return comp


def serialize_component(comp: SalaryComponent) -> Dict[str, Any]:
    return {
        "id": str(comp.id),
        "company_id": comp.company_id,
        "name": comp.name,
        "code": comp.code,
        "component_type": comp.component_type.value,
        "calculation_type": comp.calculation_type.value,
        "percentage_rate": comp.percentage_rate,
        "base_component_id": comp.base_component_id,
        "default_value": comp.default_value,
        "taxable": comp.taxable,
        "payroll_enabled": comp.payroll_enabled,
        "display_order": comp.display_order,
        "active": comp.active,
        "created_by": comp.created_by,
        "created_at": comp.created_at,
        "updated_at": comp.updated_at,
    }
