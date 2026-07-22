"""Reusable RBAC visibility query helpers.

These helpers keep tenant isolation and hierarchy scoping in one place so
endpoints do not need to hand-roll owner filters.
"""
from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

from app.models.user import User, UserRole
from app.services.user_service import UserService


FULL_PLATFORM_ROLES = {UserRole.SUPER_ADMIN}
FULL_COMPANY_ROLES = {UserRole.ADMIN}
TEAM_SCOPED_ROLES = {UserRole.MANAGER, UserRole.LEAD}


def _role_value(role: Any) -> str:
    return getattr(role, "value", str(role))


def _normalize_role(role: Any) -> UserRole | str:
    if isinstance(role, UserRole):
        return role
    try:
        return UserRole.from_legacy(str(role))
    except Exception:
        return str(role)


async def visible_user_ids(current_user: User, *, include_self: bool = True) -> list[str] | None:
    """Return visible user IDs, or None when owner scoping is not required."""
    role = _normalize_role(getattr(current_user, "role", None))
    if role in FULL_PLATFORM_ROLES or role in FULL_COMPANY_ROLES:
        return None

    user_ids: list[str] = [str(current_user.id)] if include_self else []
    if role in TEAM_SCOPED_ROLES:
        subordinate_ids = await UserService.get_all_subordinates_ids(
            str(current_user.id),
            getattr(current_user, "company_id", None),
        )
        for user_id in subordinate_ids:
            if user_id not in user_ids:
                user_ids.append(user_id)
    return user_ids


def _owner_filter(ownership_fields: Sequence[str], user_ids: Sequence[str]) -> dict[str, Any]:
    fields = [field for field in ownership_fields if field]
    if not fields:
        return {}
    if len(fields) == 1:
        return {fields[0]: {"$in": list(user_ids)}}
    return {"$or": [{field: {"$in": list(user_ids)}} for field in fields]}


def _merge_with_and(query: dict[str, Any], required_filter: Mapping[str, Any]) -> dict[str, Any]:
    if not required_filter:
        return query

    existing_or = query.pop("$or", None)
    existing_and = list(query.pop("$and", []))
    if existing_or is not None:
        existing_and.append({"$or": existing_or})
    existing_and.append(dict(required_filter))
    query["$and"] = existing_and
    return query


async def build_visibility_query(
    current_user: User,
    *,
    ownership_fields: Iterable[str],
    base_query: Mapping[str, Any] | None = None,
    company_field: str = "company_id",
    include_self: bool = True,
) -> dict[str, Any]:
    """Build a Mongo-style query with company and hierarchy visibility.

    Super admin: no company or owner filter.
    Admin: company filter only.
    Manager/Lead: company + own records + reporting hierarchy.
    Employee: company + own records.
    """
    query: dict[str, Any] = dict(base_query or {})
    role = _normalize_role(getattr(current_user, "role", None))

    if role not in FULL_PLATFORM_ROLES:
        query[company_field] = getattr(current_user, "company_id", None)

    user_ids = await visible_user_ids(current_user, include_self=include_self)
    if user_ids is None:
        return query

    required_filter = _owner_filter(tuple(ownership_fields), user_ids)
    if not required_filter:
        return query

    has_conflict = any(field in query for field in ownership_fields) or "$or" in query or "$and" in query
    if has_conflict:
        return _merge_with_and(query, required_filter)

    query.update(required_filter)
    return query


async def can_view_owned_record(
    current_user: User,
    record: Any,
    *,
    ownership_fields: Iterable[str],
    company_field: str = "company_id",
) -> bool:
    """Check object-level visibility for fetched records."""
    role = _normalize_role(getattr(current_user, "role", None))
    if role in FULL_PLATFORM_ROLES:
        return True

    if getattr(record, company_field, None) != getattr(current_user, "company_id", None):
        return False

    if role in FULL_COMPANY_ROLES:
        return True
    if role in TEAM_SCOPED_ROLES:
        return True

    user_ids = await visible_user_ids(current_user)
    visible = set(user_ids or [])
    return any(str(getattr(record, field, "") or "") in visible for field in ownership_fields)


async def require_owned_record_access(
    current_user: User,
    record: Any,
    *,
    ownership_fields: Iterable[str],
    company_field: str = "company_id",
) -> None:
    from fastapi import HTTPException, status

    if not await can_view_owned_record(
        current_user,
        record,
        ownership_fields=ownership_fields,
        company_field=company_field,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
