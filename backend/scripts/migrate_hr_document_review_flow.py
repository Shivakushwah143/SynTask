"""
HR Document employee-submission review-flow migration.

Backfills the new review-workflow fields for existing data so nothing created
before this feature changes meaning:

1. ``hr_documents`` (and ``hr_document_versions``): rows with no review state
   become ``submission_source="hr"`` + ``review_status="approved"`` — existing
   HR-uploaded documents keep behaving exactly as before.
2. ``hr_document_types``: ``employee_upload_allowed`` is repaired to the
   product defaults on the standard seeded codes — rows with no value get
   ``False``, except the self-declared/identity codes (resume, aadhaar, pan,
   passport, driving_license, educational_certificate, experience_letter) which
   default to ``True``. Rows seeded with an explicit ``False`` before those
   default codes were defined are also enabled. The first repair stamps
   ``employee_upload_defaults_repaired_at``; after that moment an explicit HR
   toggle (HR Settings writes a newer ``updated_at``) is never overwritten.

Safe/idempotent: re-running never flips an explicit HR value taken after the
repair stamp.

Run from ``backend/``:

    python -m scripts.migrate_hr_document_review_flow
    python -m scripts.migrate_hr_document_review_flow --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Allow running as a script from the backend/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bson import ObjectId  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

from app.core.database import init_db  # noqa: E402
from app.services.hr_document_service import backfill_employee_upload_defaults  # noqa: E402


async def _backfill_collection(model, field_values: dict, dry_run: bool) -> None:
    """Set ``field_values`` on rows missing any of those fields (idempotent)."""
    collection = model.get_pymongo_collection()
    or_clauses: list[dict] = []
    for field in field_values:
        or_clauses.append({field: {"$exists": False}})
        or_clauses.append({field: None})
    query: dict = {"$or": or_clauses}

    total = 0
    ids: list[str] = []
    async for doc in collection.find(query, {"_id": 1}):
        total += 1
        ids.append(str(doc["_id"]))
    if dry_run:
        logger.info("  dry-run: %d row(s) would be updated in %s", total, model.Settings.name)
        return
    if not total:
        logger.info("  %s: nothing to backfill", model.Settings.name)
        return
    result = await collection.update_many(
        {"_id": {"$in": [ObjectId(_id) for _id in ids]}},
        {"$set": dict(field_values)},
    )
    logger.info("  %s: updated %d row(s)", model.Settings.name, result.modified_count)


async def migrate(dry_run: bool = False) -> None:
    await init_db()

    from app.models.hr_document import HRDocument, HRDocumentVersion

    logger.info("Backfilling review fields on existing HR documents…")
    await _backfill_collection(
        HRDocument,
        {"submission_source": "hr", "review_status": "approved"},
        dry_run,
    )
    logger.info("Backfilling review fields on existing document versions…")
    await _backfill_collection(
        HRDocumentVersion,
        {"submission_source": "hr", "review_status": "approved"},
        dry_run,
    )
    logger.info("Backfilling employee_upload_allowed on document types…")
    repaired = await backfill_employee_upload_defaults(None, dry_run=dry_run)
    logger.info("  document types: %d row(s) %s", repaired, "would be repaired (dry-run)" if dry_run else "repaired")
    if dry_run:
        return
    logger.info("Migration finished successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(description="HR document review-flow backfill")
    parser.add_argument("--dry-run", action="store_true", help="Report without writing")
    args = parser.parse_args()
    try:
        asyncio.run(migrate(dry_run=args.dry_run))
    except KeyboardInterrupt:
        logger.info("Migration cancelled")
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        logger.error("Migration failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
