"""Single authorization resolver for business capabilities and resource scope."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.permission_catalog import PERMISSION_BY_KEY
from app.models.capability import get_capabilities_for_role
from app.models.department import Department
from app.models.user import User, UserRole


@dataclass(frozen=True)
class AuthorizationResult:
    allowed: bool
    source: str
    scope: str | None = None
    reason: str | None = None


def _role(user: User) -> UserRole:
    return user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))


def _overrides(user: User) -> dict[str, Any]:
    return {item.permission: item for item in (getattr(user, "permission_overrides", None) or [])}


async def effective_permissions(user: User) -> dict[str, AuthorizationResult]:
    """Merge default policy, legacy grants, and tri-state user overrides."""
    role = _role(user)
    if role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return {key: AuthorizationResult(True, "protected_role", "company") for key in PERMISSION_BY_KEY}
    inherited = set(getattr(user, "capability_grants", []) or [])
    if user.company_id and user.department_id:
        department = await Department.get(user.department_id)
        if department and department.company_id == user.company_id and department.deleted_at is None:
            inherited.update(await get_capabilities_for_role(department.department_type, role, user.company_id))
    result = {key: AuthorizationResult(True, "role_or_department", "company") for key in inherited if key in PERMISSION_BY_KEY}
    for key, override in _overrides(user).items():
        if key not in PERMISSION_BY_KEY or override.effect == "inherit":
            continue
        result[key] = AuthorizationResult(override.effect == "allow", "user_override", override.scope, "explicit_deny" if override.effect == "deny" else None)
    return result


async def permission_result(user: User, permission: str) -> AuthorizationResult:
    if permission not in PERMISSION_BY_KEY:
        return AuthorizationResult(False, "catalog", reason="unknown_permission")
    return (await effective_permissions(user)).get(permission, AuthorizationResult(False, "default", reason="not_granted"))


async def _scope_allows(user: User, scope: str | None, resource: Any = None, target_user: User | None = None) -> bool:
    if not scope or scope == "company":
        return True
    uid = str(user.id)
    if scope == "self":
        return target_user is None or str(target_user.id) == uid
    if scope == "created":
        return resource is not None and str(getattr(resource, "created_by", "")) == uid
    if scope == "assigned":
        return resource is not None and str(getattr(resource, "assigned_to", "")) == uid
    if scope == "department":
        subject = target_user or resource
        return subject is not None and getattr(subject, "department_id", None) == user.department_id
    if scope == "team":
        if target_user is None:
            return False
        return uid in {str(item) for item in (getattr(target_user, "ancestors", None) or [])} or str(target_user.id) == uid
    if scope == "project":
        if resource is None:
            return False
        ids = {str(value) for value in (getattr(resource, "team_member_ids", None) or []) + (getattr(resource, "assigned_user_ids", None) or [])}
        ids.update({str(getattr(resource, field)) for field in ("lead_id", "created_by", "assigned_to") if getattr(resource, field, None)})
        return uid in ids
    return False


async def authorize(user: User, permission: str, *, resource: Any = None, target_user: User | None = None) -> AuthorizationResult:
    """Tenant, override, inherited policy and resource scope in precedence order."""
    if resource is not None and getattr(resource, "company_id", None) and str(resource.company_id) != str(user.company_id):
        return AuthorizationResult(False, "tenant", reason="cross_company")
    if target_user is not None and str(target_user.company_id) != str(user.company_id):
        return AuthorizationResult(False, "tenant", reason="cross_company")
    result = await permission_result(user, permission)
    if not result.allowed:
        return result
    if not await _scope_allows(user, result.scope, resource, target_user):
        return AuthorizationResult(False, result.source, result.scope, "scope_violation")
    return result


async def has_permission(user: User, permission: str, **context: Any) -> bool:
    return (await authorize(user, permission, **context)).allowed
