"""Create the tenant-scoped Meta Lead Ads idempotency index.

Run:
    python scripts/migrate_meta_lead_fields.py --dry-run
    python scripts/migrate_meta_lead_fields.py
"""

import argparse
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, IndexModel

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.sales_prospect import SalesProspect


def describe_plan() -> list[str]:
    return ["sales_prospects: unique (company_id, meta_lead_id) where meta_lead_id is a string"]


async def apply_migration() -> None:
    from app.core.config import settings

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        database = client[settings.DATABASE_NAME]
        await client.admin.command("ping")
        await database[SalesProspect.Settings.name].create_indexes([
            IndexModel(
                [("company_id", ASCENDING), ("meta_lead_id", ASCENDING)],
                unique=True,
                partialFilterExpression={"meta_lead_id": {"$type": "string"}},
            )
        ])
        print("Applied sales_prospects Meta Lead Ads index")
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print the planned index without connecting to MongoDB.")
    args = parser.parse_args()
    for line in describe_plan():
        print(line)
    if args.dry_run:
        print("Dry run complete; database unchanged.")
        return 0
    asyncio.run(apply_migration())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
