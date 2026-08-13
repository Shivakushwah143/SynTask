"""
Phase 1 HRMS — Employee Profile backfill migration.

Creates an EmployeeProfile for every applicable existing company User so the
new People → Employees surface is populated without manual re-entry.

Rules:
- Idempotent — safe to run twice; existing profiles are skipped.
- Company scoped — each profile carries its user's company_id.
- No duplicate profiles / users — the (company_id, user_id) unique index plus
  an existence check prevent duplicates.
- Platform Super Admins are skipped (no company / platform-level identity).
- Preserves current data — department_id, designation, reports_to, phone are
  mapped from the User where available.
- Assigns/generates a company-scoped employee number safely.

Run:  python -m scripts.migrate_employee_profiles
"""
import asyncio

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.clock import utc_now
from app.models.department import Department
from app.models.employee_profile import EmployeeProfile, EmploymentStatus
from app.models.user import User, UserRole
from app.services.employee_profile_service import generate_employee_number


async def main() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(
        database=db,
        document_models=[User, Department, EmployeeProfile],
    )

    users = await User.find(
        {"company_id": {"$ne": None, "$exists": True}, "role": {"$ne": UserRole.SUPER_ADMIN.value}}
    ).to_list()

    created = 0
    skipped = 0
    errors = []

    for user in users:
        try:
            if not user.company_id or user.role == UserRole.SUPER_ADMIN:
                skipped += 1
                continue
            existing = await EmployeeProfile.find_one(
                {"company_id": user.company_id, "user_id": str(user.id)}
            )
            if existing:
                skipped += 1
                continue
            profile = EmployeeProfile(
                company_id=user.company_id,
                user_id=str(user.id),
                employee_number=await generate_employee_number(user.company_id),
                department_id=getattr(user, "department_id", None) or None,
                designation=getattr(user, "designation", None) or None,
                reports_to=getattr(user, "reports_to", None) or None,
                joining_date=getattr(user, "created_at", None),
                employment_status=EmploymentStatus.ONBOARDING,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            await profile.insert()
            created += 1
        except Exception as exc:  # noqa: BLE001 - migration must report + continue
            errors.append(f"{user.email}: {exc}")

    print(f"Employee profile backfill complete: {created} created, {skipped} skipped, {len(errors)} errors")
    for error in errors:
        print(f"  - {error}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
