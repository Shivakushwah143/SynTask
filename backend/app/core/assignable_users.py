import logging
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.models.user import User, UserRole, UserStatus


logger = logging.getLogger(__name__)

ASSIGNABLE_USER_ROLE_VALUES = [
    UserRole.ADMIN.value,
    UserRole.SUB_ADMIN.value,
    UserRole.MANAGER.value,
    UserRole.LEAD.value,
    UserRole.EMPLOYEE.value,
]

# Roles that may assign Sales leads across the whole company instead of being
# limited to their own department. Single source of truth shared by the Sales
# lead engine (validate_target_user) and the assignable-user listing.
COMPANY_WIDE_ASSIGNMENT_ROLES = {
    UserRole.ADMIN.value,
    UserRole.SUB_ADMIN.value,
    UserRole.SUPER_ADMIN.value,
}


def _role_value(role: Any) -> Any:
    return role.value if hasattr(role, "value") else role


def resolve_sales_assignment_department(
    current_user: User,
    *,
    department_id: Optional[str] = None,
) -> Optional[str]:
    """Effective department scope for Sales lead owner assignment.

    This is the one place the Sales assignment contract is defined, so the owner
    dropdown (GET /users/assignable?context=sales_lead) and lead creation
    validation (AssignmentEngine.validate_target_user) can never disagree:

    - an explicit ``department_id`` always wins;
    - Admin / Sub Admin / Super Admin assign company-wide (no department scope);
    - every other role is scoped to their own department.
    """
    if department_id:
        return str(department_id)
    if _role_value(getattr(current_user, "role", None)) in COMPANY_WIDE_ASSIGNMENT_ROLES:
        return None
    return getattr(current_user, "department_id", None)


def _candidate_ids(raw_id: Optional[str]) -> list[Any]:
    normalized = str(raw_id or "").strip()
    if not normalized:
        return []
    candidates: list[Any] = [normalized]
    if ObjectId.is_valid(normalized):
        candidates.append(ObjectId(normalized))
    return candidates


def build_assignable_user_query(company_id: Optional[str], *, department_id: Optional[str] = None) -> dict[str, Any]:
    company_ids = _candidate_ids(company_id)
    if not company_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")

    conditions: list[dict[str, Any]] = [
        {"company_id": {"$in": company_ids}},
        {"status": UserStatus.ACTIVE.value},
        {"role": {"$in": ASSIGNABLE_USER_ROLE_VALUES}},
        {"$or": [{"isActive": {"$exists": False}}, {"isActive": True}]},
        {"$or": [{"deleted": {"$exists": False}}, {"deleted": False}]},
        {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]},
    ]
    if department_id:
        conditions.append(
            {"$or": [{"department_id": department_id}, {"department": department_id}]}
        )
    return {"$and": conditions}


async def load_assignable_users_for_company(
    company_id: Optional[str], *, department_id: Optional[str] = None
) -> list[User]:
    query = build_assignable_user_query(company_id, department_id=department_id)
    users = await User.find(query).to_list()
    logger.info(
        "Loaded assignable users for companyId=%s departmentId=%s count=%s",
        company_id,
        department_id,
        len(users),
    )
    return users
