"""Backfill canonical Client -> CRMCompany links.

Run:
    python scripts/backfill_client_crm_company_links.py --dry-run
    python scripts/backfill_client_crm_company_links.py

The script is additive and idempotent. It links only unambiguous same-tenant
matches and reports unresolved/ambiguous clients without modifying them.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo import ASCENDING, IndexModel

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.client import Client
from app.models.crm_company import CRMCompany
from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect


def _exact(value: str) -> dict[str, str]:
    return {"$regex": f"^{re.escape(value)}$", "$options": "i"}


def _object_id(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return value


async def _resolve(database: Any, client: dict[str, Any]) -> tuple[str, str | None, str]:
    tenant_id = str(client.get("company_id") or "")
    client_id = client["_id"]
    existing = client.get("crm_company_id")
    companies = database[CRMCompany.Settings.name]
    leads = database[SalesProspect.Settings.name]
    contacts = database[SalesContact.Settings.name]

    if existing:
        company = await companies.find_one({"_id": _object_id(existing), "company_id": tenant_id, "deleted": False})
        if company:
            return "already_linked", str(existing), "client.crm_company_id"
        return "unresolved", None, "existing_crm_company_id_invalid_or_cross_tenant"

    source_lead_id = client.get("source_lead_id")
    if source_lead_id:
        lead = await leads.find_one({"_id": _object_id(source_lead_id), "company_id": tenant_id, "deleted": False})
        if lead and lead.get("crm_company_id"):
            company = await companies.find_one({"_id": _object_id(lead["crm_company_id"]), "company_id": tenant_id, "deleted": False})
            if company:
                return "resolved", str(company["_id"]), "source_lead.crm_company_id"

    linked = await leads.find({"company_id": tenant_id, "deleted": False, "client_id": str(client_id)}).to_list(length=None)
    linked_ids = {str(item.get("crm_company_id")) for item in linked if item.get("crm_company_id")}
    if len(linked_ids) == 1:
        company_id = next(iter(linked_ids))
        company = await companies.find_one({"_id": _object_id(company_id), "company_id": tenant_id, "deleted": False})
        if company:
            return "resolved", company_id, "linked_lead.crm_company_id"
    if len(linked_ids) > 1:
        return "ambiguous", None, "linked_leads_multiple_crm_companies"

    account_name = str(client.get("company_name") or client.get("name") or "").strip()
    if account_name:
        name_matches = await companies.find({"company_id": tenant_id, "deleted": False, "name": _exact(account_name)}).to_list(length=None)
        if len(name_matches) == 1:
            return "resolved", str(name_matches[0]["_id"]), "client.company_name_exact"
        if len(name_matches) > 1:
            return "ambiguous", None, "client.company_name_exact_multiple"

    email = str(client.get("email") or "").strip().lower()
    domain = email.split("@", 1)[1] if "@" in email else ""
    if domain:
        domain_matches = await companies.find(
            {
                "company_id": tenant_id,
                "deleted": False,
                "$or": [
                    {"email": {"$regex": f"@{re.escape(domain)}$", "$options": "i"}},
                    {"website": {"$regex": re.escape(domain), "$options": "i"}},
                ],
            }
        ).to_list(length=None)
        if len(domain_matches) == 1:
            return "resolved", str(domain_matches[0]["_id"]), "client.email_domain"
        if len(domain_matches) > 1:
            return "ambiguous", None, "client.email_domain_multiple"

    contact = str(client.get("contact") or "").strip()
    if contact:
        contact_matches = await contacts.find(
            {
                "company_id": tenant_id,
                "deleted": False,
                "phone": contact,
                "crm_company_id": {"$type": "string"},
            }
        ).to_list(length=None)
        contact_company_ids = {str(item.get("crm_company_id")) for item in contact_matches if item.get("crm_company_id")}
        if len(contact_company_ids) == 1:
            return "resolved", next(iter(contact_company_ids)), "client.contact_phone"
        if len(contact_company_ids) > 1:
            return "ambiguous", None, "client.contact_phone_multiple"

    return "unresolved", None, "no_safe_match"


async def run(dry_run: bool) -> dict[str, int]:
    mongo = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        database = mongo[settings.DATABASE_NAME]
        await mongo.admin.command("ping")
        clients = database[Client.Settings.name]
        stats = {"scanned": 0, "linked": 0, "already_linked": 0, "unresolved": 0, "ambiguous": 0}
        details: list[str] = []

        async for client in clients.find({}):
            stats["scanned"] += 1
            status, company_id, reason = await _resolve(database, client)
            if status == "already_linked":
                stats["already_linked"] += 1
                continue
            if status == "resolved" and company_id:
                stats["linked"] += 1
                details.append(f"LINK {client['_id']} -> {company_id} ({reason})")
                if not dry_run:
                    await clients.update_one(
                        {"_id": client["_id"], "$or": [{"crm_company_id": {"$exists": False}}, {"crm_company_id": None}, {"crm_company_id": ""}]},
                        {"$set": {"crm_company_id": company_id}},
                    )
                continue
            stats[status] += 1
            details.append(f"{status.upper()} {client['_id']} ({reason})")

        if not dry_run:
            await clients.create_indexes(
                [
                    IndexModel([("company_id", ASCENDING), ("crm_company_id", ASCENDING)]),
                    IndexModel(
                        [("company_id", ASCENDING), ("source_lead_id", ASCENDING)],
                        name="company_id_1_source_lead_id_1",
                        unique=True,
                        partialFilterExpression={"source_lead_id": {"$type": "string"}},
                    ),
                    IndexModel([("company_id", ASCENDING), ("account_owner_id", ASCENDING)]),
                    IndexModel([("company_id", ASCENDING), ("sales_owner_id", ASCENDING)]),
                ]
            )

        for line in details:
            print(line)
        print(
            "Summary: "
            + ", ".join(f"{key}={value}" for key, value in stats.items())
            + (", dry_run=true" if dry_run else ", dry_run=false")
        )
        return stats
    finally:
        mongo.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report planned links without modifying data.")
    args = parser.parse_args()
    asyncio.run(run(args.dry_run))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
