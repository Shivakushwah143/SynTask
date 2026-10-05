"""
eTimeOffice attendance sync service.

Bridges the biometric provider into the existing SynTask Attendance module:

    eTimeOffice API  ->  ETimeOfficeClient  ->  normalization  ->  explicit
    employee mapping (company-scoped ETimeOfficeEmployeeMapping table, confirmed
    by HR in the Attendance UI)  ->  existing Attendance records  ->  HR
    Attendance UI (Source: eTimeOffice)

Guarantees:
- Tenant isolation: records are only written for users of the target
  ``company_id`` that have an explicit mapping; external employees that do not
  map are counted as unmapped and never fail the run.
- No inferred identity: punches resolve ONLY through the explicit mapping
  table — never through ``EmployeeProfile.employee_number`` numeric suffixes or
  name matching — so biometric attendance can never be silently attached to
  the wrong SynTask employee.
- Idempotency: re-syncing the same window is a no-op (existing identical
  records are counted as duplicates and not rewritten).
- Safety: never overwrites attendance produced by the SynTask app check-in
  (source is None/manual); never deletes attendance; a failed provider run
  leaves existing attendance untouched and stores the error for the status UI.
- Only safe metadata is persisted — never provider credentials/cookies.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional

import pytz
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.clock import utc_now
from app.core.config import settings
from app.integrations.etimeoffice.client import (
    ETimeOfficeClient,
    ETimeOfficeError,
    ETimeOfficeInOutDay,
)
from app.integrations.etimeoffice.models import (
    PROVIDER_ETIMEOFFICE,
    ETimeOfficeEmployeeMapping,
    ETimeOfficeSyncState,
)
from app.models.attendance import Attendance, AttendancePolicy, AttendanceStatus
from app.services.attendance_policy_service import get_active_policy
from app.services.attendance_status_resolver import compute_overtime

logger = logging.getLogger(__name__)


class ETimeOfficeSyncInProgress(Exception):
    """Raised when a sync is already running for the company."""


class ETimeOfficeNotConfigured(Exception):
    """Raised when provider credentials are missing/disabled."""


def _mask_code(code: str, keep: int = 2) -> str:
    """Mask an external employee code in surfaced messages (PII hygiene)."""
    code = str(code)
    return "*" * max(0, len(code) - keep) + code[-keep:] if code else ""


def _wall_to_utc(day: date, wall: time, timezone_name: str) -> datetime:
    """Convert a provider wall-clock instant to a naive-UTC SynTask instant."""
    zone = pytz.timezone(timezone_name)
    local = zone.localize(datetime.combine(day, wall))
    return local.astimezone(pytz.utc).replace(tzinfo=None)


def _resolve_sync_timezone() -> str:
    """Pick the timezone used to interpret eTimeOffice wall-clock times.

    The provider returns device wall-clock times without an offset, so the
    corporate timezone must come from configuration
    (``ETIMEOFFICE_TIMEZONE``, default Asia/Kolkata). Ops must set it to the
    company's actual timezone; it must match what HR users see in SynTask.
    """
    configured = getattr(settings, "ETIMEOFFICE_TIMEZONE", None)
    if configured and configured.strip():
        candidate = configured.strip()
        if candidate in pytz.all_timezones_set:
            return candidate
    return "UTC"


def _late_early_flags(
    timezone_name: str,
    policy: Optional[AttendancePolicy],
    login_utc: Optional[datetime],
    logout_utc: Optional[datetime],
) -> dict:
    """Recompute late/early minutes from SynTask policy rules in the company
    wall-clock timezone.

    Computed in the integration wall-clock zone (``ETIMEOFFICE_TIMEZONE``)
    because the UTC instants were derived from that same zone; a company
    policy whose stored timezone is stale (e.g. default UTC) must not distort
    biometric arrival flags. Expected times default to 09:00-18:00 with zero
    grace when no policy exists, matching the AttendancePolicy defaults.
    """
    expected_start = "09:00"
    expected_end = "18:00"
    late_grace = 0.0
    early_grace = 0.0
    if policy is not None:
        expected_start = policy.expected_start_time or expected_start
        expected_end = policy.expected_end_time or expected_end
        late_grace = float(policy.late_grace_minutes or 0.0)
        early_grace = float(policy.early_departure_grace_minutes or 0.0)

    zone = pytz.timezone(timezone_name)

    def _minutes_after_midnight(value: str) -> int:
        parts = str(value).split(":")
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            return 9 * 60

    is_late = False
    late_minutes = 0.0
    is_early = False
    early_minutes = 0.0

    if login_utc is not None:
        local_login = login_utc.replace(tzinfo=timezone.utc).astimezone(zone)
        start_local = zone.localize(
            datetime.combine(local_login.date(), time(0, 0))
        ) + timedelta(minutes=_minutes_after_midnight(expected_start) + late_grace)
        if local_login > start_local:
            is_late = True
            late_minutes = round((local_login - start_local).total_seconds() / 60.0, 2)

    if logout_utc is not None:
        local_logout = logout_utc.replace(tzinfo=timezone.utc).astimezone(zone)
        end_local = zone.localize(
            datetime.combine(local_logout.date(), time(0, 0))
        ) + timedelta(minutes=_minutes_after_midnight(expected_end) - early_grace)
        if local_logout < end_local:
            is_early = True
            early_minutes = round((end_local - local_logout).total_seconds() / 60.0, 2)

    return {
        "is_late": is_late,
        "late_minutes": late_minutes,
        "is_early_departure": is_early,
        "early_departure_minutes": early_minutes,
    }


# ---------------------------------------------------------------------------
# Explicit employee mapping + provider directory (company-scoped)
# ---------------------------------------------------------------------------
# The mapping table is the ONLY identity link between an eTimeOffice Empcode
# and a SynTask employee. Rows are created/refreshed from the provider
# directory (code + name metadata) and assigned by an HR admin in the
# Attendance UI. Sync never infers an employee from a code pattern or name.


async def persist_etimeoffice_directory(
    company_id: str,
    entries: Dict[str, str],
    actor_id: Optional[str] = None,
) -> None:
    """Upsert provider directory metadata (code -> name) for a company.

    Never touches ``employee_id``: an existing HR-confirmed mapping (and its
    ``created_by`` audit) survives a directory refresh untouched.
    """
    if not entries:
        return
    collection = ETimeOfficeEmployeeMapping.get_pymongo_collection()
    now = utc_now()
    for code, name in entries.items():
        try:
            await collection.update_one(
                {
                    "company_id": company_id,
                    "provider": PROVIDER_ETIMEOFFICE,
                    "external_employee_code": str(code),
                },
                {
                    "$set": {
                        "external_employee_name": name or "",
                        "last_seen_at": now,
                        "updated_at": now,
                    },
                    "$setOnInsert": {
                        "company_id": company_id,
                        "provider": PROVIDER_ETIMEOFFICE,
                        "external_employee_code": str(code),
                        "employee_id": None,
                        "created_by": actor_id,
                        "created_at": now,
                    },
                },
                upsert=True,
            )
        except DuplicateKeyError:
            logger.warning(
                "eTimeOffice directory upsert race for company=%s code=%s",
                company_id,
                _mask_code(str(code)),
            )


async def load_etimeoffice_employee_mappings(company_id: str) -> Dict[str, str]:
    """Resolve external code -> SynTask user_id from confirmed mappings only."""
    mappings = await ETimeOfficeEmployeeMapping.find(
        ETimeOfficeEmployeeMapping.company_id == company_id,
        ETimeOfficeEmployeeMapping.provider == PROVIDER_ETIMEOFFICE,
        ETimeOfficeEmployeeMapping.employee_id != None,  # noqa: E711 (Beanie expr)
    ).to_list()
    return {m.external_employee_code: str(m.employee_id) for m in mappings}


async def refresh_etimeoffice_directory(
    company_id: str,
    days_back: Optional[int] = None,
    actor_id: Optional[str] = None,
) -> Dict[str, str]:
    """Read-only provider directory refresh: download the recent punch window
    and persist {external_employee_code: external_employee_name} for every
    eTimeOffice employee seen. Never changes mapping assignments.

    Returns the directory seen in the window. Raises ETimeOfficeError when the
    provider is unreachable (existing mappings/attendance stay untouched).
    """
    if not settings.etimeoffice_configured:
        raise ETimeOfficeNotConfigured(
            "eTimeOffice integration is not configured or is disabled"
        )
    timezone_name = _resolve_sync_timezone()
    to_date = _today_in_tz(timezone_name)
    lookback = days_back if days_back and days_back > 0 else max(
        1, getattr(settings, "ETIMEOFFICE_SYNC_LOOKBACK_DAYS", 7)
    )
    from_date = to_date - timedelta(days=lookback)

    client = ETimeOfficeClient()
    try:
        days = await client.fetch_in_out_days(from_date, to_date, emp_code="ALL")
        entries: Dict[str, str] = {}
        for day in days:
            code = str(day.external_employee_code).strip()
            if not code:
                continue
            entries.setdefault(code, (day.external_employee_name or "").strip())
        await persist_etimeoffice_directory(company_id, entries, actor_id=actor_id)
        return entries
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Record normalization + idempotent persistence
# ---------------------------------------------------------------------------


def _today_in_tz(timezone_name: str) -> date:
    return datetime.now(pytz.timezone(timezone_name)).date()


def _day_to_attendance_fields(
    day: ETimeOfficeInOutDay,
    timezone_name: str,
    policy: Optional[AttendancePolicy],
) -> dict:
    """Map a normalized provider day onto Attendance field values (UTC)."""
    today = _today_in_tz(timezone_name)
    has_check_in = day.check_in is not None
    login = (
        _wall_to_utc(day.date, day.check_in, timezone_name) if day.check_in else None
    )
    logout = (
        _wall_to_utc(day.date, day.check_out, timezone_name) if day.check_out else None
    )

    work_seconds = float(day.work_minutes * 60)
    break_seconds = float(day.break_minutes * 60)

    if logout is not None:
        status = AttendanceStatus.CHECKED_OUT
    elif day.date == today:
        status = AttendanceStatus.WORKING  # in progress today, no checkout yet
    elif has_check_in:
        status = AttendanceStatus.CHECKED_OUT
    else:
        status = AttendanceStatus.OFFLINE

    # Late/early/overtime flags recomputed through SynTask policy rules (not
    # copied from the vendor) so app and biometric rows compare fairly.
    flags = _late_early_flags(timezone_name, policy, login, logout)
    overtime_minutes = compute_overtime(policy, day.work_minutes) if policy is not None else 0.0

    return {
        "date": day.date.isoformat(),
        "login_time": login,
        "logout_time": logout,
        "total_working_hours": work_seconds,
        "break_duration": break_seconds,
        "status": status,
        "is_late": flags["is_late"],
        "late_minutes": flags["late_minutes"],
        "is_early_departure": flags["is_early_departure"],
        "early_departure_minutes": flags["early_departure_minutes"],
        "overtime_minutes": overtime_minutes,
        "overtime_seconds": overtime_minutes * 60.0,
        "work_type": "Completed" if logout is not None else None,
        "source": "etimeoffice",
        "external_employee_code": day.external_employee_code,
    }


def _existing_matches_payload(attendance: Attendance, fields: dict) -> bool:
    """True when the persisted record already equals the payload (no write)."""
    def same_time(a, b) -> bool:
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        return abs((a - b).total_seconds()) < 1

    return (
        attendance.date == fields["date"]
        and same_time(attendance.login_time, fields["login_time"])
        and same_time(attendance.logout_time, fields["logout_time"])
        and float(attendance.total_working_hours or 0) == fields["total_working_hours"]
        and float(attendance.break_duration or 0) == fields["break_duration"]
        and attendance.status == fields["status"]
        and attendance.source == fields["source"]
        and (attendance.external_employee_code or None) == fields["external_employee_code"]
    )


async def _upsert_external_day(
    company_id: str,
    employee_id: str,
    fields: dict,
) -> str:
    """Insert/update one biometric attendance day.

    Returns "updated" | "duplicate" | "skipped_app".
    """
    existing = await Attendance.find_one(
        Attendance.company_id == company_id,
        Attendance.employee_id == employee_id,
        Attendance.date == fields["date"],
    )

    now = utc_now()
    if existing is None:
        await Attendance(
            employee_id=employee_id,
            company_id=company_id,
            **fields,
            created_at=now,
            updated_at=now,
        ).insert()
        return "updated"

    if existing.source == "etimeoffice":
        if _existing_matches_payload(existing, fields):
            return "duplicate"
        fields["updated_at"] = now
        for key, value in fields.items():
            setattr(existing, key, value)
        await existing.save()
        return "updated"

    # Record was created by the SynTask app (manual check-in/check-out).
    # Never overwrite or delete manual attendance from a provider run.
    return "skipped_app"


# ---------------------------------------------------------------------------
# Sync orchestration
# ---------------------------------------------------------------------------


def _state_collection():
    """Return the underlying (motor) collection for atomic guard updates."""
    return ETimeOfficeSyncState.get_pymongo_collection()


async def _mark_syncing(company_id: str) -> None:
    """Atomically claim the in-flight guard; raise when another sync runs."""
    collection = _state_collection()
    now = utc_now()
    # Ensure the state document exists first (unique index makes the upsert
    # idempotent), then claim it with an atomic compare-and-set on ``syncing``.
    try:
        await collection.update_one(
            {"company_id": company_id, "provider": PROVIDER_ETIMEOFFICE},
            {
                "$setOnInsert": {
                    "connected": False,
                    "syncing": False,
                    "last_summary": {},
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
        )
    except DuplicateKeyError:
        pass  # another writer created it concurrently
    claimed = await collection.find_one_and_update(
        {"company_id": company_id, "provider": PROVIDER_ETIMEOFFICE, "syncing": False},
        {"$set": {"syncing": True, "sync_started_at": now, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if claimed is None:
        raise ETimeOfficeSyncInProgress(
            "An eTimeOffice sync is already running for this company"
        )


async def _finish_syncing(
    company_id: str,
    *,
    connected: bool,
    summary: dict,
    error: Optional[str] = None,
) -> None:
    collection = _state_collection()
    now = utc_now()
    set_fields: dict = {
        "connected": connected,
        "last_attempted_at": now,
        "last_error": error,
        "last_summary": summary,
        "syncing": False,
        "sync_started_at": None,
        "updated_at": now,
    }
    if connected:
        set_fields["last_successful_at"] = now
    await collection.update_one(
        {"company_id": company_id, "provider": PROVIDER_ETIMEOFFICE},
        {"$set": set_fields},
        upsert=True,
    )


def _default_summary() -> dict:
    return {
        "success": False,
        "employees_received": 0,
        "mapped": 0,
        "unmapped": 0,
        "attendance_updated": 0,
        "duplicates_skipped": 0,
        "skipped_app_attendance": 0,
        "errors": [],
        "last_sync": None,
    }


async def sync_etimeoffice_for_company(
    company_id: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> dict:
    """Run one read-only eTimeOffice sync for a single SynTask company.

    Returns a safe summary (never credentials, cookies, or full employee PII).
    """
    # Prometheus metrics (lazy import to avoid circular dep at module load)
    try:
        from app.metrics.etimeoffice import (
            record_sync_start,
            record_sync_success,
            record_sync_error,
        )
        _sync_start = record_sync_start()
    except Exception:
        _sync_start = None  # metrics unavailable – continue without them

    if not settings.etimeoffice_configured:
        raise ETimeOfficeNotConfigured(
            "eTimeOffice integration is not configured or is disabled"
        )

    timezone_name = _resolve_sync_timezone()
    to_date = to_date or _today_in_tz(timezone_name)
    lookback = getattr(settings, "ETIMEOFFICE_SYNC_LOOKBACK_DAYS", 7)
    from_date = from_date or (to_date - timedelta(days=max(1, lookback) - 1))

    # Claim the in-flight guard (also covers the automatic loop overlap).
    await _mark_syncing(company_id)
    summary = _default_summary()

    client: Optional[ETimeOfficeClient] = None
    try:
        policy = await get_active_policy(company_id)

        client = ETimeOfficeClient()
        days = await client.fetch_in_out_days(from_date, to_date, emp_code="ALL")

        # 1. Persist the provider directory (code + name metadata) so the
        #    mapping UI always reflects the current eTimeOffice roster.
        entries: Dict[str, str] = {}
        for day in days:
            code = str(day.external_employee_code).strip()
            if code:
                entries.setdefault(code, (day.external_employee_name or "").strip())
        await persist_etimeoffice_directory(company_id, entries)

        # 2. Resolve attendance through the EXPLICIT mapping table only.
        confirmed = await load_etimeoffice_employee_mappings(company_id)

        received_codes = sorted(entries.keys())
        summary["employees_received"] = len(received_codes)

        mapped_users: Dict[str, str] = {
            code: user_id
            for code in received_codes
            if (user_id := confirmed.get(code)) is not None
        }
        summary["mapped"] = len(mapped_users)
        summary["unmapped"] = summary["employees_received"] - summary["mapped"]

        present_days = [
            day
            for day in days
            if day.check_in is not None and day.external_employee_code in mapped_users
        ]

        updated = 0
        duplicates = 0
        skipped_app = 0
        for day in present_days:
            employee_id = mapped_users[day.external_employee_code]
            try:
                fields = _day_to_attendance_fields(day, timezone_name, policy)
                result = await _upsert_external_day(company_id, employee_id, fields)
            except Exception as exc:  # one bad day never fails the whole sync
                logger.exception(
                    "eTimeOffice sync failed for company=%s employee=%s day=%s",
                    company_id,
                    _mask_code(day.external_employee_code),
                    day.date.isoformat(),
                )
                summary["errors"].append(
                    f"{_mask_code(day.external_employee_code)} {day.date.isoformat()}: "
                    f"{exc.__class__.__name__}"
                )
                continue
            if result == "updated":
                updated += 1
            elif result == "duplicate":
                duplicates += 1
            else:
                skipped_app += 1

        summary["attendance_updated"] = updated
        summary["duplicates_skipped"] = duplicates
        summary["skipped_app_attendance"] = skipped_app
        summary["last_sync"] = utc_now().isoformat() + "Z"
        summary["success"] = True

        await _finish_syncing(
            company_id,
            connected=True,
            summary=summary,
            error=None,
        )
        if _sync_start is not None:
            try:
                record_sync_success(_sync_start)
            except Exception:
                pass
        return summary
    except ETimeOfficeSyncInProgress:
        raise
    except Exception as exc:
        summary["last_sync"] = utc_now().isoformat() + "Z"
        summary["errors"].append(f"{exc.__class__.__name__}: {str(exc)[:200]}")
        await _finish_syncing(
            company_id,
            connected=False,
            summary=summary,
            error=f"{exc.__class__.__name__}: {str(exc)[:200]}",
        )
        if _sync_start is not None:
            try:
                record_sync_error(_sync_start)
            except Exception:
                pass
        raise
    finally:
        if client is not None:
            await client.aclose()


async def get_etimeoffice_status(company_id: str) -> dict:
    """Company-scoped integration status for the Attendance status UI."""
    state = await ETimeOfficeSyncState.find_one(
        {"company_id": company_id, "provider": PROVIDER_ETIMEOFFICE}
    )
    return {
        "provider": PROVIDER_ETIMEOFFICE,
        "enabled": settings.ETIMEOFFICE_ENABLED,
        "configured": settings.etimeoffice_configured,
        "connected": bool(state and state.connected),
        "syncing": bool(state and state.syncing),
        "last_attempted_at": state.last_attempted_at.isoformat() + "Z"
        if state and state.last_attempted_at
        else None,
        "last_successful_at": state.last_successful_at.isoformat() + "Z"
        if state and state.last_successful_at
        else None,
        "last_error": (state.last_error if state else None),
        "last_summary": (state.last_summary if state else None),
        "sync_interval_seconds": settings.ETIMEOFFICE_SYNC_INTERVAL_SECONDS,
        "lookback_days": settings.ETIMEOFFICE_SYNC_LOOKBACK_DAYS,
    }


# ---------------------------------------------------------------------------
# Periodic automatic sync (reuses the in-process leader-gated loop pattern)
# ---------------------------------------------------------------------------


async def _companies_with_etimeoffice_mappings() -> List[str]:
    """Companies that have eTimeOffice directory/mapping rows to sync."""
    collection = ETimeOfficeEmployeeMapping.get_pymongo_collection()
    return await collection.distinct(
        "company_id", {"provider": PROVIDER_ETIMEOFFICE}
    )


async def run_etimeoffice_sync_loop() -> None:
    """Periodic background sync (default every 3 minutes), leader-gated across
    API workers so overlapping sync jobs never run."""
    from app.core.leader import try_acquire_leader

    interval = max(60, getattr(settings, "ETIMEOFFICE_SYNC_INTERVAL_SECONDS", 180))
    while True:
        if not settings.etimeoffice_configured:
            await asyncio.sleep(interval)
            continue
        if not await try_acquire_leader(
            "etimeoffice_attendance_sync", ttl_seconds=interval + 60
        ):
            await asyncio.sleep(interval)
            continue
        try:
            company_ids = await _companies_with_etimeoffice_mappings()
            for company_id in company_ids:
                try:
                    # Manual business span (Topic 9). No tenant/user identifiers
                    # are attached — trace attributes stay bounded.
                    from app.observability.tracing import trace_span

                    with trace_span(
                        "etimeoffice.attendance_sync",
                        {"syntask.integration": "etimeoffice", "syntask.operation": "attendance_sync"},
                    ):
                        await sync_etimeoffice_for_company(company_id)
                except ETimeOfficeSyncInProgress:
                    continue
                except ETimeOfficeError:
                    logger.warning(
                        "eTimeOffice auto-sync failed for company=%s", company_id,
                        exc_info=True,
                    )
                except Exception:
                    logger.exception(
                        "eTimeOffice auto-sync failed for company=%s", company_id
                    )
        except Exception:
            logger.exception("eTimeOffice auto-sync sweep failed")
        await asyncio.sleep(interval)
