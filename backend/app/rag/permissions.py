from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import HTTPException, status

from app.api.dependencies import get_project_by_id
from app.models.department import Department
from app.models.project import Project
from app.models.user import User, UserRole


@dataclass(slots=True)
class RAGScope:
    company_id: str
    tenant_id: str
    user_id: str
    role: str
    department_id: Optional[str] = None
    project_id: Optional[str] = None
    client_id: Optional[str] = None
    allowed_user_ids: list[str] = field(default_factory=list)
    allowed_roles: list[str] = field(default_factory=list)

    def visibility_filter(self) -> dict[str, Any]:
        filters: dict[str, Any] = {
            "company_id": self.company_id,
            "tenant_id": self.tenant_id,
            "approval_status": "approved",
            "deleted": False,
        }
        if self.project_id:
            filters["project_id"] = self.project_id
        if self.department_id:
            filters["department_id"] = self.department_id
        if self.client_id:
            filters["client_id"] = self.client_id
        return filters


def require_company_scope(current_user: User) -> str:
    company_id = getattr(current_user, "company_id", None)
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company scope required")
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant-scoped RAG access required")
    return str(company_id)


async def resolve_rag_scope(
    current_user: User,
    *,
    project_id: str | None = None,
    department_id: str | None = None,
    client_id: str | None = None,
    visibility: dict[str, Any] | None = None,
) -> RAGScope:
    company_id = require_company_scope(current_user)
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    requested_department_id = department_id or (visibility or {}).get("department_id")
    requested_project_id = project_id or (visibility or {}).get("project_id")
    requested_client_id = client_id or (visibility or {}).get("client_id")

    if requested_department_id:
        department = await Department.get(requested_department_id)
        if not department or department.company_id != company_id or department.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Department scope denied")
        if current_user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER}:
            if getattr(current_user, "department_id", None) != requested_department_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Department scope denied")

    if requested_project_id:
        project, canonical_project_id = await get_project_by_id(requested_project_id, company_id)
        if not project:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project scope denied")
        await ensure_project_visibility(project, current_user)
        requested_project_id = canonical_project_id or requested_project_id

    return RAGScope(
        company_id=company_id,
        tenant_id=company_id,
        user_id=str(current_user.id),
        role=role,
        department_id=requested_department_id,
        project_id=requested_project_id,
        client_id=requested_client_id,
        allowed_user_ids=list((visibility or {}).get("allowed_user_ids") or []),
        allowed_roles=list((visibility or {}).get("allowed_roles") or []),
    )


async def ensure_project_visibility(project: Project, current_user: User) -> None:
    if current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        return
    user_id = str(current_user.id)
    allowed = {
        str(project.created_by or ""),
        str(project.lead_id or ""),
        str(project.assigned_to or ""),
        *[str(item) for item in (project.assigned_user_ids or [])],
        *[str(item) for item in (project.team_member_ids or [])],
    }
    if user_id not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project scope denied")


async def can_approve_source(current_user: User, source_visibility: dict[str, Any], company_id: str) -> bool:
    if current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        return True
    if current_user.role != UserRole.MANAGER:
        return False
    department_id = source_visibility.get("department_id")
    if department_id and department_id == getattr(current_user, "department_id", None):
        return True
    project_id = source_visibility.get("project_id")
    if project_id:
        project, _ = await get_project_by_id(project_id, company_id)
        if project:
            try:
                await ensure_project_visibility(project, current_user)
                return True
            except HTTPException:
                return False
    allowed_user_ids = set(str(item) for item in source_visibility.get("allowed_user_ids") or [])
    return str(current_user.id) in allowed_user_ids


def source_visible_to_scope(source, scope: RAGScope) -> bool:
    if source.company_id != scope.company_id or source.tenant_id != scope.tenant_id:
        return False
    status_value = source.status.value if hasattr(source.status, "value") else str(source.status)
    if status_value in {"deleted", "retired", "quarantined", "failed"}:
        return False
    visibility = dict(source.visibility or {})
    if visibility.get("project_id") and visibility.get("project_id") != scope.project_id:
        return False
    if visibility.get("department_id") and visibility.get("department_id") != scope.department_id:
        return False
    if visibility.get("client_id") and visibility.get("client_id") != scope.client_id:
        return False
    allowed_users = set(str(item) for item in visibility.get("allowed_user_ids") or [])
    if allowed_users and scope.user_id not in allowed_users:
        return False
    allowed_roles = set(str(item) for item in visibility.get("allowed_roles") or [])
    if allowed_roles and scope.role not in allowed_roles:
        return False
    return True
