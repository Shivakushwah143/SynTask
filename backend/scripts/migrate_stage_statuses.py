"""
One-time migration: backfill SalesProspect.current_stage_status for existing leads.

The stage inner-status snapshot is derived from each lead's current stage and its
per-stage domain field (qualify_status, discovery_outcome, proposal_status,
negotiation_status, agreement_status, won_status), falling back to the documented
stage default. Discovery stays unset until an outcome is recorded.

Run from backend:
    .\\.venv\\Scripts\\python.exe scripts\\migrate_stage_statuses.py

Safety rules:
- Only sets the snapshot where a reliable domain value exists, otherwise applies
  the documented default for the lead's current stage (or leaves it unset).
- Never overwrites an already-valid current_stage_status.
- Does NOT invent historical status changes (no stage_status_history entries).
"""
import asyncio
import os
import sys

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.crm.models import SalesProspect
from app.crm.pipeline import (
    STAGE_DEFAULT_STATUS,
    STAGE_STATUS_DOMAIN_FIELD,
    resolved_stage_status,
    stage_status_key,
)


async def migrate() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(database=db, document_models=[SalesProspect])

    prospects = await SalesProspect.find(
        {"deleted": False, "current_stage_status": None}
    ).to_list()
    updated = 0
    skipped = 0

    for prospect in prospects:
        stage_key = stage_status_key(prospect.current_stage)
        if not stage_key or stage_key == "lost":
            # Unknown or Lost stage: no inner status applies.
            skipped += 1
            continue
        domain_field = STAGE_STATUS_DOMAIN_FIELD.get(stage_key)
        domain_value = None
        if domain_field:
            raw = getattr(prospect, domain_field, None)
            domain_value = str(raw or "").strip().lower() if raw else None
        target = domain_value or STAGE_DEFAULT_STATUS.get(stage_key)
        if not target:
            # Discovery has no default until an outcome is recorded.
            skipped += 1
            continue
        # Defensive: recompute with the resolver (domain field wins over snapshot).
        resolved = resolved_stage_status(prospect)
        final = resolved or target
        prospect.current_stage_status = final
        await prospect.save()
        updated += 1

    print(f"Backfilled current_stage_status for {updated} leads ({skipped} left unset)")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
