"""
Restore a user's admin access safely.

Usage:
    python scripts/restore_admin_access.py --email alice@example.com
    python scripts/restore_admin_access.py --user-id 64a... --previous-role manager
    python scripts/restore_admin_access.py --email alice@example.com --dry-run
"""

import argparse
import asyncio
import os
import re
import sys
from typing import Optional

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.user import User, UserRole


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore a user's admin access safely.")
    parser.add_argument("--email", help="User email to restore admin access for.")
    parser.add_argument("--user-id", help="User ID to restore admin access for.")
    parser.add_argument(
        "--previous-role",
        help="Optional previous role to preserve when restoring admin access.",
        default=None,
    )
    parser.add_argument(
        "--dry-run",
        help="Show the intended update without saving it.",
        action="store_true",
    )
    return parser.parse_args()


def normalize_role(role_value: Optional[str]) -> UserRole:
    if isinstance(role_value, UserRole):
        return role_value
    if role_value is None:
        return UserRole.EMPLOYEE
    try:
        return UserRole.from_legacy(str(role_value))
    except Exception:
        normalized = str(role_value).strip().lower().replace(" ", "_").replace("-", "_")
        return UserRole(normalized)


async def restore_admin_access(
    email: Optional[str],
    user_id: Optional[str],
    previous_role: Optional[str],
    dry_run: bool,
) -> int:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    database = client[settings.DATABASE_NAME]

    await init_beanie(database=database, document_models=[User])

    if not email and not user_id:
        print("ERROR: Provide either --email or --user-id.")
        return 1

    if email:
        query = {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
        user = await User.find_one(query)
    else:
        user = await User.get(user_id)

    if not user:
        target = email or user_id
        print(f"User not found: {target}")
        return 1

    current_role = normalize_role(getattr(user, "role", None))
    if current_role == UserRole.ADMIN:
        print(f"User is already admin: {user.email} ({user.id})")
        client.close()
        return 0

    resolved_previous_role = None
    if previous_role:
        resolved_previous_role = normalize_role(previous_role)
    else:
        resolved_previous_role = current_role

    print("Restoring admin access for user:")
    print(f"  id: {user.id}")
    print(f"  email: {user.email}")
    print(f"  current role: {current_role.value}")
    print(f"  previous_role to save: {resolved_previous_role.value}")
    print("  new role: admin")
    print(f"  dry run: {dry_run}")

    if dry_run:
        client.close()
        return 0

    user.previous_role = resolved_previous_role
    user.role = UserRole.ADMIN
    user.updated_at = getattr(user, "updated_at", None)
    await user.save()

    print("Admin access restored successfully.")
    client.close()
    return 0


if __name__ == "__main__":
    args = parse_args()
    exit_code = asyncio.run(
        restore_admin_access(
            email=args.email,
            user_id=args.user_id,
            previous_role=args.previous_role,
            dry_run=args.dry_run,
        )
    )
    raise SystemExit(exit_code)
