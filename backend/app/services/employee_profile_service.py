"""
Employee Profile Service — Phase 1 HRMS.

Owns the canonical company-scoped Employee Profile operations:

- ``list_employees`` (backend search/filter/pagination with batched joins)
- ``get_employee`` (normalized detail DTO with per-user access rules)
- ``create_profile`` / ``update_profile`` (HR management)
- ``ensure_employee_profile`` (used by user-creation paths + migration)
- ``EmployeeOnboardingService.create_employee_from_candidate`` — the ONE
  canonical candidate → employee path. Every recruitment conversion entry
  point delegates here so there can never be two inconsistent employee
  creation implementations.

Company isolation is enforced on every operation; the authenticated user's
company is always the source of truth.
"""
import secrets
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.core.security import get_password_hash
from app.models.department import Department
from app.models.employee_profile import (
    Address,
    EmergencyContact,
    EmployeeProfile,
    EmploymentStatus,
    EmploymentType,
    EmployeeWorkMode,
    ExitInfo,
    Gender,
    ProbationInfo,
)
from app.models.user import User, UserRole, UserStatus

# Normalization maps — legacy string variants collapse to the canonical enum.
_WORK_MODE_ALIASES = {
    "office": EmployeeWorkMode.ONSITE,
    "onsite": EmployeeWorkMode.ONSITE,
    "in_office": EmployeeWorkMode.ONSITE,
    "remote": EmployeeWorkMode.REMOTE,
    "wfh": EmployeeWorkMode.REMOTE,
    "work_from_home": EmployeeWorkMode.REMOTE,
    "workfromhome": EmployeeWorkMode.REMOTE,
    "hybrid": EmployeeWorkMode.HYBRID,
}

_EMPLOYMENT_TYPE_ALIASES = {
    "full_time": EmploymentType.FULL_TIME,
    "fulltime": EmploymentType.FULL_TIME,
    "part_time": EmploymentType.PART_TIME,
    "parttime": EmploymentType.PART_TIME,
    "contract": EmploymentType.CONTRACT,
    "intern": EmploymentType.INTERN,
    "internship": EmploymentType.INTERN,
    "temporary": EmploymentType.TEMPORARY,
    "temp": EmploymentType.TEMPORARY,
}

_EMPLOYMENT_STATUS_ALIASES = {
    "onboarding": EmploymentStatus.ONBOARDING,
    "probation": EmploymentStatus.PROBATION,
    "active": EmploymentStatus.ACTIVE,
    "notice_period": EmploymentStatus.NOTICE_PERIOD,
    "noticeperiod": EmploymentStatus.NOTICE_PERIOD,
    "exited": EmploymentStatus.EXITED,
    "resigned": EmploymentStatus.EXITED,
    "terminated": EmploymentStatus.EXITED,
}


def normalize_work_mode(value: Optional[str]) -> Optional[EmployeeWorkMode]:
    if value is None or isinstance(value, EmployeeWorkMode):
        return value
    key = str(value).strip().lower().replace("_", "").replace("-", "").replace(" ", "")
    return _WORK_MODE_ALIASES.get(key)


def normalize_employment_type(value: Optional[str]) -> Optional[EmploymentType]:
    if value is None or isinstance(value, EmploymentType):
        return value
    key = str(value).strip().lower().replace("_", "").replace("-", "").replace(" ", "")
    return _EMPLOYMENT_TYPE_ALIASES.get(key)


def normalize_employment_status(value: Optional[str]) -> Optional[EmploymentStatus]:
    if value is None or isinstance(value, EmploymentStatus):
        return value
    key = str(value).strip().lower().replace("_", "").replace("-", "").replace(" ", "")
    return _EMPLOYMENT_STATUS_ALIASES.get(key)


# =============================================================================
# Company-scoped helpers
# =============================================================================


async def _get_company_user(company_id: str, user_id: str) -> User:
    user = await User.get(user_id)
    if not user or user.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def _validate_department(company_id: str, department_id: Optional[str]) -> Optional[Department]:
    if not department_id:
        return None
    department = await Department.get(department_id)
    if (
        not department
        or department.deleted_at is not None
        or department.company_id != company_id
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")
    return department


async def _validate_manager(
    company_id: str,
    reports_to: Optional[str],
    *,
    employee_user_id: Optional[str] = None,
) -> Optional[User]:
    """Validate a reporting manager belongs to the company (and is not self)."""
    if not reports_to:
        return None
    manager = await User.get(reports_to)
    if not manager or manager.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager must belong to the same company")
    if employee_user_id and str(manager.id) == str(employee_user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee cannot report to themselves")
    return manager


async def _validate_employee_number(company_id: str, employee_number: Optional[str], *, exclude_profile_id: Optional[str] = None) -> Optional[str]:
    if not employee_number:
        return None
    number = str(employee_number).strip()
    existing = await EmployeeProfile.find_one(
        {"company_id": company_id, "employee_number": number}
    )
    if existing and (not exclude_profile_id or str(existing.id) != str(exclude_profile_id)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee number already exists")
    return number


async def generate_employee_number(company_id: str) -> str:
    """Generate a company-scoped, stable employee number (EMP-YYYY-####).

    Mirrors the existing TrackingCodeService pattern: count existing numbers for
    the year prefix, then scan forward for the first free value. The unique
    (company_id, employee_number) index is the authoritative backstop.
    """
    year = utc_now().year
    prefix = f"EMP-{year}-"
    count = await EmployeeProfile.find(
        {"company_id": company_id, "employee_number": {"$regex": f"^{prefix}"}}
    ).count()
    for offset in range(1, 100):
        number = f"{prefix}{count + offset:04d}"
        if not await EmployeeProfile.find_one(
            {"company_id": company_id, "employee_number": number}
        ):
            return number
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to generate employee number")


async def ensure_employee_profile(user: User) -> EmployeeProfile:
    """Create an EmployeeProfile for ``user`` when one does not exist.

    Used by user-creation paths and the backfill migration so every applicable
    company staff member (any role except platform Super Admin) has a profile.
    """
    if not user.company_id or user.role == UserRole.SUPER_ADMIN:
        raise ValueError("Employee profiles only apply to company staff")
    existing = await EmployeeProfile.find_one(
        {"company_id": user.company_id, "user_id": str(user.id)}
    )
    if existing:
        return existing
    profile = EmployeeProfile(
        company_id=user.company_id,
        user_id=str(user.id),
        employee_number=await generate_employee_number(user.company_id),
        department_id=getattr(user, "department_id", None) or None,
        designation=getattr(user, "designation", None) or None,
        reports_to=getattr(user, "reports_to", None) or None,
        joining_date=getattr(user, "created_at", None),
        employment_status=EmploymentStatus.ONBOARDING,
    )
    await profile.insert()
    return profile


# =============================================================================
# Serialization
# =============================================================================


async def _resolve_names(
    company_id: str,
    user_ids: set[str],
    user_by_id: Optional[dict[str, User]] = None,
) -> dict[str, str]:
    """Batch resolve user names (used for managers)."""
    ids = [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]
    if not ids:
        return {}
    users = user_by_id or {}
    if not users:
        fetched = await User.find({"_id": {"$in": ids}}).to_list()
        users = {str(u.id): u for u in fetched}
    return {
        uid: users[uid].full_name()
        for uid in user_ids
        if uid in users and users[uid].company_id == company_id
    }


async def serialize_list_item(profile: EmployeeProfile, context: dict) -> dict:
    user = context.get("user_by_id", {}).get(profile.user_id)
    department = context.get("department_by_id", {}).get(profile.department_id or "")
    manager_name = context.get("manager_names", {}).get(profile.reports_to or "")

    return {
        "id": str(profile.id),
        "employee_number": profile.employee_number,
        "user_id": profile.user_id,
        "full_name": user.full_name() if user else "",
        "email": user.email if user else "",
        "avatar": getattr(user, "avatar", None) if user else None,
        "phone": getattr(user, "phone", None) if user else None,
        "department_id": profile.department_id,
        "department_name": department.name if department else None,
        "designation": profile.designation,
        "manager_id": profile.reports_to,
        "manager_name": manager_name,
        "employment_type": profile.employment_type.value if profile.employment_type else None,
        "joining_date": profile.joining_date,
        "employment_status": profile.employment_status.value,
        "work_mode": profile.work_mode.value if profile.work_mode else None,
        "work_location": profile.work_location,
        "candidate_id": profile.candidate_id,
        "user_status": user.status.value if user else None,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


async def build_detail(
    profile: EmployeeProfile,
    user: User,
    *,
    can_edit: bool = False,
) -> dict:
    department_name = None
    if profile.department_id:
        department = await Department.get(profile.department_id)
        if department and department.company_id == profile.company_id:
            department_name = department.name

    manager_name = None
    if profile.reports_to:
        manager = await User.get(profile.reports_to)
        if manager and manager.company_id == profile.company_id:
            manager_name = manager.full_name()

    return {
        "id": str(profile.id),
        "employee_number": profile.employee_number,
        "user_id": profile.user_id,
        "company_id": profile.company_id,
        "candidate_id": profile.candidate_id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name(),
        "email": user.email,
        "avatar": getattr(user, "avatar", None),
        "phone": getattr(user, "phone", None),
        "user_status": user.status.value if isinstance(user.status, UserStatus) else str(user.status),
        "role": user.role.value if isinstance(user.role, UserRole) else str(user.role),
        "date_of_birth": profile.date_of_birth,
        "gender": profile.gender.value if profile.gender else None,
        "personal_email": profile.personal_email,
        "personal_phone": profile.personal_phone,
        "address": profile.address.model_dump() if profile.address else None,
        "emergency_contact": profile.emergency_contact.model_dump() if profile.emergency_contact else None,
        "employment_type": profile.employment_type.value if profile.employment_type else None,
        "joining_date": profile.joining_date,
        "department_id": profile.department_id,
        "department_name": department_name,
        "designation": profile.designation,
        "manager_id": profile.reports_to,
        "manager_name": manager_name,
        "work_location": profile.work_location,
        "work_mode": profile.work_mode.value if profile.work_mode else None,
        "employment_status": profile.employment_status.value,
        "probation": profile.probation.model_dump() if profile.probation else None,
        "exit_info": profile.exit_info.model_dump() if profile.exit_info else None,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
        "can_edit": can_edit,
    }


def _apply_personal_payload(profile: EmployeeProfile, data: dict) -> None:
    if data.get("address") is not None:
        profile.address = Address(**data["address"])
    if data.get("emergency_contact") is not None:
        profile.emergency_contact = EmergencyContact(**data["emergency_contact"])
    if data.get("probation") is not None:
        profile.probation = ProbationInfo(**data["probation"])
    if data.get("exit_info") is not None:
        profile.exit_info = ExitInfo(**data["exit_info"])
    for field in (
        "date_of_birth",
        "gender",
        "personal_email",
        "personal_phone",
        "employment_type",
        "joining_date",
        "department_id",
        "designation",
        "reports_to",
        "work_location",
        "work_mode",
        "employment_status",
    ):
        if data.get(field) is not None:
            setattr(profile, field, data[field])


# =============================================================================
# Employee list / detail
# =============================================================================


async def list_employees(
    company_id: str,
    *,
    search: Optional[str] = None,
    department_id: Optional[str] = None,
    designation: Optional[str] = None,
    employment_status: Optional[str] = None,
    employment_type: Optional[str] = None,
    work_mode: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    """Company-scoped employee list with backend search/filter/pagination.

    Uses batched joins (users, departments, managers) — no per-row N+1 queries.
    """
    if page < 1:
        page = 1
    page_size = max(1, min(page_size, 100))

    query: dict = {"company_id": company_id}

    # Search is user-data based (name/email/phone live on User), so resolve
    # matching user_ids first, then filter profiles.
    if search:
        term = search.strip()
        user_filter = {
            "company_id": company_id,
            "$or": [
                {"first_name": {"$regex": term, "$options": "i"}},
                {"last_name": {"$regex": term, "$options": "i"}},
                {"email": {"$regex": term, "$options": "i"}},
                {"phone": {"$regex": term, "$options": "i"}},
            ],
        }
        matching_users = await User.find(user_filter).to_list()
        user_ids = {str(u.id) for u in matching_users}
        number_profiles = await EmployeeProfile.find(
            {"company_id": company_id, "employee_number": {"$regex": term, "$options": "i"}}
        ).to_list()
        user_ids |= {profile.user_id for profile in number_profiles}
        query["user_id"] = {"$in": list(user_ids)} if user_ids else {"$in": []}

    if department_id:
        query["department_id"] = department_id
    if designation:
        query["designation"] = {"$regex": designation, "$options": "i"}
    if employment_status:
        status_value = normalize_employment_status(employment_status)
        if status_value is not None:
            query["employment_status"] = status_value
    if employment_type:
        type_value = normalize_employment_type(employment_type)
        if type_value is not None:
            query["employment_type"] = type_value
    if work_mode:
        mode_value = normalize_work_mode(work_mode)
        if mode_value is not None:
            query["work_mode"] = mode_value

    total = await EmployeeProfile.find(query).count()

    sort_field_map = {
        "created_at": "created_at",
        "joining_date": "joining_date",
        "employee_number": "employee_number",
        "updated_at": "updated_at",
    }
    sort_key = sort_field_map.get(sort_by, "created_at")
    sort_direction = -1 if sort_order == "asc" else 1
    profiles = (
        await EmployeeProfile.find(query)
        .sort([(sort_key, sort_direction)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    # --- Batched joins -----------------------------------------------------
    user_ids = {profile.user_id for profile in profiles}
    department_ids = {profile.department_id for profile in profiles if profile.department_id}
    manager_ids = {profile.reports_to for profile in profiles if profile.reports_to}

    user_by_id: dict[str, User] = {}
    if user_ids:
        ids = [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]
        if ids:
            fetched = await User.find({"_id": {"$in": ids}}).to_list()
            user_by_id = {str(u.id): u for u in fetched if u.company_id == company_id}

    department_by_id: dict[str, Department] = {}
    if department_ids:
        ids = [ObjectId(did) for did in department_ids if ObjectId.is_valid(did)]
        if ids:
            fetched = await Department.find(
                {"company_id": company_id, "deleted_at": None, "_id": {"$in": ids}}
            ).to_list()
            department_by_id = {str(d.id): d for d in fetched}

    manager_names: dict[str, str] = {}
    if manager_ids:
        ids = [ObjectId(mid) for mid in manager_ids if ObjectId.is_valid(mid)]
        if ids:
            fetched = await User.find({"_id": {"$in": ids}}).to_list()
            manager_by_id = {str(u.id): u for u in fetched if u.company_id == company_id}
            manager_names = {
                uid: manager_by_id[uid].full_name() for uid in manager_ids if uid in manager_by_id
            }

    context = {
        "user_by_id": user_by_id,
        "department_by_id": department_by_id,
        "manager_names": manager_names,
    }
    items = [await serialize_list_item(profile, context) for profile in profiles]
    return items, total


async def get_employee(company_id: str, employee_id: str, actor: User, *, can_edit: bool = False) -> dict:
    """Return the normalized detail DTO for one employee.

    Access rules:
    - Company admins / HR managers (managed by the endpoint dependency) pass.
    - A regular employee may only open their own profile.
    - ``can_edit`` is computed by the endpoint from the manage permission.
    """
    profile = await EmployeeProfile.get(employee_id)
    if not profile or profile.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    user = await _get_company_user(company_id, profile.user_id)

    role = actor.role if isinstance(actor.role, UserRole) else UserRole.from_legacy(str(actor.role))
    if role not in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN} and str(actor.id) != str(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own employee profile",
        )

    return await build_detail(profile, user, can_edit=can_edit)


# =============================================================================
# HR create / update
# =============================================================================


async def create_profile(company_id: str, actor: User, data: dict) -> dict:
    """Create an Employee Profile for an existing company User (HR/Admin only)."""
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id is required")
    user = await _get_company_user(company_id, user_id)
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Super Admin profiles are not supported")

    existing = await EmployeeProfile.find_one({"company_id": company_id, "user_id": user_id})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee profile already exists for this user")

    department = await _validate_department(company_id, data.get("department_id"))
    manager = await _validate_manager(company_id, data.get("reports_to"), employee_user_id=user_id)

    employee_number = data.get("employee_number")
    if employee_number:
        employee_number = await _validate_employee_number(company_id, employee_number)
    else:
        employee_number = await generate_employee_number(company_id)

    profile = EmployeeProfile(
        company_id=company_id,
        user_id=str(user.id),
        employee_number=employee_number,
        department_id=str(department.id) if department else data.get("department_id"),
        reports_to=str(manager.id) if manager else data.get("reports_to"),
        employment_status=normalize_employment_status(data.get("employment_status")) or EmploymentStatus.ONBOARDING,
    )
    _apply_personal_payload(profile, data)
    await profile.insert()

    # Remove candidate_id if None to keep the sparse unique index clean.
    # MongoDB sparse indexes only exclude documents where the field is ABSENT;
    # a field with value null IS indexed and can violate unique constraints.
    if profile.candidate_id is None:
        await EmployeeProfile.get_motor_collection().update_one(
            {"_id": profile.id},
            {"$unset": {"candidate_id": ""}},
        )

    await _record_employee_event(
        company_id, "EmployeeProfileCreated", actor, profile,
        payload={"employee_id": str(profile.id), "user_id": profile.user_id, "employee_number": profile.employee_number},
    )
    return await build_detail(profile, user, can_edit=True)


async def update_profile(company_id: str, employee_id: str, actor: User, data: dict) -> dict:
    """Partial update of an Employee Profile (HR/Admin only)."""
    profile = await EmployeeProfile.get(employee_id)
    if not profile or profile.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    user = await _get_company_user(company_id, profile.user_id)

    changes: dict = {}
    if data.get("employee_number") is not None:
        new_number = await _validate_employee_number(
            company_id, data["employee_number"], exclude_profile_id=str(profile.id)
        )
        if new_number != profile.employee_number:
            changes["employee_number"] = new_number
            profile.employee_number = new_number
    if data.get("department_id") is not None:
        department = await _validate_department(company_id, data["department_id"])
        if str(department.id) != profile.department_id:
            changes["department_id"] = str(department.id)
            profile.department_id = str(department.id)
    if data.get("reports_to") is not None:
        manager = await _validate_manager(company_id, data["reports_to"], employee_user_id=profile.user_id)
        new_reports_to = str(manager.id) if manager else None
        if new_reports_to != profile.reports_to:
            changes["reports_to"] = new_reports_to
            profile.reports_to = new_reports_to

    # Simple scalar employment fields
    for field in (
        "employment_type",
        "joining_date",
        "designation",
        "work_location",
        "work_mode",
        "employment_status",
        "date_of_birth",
        "gender",
        "personal_email",
        "personal_phone",
    ):
        if data.get(field) is not None:
            value = data[field]
            if field == "work_mode":
                value = normalize_work_mode(value)
            elif field == "employment_type":
                value = normalize_employment_type(value)
            elif field == "employment_status":
                value = normalize_employment_status(value)
            if value is not None and value != getattr(profile, field):
                changes[field] = value
                setattr(profile, field, value)

    # Nested structures
    if data.get("address") is not None:
        changes["address"] = data["address"]
        profile.address = Address(**data["address"])
    if data.get("emergency_contact") is not None:
        changes["emergency_contact"] = data["emergency_contact"]
        profile.emergency_contact = EmergencyContact(**data["emergency_contact"])
    # Phase 11 — Lifecycle-sensitive fields must go through LifecycleService,
    # not be directly patched.  employment_status and exit_info changes that
    # should flow through resignation/termination/confirmation workflows are
    # blocked here with a clear error.
    LIFECYCLE_PROTECTED_FIELDS = {"employment_status", "exit_info"}
    blocked = LIFECYCLE_PROTECTED_FIELDS & {k for k, v in data.items() if v is not None}
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The following fields cannot be updated directly: {', '.join(sorted(blocked))}. "
                "Use the Employee Lifecycle endpoints for status changes, exits, and confirmations."
            ),
        )
    if data.get("probation") is not None:
        changes["probation"] = data["probation"]
        profile.probation = ProbationInfo(**data["probation"])

    if changes:
        # Phase 11 closure — lifecycle-sensitive changes are recorded BEFORE the
        # profile save so a history failure aborts the mutation (no silent
        # history loss). Personal/contact changes never block.
        from app.services.lifecycle_service import _profile_employment_state, record_profile_changes

        lifecycle_fields = {
            "department_id", "designation", "reports_to",
            "employment_type", "work_location", "work_mode",
        }
        touch_lifecycle = bool(lifecycle_fields & set(changes.keys()))
        recorded_events = []
        if touch_lifecycle:
            before_state = _profile_employment_state(profile)
            try:
                recorded_events = await record_profile_changes(
                    company_id, actor, profile, changes, before_state=before_state,
                )
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=(
                        "Profile could not be updated because the employment history "
                        "could not be recorded. No changes were saved — please retry."
                    ),
                ) from exc

        profile.updated_at = utc_now()
        try:
            await profile.save()
        except Exception:
            # Compensation: history events were persisted but the profile save
            # failed — remove them so no orphan history is left behind.
            for event in recorded_events:
                try:
                    await event.delete()
                except Exception:
                    pass
            raise

        await _record_employee_event(
            company_id, "EmployeeProfileUpdated", actor, profile,
            payload={"employee_id": str(profile.id), "changes": changes},
        )
    return await build_detail(profile, user, can_edit=True)


async def _record_employee_event(
    company_id: str,
    event_name: str,
    actor: User,
    profile: EmployeeProfile,
    payload: dict,
) -> None:
    """Emit a domain event through the existing recruitment event bus.

    Reuses the platform event infrastructure — no new audit engine.
    """
    from app.recruitment.events import publish_recruitment_event

    try:
        await publish_recruitment_event(
            event_name=event_name,
            aggregate_type="employee",
            aggregate_id=str(profile.id),
            company_id=company_id,
            actor_id=str(actor.id),
            payload=payload,
        )
    except Exception:
        # Event publishing must never break the core operation.
        import logging

        logging.getLogger(__name__).exception("Failed to publish employee profile event")


# =============================================================================
# Canonical Candidate → Employee onboarding
# =============================================================================


class EmployeeOnboardingService:
    """The single canonical candidate → employee conversion path.

    Every recruitment conversion entry point (``RecruitmentService.convert``,
    ``RecruitmentService.hire_candidate``) delegates here so User + Employee
    Profile creation is consistent across the whole application.
    """

    @staticmethod
    async def create_employee_from_candidate(
        company_id: str,
        actor_id: str,
        candidate,
        *,
        job=None,
        offer=None,
        department_id: Optional[str] = None,
        designation: Optional[str] = None,
        reports_to: Optional[str] = None,
        joining_date: Optional[datetime] = None,
        employment_type: Optional[EmploymentType] = None,
        work_mode: Optional[EmployeeWorkMode] = None,
        work_location: Optional[str] = None,
    ) -> dict:
        from app.recruitment.models import Candidate, CandidateStatus

        # 1. Candidate exists + company scope
        if candidate.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

        # 2. Prevent duplicate conversion
        if candidate.status == CandidateStatus.EMPLOYEE and candidate.employee_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Candidate has already been converted to an employee",
            )
        existing_profile_for_candidate = await EmployeeProfile.find_one(
            {"company_id": company_id, "candidate_id": str(candidate.id)}
        )
        if existing_profile_for_candidate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee profile already exists for this candidate",
            )

        # 3. Resolve employment defaults from job/offer where available
        dept_id = department_id or (job.department_id if job else None)
        designation_value = designation or (job.title if job else None) or (offer.job_title if offer else None)
        reports_to_value = reports_to or (job.hiring_manager_id if job else None) or (offer.reporting_manager_id if offer else None)
        joining_date_value = joining_date or (offer.joining_date if offer else None)
        type_value = employment_type or (normalize_employment_type(getattr(job, "employment_type", None)) if job else None) or (
            normalize_employment_type(getattr(offer, "employment_type", None)) if offer else None
        )
        mode_value = work_mode or (normalize_work_mode(getattr(job, "work_mode", None)) if job else None)
        location_value = work_location or (job.location if job else None) or (offer.work_location if offer else None)

        # 4. Validate department + manager company scope
        if dept_id:
            await _validate_department(company_id, dept_id)

        # 5. Reuse existing User by email when legitimate — never duplicate accounts
        existing_user = await User.find_one({"email": candidate.email})
        if existing_user:
            if existing_user.company_id and existing_user.company_id != company_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A user with this email already exists in another company",
                )
            user = existing_user
            if not user.company_id:
                user.company_id = company_id
            created_user = False
        else:
            names = (candidate.full_name or "").strip().split(maxsplit=1)
            user = User(
                email=candidate.email,
                password_hash=get_password_hash(secrets.token_urlsafe(24)),
                first_name=names[0] if names else candidate.full_name or "",
                last_name=names[1] if len(names) > 1 else "",
                role=UserRole.EMPLOYEE,
                status=UserStatus.PENDING,
                modules=["task"],
                company_id=company_id,
                department_id=dept_id,
                reports_to=reports_to_value,
                created_by=actor_id,
            )
            await user.insert()
            created_user = True

        if reports_to_value:
            await _validate_manager(company_id, reports_to_value, employee_user_id=str(user.id))
            if user.reports_to != reports_to_value:
                user.reports_to = reports_to_value
                user.updated_at = utc_now()
                await user.save()

        # 6. Create/link Employee Profile (no duplicate per user or candidate)
        profile = await EmployeeProfile.find_one({"company_id": company_id, "user_id": str(user.id)})
        if profile and profile.candidate_id and profile.candidate_id != str(candidate.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user already belongs to another converted candidate",
            )
        if not profile:
            profile = EmployeeProfile(
                company_id=company_id,
                user_id=str(user.id),
                candidate_id=str(candidate.id),
                employee_number=await generate_employee_number(company_id),
                department_id=dept_id,
                designation=designation_value,
                reports_to=reports_to_value,
                joining_date=joining_date_value,
                employment_type=type_value,
                work_mode=mode_value,
                work_location=location_value,
                employment_status=(
                    EmploymentStatus.PROBATION if joining_date_value else EmploymentStatus.ONBOARDING
                ),
            )
            await profile.insert()
        else:
            profile.candidate_id = str(candidate.id)
            profile.department_id = profile.department_id or dept_id
            profile.designation = profile.designation or designation_value
            profile.reports_to = profile.reports_to or reports_to_value
            profile.joining_date = profile.joining_date or joining_date_value
            profile.employment_type = profile.employment_type or type_value
            profile.work_mode = profile.work_mode or mode_value
            profile.work_location = profile.work_location or location_value
            profile.updated_at = utc_now()
            await profile.save()

        # 7. Link candidate → employee and move it out of the pipeline
        candidate.employee_id = str(user.id)
        candidate.job_id = str(candidate.job_id or (job.id if job else None) or "")
        candidate.status = CandidateStatus.EMPLOYEE
        candidate.updated_at = utc_now()
        await candidate.save()

        # 8. Phase 9 — record the JOINED lifecycle foundation event
        # (idempotent; the profile was just created or linked).
        try:
            from app.services.lifecycle_service import record_joined_event

            await record_joined_event(company_id, profile, actor_id=actor_id)
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Failed to record JOINED lifecycle event")

        # 9. Emit events (existing recruitment bus; preserves timeline/audit)
        from app.recruitment.events import publish_recruitment_event

        payload = {
            "employee_id": str(user.id),
            "employee_profile_id": str(profile.id),
            "designation": designation_value,
            "department_id": dept_id,
            "joining_date": joining_date_value.isoformat() if joining_date_value else None,
            "created_user": created_user,
            "reused_user": not created_user,
        }
        try:
            await publish_recruitment_event(
                event_name="CandidateConverted",
                aggregate_type="candidate",
                aggregate_id=str(candidate.id),
                company_id=company_id,
                actor_id=actor_id,
                payload={**payload, "candidate_id": str(candidate.id), "job_id": candidate.job_id},
            )
            await publish_recruitment_event(
                event_name="EmployeeProfileCreated",
                aggregate_type="employee",
                aggregate_id=str(profile.id),
                company_id=company_id,
                actor_id=actor_id,
                payload=payload,
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Failed to publish candidate conversion event")

        return {
            "user": user,
            "profile": profile,
            "designation": designation_value,
            "department_id": dept_id,
            "employee_number": profile.employee_number,
            "created_user": created_user,
        }
