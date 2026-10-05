"""
Idempotent seed of default HR Document Types for every company.

Usage (from backend/):

    python -m scripts.seed_hr_document_types

Safe to run repeatedly — existing codes are never duplicated or overwritten.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import init_db, close_db
from app.models.company import Company
from app.services.hr_document_service import ensure_default_document_types


async def main() -> None:
    await init_db()
    companies = await Company.find_all().to_list()
    total_created = 0
    for company in companies:
        created = await ensure_default_document_types(str(company.id))
        if created:
            print(f"Seeded {created} default document types for {company.name} ({company.id})")
        total_created += created
    print(f"Done. {total_created} document types created across {len(companies)} companies.")
    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
