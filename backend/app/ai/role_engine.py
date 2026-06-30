from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.models.user import User, UserRole


@dataclass(slots=True)
class RoleResolution:
    role_key: str
    prompt_version: str
    fallback_chain: list[str]
    fallback_used: bool
    fallback_reason: Optional[str]
    access_scope: str


class RoleEngine:
    """Resolve the AI persona from verified user context."""

    PROMPT_VERSION = "1.0"

    def resolve(self, current_user: User) -> RoleResolution:
        role = current_user.role
        department_context_available = bool(
            getattr(current_user, "department_id", None) or getattr(current_user, "department", None)
        )

        if role == UserRole.SUPER_ADMIN:
            return RoleResolution(
                role_key="super_admin",
                prompt_version=self.PROMPT_VERSION,
                fallback_chain=["admin"],
                fallback_used=False,
                fallback_reason=None,
                access_scope="multi_tenant",
            )

        if role == UserRole.ADMIN:
            return RoleResolution(
                role_key="admin",
                prompt_version=self.PROMPT_VERSION,
                fallback_chain=[],
                fallback_used=False,
                fallback_reason=None,
                access_scope="company",
            )

        if role == UserRole.MANAGER:
            if department_context_available:
                return RoleResolution(
                    role_key="department",
                    prompt_version=self.PROMPT_VERSION,
                    fallback_chain=["lead"],
                    fallback_used=False,
                    fallback_reason=None,
                    access_scope="department",
                )
            return RoleResolution(
                role_key="lead",
                prompt_version=self.PROMPT_VERSION,
                fallback_chain=["department", "lead"],
                fallback_used=True,
                fallback_reason="Department context unavailable; using lead persona fallback.",
                access_scope="team",
            )

        if role == UserRole.LEAD:
            return RoleResolution(
                role_key="lead",
                prompt_version=self.PROMPT_VERSION,
                fallback_chain=[],
                fallback_used=False,
                fallback_reason=None,
                access_scope="team",
            )

        return RoleResolution(
            role_key="employee",
            prompt_version=self.PROMPT_VERSION,
            fallback_chain=[],
            fallback_used=False,
            fallback_reason=None,
            access_scope="self",
        )

