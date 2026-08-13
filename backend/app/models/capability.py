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
    (DepartmentType.SALES, UserRole.SUB_ADMIN): [
        "import_leads",
        "assign_leads",
        "view_team_pipeline",
        "reassign_leads",
        "team_analytics",
    ],
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
    (DepartmentType.HR, UserRole.SUB_ADMIN): [
        "hire", "attendance", "performance", "recruitment.view",
        "recruitment.jobs.view", "recruitment.jobs.create", "recruitment.jobs.update",
        "recruitment.jobs.publish", "recruitment.jobs.archive",
        "recruitment.jobs.manage", "recruitment.jobs.duplicate",
        "recruitment.candidates.view",
        "recruitment.candidates.manage", "recruitment.candidates.assign",
        "recruitment.resume_pool.view",
        "recruitment.interviews.view",
        "recruitment.interviews.manage", "recruitment.offers.manage",
        "recruitment.offers.approve", "recruitment.convert_employee",
        "recruitment.reports.view", "recruitment.inbox.manage",
        "employee_management.view", "employee_management.manage",
    ],
    (DepartmentType.HR, UserRole.MANAGER): [
        "hire", "attendance", "performance", "recruitment.view",
        "recruitment.jobs.view", "recruitment.jobs.create", "recruitment.jobs.update",
        "recruitment.jobs.publish", "recruitment.jobs.archive",
        "recruitment.jobs.manage", "recruitment.jobs.duplicate",
        "recruitment.candidates.view",
        "recruitment.candidates.manage", "recruitment.candidates.assign",
        "recruitment.resume_pool.view",
        "recruitment.interviews.view",
        "recruitment.interviews.manage", "recruitment.offers.manage",
        "recruitment.offers.approve", "recruitment.convert_employee",
        "recruitment.reports.view", "recruitment.inbox.manage",
        "employee_management.view", "employee_management.manage",
    ],
    (DepartmentType.HR, UserRole.LEAD): [
        "recruitment.view", "recruitment.candidates.view",
        "recruitment.candidates.manage", "recruitment.resume_pool.view",
        "recruitment.candidates.assign", "recruitment.interviews.view",
        "recruitment.interviews.manage",
        "employee_management.view",
    ],
    (DepartmentType.HR, UserRole.EMPLOYEE): [
        "recruitment.view", "recruitment.candidates.view",
        "recruitment.resume_pool.view", "recruitment.interviews.view",
        "recruitment.interviews.feedback",
        "employee_management.view",
    ],
    (DepartmentType.FINANCE, UserRole.SUB_ADMIN): ["billing", "ledger", "reports"],
    (DepartmentType.FINANCE, UserRole.MANAGER): ["billing", "ledger", "reports"],
    (DepartmentType.SUPPORT, UserRole.SUB_ADMIN): ["manage_tickets", "team_support"],
    (DepartmentType.SUPPORT, UserRole.MANAGER): ["manage_tickets", "team_support"],
    (DepartmentType.OPERATIONS, UserRole.SUB_ADMIN): ["own_client_account", "manage_delivery"],
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
            # Merge newly added default capabilities into already-seeded rows so
            # existing deployments pick up new capability keys on startup.
            missing = [cap for cap in capabilities if cap not in (existing.capabilities or [])]
            if missing:
                existing.capabilities = list(dict.fromkeys([*(existing.capabilities or []), *missing]))
                await existing.save()
            continue
        await RoleCapability(
            company_id=None,
            department_type=department_type,
            role=role,
            capabilities=capabilities,
        ).insert()
        created += 1
    return created
