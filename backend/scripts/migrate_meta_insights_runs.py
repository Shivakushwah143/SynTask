"""Add Phase 4 insights-run safety indexes without modifying stored documents.

Run:
    python scripts/migrate_meta_insights_runs.py --dry-run
    python scripts/migrate_meta_insights_runs.py
"""

import argparse
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.integrations.meta.models import MetaSyncRun


def describe_plan() -> list[str]:
    return [
        "meta_sync_runs: add partial unique active_key index",
        "meta_sync_runs: add pending insights dispatch index",
    ]


async def apply_migration() -> None:
    from app.core.config import settings

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        await client.admin.command("ping")
        collection = client[settings.DATABASE_NAME][MetaSyncRun.Settings.name]
        indexes = MetaSyncRun.Settings.indexes[-2:]
        await collection.create_indexes(indexes)
        print("Applied meta_sync_runs insights safety indexes")
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
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
