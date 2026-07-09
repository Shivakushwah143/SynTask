"""
Department and role capability mappings.
"""
from __future__ import annotations

from typing import List, Optional, Tuple

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.models.department import DepartmentType
from app.models.user import UserRole


class RoleCapability(Document):
    company_id: Optional[str] = None
    department_type: DepartmentType
    role: UserRole
    capabilities: List[str] = Field(default_factory=list)

    class Settings:
        name = "role_capabilities"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("department_type", ASCENDING), ("role", ASCENDING)], unique=True),
        ]


DEFAULT_CAPABILITIES: dict[Tuple[DepartmentType, UserRole], List[str]] = {
    (DepartmentType.SALES, UserRole.MANAGER): [
        "import_leads",
        "assign_leads",
        "view_team_pipeline",
        "reassign_leads",
        "team_analytics",
    ],
    (DepartmentType.SALES, UserRole.LEAD): [
        "assign_leads",
        "view_team_pipeline",
    ],
    (DepartmentType.SALES, UserRole.EMPLOYEE): [
        "own_lead_workspace",
        "advance_own_pipeline",
    ],
    (DepartmentType.HR, UserRole.MANAGER): ["hire", "attendance", "performance"],
    (DepartmentType.FINANCE, UserRole.MANAGER): ["billing", "ledger", "reports"],
    (DepartmentType.SUPPORT, UserRole.MANAGER): ["manage_tickets", "team_support"],
    (DepartmentType.OPERATIONS, UserRole.MANAGER): ["own_client_account", "manage_delivery"],
}


async def get_capabilities_for_role(
    department_type: DepartmentType,
    role: UserRole,
    company_id: Optional[str] = None,
) -> List[str]:
    role_capability = await RoleCapability.find_one(
        {
            "company_id": company_id,
            "department_type": department_type,
            "role": role,
        }
    )
    if role_capability:
        return list(role_capability.capabilities or [])
    return list(DEFAULT_CAPABILITIES.get((department_type, role), []))


async def seed_default_capabilities() -> int:
    created = 0
    for (department_type, role), capabilities in DEFAULT_CAPABILITIES.items():
        existing = await RoleCapability.find_one(
            {
                "company_id": None,
                "department_type": department_type,
                "role": role,
            }
        )
        if existing:
            continue
        await RoleCapability(
            company_id=None,
            department_type=department_type,
            role=role,
            capabilities=capabilities,
        ).insert()
        created += 1
    return created
