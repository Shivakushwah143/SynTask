"""Backfill Sales-to-Clients handoff fields and indexes.

Run:
    python scripts/migrate_sales_client_handoff.py --dry-run
    python scripts/migrate_sales_client_handoff.py
"""

import argparse
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, IndexModel

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.client import Client
from app.models.sales_prospect import SalesProspect


def describe_plan() -> list[str]:
    return [
        "clients: set origin_type='legacy' where origin_type is missing",
        "sales_prospects: set converted_at from closed_date/updated_at for won leads with converted_client_id",
        "clients: non-unique index on source_lead_id",
        "clients: unique partial index on (company_id, source_lead_id) where source_lead_id is a string",
        "sales_prospects: index on converted_client_id",
    ]


async def apply_migration(dry_run: bool) -> None:
    from app.core.config import settings

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        database = client[settings.DATABASE_NAME]
        await client.admin.command("ping")

        clients = database[Client.Settings.name]
        prospects = database[SalesProspect.Settings.name]

        duplicates = await clients.aggregate(
            [
                {"$match": {"source_lead_id": {"$type": "string"}}},
                {
                    "$group": {
                        "_id": {"company_id": "$company_id", "source_lead_id": "$source_lead_id"},
                        "count": {"$sum": 1},
                        "ids": {"$push": "$_id"},
                    }
                },
                {"$match": {"count": {"$gt": 1}}},
            ]
        ).to_list(length=None)
        if duplicates:
            print("Duplicate client source_lead_id values found; resolve before creating unique index:")
            for item in duplicates:
                print(f"  {item['_id']}: {item['ids']}")
            raise SystemExit(1)

        if dry_run:
            print("Dry run complete; database unchanged.")
            return

        legacy_result = await clients.update_many(
            {"origin_type": {"$exists": False}},
            {"$set": {"origin_type": "legacy"}},
        )
        prospect_result = await prospects.update_many(
            {
                "converted_client_id": {"$type": "string"},
                "converted_at": {"$exists": False},
            },
            [{"$set": {"converted_at": {"$ifNull": ["$closed_date", "$updated_at"]}}}],
        )
        await clients.create_indexes(
            [
                IndexModel([("source_lead_id", ASCENDING)]),
                IndexModel(
                    [("company_id", ASCENDING), ("source_lead_id", ASCENDING)],
                    unique=True,
                    partialFilterExpression={"source_lead_id": {"$type": "string"}},
                ),
            ]
        )
        await prospects.create_indexes([IndexModel([("converted_client_id", ASCENDING)])])

        print(f"Updated legacy clients: {legacy_result.modified_count}")
        print(f"Updated converted leads: {prospect_result.modified_count}")
        print("Applied Sales-to-Clients handoff indexes")
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print the planned changes and check duplicates.")
    args = parser.parse_args()
    for line in describe_plan():
        print(line)
    asyncio.run(apply_migration(args.dry_run))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
