"""
Phase 7 — Payslip PDF migration.

Ensures the ``payslips`` collection and its company-scoped indexes exist.
There is no legacy payslip data to backfill — payslips are generated from
PROCESSED payroll records, so running this script is only required to
initialize the collection on deployments where Beanie model registration alone
is not enough (it is safe to run multiple times).

Usage:
    python -m scripts.migrate_payslips
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

    from app.models.payslip import Payslip

    # Beanie registers the model + indexes during init_db; this explicit call
    # guarantees the index creation even if init_db was skipped in some flow.
    await Payslip.init_collection()
    logger.info("Payslip model registered: collection=%s", Payslip.Settings.name)

    indexes = await Payslip.collection.index_information()
    expected = {
        "payslips_company_record_version_uniq",
    }
    for name in expected:
        if name in indexes:
            logger.info("Index %s present", name)
        else:
            logger.warning("Index %s missing — will be created by Beanie on next startup", name)
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
