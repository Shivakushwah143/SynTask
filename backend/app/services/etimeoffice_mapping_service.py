"""
eTimeOffice employee-mapping service.

Owns the explicit, company-scoped mapping table between eTimeOffice employees
(external Empcode + directory name metadata) and SynTask employees:

    company_id + provider + external_employee_code  (unique)
        -> employee_id  (SynTask User id, set only after HR confirms)

Rules enforced here (and by the model indexes):
- Attendance sync resolves punches ONLY through this table — never by
  ``EmployeeProfile.employee_number`` numeric suffixes and never by name.
- (company_id, provider, external_employee_code) is unique.
- A SynTask employee maps to at most one eTimeOffice code per provider
  (partial unique index on employee_id).
- Every operation is company-scoped: Company A can never see or assign
  Company B's eTimeOffice employees.

Name matching is used ONLY to suggest a likely SynTask employee in the HR
mapping UI. A suggestion is never an assignment — HR must confirm.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Dict, List, Optional

from app.core.clock import utc_now
from app.core.config import settings
from app.integrations.etimeoffice.models import (
    PROVIDER_ETIMEOFFICE,
    ETimeOfficeEmployeeMapping,
)
from app.models.employee_profile import EmployeeProfile
from app.models.user import User, UserRole, UserStatus
from app.services.etimeoffice_sync_service import (
    load_etimeoffice_employee_mappings,
    refresh_etimeoffice_directory,
)

# Roles an HR admin may attach biometric punches to (mirrors who can have
# attendance records in the app). Pure company admins/super-admins are excluded.
MAPPABLE_ROLES = {
    UserRole.SUB_ADMIN,
    UserRole.MANAGER,
    UserRole.LEAD,
    UserRole.EMPLOYEE,
}

_PLACEHOLDER_NAME = re.compile(
    r"^(?:emp(?:loyee|name)?|user|staff)\s*[-_]?\d*|n/?a|test\s*user|dummy$",
    re.IGNORECASE,
)


class ETimeOfficeMappingError(Exception):
    """Raised for mapping validation failures that map to a 4xx response."""


def normalize_name(value: Optional[str]) -> str:
    """Normalize a person name for comparison/suggestion purposes."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", str(value).strip()).casefold()


def is_placeholder_name(value: Optional[str]) -> bool:
    """True for provider placeholder identities (e.g. ``Empname0005``).\n\n    These should never be auto-suggested; HR may still map them explicitly if\n    a real SynTask employee exists.\n    """
    name = normalize_name(value)
    if not name:
        return True
    if _PLACEHOLDER_NAME.match(name):
        return True
    # All-digits / "employee 5"-style names are never real people.
    if re.fullmatch(r"(emp\s*)?\d+", name):
        return True
    return False


# ---------------------------------------------------------------------------
# Company employee candidates (dropdown source for the mapping UI)
# ---------------------------------------------------------------------------


async def company_employee_candidates(company_id: str) -> List[dict]:
    """Active company users eligible to receive biometric punches.\n\n    Each entry: {id, name, employee_number, role}. ``employee_number`` is\n    display-only reference data and is never used for resolution.\n    """
    users = await User.find(
        {
            "company_id": company_id,
            "status": UserStatus.ACTIVE.value,
            "role": {"$in": [r.value for r in MAPPABLE_ROLES]},
        }
    ).sort([("first_name", 1)]).to_list()

    profiles = await EmployeeProfile.find(
        {"company_id": company_id, "user_id": {"$in": [str(u.id) for u in users]}}
    ).to_list()
    numbers = {str(p.user_id): str(p.employee_number or "").strip() for p in profiles}

    candidates: List[dict] = []
    for user in users:
        candidates.append(
            {
                "id": str(user.id),
                "name": user.full_name().strip(),
                "employee_number": numbers.get(str(user.id), ""),
                "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            }
        )
    candidates.sort(key=lambda c: normalize_name(c["name"]))
    return candidates


def _candidate_names(candidates: List[dict]) -> Dict[str, List[dict]]:
    """Map normalized candidate name -> candidates sharing that name."""
    index: Dict[str, List[dict]] = {}
    for candidate in candidates:
        index.setdefault(normalize_name(candidate["name"]), []).append(candidate)
    return index


def suggest_employee(
    candidates: List[dict],
    external_name: Optional[str],
) -> Optional[dict]:
    """Suggest one SynTask employee for an external name.\n\n    Exact normalized full-name match wins. Otherwise a unique fuzzy match with\n    high confidence (>= 0.92 similarity) is suggested. Placeholder names and\n    ambiguous matches yield no suggestion. The result is a suggestion only —\n    the caller (HR) must confirm before it becomes a mapping.\n    """
    name = normalize_name(external_name)
    if not name or is_placeholder_name(external_name):
        return None

    index = _candidate_names(candidates)
    exact = index.get(name) or []
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return None  # two employees share the exact name — ambiguous

    best: Optional[dict] = None
    best_ratio = 0.0
    for candidate in candidates:
        ratio = SequenceMatcher(None, name, normalize_name(candidate["name"])).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best = candidate
    if best is not None and best_ratio >= 0.92:
        return best
    return None


# ---------------------------------------------------------------------------
# Mapping CRUD (admin-only, company-scoped)
# ---------------------------------------------------------------------------


def _user_eligible(user: User) -> bool:
    role = user.role
    if hasattr(role, "value"):
        role = UserRole(role.value)
    return (
        user.status == UserStatus.ACTIVE
        and user.company_id is not None
        and role in MAPPABLE_ROLES
    )


async def list_etimeoffice_mappings(
    company_id: str,
    *,
    refresh: bool = False,
    actor_id: Optional[str] = None,
) -> dict:
    """Return directory + mapping rows for the Attendance mapping UI.\n\n    ``refresh=True`` first downloads the provider directory (read-only) so new\n    eTimeOffice employees appear before HR maps them. Provider failures raise\n    the underlying ETimeOfficeError and leave existing rows untouched.\n    """
    if refresh:
        await refresh_etimeoffice_directory(company_id, actor_id=actor_id)

    docs = await ETimeOfficeEmployeeMapping.find(
        {
            "company_id": company_id,
            "provider": PROVIDER_ETIMEOFFICE,
        }
    ).sort([("external_employee_code", 1)]).to_list()

    candidates = await company_employee_candidates(company_id)
    candidates_by_id = {c["id"]: c for c in candidates}

    rows = []
    for doc in docs:
        mapped = candidates_by_id.get(str(doc.employee_id)) if doc.employee_id else None
        suggestion = suggest_employee(candidates, doc.external_employee_name)
        if mapped and suggestion and suggestion["id"] == mapped["id"]:
            suggestion = None  # already mapped — nothing left to suggest
        rows.append(
            {
                "external_employee_code": doc.external_employee_code,
                "external_employee_name": doc.external_employee_name,
                "employee": mapped,
                "status": "mapped" if mapped else "unmapped",
                "suggestion": suggestion,
                "last_seen_at": doc.last_seen_at.isoformat() + "Z"
                if doc.last_seen_at
                else None,
                "updated_at": doc.updated_at.isoformat() + "Z" if doc.updated_at else None,
            }
        )

    return {
        "provider": PROVIDER_ETIMEOFFICE,
        "configured": settings.etimeoffice_configured,
        "rows": rows,
        "employees": candidates,
        "mapped_count": sum(1 for r in rows if r["status"] == "mapped"),
        "unmapped_count": sum(1 for r in rows if r["status"] == "unmapped"),
    }


async def _ensure_mapping_doc(company_id: str, code: str) -> ETimeOfficeEmployeeMapping:
    doc = await ETimeOfficeEmployeeMapping.find_one(
        {
            "company_id": company_id,
            "provider": PROVIDER_ETIMEOFFICE,
            "external_employee_code": code,
        }
    )
    if doc is None:
        doc = ETimeOfficeEmployeeMapping(
            company_id=company_id,
            provider=PROVIDER_ETIMEOFFICE,
            external_employee_code=code,
            external_employee_name="",
            employee_id=None,
        )
        await doc.insert()
    return doc


async def set_etimeoffice_mapping(
    company_id: str,
    code: str,
    employee_id: Optional[str],
    actor_id: Optional[str] = None,
) -> dict:
    """Confirm (or change) the SynTask employee for one eTimeOffice code.\n\n    ``employee_id=None`` removes the mapping (the directory row remains,\n    marked unmapped). Validates tenancy, active status, and that the employee\n    is not already mapped to a different code.\n    """
    code = str(code or "").strip()
    if not code:
        raise ETimeOfficeMappingError("external_employee_code is required")

    doc = await _ensure_mapping_doc(company_id, code)

    if not employee_id:
        if doc.employee_id:
            doc.employee_id = None
            doc.updated_at = utc_now()
            await doc.save()
        return _mapping_payload(doc)

    target = await User.get(employee_id)
    if not target or target.company_id != company_id:
        raise ETimeOfficeMappingError("Selected employee does not belong to this company")
    if not _user_eligible(target):
        raise ETimeOfficeMappingError("Selected employee is not an active, mappable employee")

    # One eTimeOffice code per SynTask employee.
    existing = await ETimeOfficeEmployeeMapping.find_one(
        {
            "company_id": company_id,
            "provider": PROVIDER_ETIMEOFFICE,
            "employee_id": employee_id,
            "external_employee_code": {"$ne": code},
        }
    )
    if existing:
        raise ETimeOfficeMappingError(
            f"This employee is already mapped to eTimeOffice code "
            f"{existing.external_employee_code}"
        )

    doc.employee_id = employee_id
    doc.created_by = actor_id
    doc.updated_at = utc_now()
    try:
        await doc.save()
    except Exception as exc:  # partial unique index on employee_id raced us
        if "duplicate key" in str(exc).lower():
            raise ETimeOfficeMappingError(
                "This employee is already mapped to another eTimeOffice code"
            ) from exc
        raise
    return _mapping_payload(doc)


def _mapping_payload(doc: ETimeOfficeEmployeeMapping) -> dict:
    return {
        "external_employee_code": doc.external_employee_code,
        "external_employee_name": doc.external_employee_name,
        "employee_id": doc.employee_id,
        "status": "mapped" if doc.employee_id else "unmapped",
        "updated_at": doc.updated_at.isoformat() + "Z" if doc.updated_at else None,
    }


# ---------------------------------------------------------------------------
# One-time reconciliation of wrongly-assigned biometric attendance
# ---------------------------------------------------------------------------


async def reconcile_etimeoffice_attendance(
    company_id: str,
    *,
    dry_run: bool = False,
) -> dict:
    """Repair biometric Attendance rows written by the old suffix-based mapping.

    Resolution is the same table the sync now uses: each row's stored
    ``external_employee_code`` is resolved through the EXPLICIT mapping. Rows
    already on the mapped employee stay; rows on another employee are moved;
    rows whose target employee already owns a same-date record keep the target
    record (manual rows win; identical biometric duplicates are removed); rows
    whose code is unmapped are left untouched and counted unresolved.

    Returns a safe summary + a per-row detail list. ``dry_run`` previews every
    change without writing.
    """
    attendance = Attendance_collection()
    confirmed = await load_etimeoffice_employee_mappings(company_id)

    company_users = await User.find({"company_id": company_id}).to_list()
    valid_user_ids = {str(u.id) for u in company_users}

    rows = await attendance.find(
        {"company_id": company_id, "source": "etimeoffice"}
    ).to_list()

    stats = {
        "rows_checked": len(rows),
        "already_correct": 0,
        "reassigned": 0,
        "merged_duplicate": 0,
        "kept_existing": 0,
        "unresolved": 0,
        "changes": [],
    }

    # occupancy of every company attendance row on days covered by biometrics,
    # so a move never collides with a same-date record of the target employee.
    dates = {row["date"] for row in rows}
    occupancy: Dict[tuple, dict] = {}
    all_rows = await attendance.find(
        {"company_id": company_id, "date": {"$in": sorted(dates)}}
    ).to_list()
    for row in all_rows:
        occupancy[(row["employee_id"], row["date"])] = row

    candidates: Dict[object, dict] = {}  # attendance _id -> row needing a move
    change_by_row: Dict[str, dict] = {}
    changes: List[dict] = []

    for row in rows:
        row_key = str(row["_id"])
        code = str(row.get("external_employee_code") or "").strip()
        target = confirmed.get(code)
        change = {
            "external_employee_code": code,
            "date": row.get("date"),
            "from_employee_id": row.get("employee_id"),
            "to_employee_id": target,
            "action": None,
        }

        if not target or target not in valid_user_ids:
            change["action"] = "unresolved"
            stats["unresolved"] += 1
            changes.append(change)
        elif target == row.get("employee_id"):
            change["action"] = "ok"
            stats["already_correct"] += 1
        else:
            candidates[row["_id"]] = row
            change_by_row[row_key] = change
            changes.append(change)  # action decided below (chained swaps)

    # Rows being moved vacate their current (employee, date) pair, which frees
    # it for another moved row (e.g. A->B while B's row goes to C).
    vacating = {
        (row["employee_id"], row["date"])
        for row in candidates.values()
    }
    occupied_after = {
        pair: holder
        for pair, holder in occupancy.items()
        if pair not in vacating
    }

    move_targets: Dict[object, str] = {}  # attendance _id -> employee_id (final)
    to_delete: List[object] = []
    for row_id, row in candidates.items():
        code = str(row.get("external_employee_code") or "").strip()
        target = confirmed[code]
        holder = occupied_after.get((target, row["date"]))
        change = change_by_row[str(row_id)]
        if holder is None:
            move_targets[row_id] = target
            change["action"] = "reassign"
            stats["reassigned"] += 1
        elif (
            holder.get("source") == "etimeoffice"
            and str(holder.get("external_employee_code") or "") == code
        ):
            # The correct employee already has this exact biometric day — the
            # row under the wrong employee is a duplicate copy.
            to_delete.append(row_id)
            change["action"] = "merged_duplicate"
            stats["merged_duplicate"] += 1
        else:
            # Target employee's day is a manual/app record; keep that record and
            # drop the wrongly-assigned biometric copy.
            to_delete.append(row_id)
            change["action"] = "kept_existing"
            stats["kept_existing"] += 1

    if not dry_run and (move_targets or to_delete):
        # Two-phase move: first vacate every row to a unique temp owner so the
        # unique (company, employee, date) index can never collide mid-swap.
        # Filters always use the raw ``_id`` object (a stringified id would
        # silently match nothing and leave the wrong row in place).
        for row_id in move_targets:
            await attendance.update_one(
                {"_id": row_id},
                {"$set": {"employee_id": f"__sync_tmp_{row_id}__"}},
            )
        for row_id, target in move_targets.items():
            await attendance.update_one(
                {"_id": row_id}, {"$set": {"employee_id": target, "updated_at": utc_now()}}
            )
        if to_delete:
            await attendance.delete_many({"_id": {"$in": to_delete}})

    stats["changes"] = changes
    stats["dry_run"] = dry_run
    return stats


def Attendance_collection():
    """Lazily resolve the raw motor collection for the attendance model."""
    from app.models.attendance import Attendance

    return Attendance.get_pymongo_collection()
