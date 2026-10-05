"""
One-time cleanup: neutralize invalid email values on existing leads.

Legacy/dirty records can carry non-email strings in sales_prospects.email (for
example 'vghygcvghgv'), which previously crashed reads — the pipeline board and
leads endpoints returned 500 because the model validated the value as EmailStr.
The model now stores email as a plain string and the write paths sanitize it
(LeadEngine._sanitize_email), but records created before this fix keep the junk
value. This script clears those values to None using the same sanitizer.

Run from backend:
    .\\.venv\\Scripts\\python.exe scripts\\cleanup_invalid_lead_emails.py

Safety rules:
- Only touches sales_prospects documents that HAVE an email value.
- Invalid emails are cleared to None; valid emails are left untouched
  (lowercased/normalized only when the sanitizer normalizes them).
- Never deletes leads or any other field.
"""
import asyncio
import os
import sys

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.crm.models import SalesProspect
from app.crm.lead_engine import _sanitize_email


async def cleanup() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(database=db, document_models=[SalesProspect])

    prospects = await SalesProspect.find(
        {"deleted": False, "email": {"$ne": None}}
    ).to_list()
    cleared = 0
    for prospect in prospects:
        current = prospect.email
        cleaned = _sanitize_email(current)
        if cleaned != current:
            prospect.email = cleaned
            await prospect.save()
            cleared += 1

    print(
        f"Checked {len(prospects)} lead(s) with an email value; "
        f"cleared {cleared} invalid value(s)."
    )


if __name__ == "__main__":
    asyncio.run(cleanup())
