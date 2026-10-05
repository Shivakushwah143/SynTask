"""
HR Document Expiry Checks — Phase 2 HRMS.

Daily, idempotent background task that notifies company admins when HR
documents expire or are expiring soon. Reuses the existing ``Notification``
model (no second notification architecture) and deduplicates through the
``metadata.reminder_key`` partial unique index on ``notifications`` plus an
explicit pre-insert lookup, so the same document state is never notified
twice on the same day.
"""
import asyncio
import logging
from datetime import timedelta

from app.core.clock import utc_now
from app.models.hr_document import HRDocument, HRDocumentStatus
from app.models.notification import Notification, NotificationType
from app.models.user import User, UserRole
from app.services.hr_document_service import EXPIRING_SOON_DAYS, compute_expiry_state

logger = logging.getLogger(__name__)


def _reminder_key(document_id: str, state: str, expiry_iso: str) -> str:
    return f"hr-doc-expiry:{document_id}:{state}:{expiry_iso}"


async def _notify_expiry(company_id: str, document_id: str, state: str, expiry_date, employee_name: str | None) -> None:
    today = utc_now().date()
    expiry_iso = expiry_date.date().isoformat()
    reminder_key = _reminder_key(document_id, state, expiry_iso)

    admins = await User.find(
        {"company_id": company_id, "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value]}}
    ).to_list()

    if state == "expired":
        title = "HR document expired"
        message = f"An HR document expired on {expiry_iso}"
    else:
        title = "HR document expiring soon"
        message = f"An HR document expires on {expiry_iso}"

    if employee_name:
        title += f" — {employee_name}"
        message += f" for {employee_name}"

    for admin in admins:
        existing = await Notification.find_one(
            {
                "company_id": company_id,
                "user_id": str(admin.id),
                "metadata.reminder_key": reminder_key,
            }
        )
        if existing:
            continue
        try:
            await Notification(
                company_id=company_id,
                user_id=str(admin.id),
                type=NotificationType.SYSTEM,
                title=title,
                message=message,
                related_id=document_id,
                related_type="hr_document",
                metadata={"reminder_key": reminder_key, "surface": "hr_documents", "expiry_state": state},
                created_at=utc_now(),
            ).insert()
            logger.info("HR document expiry notification sent: %s (%s)", document_id, state)
        except Exception:
            logger.exception("Failed to create HR document expiry notification")


async def check_hr_document_expirations() -> int:
    """Scan active documents with expiry dates in range and notify admins.

    Returns the number of documents processed. Safe when owners have been
    deleted — document metadata itself is enough to build the notification.
    """
    today = utc_now().date()
    boundary = today + timedelta(days=EXPIRING_SOON_DAYS + 1)
    query = {
        "status": HRDocumentStatus.ACTIVE.value,
        "expiry_date": {"$ne": None, "$lte": boundary.replace(hour=23, minute=59, second=59)},
    }
    documents = await HRDocument.find(query).to_list()
    if not documents:
        return 0

    # Batch resolve employee owner names (EmployeeProfile → User).
    from bson import ObjectId

    from app.models.employee_profile import EmployeeProfile

    employee_ids = {doc.employee_id for doc in documents if doc.employee_id}
    name_by_employee: dict[str, str] = {}
    profile_ids = [ObjectId(eid) for eid in employee_ids if ObjectId.is_valid(eid)]
    if profile_ids:
        profiles = await EmployeeProfile.find({"company_id": {"$in": [doc.company_id for doc in documents]}, "_id": {"$in": profile_ids}}).to_list()
        user_ids = {profile.user_id for profile in profiles}
        users = await User.find({"_id": {"$in": [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]}}).to_list()
        users_by_id = {str(u.id): u for u in users}
        name_by_employee = {
            str(profile.id): users_by_id[profile.user_id].full_name()
            for profile in profiles
            if profile.user_id in users_by_id
        }

    processed = 0
    for document in documents:
        state = compute_expiry_state(document.expiry_date, today=today)
        if state not in ("expired", "expiring_soon"):
            continue
        employee_name = name_by_employee.get(document.employee_id or "")
        await _notify_expiry(
            document.company_id,
            str(document.id),
            state,
            document.expiry_date,
            employee_name,
        )
        processed += 1
    return processed


async def run_hr_document_expiry_loop() -> None:
    """Periodic background loop (daily), leader-gated across API workers."""
    from app.core.leader import try_acquire_leader
    while True:
        if not await try_acquire_leader("hr_document_expiry", ttl_seconds=60 * 60):
            await asyncio.sleep(60 * 60)
            continue
        try:
            processed = await check_hr_document_expirations()
            if processed:
                logger.info("HR document expiry check processed %d documents", processed)
            # Daily check.
            await asyncio.sleep(24 * 60 * 60)
        except Exception as exc:
            logger.error("HR document expiry check failed: %s", exc)
            await asyncio.sleep(60 * 60)
