"""
Trusted AISecurityContext — immutable context derived exclusively from
authenticated SynTask backend state.

Never trust values from:
    LLM tool arguments, user prompt, conversation memory,
    Redis entity memory, frontend payload, selected_record metadata.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from app.api.dependencies import get_effective_permissions
from app.models.user import User

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AISecurityContext:
    """Immutable trusted security context for AI governance decisions.

    Derived exclusively from authenticated SynTask backend state.
    The LLM cannot override any field in this context.
    """
    user_id: str
    company_id: str
    role: str
    department_id: str | None
    department_type: str | None
    enabled_modules: frozenset[str]
    effective_capabilities: frozenset[str]
    request_id: str
    trace_id: str | None = None

    # Derived convenience flags (computed once, immutable)
    is_admin: bool = False
    is_super_admin: bool = False

    def has_capability(self, capability: str) -> bool:
        """Check if this context has a specific capability (or wildcard)."""
        if "*" in self.effective_capabilities:
            return True
        return capability in self.effective_capabilities

    def has_any_capability(self, capabilities: list[str]) -> bool:
        """Check if this context has at least one of the listed capabilities."""
        if "*" in self.effective_capabilities:
            return True
        return any(cap in self.effective_capabilities for cap in capabilities)

    def has_module(self, module: str) -> bool:
        """Check if a module is enabled for this context."""
        return module in self.enabled_modules

    def has_any_module(self, modules: list[str]) -> bool:
        """Check if at least one of the listed modules is enabled."""
        return any(m in self.enabled_modules for m in modules)

    def has_role(self, roles: set[str]) -> bool:
        """Check if the user's role is in the allowed set."""
        return self.role in roles


async def build_security_context(
    current_user: User,
    request_id: str | None = None,
    trace_id: str | None = None,
) -> AISecurityContext:
    """Build a trusted AISecurityContext from the authenticated user.

    All values come from backend state — never from LLM output or request payload.
    """
    user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    company_id = str(current_user.company_id) if current_user.company_id else ""

    # Resolve effective capabilities from the existing SynTask capability system
    try:
        effective_perms = await get_effective_permissions(current_user)
    except Exception:
        logger.exception("Failed to resolve effective permissions for user %s", current_user.id)
        effective_perms = set()

    # Resolve department info
    department_id = getattr(current_user, "department_id", None)
    department_type = None
    if department_id:
        try:
            from app.models.department import Department
            dept = await Department.get(department_id)
            if dept and str(dept.company_id) == company_id:
                department_type = dept.department_type.value if hasattr(dept.department_type, "value") else str(dept.department_type)
            else:
                department_id = None
        except Exception:
            logger.warning("Failed to resolve department %s for user %s", department_id, current_user.id)
            department_id = None

    # Resolve enabled modules
    modules = getattr(current_user, "modules", []) or []
    enabled_modules = frozenset(str(m).lower() for m in modules)

    # Normalize role
    normalized_role = user_role.lower()

    return AISecurityContext(
        user_id=str(current_user.id),
        company_id=company_id,
        role=normalized_role,
        department_id=str(department_id) if department_id else None,
        department_type=department_type,
        enabled_modules=enabled_modules,
        effective_capabilities=frozenset(effective_perms),
        request_id=request_id or str(uuid4()),
        trace_id=trace_id,
        is_admin=normalized_role in {"admin", "super_admin", "sub_admin"},
        is_super_admin=normalized_role == "super_admin",
    )
