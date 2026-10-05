import logging
from datetime import datetime

from app.core.clock import utc_now
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import _module_access_allowed, get_current_user, get_effective_permissions
from app.core.permission_catalog import catalog_payload, is_known_permission
from app.services.authorization_service import authorize, effective_permissions
from app.models.department import Department
from app.models.user import PermissionOverride, User, UserRole
from app.schemas.admin_permissions import MODULE_CATALOG, ModuleUpdateRequest, CapabilityGrantUpdateRequest, PermissionOverrideUpdateRequest, normalize_modules
from app.services.timeline_service import create_timeline_event
from app.models.timeline import TimelineEventType, TimelineModule

router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_role(role: Any) -> UserRole:
    if isinstance(role, UserRole):
        return role
    if role is None:
        return UserRole.EMPLOYEE
    try:
        return UserRole.from_legacy(str(role))
    except Exception:
        normalized = str(role).strip().lower().replace(" ", "_").replace("-", "_")
        try:
            return UserRole(normalized)
        except ValueError:
            return UserRole.EMPLOYEE


def _role_value(role: Any) -> str | None:
    if role is None:
        return None
    if isinstance(role, UserRole):
        return role.value
    try:
        return _normalize_role(role).value
    except Exception:
        return str(role)


async def _require_admin_company_scope(current_user: User) -> User:
    current_role = _normalize_role(getattr(current_user, "role", None))
    if current_role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        delegation = await authorize(current_user, "permissions.delegate")
        if not delegation.allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission delegation access required")
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    return current_user


async def _assert_target_delegatable(actor: User, target: User, overrides: list[PermissionOverride]) -> None:
    """Managers cannot edit peers/admins or delegate a broader authority."""
    actor_role = _normalize_role(actor.role)
    target_role = _normalize_role(target.role)
    if actor_role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        if target_role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN} or str(actor.id) not in set(target.ancestors or []):
            raise HTTPException(status_code=403, detail="Target is outside your delegation team")
        for item in overrides:
            if item.effect != "allow":
                continue
            actor_result = await authorize(actor, item.permission)
            if not actor_result.allowed or (actor_result.scope != "company" and item.scope == "company"):
                raise HTTPException(status_code=403, detail="Cannot delegate authority beyond your own scope")



def _cap_modules_for_actor(actor: User, modules: list[str]) -> list[str]:
    normalized = normalize_modules(modules, require_tasks_projects=False)
    if _normalize_role(getattr(actor, "role", None)) in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        return normalized
    actor_modules = getattr(actor, "modules", []) or []
    return [module for module in normalized if _module_access_allowed(module, actor_modules)]


def _ensure_full_admin(actor: User) -> None:
    if _normalize_role(getattr(actor, "role", None)) != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company admin access required")


async def _get_tenant_target_user(user_id: str, company_id: str) -> User | None:
    user = await User.get(user_id)
    if not user or user.company_id != company_id:
        return None
    return user


async def _record_admin_action(actor: User, target_user: User | None, action: str, *, before: Any, after: Any, target_type: str) -> None:
    try:
        await create_timeline_event(
            user_id=str(actor.id),
            company_id=actor.company_id,
            event_type=TimelineEventType.TASK_UPDATED,
            title=f"Admin permission {action}",
            related_module=TimelineModule.TASK,
            related_record_id=str(target_user.id if target_user else actor.id),
            description=f"{action} for {target_type}",
            metadata={"actor_role": _role_value(getattr(actor, "role", None)), "before": before, "after": after, "target_type": target_type},
            actor_id=str(actor.id),
            idempotency_key=f"admin-permissions:{actor.id}:{target_type}:{action}:{utc_now().timestamp()}",
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Failed to record admin permission timeline event: %s", exc)


@router.get("/overview")
async def get_admin_permissions_overview(current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)

    departments = await Department.find(
        Department.company_id == current_user.company_id,
        Department.deleted_at == None,
    ).sort("-created_at").to_list()

    department_payload = []
    for department in departments:
        department_payload.append({
            "id": str(department.id),
            "name": department.name,
            "department_type": getattr(department, "department_type", "operations").value if hasattr(getattr(department, "department_type", None), "value") else getattr(department, "department_type", "operations"),
            "enabled_modules": list(getattr(department, "enabled_modules", []) or []),
            "member_count": 0,
        })

    employee_query = {
        "company_id": current_user.company_id,
        "role": {"$in": [UserRole.SUB_ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.EMPLOYEE.value]},
    }
    employees = await User.find(employee_query).to_list()
    employee_payload = []
    for user in employees:
        resolved = await effective_permissions(user)
        employee_payload.append({
            "id": str(user.id),
            "full_name": user.full_name(),
            "role": user.role.value,
            "department_id": getattr(user, "department_id", None),
            "modules": list(getattr(user, "modules", []) or []),
            "capability_grants": list(getattr(user, "capability_grants", []) or []),
            "permission_overrides": [item.model_dump() for item in (getattr(user, "permission_overrides", []) or [])],
            "effective_permissions": {key: {"allowed": item.allowed, "source": item.source, "scope": item.scope} for key, item in resolved.items()},
        })

    admin_query = {"company_id": current_user.company_id, "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value]}}
    admins = await User.find(admin_query).to_list()
    admin_payload = [
        {
            "id": str(user.id),
            "full_name": user.full_name(),
            "previous_role": _role_value(getattr(user, "previous_role", None)),
        }
        for user in admins
    ]

    return {
        "module_catalog": MODULE_CATALOG,
        "permission_catalog": catalog_payload(),
        "departments": department_payload,
        "employees": employee_payload,
        "admins": admin_payload,
    }


@router.get("/catalog")
async def get_permission_catalog(current_user: User = Depends(get_current_user)):
    await _require_admin_company_scope(current_user)
    return {"permissions": catalog_payload(), "scopes": ["self", "created", "assigned", "project", "team", "department", "company"]}


@router.get("/users/{user_id}")
async def get_user_permissions(user_id: str, current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)
    target = await _get_tenant_target_user(user_id, current_user.company_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    effective = await effective_permissions(target)
    return {"modules": list(target.modules or []), "overrides": [item.model_dump() for item in (target.permission_overrides or [])],
            "effective_permissions": {key: {"allowed": item.allowed, "source": item.source, "scope": item.scope} for key, item in effective.items()}}


@router.put("/departments/{department_id}/modules")
async def update_department_modules(department_id: str, payload: ModuleUpdateRequest, current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)
    department = await Department.get(department_id)
    if not department or department.company_id != current_user.company_id or department.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    normalized_modules = _cap_modules_for_actor(current_user, payload.modules)
    department.enabled_modules = normalized_modules
    department.updated_at = utc_now()
    await department.save()
    await _record_admin_action(current_user, None, "department_modules_updated", before={}, after={"modules": normalized_modules}, target_type="department")
    return {"modules": normalized_modules}


@router.post("/departments/{department_id}/apply")
async def apply_department_modules(department_id: str, current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)
    department = await Department.get(department_id)
    if not department or department.company_id != current_user.company_id or department.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    target_modules = _cap_modules_for_actor(current_user, list(getattr(department, "enabled_modules", []) or []))
    matched_users = await User.find({
        "company_id": current_user.company_id,
        "department_id": department_id,
    }).to_list()
    for user in matched_users:
        user.modules = target_modules
        await user.save()

    await _record_admin_action(current_user, None, "department_modules_applied", before={}, after={"modules": target_modules, "department_id": department_id}, target_type="department")
    return {"updated_count": len(matched_users), "modules": target_modules}


@router.put("/users/{user_id}/modules")
async def update_user_modules(user_id: str, payload: ModuleUpdateRequest, current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)
    target_user = await _get_tenant_target_user(user_id, current_user.company_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target_role = _normalize_role(getattr(target_user, "role", None))
    current_role = _normalize_role(getattr(current_user, "role", None))
    if target_role == UserRole.ADMIN or (target_role == UserRole.SUB_ADMIN and current_role != UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin modules cannot be changed here")
    await _assert_target_delegatable(current_user, target_user, [])

    normalized_modules = _cap_modules_for_actor(current_user, payload.modules)
    before_modules = list(getattr(target_user, "modules", []) or [])
    target_user.modules = normalized_modules
    target_user.updated_at = utc_now()
    await target_user.save()
    await _record_admin_action(current_user, target_user, "user_modules_updated", before={"modules": before_modules}, after={"modules": normalized_modules}, target_type="user")
    return {"modules": normalized_modules}


@router.put("/users/{user_id}/capabilities")
async def update_user_capability_grants(user_id: str, payload: CapabilityGrantUpdateRequest, current_user: User = Depends(get_current_user)):
    """Set explicit grants without changing role defaults or tenant scope."""
    current_user = await _require_admin_company_scope(current_user)
    target_user = await _get_tenant_target_user(user_id, current_user.company_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target_role = _normalize_role(getattr(target_user, "role", None))
    current_role = _normalize_role(getattr(current_user, "role", None))
    if target_role == UserRole.ADMIN or (target_role == UserRole.SUB_ADMIN and current_role != UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin permissions cannot be changed here")
    requested = list(dict.fromkeys(str(item).strip() for item in payload.capabilities if str(item).strip()))
    unknown = [key for key in requested if not is_known_permission(key)]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown permission key: {unknown[0]}")
    await _assert_target_delegatable(current_user, target_user, [PermissionOverride(permission=key, effect="allow") for key in requested])
    if current_role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        delegatable = await get_effective_permissions(current_user)
        if "*" not in delegatable and not set(requested).issubset(delegatable):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot grant a capability you do not hold")
    before = list(getattr(target_user, "capability_grants", []) or [])
    target_user.capability_grants = requested
    target_user.updated_at = utc_now()
    await target_user.save()
    await _record_admin_action(current_user, target_user, "user_capabilities_updated", before={"capabilities": before}, after={"capabilities": requested}, target_type="user")
    return {"capabilities": requested}


@router.put("/users/{user_id}")
async def update_user_permission_overrides(user_id: str, payload: PermissionOverrideUpdateRequest, current_user: User = Depends(get_current_user)):
    """Persist tri-state overrides separately from module access and department defaults."""
    current_user = await _require_admin_company_scope(current_user)
    target = await _get_tenant_target_user(user_id, current_user.company_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    raw = [PermissionOverride(**item.model_dump()) for item in payload.overrides]
    if len({item.permission for item in raw}) != len(raw):
        raise HTTPException(status_code=422, detail="A permission can only be overridden once")
    unknown = [item.permission for item in raw if not is_known_permission(item.permission)]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown permission key: {unknown[0]}")
    from app.core.permission_catalog import PERMISSION_BY_KEY
    for item in raw:
        # Schema verifies global scopes; this tighter catalog check keeps UI and
        # API policy aligned.
        if item.scope and item.scope not in PERMISSION_BY_KEY[item.permission]["supported_scopes"]:
            raise HTTPException(status_code=422, detail=f"Scope '{item.scope}' is unsupported for {item.permission}")
    await _assert_target_delegatable(current_user, target, raw)
    before = [item.model_dump() for item in (target.permission_overrides or [])]
    target.permission_overrides = raw
    target.access_policy_version = 2
    target.updated_at = utc_now()
    await target.save()
    await _record_admin_action(current_user, target, "user_permission_overrides_updated", before={"overrides": before}, after={"overrides": [item.model_dump() for item in raw]}, target_type="user")
    return {"overrides": [item.model_dump() for item in raw]}


@router.post("/users/{user_id}/promote")
async def promote_user_to_admin(user_id: str, current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)
    _ensure_full_admin(current_user)
    target_user = await _get_tenant_target_user(user_id, current_user.company_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    current_target_role = _normalize_role(getattr(target_user, "role", None))
    if current_target_role not in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only employee-level roles can be promoted")

    previous_role = current_target_role
    target_user.previous_role = previous_role
    target_user.role = UserRole.SUB_ADMIN
    target_user.updated_at = utc_now()
    await target_user.save()
    await _record_admin_action(current_user, target_user, "user_promoted", before={"role": _role_value(previous_role)}, after={"role": UserRole.SUB_ADMIN.value}, target_type="user")
    return {"message": "User promoted to sub-admin", "previous_role": _role_value(previous_role)}


@router.post("/users/{user_id}/demote")
async def demote_user_to_previous_role(user_id: str, current_user: User = Depends(get_current_user)):
    current_user = await _require_admin_company_scope(current_user)
    _ensure_full_admin(current_user)
    target_user = await _get_tenant_target_user(user_id, current_user.company_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if _normalize_role(getattr(target_user, "role", None)) not in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only admins can be demoted")

    demoted_from = _normalize_role(getattr(target_user, "role", None))
    if demoted_from == UserRole.ADMIN:
        admin_query = User.find({"company_id": current_user.company_id, "role": UserRole.ADMIN.value})
        admin_count = await admin_query.count()
        if admin_count <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote the last admin")

    previous_role = _normalize_role(getattr(target_user, "previous_role", None)) or UserRole.EMPLOYEE
    target_user.role = previous_role
    target_user.previous_role = None
    target_user.updated_at = utc_now()
    await target_user.save()
    await _record_admin_action(current_user, target_user, "user_demoted", before={"role": _role_value(demoted_from)}, after={"role": _role_value(previous_role)}, target_type="user")
    return {"message": "User demoted", "role": _role_value(previous_role)}
