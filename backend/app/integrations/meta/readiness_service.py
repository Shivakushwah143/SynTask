from datetime import datetime

from app.core.clock import aware_utc_now
from typing import Any, Dict, List, Optional
from app.integrations.meta.readiness_models import MetaReadinessRecord

DEFAULT_CHECKLIST = [
    {
        "checklist_id": "PII_REDACTION",
        "checklist_name": "PII & Access Token Log Redaction",
        "notes": "Verify that debug logging and exception traces redact access tokens, payloads, and phone numbers.",
    },
    {
        "checklist_id": "OAUTH_FLOW",
        "checklist_name": "SaaS Multi-tenant OAuth Wizard",
        "notes": "Verify secure short-lived to long-lived token exchange and Fernet encryption.",
    },
    {
        "checklist_id": "TWENTY_FOUR_HOUR_GATE",
        "checklist_name": "Meta 24-hour Reply Window Gate",
        "notes": "Enforce strict window validation to reject outbound messaging if outside the 24-hour window.",
    },
    {
        "checklist_id": "WEBHOOK_VERIFICATION",
        "checklist_name": "Secure Webhook Signature Router",
        "notes": "Ensure that Meta SHA-256 signatures are validated before routing events.",
    },
    {
        "checklist_id": "HUMAN_APPROVAL_GATE",
        "checklist_name": "Human-Approved Outbound Sending Only",
        "notes": "Verify that all message composer actions require manual agent trigger and cannot send autonomously.",
    },
]

class MetaReadinessService:
    """Manages Meta App Review readiness audits, evidence packs, and certification checklist."""

    @classmethod
    async def get_readiness_checklist(cls) -> List[MetaReadinessRecord]:
        records = await MetaReadinessRecord.find_all().to_list()
        if len(records) < len(DEFAULT_CHECKLIST):
            # Seed missing checklist items
            existing_ids = {r.checklist_id for r in records}
            for item in DEFAULT_CHECKLIST:
                if item["checklist_id"] not in existing_ids:
                    record = MetaReadinessRecord(
                        checklist_id=item["checklist_id"],
                        checklist_name=item["checklist_name"],
                        status="pending",
                        notes=item["notes"],
                    )
                    await record.insert()
            records = await MetaReadinessRecord.find_all().to_list()
        return records

    @classmethod
    async def update_readiness_record(
        cls,
        *,
        checklist_id: str,
        status: str,
        evidence_url: Optional[str] = None,
        notes: Optional[str] = None,
        verified_by: Optional[str] = None,
    ) -> MetaReadinessRecord:
        record = await MetaReadinessRecord.find_one({"checklist_id": checklist_id})
        if not record:
            raise ValueError(f"Readiness check item '{checklist_id}' not found")
        
        record.status = status
        if evidence_url is not None:
            record.evidence_url = evidence_url
        if notes is not None:
            record.notes = notes
            
        record.verified_by = verified_by
        record.verified_at = aware_utc_now()
        record.updated_at = aware_utc_now()
        await record.save()
        return record

    @classmethod
    async def is_fully_ready(cls) -> bool:
        records = await cls.get_readiness_checklist()
        return all(r.status == "passed" for r in records)

    @classmethod
    async def export_evidence_package(cls) -> Dict[str, Any]:
        records = await cls.get_readiness_checklist()
        passed_items = [r for r in records if r.status == "passed"]
        
        return {
            "exported_at": aware_utc_now().isoformat(),
            "checklist_count": len(records),
            "passed_count": len(passed_items),
            "fully_ready": len(passed_items) == len(records),
            "items": [
                {
                    "checklist_id": r.checklist_id,
                    "checklist_name": r.checklist_name,
                    "status": r.status,
                    "evidence_url": r.evidence_url,
                    "notes": r.notes,
                    "verified_at": r.verified_at.isoformat() if r.verified_at else None,
                    "verified_by": r.verified_by,
                }
                for r in records
            ],
        }
