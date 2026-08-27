from __future__ import annotations

from datetime import datetime
from pathlib import Path
import uuid
from typing import Any, Dict, Iterable, List, Optional

from app.crm.client_identity import load_contacts_for_client
from app.models.client import Client
from app.models.client_onboarding import (
    ClientOnboarding,
    ClientOnboardingItem,
    ClientOnboardingItemStatus,
    ClientOnboardingStatus,
)
from app.models.crm_document import CRMDocument, CRMDocumentStatus, CRMDocumentType
from app.models.meeting import Meeting, MeetingStatus
from app.models.project import Project
from app.models.sales_prospect import SalesProspect
from app.models.user import User
from app.core.clock import utc_now
from beanie.exceptions import CollectionWasNotInitialized


ONBOARDING_ITEM_DEFINITIONS: List[Dict[str, Any]] = [
    {"key": "agreement", "label": "Agreement / Contract", "layer": "commercial", "tab": "commercial", "required": False, "action_label": "Open Commercial"},
    {"key": "payment_terms", "label": "Payment Terms / Billing", "layer": "commercial", "tab": "commercial", "required": True, "action_label": "Complete Billing"},
    {"key": "primary_contact", "label": "Primary Contact", "layer": "contacts", "tab": "contacts", "required": True, "action_label": "Complete Primary Contact"},
    {"key": "requirements", "label": "Requirements", "layer": "requirements", "tab": "requirements", "required": True, "action_label": "Open Requirements"},
    {"key": "documents", "label": "Documents", "layer": "documents", "tab": "documents", "required": False, "action_label": "Open Documents"},
    {"key": "brand_assets", "label": "Brand / Assets", "layer": "assets_access", "tab": "assets-access", "required": False, "action_label": "Record Assets"},
    {"key": "required_access", "label": "Required Credentials / Access", "layer": "assets_access", "tab": "assets-access", "required": False, "action_label": "Record Access"},
    {"key": "project_created", "label": "Project Created", "layer": "project_team", "tab": "project-team", "required": True, "action_label": "Create Project"},
    {"key": "team_assigned", "label": "Team / Account Owner Assigned", "layer": "project_team", "tab": "project-team", "required": True, "action_label": "Assign Team"},
    {"key": "kickoff_meeting", "label": "Kickoff Meeting", "layer": "kickoff", "tab": "kickoff", "required": True, "action_label": "Open Kickoff"},
    {"key": "start_readiness", "label": "Initial Delivery / Start Readiness", "layer": "project_team", "tab": "project-team", "required": True, "action_label": "Set Start Readiness"},
]


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _status_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value or "")


async def _source_lead_for_client(client: Client) -> SalesProspect | None:
    company_id = str(getattr(client, "company_id", "") or "")
    source_lead_id = getattr(client, "source_lead_id", None)
    if source_lead_id:
        try:
            lead = await SalesProspect.get(source_lead_id)
        except Exception:
            lead = None
        if lead and not getattr(lead, "deleted", False) and str(getattr(lead, "company_id", "") or "") == company_id:
            return lead
    try:
        return await SalesProspect.find_one({"company_id": company_id, "client_id": str(client.id), "deleted": {"$ne": True}})
    except CollectionWasNotInitialized:
        return None


async def _projects_for_client(client: Client) -> List[Project]:
    project_ids = [pid for pid in (client.project_ids or []) if pid]
    filters: List[Dict[str, Any]] = [{"client_id": str(client.id)}]
    if project_ids:
        filters.append({"project_id": {"$in": project_ids}})
    try:
        return await Project.find({"company_id": client.company_id, "$or": filters}).to_list()
    except CollectionWasNotInitialized:
        return []


async def _kickoff_for_client(client: Client) -> Meeting | None:
    return await Meeting.find_one(
        {
            "company_id": client.company_id,
            "$or": [
                {"title": f"Kickoff - {client.name}"},
                {"description": {"$regex": str(client.id), "$options": "i"}},
            ],
        }
    )


async def _contract_for_client(client: Client, source_lead: SalesProspect | None) -> CRMDocument | None:
    lead_id = str(getattr(source_lead, "id", "") or "")
    if not lead_id:
        return None
    return await CRMDocument.find_one(
        {"company_id": client.company_id, "lead_id": lead_id, "document_type": CRMDocumentType.CONTRACT}
    )


def _item_payload(definition: Dict[str, Any], *, status: ClientOnboardingItemStatus, percent: int, **extra: Any) -> Dict[str, Any]:
    return {
        **definition,
        "status": status,
        "completion_percent": percent,
        "validation": extra.pop("validation", {}),
        **extra,
    }


async def calculate_onboarding_items(client: Client) -> List[Dict[str, Any]]:
    try:
        contacts = await load_contacts_for_client(client)
    except CollectionWasNotInitialized:
        contacts = []
    source_lead = await _source_lead_for_client(client)
    projects = await _projects_for_client(client)
    kickoff = await _kickoff_for_client(client)
    contract = await _contract_for_client(client, source_lead)
    try:
        existing_items = {
            item.key: item
            for item in await ClientOnboardingItem.find(
                {"company_id": client.company_id, "client_id": str(client.id)}
            ).to_list()
        }
    except CollectionWasNotInitialized:
        existing_items = {}
    definitions = {item["key"]: item for item in ONBOARDING_ITEM_DEFINITIONS}

    primary_contact = next((contact for contact in contacts if getattr(contact, "is_primary_contact", False)), None)
    has_direct_contact = _has_value(getattr(client, "email", None)) or _has_value(getattr(client, "contact", None))
    contact_status = ClientOnboardingItemStatus.CONFIRMED if primary_contact else ClientOnboardingItemStatus.ADDED if has_direct_contact else ClientOnboardingItemStatus.MISSING

    requirement_complete = _has_value(getattr(client, "notes", None)) or _has_value(getattr(source_lead, "requirement", None)) or _has_value(getattr(source_lead, "pain_points", None))
    project_ready = bool(projects)
    team_ready = _has_value(getattr(client, "account_owner_id", None)) or _has_value(getattr(client, "assigned_to", None)) or any(_has_value(getattr(project, "assigned_to", None)) for project in projects)
    start_ready = _has_value(getattr(client, "start_date", None)) or any(_has_value(getattr(project, "start_date", None)) for project in projects)
    budget_ready = _has_value(getattr(client, "budget", None)) or _has_value(getattr(source_lead, "won_amount", None)) or _has_value(getattr(source_lead, "budget", None))

    kickoff_status = ClientOnboardingItemStatus.MISSING
    kickoff_percent = 0
    if kickoff:
        if _status_value(getattr(kickoff, "status", None)) == MeetingStatus.COMPLETED.value:
            kickoff_status = ClientOnboardingItemStatus.COMPLETED
            kickoff_percent = 100
        else:
            kickoff_status = ClientOnboardingItemStatus.SCHEDULED
            kickoff_percent = 70

    document_status = ClientOnboardingItemStatus.MISSING
    document_percent = 0
    if contract:
        contract_status = _status_value(contract.status)
        if contract_status == CRMDocumentStatus.ACCEPTED.value:
            document_status = ClientOnboardingItemStatus.SIGNED_CONFIRMED
            document_percent = 100
        elif contract_status == CRMDocumentStatus.VIEWED.value:
            document_status = ClientOnboardingItemStatus.VIEWED_RECEIVED
            document_percent = 75
        elif contract_status == CRMDocumentStatus.SENT.value:
            document_status = ClientOnboardingItemStatus.SENT
            document_percent = 50
        else:
            document_status = ClientOnboardingItemStatus.DRAFT
            document_percent = 25
    elif client.documents:
        document_status = ClientOnboardingItemStatus.VIEWED_RECEIVED
        document_percent = 60

    calculated = [
        _item_payload(definitions["agreement"], status=document_status, percent=document_percent, linked_entity_type="crm_document" if contract else None, linked_entity_id=str(contract.id) if contract else None),
        _item_payload(definitions["payment_terms"], status=ClientOnboardingItemStatus.CONFIRMED if budget_ready else ClientOnboardingItemStatus.MISSING, percent=100 if budget_ready else 0, linked_entity_type="client"),
        _item_payload(definitions["primary_contact"], status=contact_status, percent=100 if contact_status != ClientOnboardingItemStatus.MISSING else 0, linked_entity_type="sales_contact" if primary_contact else "client" if has_direct_contact else None, linked_entity_id=str(primary_contact.id) if primary_contact else str(client.id) if has_direct_contact else None),
        _item_payload(definitions["requirements"], status=ClientOnboardingItemStatus.COMPLETED if requirement_complete else ClientOnboardingItemStatus.NOT_STARTED, percent=100 if requirement_complete else 0, linked_entity_type="sales_prospect" if source_lead else "client"),
        _item_payload(definitions["documents"], status=document_status, percent=document_percent, linked_entity_type="crm_document" if contract else "client_document" if client.documents else None, linked_entity_id=str(contract.id) if contract else None),
        _item_payload(definitions["brand_assets"], status=ClientOnboardingItemStatus.PARTIALLY_RECEIVED if client.documents else ClientOnboardingItemStatus.MISSING, percent=50 if client.documents else 0, required=False),
        _item_payload(definitions["required_access"], status=ClientOnboardingItemStatus.REQUESTED if client.notes else ClientOnboardingItemStatus.MISSING, percent=25 if client.notes else 0, required=False),
        _item_payload(definitions["project_created"], status=ClientOnboardingItemStatus.CREATED if project_ready else ClientOnboardingItemStatus.NOT_STARTED, percent=100 if project_ready else 0, linked_entity_type="project" if projects else None, linked_entity_id=str(projects[0].id) if projects else None),
        _item_payload(definitions["team_assigned"], status=ClientOnboardingItemStatus.TEAM_ASSIGNED if team_ready else ClientOnboardingItemStatus.MISSING, percent=100 if team_ready else 0, assigned_owner_id=getattr(client, "account_owner_id", None) or getattr(client, "assigned_to", None)),
        _item_payload(definitions["kickoff_meeting"], status=kickoff_status, percent=kickoff_percent, linked_entity_type="meeting" if kickoff else None, linked_entity_id=str(kickoff.id) if kickoff else None),
        _item_payload(definitions["start_readiness"], status=ClientOnboardingItemStatus.READY if start_ready else ClientOnboardingItemStatus.NOT_STARTED, percent=100 if start_ready else 0, linked_entity_type="project" if projects else "client"),
    ]

    manual_keys = {"agreement", "requirements", "brand_assets", "required_access"}
    for payload in calculated:
        existing = existing_items.get(payload["key"])
        if payload["key"] not in manual_keys or not existing:
            continue
        if payload["key"] == "agreement" and contract:
            continue
        if payload["key"] == "requirements" and requirement_complete:
            continue
        if payload["key"] in {"brand_assets", "required_access"} and payload["completion_percent"] > 0:
            continue
        if existing.notes or existing.status not in {
            ClientOnboardingItemStatus.MISSING,
            ClientOnboardingItemStatus.NOT_STARTED,
        }:
            payload["status"] = existing.status
            payload["completion_percent"] = existing.completion_percent
            payload["notes"] = existing.notes
            payload["validation"] = existing.validation
    return calculated


def _is_required_complete(item: Dict[str, Any]) -> bool:
    return not item.get("required", True) or int(item.get("completion_percent") or 0) >= 100


async def sync_client_onboarding(client: Client, actor: Optional[User] = None) -> Dict[str, Any]:
    now = utc_now()
    onboarding = await ClientOnboarding.find_one({"company_id": client.company_id, "client_id": str(client.id)})
    if not onboarding:
        onboarding = ClientOnboarding(company_id=client.company_id, client_id=str(client.id))
        await onboarding.insert()

    calculated = await calculate_onboarding_items(client)
    saved_items: List[ClientOnboardingItem] = []
    for payload in calculated:
        item = await ClientOnboardingItem.find_one({"company_id": client.company_id, "client_id": str(client.id), "key": payload["key"]})
        old_status = item.status.value if item else None
        old_percent = item.completion_percent if item else None
        if not item:
            item = ClientOnboardingItem(
                onboarding_id=str(onboarding.id),
                client_id=str(client.id),
                company_id=client.company_id,
                key=payload["key"],
                label=payload["label"],
                layer=payload["layer"],
            )
        for field in ("label", "layer", "required", "status", "completion_percent", "assigned_owner_id", "linked_entity_type", "linked_entity_id", "tab", "action_label", "notes", "validation"):
            if field in payload:
                setattr(item, field, payload[field])
        if old_status != item.status.value or old_percent != item.completion_percent:
            item.audit_history.append({
                "actor_id": str(getattr(actor, "id", "")) if actor else None,
                "from_status": old_status,
                "to_status": item.status.value,
                "from_percent": old_percent,
                "to_percent": item.completion_percent,
                "timestamp": now,
            })
        item.updated_at = now
        item.completed_at = now if item.completion_percent >= 100 else None
        await item.save()
        saved_items.append(item)

    required_items = [item for item in saved_items if item.required]
    completed_required = [item for item in required_items if item.completion_percent >= 100]
    blockers = [item.key for item in required_items if item.completion_percent < 100]
    onboarding.required_total = len(required_items)
    onboarding.required_completed = len(completed_required)
    onboarding.progress_percent = int(round((len(completed_required) / len(required_items)) * 100)) if required_items else 100
    onboarding.blocking_item_keys = blockers
    onboarding.status = ClientOnboardingStatus.READY if not blockers else ClientOnboardingStatus.IN_PROGRESS
    onboarding.next_action = next((item.action_label for item in saved_items if item.key in blockers), None)
    onboarding.completed_at = now if not blockers else None
    onboarding.updated_at = now
    await onboarding.save()

    return serialize_onboarding(onboarding, saved_items)


def serialize_onboarding(onboarding: ClientOnboarding, items: Iterable[ClientOnboardingItem]) -> Dict[str, Any]:
    item_list = [
        {
            "id": str(item.id),
            "key": item.key,
            "label": item.label,
            "layer": item.layer,
            "required": item.required,
            "status": item.status.value,
            "completion_percent": item.completion_percent,
            "assigned_owner_id": item.assigned_owner_id,
            "linked_entity_type": item.linked_entity_type,
            "linked_entity_id": item.linked_entity_id,
            "tab": item.tab,
            "action_label": item.action_label,
            "notes": item.notes,
            "validation": item.validation,
            "audit_history": item.audit_history[-10:],
            "completed_at": item.completed_at,
            "updated_at": item.updated_at,
        }
        for item in items
    ]
    blockers = [item for item in item_list if item["key"] in onboarding.blocking_item_keys]
    return {
        "id": str(onboarding.id),
        "client_id": onboarding.client_id,
        "status": onboarding.status.value,
        "progress_percent": onboarding.progress_percent,
        "required_completed": onboarding.required_completed,
        "required_total": onboarding.required_total,
        "blocking_item_keys": onboarding.blocking_item_keys,
        "blocking_items": blockers,
        "next_action": onboarding.next_action,
        "items": item_list,
        "updated_at": onboarding.updated_at,
    }


async def activation_blockers(client: Client, actor: Optional[User] = None) -> List[Dict[str, Any]]:
    try:
        onboarding = await sync_client_onboarding(client, actor)
    except CollectionWasNotInitialized:
        calculated = await calculate_onboarding_items(client)
        onboarding = {"blocking_items": calculated}
    return [
        {
            "field": item["key"],
            "label": item["label"],
            "current_status": item["status"],
            "reason": f"{item['label']} is {item['status'].replace('_', ' ')}.",
            "tab": item["tab"],
            "action_label": item["action_label"],
        }
        for item in onboarding["blocking_items"]
        if item["required"]
    ]


async def build_onboarding_document(client: Client, actor: Optional[User] = None, upload_dir: Optional[Path] = None) -> Dict[str, Any]:
    onboarding = await sync_client_onboarding(client, actor)
    contacts = await load_contacts_for_client(client)
    projects = await _projects_for_client(client)
    kickoff = await _kickoff_for_client(client)
    safe_name = "".join(ch if ch.isalnum() else "-" for ch in (client.company_name or client.name or "client")).strip("-").lower()[:40] or "client"
    filename = f"onboarding-{safe_name}-{uuid.uuid4().hex[:8]}.md"
    target_dir = upload_dir or Path("uploads") / "clients"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename

    primary_contact = next((contact for contact in contacts if getattr(contact, "is_primary_contact", False)), None)
    contact_line = (
        f"{primary_contact.full_name()} | {primary_contact.email or 'No email'} | {primary_contact.phone or 'No phone'}"
        if primary_contact else f"{client.email or 'No email'} | {client.contact or 'No phone'}"
    )
    project_lines = "\n".join(f"- {project.name} ({_status_value(project.status) or 'status unknown'})" for project in projects) or "- No project linked yet"
    item_lines = "\n".join(f"- {item['label']}: {item['status'].replace('_', ' ')} ({item['completion_percent']}%)" for item in onboarding["items"])

    content = f"""# Client Onboarding Document

## Client Details
- Client: {client.company_name or client.name}
- Account name: {client.name}
- Industry: {client.industry or 'Not provided'}
- Start date: {client.start_date or 'Not set'}

## Primary Contact
{contact_line}

## Commercial Summary
- Billing frequency: {_status_value(client.client_type) or 'Not set'}
- Contract/deal value: {client.budget or 'Not set'}

## Requirements
{client.notes or 'No requirements captured yet.'}

## Project Information
{project_lines}

## Kickoff
- Meeting: {kickoff.title if kickoff else 'Not scheduled'}
- Status: {_status_value(kickoff.status) if kickoff else 'not scheduled'}
- Date: {kickoff.meeting_date if kickoff else 'Not scheduled'}

## Onboarding Status
- Progress: {onboarding['progress_percent']}%
- Required complete: {onboarding['required_completed']}/{onboarding['required_total']}

## Layer Statuses
{item_lines}

## Client Confirmation
Please review the onboarding summary and confirm that the captured scope, timeline, contact, and kickoff information are correct.
"""
    target.write_text(content, encoding="utf-8")
    document = {
        "name": "Client Onboarding Document",
        "original_name": filename,
        "url": f"/api/v1/files/clients/{filename}",
        "type": "onboarding_document",
        "category": "onboarding_document",
        "status": "generated",
        "generated_at": utc_now(),
        "generated_by": str(getattr(actor, "id", "")) if actor else None,
        "onboarding_progress_percent": onboarding["progress_percent"],
        "sensitive": False,
    }
    client.documents = [doc for doc in (client.documents or []) if doc.get("category") != "onboarding_document"]
    client.documents.append(document)
    client.updated_at = utc_now()
    await client.save()
    await sync_client_onboarding(client, actor)
    return document
