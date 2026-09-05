"""
Phase 9 — Employee Lifecycle backfill migration.

Creates one baseline ``EMPLOYMENT_BASELINE`` lifecycle event per existing
employee that has no lifecycle history yet (idempotent — rerunning never
duplicates events).

Honest history: the baseline records the employee's current known employment
state imported from ``EmployeeProfile``. It never fabricates detailed
promotion/transfer history the database does not contain.

Run from ``backend/``:

    python -m scripts.migrate_lifecycle --company <company_id>
    python -m scripts.migrate_lifecycle --all
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Allow running as a script from the backend/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import init_db  # noqa: E402
from app.models.employee_profile import EmployeeProfile  # noqa: E402
from app.models.lifecycle import EmployeeLifecycleEvent  # noqa: E402
from app.services.lifecycle_service import backfill_company_lifecycle  # noqa: E402


async def _run(company_id: Optional[str]) -> None:
    await init_db()
    if company_id:
        result = await backfill_company_lifecycle(company_id)
    else:
        companies = await EmployeeProfile.find({}).distinct("company_id")
        results = []
        for company in companies:
            results.append(await backfill_company_lifecycle(company))
        result = {
            "companies": len(companies),
            "companies_processed": results,
        }
    print("Lifecycle backfill result:")
    print(result)


async def _dry_run(company_id: Optional[str]) -> None:
    await init_db()
    if company_id:
        profiles = await EmployeeProfile.find({"company_id": company_id}).to_list()
    else:
        profiles = await EmployeeProfile.find({}).to_list()
    total = 0
    missing = 0
    for profile in profiles:
        total += 1
        existing = await EmployeeLifecycleEvent.find_one(
            {"company_id": profile.company_id, "employee_id": str(profile.id)}
        )
        if not existing:
            missing += 1
    print(f"Employees: {total} | Missing lifecycle baseline: {missing}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 9 lifecycle backfill")
    parser.add_argument("--company", type=str, default=None, help="Company id to backfill (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Only report how many baselines are missing")
    args = parser.parse_args()
    if args.dry_run:
        asyncio.run(_dry_run(args.company))
    else:
        asyncio.run(_run(args.company))


if __name__ == "__main__":
    main()
