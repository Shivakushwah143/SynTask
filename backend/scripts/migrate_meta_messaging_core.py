"""Create Meta messaging core collections and indexes.

Run:
    python scripts/migrate_meta_messaging_core.py --dry-run
    python scripts/migrate_meta_messaging_core.py
"""

import argparse
import asyncio
import os
import sys
from typing import Iterable, Type

from beanie import Document
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.integrations.meta.messaging_models import (
    MetaChannelConnection,
    MetaConversation,
    MetaMessage,
)


META_MESSAGING_DOCUMENTS: tuple[Type[Document], ...] = (
    MetaChannelConnection,
    MetaConversation,
    MetaMessage,
)


def describe_plan(
    documents: Iterable[Type[Document]] = META_MESSAGING_DOCUMENTS,
) -> list[str]:
    return [
        f"{document.Settings.name}: {len(document.Settings.indexes)} indexes"
        for document in documents
    ]


async def apply_migration() -> None:
    from app.core.config import settings

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        database = client[settings.DATABASE_NAME]
        await client.admin.command("ping")
        for document in META_MESSAGING_DOCUMENTS:
            collection = database[document.Settings.name]
            await collection.create_indexes(document.Settings.indexes)
            print(f"Applied {document.Settings.name}")
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned collections and indexes without connecting to MongoDB.",
    )
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
