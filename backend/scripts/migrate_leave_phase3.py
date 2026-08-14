"""
Phase 3 HRMS — Leave Management upgrade migration.

Idempotent migration that:

1. Seeds the default configurable Leave Types (LeaveTypeConfig) for every
   existing company (company-scoped, no duplicates on rerun).
2. Maps legacy LeaveRequest enum values to the new normalized model:

       SICK_LEAVE     -> leave_type_id = <sick_leave type>, duration = full_day
       CASUAL_LEAVE   -> leave_type_id = <casual_leave type>, duration = full_day
       EMERGENCY_LEAVE-> leave_type_id = <emergency_leave type>, duration = full_day
       FULL_DAY       -> duration = full_day        (category unknown -> legacy label)
       HALF_DAY       -> duration = half_day        (category unknown -> legacy label)
       WORK_FROM_HOME -> unchanged (attendance/work mode, not a paid leave)

   Legacy requests keep all existing data (status, approval history,
   attachments, approval metadata). Requests whose category cannot be mapped
   keep ``leave_type_id = None`` and render with an intelligible legacy label —
   historical data is never corrupted or deleted.

Leave balances (LeaveBalance) are intentionally NOT bulk-created here: they
initialize lazily on first access with the configured default allocation, which
keeps the migration safe and avoids creating rows for inactive types.

Run:  python -m scripts.migrate_leave_phase3
"""
import asyncio

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models.company import Company
from app.models.leave import LeaveDuration, LeaveRequest, LeaveType, LeaveTypeConfig
from app.services.leave_service import DEFAULT_LEAVE_TYPES, ensure_default_leave_types


async def main() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(
        database=db,
        document_models=[Company, LeaveTypeConfig, LeaveRequest],
    )

    # 1) Seed default leave types per company.
    companies = await Company.find({}).to_list()
    seeded = 0
    for company in companies:
        created = await ensure_default_leave_types(str(company.id))
        seeded += len(created)
    print(f"Leave types seeded: {seeded} created across {len(companies)} companies")

    # 2) Map legacy leave request values.
    legacy_requests = await LeaveRequest.find(
        {"leave_type": {"$in": [t.value for t in LeaveType]}}
    ).to_list()

    mapped = 0
    unchanged = 0
    errors = []
    for request in legacy_requests:
        try:
            legacy_value = request.leave_type.value
            if legacy_value == LeaveType.WORK_FROM_HOME.value:
                # Attendance/work mode — keep as-is, no paid-leave classification.
                unchanged += 1
                continue
            if request.leave_type_id:
                # Already migrated on an earlier run.
                unchanged += 1
                continue

            code = None
            if legacy_value in (LeaveType.SICK_LEAVE.value, LeaveType.CASUAL_LEAVE.value, LeaveType.EMERGENCY_LEAVE.value):
                code = {
                    LeaveType.SICK_LEAVE.value: "sick_leave",
                    LeaveType.CASUAL_LEAVE.value: "casual_leave",
                    LeaveType.EMERGENCY_LEAVE.value: "emergency_leave",
                }[legacy_value]

            type_config = None
            if code and request.company_id:
                type_config = await LeaveTypeConfig.find_one(
                    {"company_id": request.company_id, "code": code}
                )

            updates = {"duration": LeaveDuration.FULL_DAY}
            if legacy_value == LeaveType.HALF_DAY.value:
                updates["duration"] = LeaveDuration.HALF_DAY
            if type_config:
                updates["leave_type_id"] = str(type_config.id)
                # Normalized requests use configurable types; the legacy enum
                # value is kept for history only.
            await request.set(updates)
            mapped += 1
        except Exception as exc:  # noqa: BLE001 - migration must report + continue
            errors.append(f"{getattr(request, 'id', '?')}: {exc}")

    print(
        f"Leave requests mapped: {mapped} mapped, {unchanged} unchanged, {len(errors)} errors"
    )
    for error in errors:
        print(f"  - {error}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
