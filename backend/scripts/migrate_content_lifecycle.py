"""
Migration script: Map legacy ContentCalendarItem statuses to new canonical lifecycle.

This script:
1. Maps legacy statuses (draft, planned, shoot_scheduled, shot, editing, scheduled) 
   to new canonical statuses (idea, briefing, script, production, ready_to_publish)
2. Generates content_id (CNT-XXX) for all existing items
3. Creates initial version records for existing items
4. Adds history entries for the migration

Run with: python -m scripts.migrate_content_lifecycle

This is a SAFE, non-destructive migration — it does NOT delete any data.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Status mapping: legacy → canonical
LEGACY_STATUS_MAP = {
    "draft": "idea",
    "planned": "briefing",
    "shoot_scheduled": "production",
    "shot": "production",
    "editing": "production",
    "scheduled": "ready_to_publish",
    # These already match canonical:
    "internal_review": "internal_review",
    "client_review": "client_review",
    "approved": "approved",
    "published": "published",
    # New canonical (already correct):
    "idea": "idea",
    "briefing": "briefing",
    "script": "script",
    "production": "production",
    "revision_required": "revision_required",
    "ready_to_publish": "ready_to_publish",
}


async def migrate():
    """Run the migration."""
    from app.core.database import init_db, close_db, get_database
    from app.models.content_calendar import ContentCalendarItem, ContentHistoryEntry

    await init_db()
    db = get_database()
    collection = db["content_calendar_items"]

    # 1. Count items needing migration
    all_items = await ContentCalendarItem.find_all().to_list()
    needs_migration = 0
    needs_content_id = 0
    needs_version = 0

    for item in all_items:
        status_val = item.status.value if item.status else "draft"
        if status_val in LEGACY_STATUS_MAP and LEGACY_STATUS_MAP[status_val] != status_val:
            needs_migration += 1
        if not item.content_id:
            needs_content_id += 1
        if not item.versions:
            needs_version += 1

    logger.info(f"Found {len(all_items)} total items")
    logger.info(f"  - {needs_migration} need status migration")
    logger.info(f"  - {needs_content_id} need content_id generation")
    logger.info(f"  - {needs_version} need initial version creation")

    if needs_migration == 0 and needs_content_id == 0 and needs_version == 0:
        logger.info("No migration needed!")
        await close_db()
        return

    # 2. Generate content_ids per company
    company_counts: dict[str, int] = {}
    for item in all_items:
        cid = item.company_id
        if cid not in company_counts:
            # Count existing content_ids for this company
            existing = await ContentCalendarItem.find(
                ContentCalendarItem.company_id == cid,
                ContentCalendarItem.content_id != None,
            ).to_list()
            company_counts[cid] = len(existing)

    # 3. Apply migrations
    migrated = 0
    for item in all_items:
        changed = False

        # Status migration
        status_val = item.status.value if item.status else "draft"
        if status_val in LEGACY_STATUS_MAP:
            new_status_str = LEGACY_STATUS_MAP[status_val]
            if new_status_str != status_val:
                from app.models.content_calendar import ContentItemStatus
                try:
                    item.status = ContentItemStatus(new_status_str)
                    changed = True
                except ValueError:
                    pass

        # Content ID generation
        if not item.content_id:
            cid = item.company_id
            company_counts[cid] = company_counts.get(cid, 0) + 1
            item.content_id = f"CNT-{company_counts[cid]:03d}"
            changed = True

        # Initial version creation
        if not item.versions:
            from app.models.content_calendar import ContentVersion
            item.versions = [ContentVersion(
                version_number=1,
                caption=item.caption,
                script=item.script,
                creative_brief=item.creative_brief,
                files=list(item.file_ids or []),
                file_urls=list(item.file_urls or []),
                created_by=item.created_by,
                created_at=item.created_at or datetime.utcnow(),
            )]
            item.current_version = 1
            changed = True

        # Add migration history entry
        if changed:
            item.history.append(ContentHistoryEntry(
                action="migrated_to_canonical_lifecycle",
                from_status=status_val,
                to_status=item.status.value,
                details="Automated migration: legacy status mapped to canonical lifecycle",
                created_at=datetime.utcnow(),
            ))
            item.updated_at = datetime.utcnow()
            await item.save()
            migrated += 1
            if migrated % 50 == 0:
                logger.info(f"  Migrated {migrated} items...")

    logger.info(f"Migration complete: {migrated} items updated")
    await close_db()


if __name__ == "__main__":
    asyncio.run(migrate())
