"""
Phase 5 — Salary Component Migration.

Idempotently seeds default salary components for every existing company.

Usage:
    python -m scripts.migrate_salary_components
"""
from __future__ import annotations

import asyncio
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def migrate():
    from app.core.database import init_db
    await init_db()

    from app.models.company import Company
    from app.services.salary_component_service import ensure_default_components

    companies = await Company.find_all().to_list()
    logger.info("Found %d companies to process", len(companies))

    total_created = 0
    for company in companies:
        company_id = str(company.id)
        created = await ensure_default_components(company_id)
        if created:
            total_created += len(created)
            logger.info("Seeded %d default components for company %s", len(created), company_id)

    logger.info("Migration complete: %d total components created across %d companies", total_created, len(companies))


if __name__ == "__main__":
    try:
        asyncio.run(migrate())
    except KeyboardInterrupt:
        logger.info("Migration cancelled")
        sys.exit(1)
    except Exception as e:
        logger.error("Migration failed: %s", e)
        sys.exit(1)
