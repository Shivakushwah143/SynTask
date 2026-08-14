"""
Phase 4 — Attendance HR/Payroll Readiness Migration.

Creates default attendance policies for existing companies.
Idempotent: safe to run multiple times.

Usage:
    python -m scripts.migrate_attendance_phase4
"""
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def migrate():
    from app.core.database import init_db
    await init_db()

    from app.models.company import Company
    from app.models.attendance import AttendancePolicy

    companies = await Company.find_all().to_list()
    logger.info("Found %d companies to process", len(companies))

    created = 0
    skipped = 0

    for company in companies:
        company_id = str(company.id)

        # Check if company already has an active policy
        existing = await AttendancePolicy.find_one(
            {"company_id": company_id, "active": True}
        )
        if existing:
            skipped += 1
            continue

        # Create default policy
        policy = AttendancePolicy(
            company_id=company_id,
            name="Default Policy",
            timezone="UTC",
            expected_start_time="09:00",
            expected_end_time="18:00",
            expected_work_minutes=480.0,
            late_grace_minutes=0.0,
            early_departure_grace_minutes=0.0,
            minimum_half_day_minutes=240.0,
            minimum_full_day_minutes=360.0,
            overtime_enabled=False,
            overtime_after_minutes=480.0,
            work_week=["Mon", "Tue", "Wed", "Thu", "Fri"],
            active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        await policy.insert()
        created += 1
        logger.info("Created default attendance policy for company %s", company_id)

    logger.info(
        "Migration complete: %d policies created, %d companies already had policies",
        created, skipped,
    )

    # Register new models (Beanie handles this via init_db)
    logger.info("New models registered: AttendancePolicy, Holiday, AttendanceCorrectionRequest")
    logger.info("Migration finished successfully.")


if __name__ == "__main__":
    try:
        asyncio.run(migrate())
    except KeyboardInterrupt:
        logger.info("Migration cancelled")
        sys.exit(1)
    except Exception as e:
        logger.error("Migration failed: %s", e)
        sys.exit(1)
