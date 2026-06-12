"""
One-time migration: populate ancestors field for existing users.

Run from backend:
    .\.venv\Scripts\python.exe scripts\migrate_add_ancestors.py
"""
import asyncio
import os
import sys
from typing import Dict, List

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.user import User


async def compute_ancestors(user: User, users_by_id: Dict[str, User], seen: set[str] | None = None) -> List[str]:
    seen = seen or set()
    user_id = str(user.id)
    if user_id in seen or not user.reports_to:
        return []

    seen.add(user_id)
    parent = users_by_id.get(user.reports_to)
    if not parent:
        return []

    return [*await compute_ancestors(parent, users_by_id, seen), user.reports_to]


async def migrate() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(database=db, document_models=[User])

    users = await User.find_all().to_list()
    users_by_id = {str(user.id): user for user in users}
    updated = 0

    for user in users:
        ancestors = await compute_ancestors(user, users_by_id)
        if getattr(user, "ancestors", []) != ancestors:
            user.ancestors = ancestors
            await user.save()
            updated += 1

    print(f"Updated ancestors for {updated} users out of {len(users)}")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
