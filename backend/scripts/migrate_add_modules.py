"""
Add modules and active_module to all users.
Defaults: modules=["task"], active_module="task".
Run with: `python migrate_add_modules.py`
"""
import asyncio

from app.core.database import get_db_client
from app.models.user import User


async def migrate():
    await get_db_client()
    users = await User.find({}).to_list()
    updated = 0
    for user in users:
        changed = False
        if not getattr(user, "modules", None):
            user.modules = ["task"]
            changed = True
        if not getattr(user, "active_module", None):
            user.active_module = "task"
            changed = True
        if changed:
            await user.save()
            updated += 1
    print(f"Updated {updated} users")


if __name__ == "__main__":
    asyncio.run(migrate())

