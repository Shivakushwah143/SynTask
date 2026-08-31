from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import secrets
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
from app.models.crm_activity import CRMActivity, CRMActivityStatus, CRMActivityType
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

ASSET_REQUIREMENT_DEFAULTS: List[Dict[str, Any]] = [
    {"name": "Logo", "category": "Logo", "required": True, "description": ""},
    {"name": "Brand Guidelines", "category": "Brand Guidelines", "required": True, "description": ""},
    {"name": "Product Images", "category": "Product Images", "required": True, "description": ""},
    {"name": "Company Profile", "category": "Company Profile", "required": True, "description": ""},
    {"name": "Reference Material", "category": "Reference Material", "required": False, "description": ""},
]

ASSET_STATUSES = {"missing", "requested", "received", "verified", "replacement_required"}
ASSET_SUBMISSION_SOURCES = {"whatsapp", "email", "manual_upload", "drive", "client_portal", "physical", "other"}
ASSET_REQUEST_LINK_TTL_DAYS = 14


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
    try:
        linked = await ClientOnboardingItem.find_one(
            {"company_id": client.company_id, "client_id": str(client.id), "key": "kickoff_meeting"}
        )
    except CollectionWasNotInitialized:
        linked = None
    if linked and linked.linked_entity_type == "meeting" and linked.linked_entity_id:
        meeting = await Meeting.get(linked.linked_entity_id)
        if meeting and getattr(meeting, "company_id", None) == client.company_id:
            return meeting
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


def onboarding_data(client: Client) -> Dict[str, Any]:
    metadata = getattr(client, "lifecycle_metadata", None) or {}
    data = metadata.get("onboarding") if isinstance(metadata, dict) else None
    return data if isinstance(data, dict) else {}


def merge_onboarding_data(client: Client, patch: Dict[str, Any]) -> None:
    metadata = dict(getattr(client, "lifecycle_metadata", None) or {})
    data = dict(metadata.get("onboarding") or {})
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key] = {**data[key], **value}
        else:
            data[key] = value
    metadata["onboarding"] = data
    client.lifecycle_metadata = metadata


def _asset_data(client: Client) -> Dict[str, Any]:
    data = onboarding_data(client)
    requirements = list(data.get("asset_requirements") or [])
    legacy_assets = list(data.get("assets") or [])
    now = utc_now().isoformat()
    if not requirements:
        for asset in legacy_assets:
            name = str(asset.get("name") or "").strip()
            if not name:
                continue
            requirements.append({
                "id": asset.get("id") or uuid.uuid4().hex,
                "name": name,
                "category": asset.get("category") or name,
                "required": bool(asset.get("required", True)),
                "description": asset.get("description") or "",
                "status": asset.get("status") if asset.get("status") in ASSET_STATUSES else "missing",
                "requested_at": asset.get("requested_at"),
                "received_at": asset.get("received_at"),
                "verified_at": asset.get("verified_at"),
                "verified_by": asset.get("verified_by"),
                "verification_note": asset.get("verification_note"),
                "replacement_note": asset.get("replacement_note"),
                "file_refs": list(asset.get("file_refs") or []),
                "created_at": asset.get("created_at") or now,
                "updated_at": asset.get("updated_at") or now,
            })
    existing_names = {str(item.get("name") or "").strip().lower() for item in requirements}
    for default in ASSET_REQUIREMENT_DEFAULTS:
        if default["name"].lower() in existing_names:
            continue
        requirements.append({
            "id": uuid.uuid4().hex,
            **default,
            "status": "missing",
            "requested_at": None,
            "received_at": None,
            "verified_at": None,
            "verified_by": None,
            "file_refs": [],
            "created_at": now,
            "updated_at": now,
        })
    submissions = list(data.get("asset_submissions") or [])
    return {"requirements": requirements, "submissions": submissions}


def _save_asset_data(client: Client, requirements: List[Dict[str, Any]], submissions: List[Dict[str, Any]]) -> None:
    merge_onboarding_data(client, {
        "asset_requirements": requirements,
        "asset_submissions": submissions,
        "assets": [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "category": item.get("category"),
                "required": item.get("required", True),
                "status": item.get("status", "missing"),
                "reference": item.get("reference"),
                "file_url": item.get("file_url"),
                "file_refs": item.get("file_refs") or [],
            }
            for item in requirements
        ],
    })


def _asset_progress(requirements: List[Dict[str, Any]]) -> Dict[str, Any]:
    required_items = [item for item in requirements if item.get("required", True)]
    verified_required = [item for item in required_items if item.get("status") == "verified"]
    return {
        "required_total": len(required_items),
        "required_verified": len(verified_required),
        "required_ready": len(required_items) == len(verified_required),
        "percent": int(round((len(verified_required) / len(required_items)) * 100)) if required_items else 100,
    }


async def log_asset_activity(client: Client, actor: Optional[User], action: str, title: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    try:
        activity = CRMActivity(
            company_id=str(client.company_id),
            entity_type="client",
            entity_id=str(client.id),
            activity_type=CRMActivityType.FILE if action in {"submission_added", "file_uploaded"} else CRMActivityType.NOTE,
            title=title,
            description=(metadata or {}).get("note"),
            status=CRMActivityStatus.COMPLETED,
            completed_at=utc_now(),
            completed_by=str(getattr(actor, "id", "")) if actor else None,
            completed_by_name=getattr(actor, "full_name", None) or str(getattr(actor, "email", "") or ""),
            metadata={"client_id": str(client.id), "onboarding_asset_action": action, **(metadata or {})},
            created_by=str(getattr(actor, "id", "")) if actor else None,
            created_by_name=getattr(actor, "full_name", None) or str(getattr(actor, "email", "") or ""),
        )
        await activity.insert()
    except CollectionWasNotInitialized:
        return


async def ensure_asset_requirements(client: Client) -> Dict[str, Any]:
    assets = _asset_data(client)
    _save_asset_data(client, assets["requirements"], assets["submissions"])
    return {"requirements": assets["requirements"], "submissions": assets["submissions"], "progress": _asset_progress(assets["requirements"])}


async def update_asset_requirement(client: Client, requirement_id: str, patch: Dict[str, Any], actor: Optional[User] = None) -> Dict[str, Any]:
    assets = _asset_data(client)
    now = utc_now().isoformat()
    requirement = next((item for item in assets["requirements"] if item.get("id") == requirement_id), None)
    if not requirement:
        raise ValueError("Asset requirement not found")
    old_status = requirement.get("status", "missing")
    for key in ("name", "category", "description"):
        if key in patch and patch[key] is not None:
            requirement[key] = str(patch[key]).strip()
    if "required" in patch:
        requirement["required"] = bool(patch["required"])
    if patch.get("status"):
        new_status = str(patch["status"])
        if new_status not in ASSET_STATUSES:
            raise ValueError("Invalid asset status")
        requirement["status"] = new_status
        if new_status == "requested":
            requirement["requested_at"] = requirement.get("requested_at") or now
        elif new_status == "verified":
            requirement["verified_at"] = now
            requirement["verified_by"] = str(getattr(actor, "id", "")) if actor else None
            requirement["verification_note"] = patch.get("note") or requirement.get("verification_note")
        elif new_status == "replacement_required":
            requirement["replacement_note"] = patch.get("note") or requirement.get("replacement_note")
        if new_status != old_status:
            requirement.setdefault("status_history", []).append({"from": old_status, "to": new_status, "at": now, "by": str(getattr(actor, "id", "")) if actor else None, "note": patch.get("note")})
    requirement["updated_at"] = now
    _save_asset_data(client, assets["requirements"], assets["submissions"])
    client.updated_at = utc_now()
    await client.save()
    await log_asset_activity(client, actor, f"asset_{requirement.get('status')}", f"Asset {requirement.get('status')}: {requirement.get('name')}", {"requirement_id": requirement_id, "note": patch.get("note")})
    return {"requirements": assets["requirements"], "submissions": assets["submissions"], "progress": _asset_progress(assets["requirements"])}


async def add_asset_submission(client: Client, payload: Dict[str, Any], actor: Optional[User] = None) -> Dict[str, Any]:
    assets = _asset_data(client)
    requirement_ids = [rid for rid in payload.get("requirement_ids", []) if rid]
    valid_ids = {item.get("id") for item in assets["requirements"]}
    if not requirement_ids or any(rid not in valid_ids for rid in requirement_ids):
        raise ValueError("Submission must map to one or more valid asset requirements")
    source = str(payload.get("source") or "manual_upload")
    if source not in ASSET_SUBMISSION_SOURCES:
        raise ValueError("Invalid asset source")
    now = utc_now().isoformat()
    submission = {
        "id": uuid.uuid4().hex,
        "source": source,
        "received_from_contact_id": payload.get("received_from_contact_id"),
        "received_by_user_id": payload.get("received_by_user_id") or str(getattr(actor, "id", "")),
        "received_date": payload.get("received_date") or now,
        "requirement_ids": requirement_ids,
        "files": list(payload.get("files") or []),
        "notes": payload.get("notes"),
        "created_at": now,
        "created_by": str(getattr(actor, "id", "")) if actor else None,
    }
    assets["submissions"].append(submission)
    for requirement in assets["requirements"]:
        if requirement.get("id") not in requirement_ids:
            continue
        file_refs = requirement.setdefault("file_refs", [])
        existing_urls = {item.get("url") for item in file_refs if isinstance(item, dict)}
        for file_ref in submission["files"]:
            if isinstance(file_ref, dict) and file_ref.get("url") not in existing_urls:
                file_refs.append(file_ref)
                existing_urls.add(file_ref.get("url"))
        requirement["status"] = "received"
        requirement["received_at"] = requirement.get("received_at") or submission["received_date"]
        requirement["updated_at"] = now
    _save_asset_data(client, assets["requirements"], assets["submissions"])
    client.updated_at = utc_now()
    await client.save()
    await log_asset_activity(client, actor, "submission_added", "Asset submission added", {"submission_id": submission["id"], "requirement_ids": requirement_ids, "source": source, "files": submission["files"], "note": payload.get("notes")})
    if submission["files"]:
        await log_asset_activity(client, actor, "file_uploaded", "Asset file uploaded", {"submission_id": submission["id"], "files": submission["files"], "requirement_ids": requirement_ids})
    return {"submission": submission, "requirements": assets["requirements"], "submissions": assets["submissions"], "progress": _asset_progress(assets["requirements"])}


async def link_existing_asset_file(client: Client, requirement_id: str, file_ref: Dict[str, Any], actor: Optional[User] = None) -> Dict[str, Any]:
    url = str(file_ref.get("url") or "").strip()
    if not url:
        raise ValueError("File URL is required")
    client_docs = list(getattr(client, "documents", None) or [])
    if not any(str(doc.get("url") or "") == url for doc in client_docs if isinstance(doc, dict)):
        raise ValueError("File must belong to this client")
    return await add_asset_submission(client, {
        "source": "manual_upload",
        "requirement_ids": [requirement_id],
        "files": [{
            "name": file_ref.get("name") or file_ref.get("original_name") or url.rsplit("/", 1)[-1],
            "original_name": file_ref.get("original_name") or file_ref.get("name"),
            "url": url,
            "type": file_ref.get("type"),
            "size": file_ref.get("size"),
            "linked_existing": True,
        }],
        "notes": file_ref.get("notes") or "Existing client file linked to asset requirement.",
    }, actor)


async def generate_asset_request_link(client: Client, requirement_id: str, actor: Optional[User] = None) -> Dict[str, Any]:
    assets = _asset_data(client)
    requirement = next((item for item in assets["requirements"] if item.get("id") == requirement_id), None)
    if not requirement:
        raise ValueError("Asset requirement not found")
    token = secrets.token_urlsafe(32)
    now = utc_now()
    requirement["request_token_hash"] = hashlib.sha256(token.encode("utf-8")).hexdigest()
    requirement["request_link_expires_at"] = (now + timedelta(days=ASSET_REQUEST_LINK_TTL_DAYS)).isoformat()
    requirement["request_link_revoked_at"] = None
    requirement["requested_at"] = requirement.get("requested_at") or now.isoformat()
    requirement["status"] = "requested"
    requirement["updated_at"] = now.isoformat()
    _save_asset_data(client, assets["requirements"], assets["submissions"])
    client.updated_at = utc_now()
    await client.save()
    await log_asset_activity(client, actor, "asset_requested", f"Asset requested: {requirement.get('name')}", {"requirement_id": requirement_id})
    return {
        "token": token,
        "expires_at": requirement["request_link_expires_at"],
        "requirements": assets["requirements"],
        "submissions": assets["submissions"],
        "progress": _asset_progress(assets["requirements"]),
    }


async def revoke_asset_request_link(client: Client, requirement_id: str, actor: Optional[User] = None) -> Dict[str, Any]:
    assets = _asset_data(client)
    requirement = next((item for item in assets["requirements"] if item.get("id") == requirement_id), None)
    if not requirement:
        raise ValueError("Asset requirement not found")
    requirement["request_link_revoked_at"] = utc_now().isoformat()
    requirement["updated_at"] = requirement["request_link_revoked_at"]
    _save_asset_data(client, assets["requirements"], assets["submissions"])
    client.updated_at = utc_now()
    await client.save()
    await log_asset_activity(client, actor, "asset_request_revoked", f"Asset request revoked: {requirement.get('name')}", {"requirement_id": requirement_id})
    return {"requirements": assets["requirements"], "submissions": assets["submissions"], "progress": _asset_progress(assets["requirements"])}


def _parse_asset_link_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


async def load_asset_request_by_token(token: str) -> tuple[Client, Dict[str, Any]]:
    token_hash = hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()
    try:
        client = await Client.find_one({"lifecycle_metadata.onboarding.asset_requirements.request_token_hash": token_hash, "deleted": {"$ne": True}})
    except CollectionWasNotInitialized as exc:
        raise ValueError("Asset request link is invalid") from exc
    if not client:
        raise ValueError("Asset request link is invalid")
    assets = _asset_data(client)
    requirement = next((item for item in assets["requirements"] if item.get("request_token_hash") == token_hash), None)
    if not requirement or requirement.get("request_link_revoked_at"):
        raise ValueError("Asset request link is invalid")
    expires_at = _parse_asset_link_datetime(requirement.get("request_link_expires_at"))
    if expires_at and expires_at < utc_now().replace(tzinfo=None):
        raise ValueError("Asset request link has expired")
    return client, requirement


async def add_asset_submission_by_token(client: Client, requirement_id: str, files: List[Dict[str, Any]], notes: Optional[str] = None) -> Dict[str, Any]:
    return await add_asset_submission(client, {
        "source": "client_portal",
        "requirement_ids": [requirement_id],
        "files": files,
        "notes": notes,
    }, None)


def _commercial_data(client: Client, source_lead: SalesProspect | None) -> Dict[str, Any]:
    data = dict(onboarding_data(client).get("commercial") or {})
    if client.budget not in (None, "", 0):
        data.setdefault("deal_value", client.budget)
    elif source_lead:
        for field in ("won_amount", "budget"):
            value = getattr(source_lead, field, None)
            if value not in (None, "", 0):
                data.setdefault("deal_value", value)
                break
    if client.client_type:
        data.setdefault("billing_frequency", client.client_type.value)
    if client.start_date:
        data.setdefault("engagement_start_date", client.start_date.isoformat())
    if source_lead and getattr(source_lead, "payment_terms", None):
        data.setdefault("payment_terms", source_lead.payment_terms)
    return data


def _count_present(data: Dict[str, Any], fields: Iterable[str]) -> int:
    return sum(1 for field in fields if _has_value(data.get(field)))


def _rollup_tracked_items(items: list[dict[str, Any]]) -> tuple[ClientOnboardingItemStatus, int]:
    if not items:
        return ClientOnboardingItemStatus.MISSING, 0
    weights = {"missing": 0, "requested": 25, "received": 75, "verified": 100}
    total = sum(weights.get(str(item.get("status") or "missing"), 0) for item in items)
    percent = int(round(total / len(items)))
    if percent >= 100:
        return ClientOnboardingItemStatus.CONFIRMED, 100
    if percent >= 75:
        return ClientOnboardingItemStatus.VIEWED_RECEIVED, percent
    if percent >= 25:
        return ClientOnboardingItemStatus.REQUESTED, percent
    return ClientOnboardingItemStatus.MISSING, 0


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

    data = onboarding_data(client)
    commercial = _commercial_data(client, source_lead)
    primary_contact = next((contact for contact in contacts if getattr(contact, "is_primary_contact", False)), None)
    contact_status = ClientOnboardingItemStatus.CONFIRMED if primary_contact else ClientOnboardingItemStatus.MISSING

    requirement_fields = [
        "business_objective",
        "scope",
        "expected_deliverables",
        "target_audience",
        "important_deadlines",
    ]
    requirements = dict(data.get("requirements") or {})
    present_requirements = _count_present(requirements, requirement_fields)
    if present_requirements == len(requirement_fields):
        requirement_status = ClientOnboardingItemStatus.COMPLETED
        requirement_percent = 100
    elif present_requirements:
        requirement_status = ClientOnboardingItemStatus.PARTIALLY_RECEIVED
        requirement_percent = int(round((present_requirements / len(requirement_fields)) * 100))
    else:
        requirement_status = ClientOnboardingItemStatus.NOT_STARTED
        requirement_percent = 0
    project_ready = bool(projects)
    team_ready = bool(projects) and (
        _has_value(getattr(client, "account_owner_id", None))
        or _has_value(getattr(client, "assigned_to", None))
        or any(_has_value(getattr(project, "assigned_to", None)) or _has_value(getattr(project, "lead_id", None)) or _has_value(getattr(project, "team_member_ids", None)) for project in projects)
    )
    readiness = dict(data.get("start_readiness") or {})
    readiness_confirmed = readiness.get("ready") is True and _has_value(readiness.get("confirmed_by")) and _has_value(readiness.get("confirmed_at"))
    commercial_fields = ["deal_value", "billing_frequency", "payment_terms", "engagement_start_date"]
    commercial_ready = _count_present(commercial, commercial_fields) == len(commercial_fields)
    asset_system = _asset_data(client)
    asset_rollup = _asset_progress(asset_system["requirements"])
    if asset_rollup["required_ready"]:
        assets_status = ClientOnboardingItemStatus.CONFIRMED
    elif asset_rollup["required_verified"]:
        assets_status = ClientOnboardingItemStatus.PARTIALLY_RECEIVED
    elif any(item.get("status") == "received" for item in asset_system["requirements"] if item.get("required", True)):
        assets_status = ClientOnboardingItemStatus.VIEWED_RECEIVED
    elif any(item.get("status") == "requested" for item in asset_system["requirements"] if item.get("required", True)):
        assets_status = ClientOnboardingItemStatus.REQUESTED
    else:
        assets_status = ClientOnboardingItemStatus.MISSING
    assets_percent = asset_rollup["percent"]
    access_status, access_percent = _rollup_tracked_items(list(data.get("access") or []))

    kickoff_status = ClientOnboardingItemStatus.MISSING
    kickoff_percent = 0
    if kickoff:
        if _status_value(getattr(kickoff, "status", None)) == MeetingStatus.COMPLETED.value:
            kickoff_status = ClientOnboardingItemStatus.COMPLETED
            kickoff_percent = 100
        else:
            kickoff_status = ClientOnboardingItemStatus.SCHEDULED
            kickoff_percent = 70

    start_ready = (
        readiness_confirmed
        and commercial_ready
        and bool(primary_contact)
        and requirement_percent >= 100
        and project_ready
        and team_ready
        and kickoff_percent >= 100
    )

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
        _item_payload(definitions["payment_terms"], status=ClientOnboardingItemStatus.CONFIRMED if commercial_ready else ClientOnboardingItemStatus.PARTIALLY_RECEIVED if _count_present(commercial, commercial_fields) else ClientOnboardingItemStatus.MISSING, percent=100 if commercial_ready else int(round((_count_present(commercial, commercial_fields) / len(commercial_fields)) * 100)), linked_entity_type="client", validation={"commercial": commercial, "required_fields": commercial_fields}),
        _item_payload(definitions["primary_contact"], status=contact_status, percent=100 if primary_contact else 0, linked_entity_type="sales_contact" if primary_contact else None, linked_entity_id=str(primary_contact.id) if primary_contact else None),
        _item_payload(definitions["requirements"], status=requirement_status, percent=requirement_percent, linked_entity_type="client_onboarding", validation={"requirements": requirements, "required_fields": requirement_fields}),
        _item_payload(definitions["documents"], status=document_status, percent=document_percent, linked_entity_type="crm_document" if contract else "client_document" if client.documents else None, linked_entity_id=str(contract.id) if contract else None),
        _item_payload(definitions["brand_assets"], status=assets_status, percent=assets_percent, required=False, validation={"assets": asset_system["requirements"], "submissions": asset_system["submissions"], "progress": asset_rollup}),
        _item_payload(definitions["required_access"], status=access_status, percent=access_percent, required=False, validation={"access": list(data.get("access") or [])}),
        _item_payload(definitions["project_created"], status=ClientOnboardingItemStatus.CREATED if project_ready else ClientOnboardingItemStatus.NOT_STARTED, percent=100 if project_ready else 0, linked_entity_type="project" if projects else None, linked_entity_id=str(projects[0].id) if projects else None),
        _item_payload(definitions["team_assigned"], status=ClientOnboardingItemStatus.TEAM_ASSIGNED if team_ready else ClientOnboardingItemStatus.MISSING, percent=100 if team_ready else 0, assigned_owner_id=getattr(client, "account_owner_id", None) or getattr(client, "assigned_to", None)),
        _item_payload(definitions["kickoff_meeting"], status=kickoff_status, percent=kickoff_percent, linked_entity_type="meeting" if kickoff else None, linked_entity_id=str(kickoff.id) if kickoff else None),
        _item_payload(definitions["start_readiness"], status=ClientOnboardingItemStatus.READY if start_ready else ClientOnboardingItemStatus.NOT_STARTED, percent=100 if start_ready else 0, linked_entity_type="client_onboarding", validation={"readiness": readiness}),
    ]

    manual_keys = {"agreement"}
    for payload in calculated:
        existing = existing_items.get(payload["key"])
        if payload["key"] not in manual_keys or not existing:
            continue
        if payload["key"] == "agreement" and contract:
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


async def onboarding_snapshot_hash(client: Client, onboarding: Optional[Dict[str, Any]] = None) -> str:
    contacts = await load_contacts_for_client(client)
    projects = await _projects_for_client(client)
    kickoff = await _kickoff_for_client(client)
    source_lead = await _source_lead_for_client(client)
    primary_contact = next((contact for contact in contacts if getattr(contact, "is_primary_contact", False)), None)
    data = onboarding_data(client)
    if onboarding is None:
        onboarding = {"items": await calculate_onboarding_items(client)}
    snapshot = {
        "client": {"name": client.name, "company_name": client.company_name, "industry": client.industry},
        "primary_contact_id": str(primary_contact.id) if primary_contact else None,
        "commercial": _commercial_data(client, source_lead),
        "requirements": data.get("requirements") or {},
        "assets": data.get("assets") or [],
        "access": [
            {key: item.get(key) for key in ("name", "status", "reference") if item.get(key)}
            for item in list(data.get("access") or [])
        ],
        "project_ids": [str(project.id) for project in projects],
        "kickoff_id": str(kickoff.id) if kickoff else None,
        "onboarding_items": [
            {"key": item["key"], "status": item["status"], "completion_percent": item["completion_percent"]}
            for item in onboarding["items"]
        ],
    }
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _is_required_complete(item: Dict[str, Any]) -> bool:
    return not item.get("required", True) or int(item.get("completion_percent") or 0) >= 100


async def sync_client_onboarding(client: Client, actor: Optional[User] = None) -> Dict[str, Any]:
    now = utc_now()
    onboarding = await ClientOnboarding.find_one({"company_id": client.company_id, "client_id": str(client.id)})
    if not onboarding:
        onboarding = ClientOnboarding(company_id=client.company_id, client_id=str(client.id))
        await onboarding.insert()

    ensure_asset_requirements_payload = await ensure_asset_requirements(client)
    if ensure_asset_requirements_payload:
        await client.save()
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

    changed_freshness = False
    current_hash = await onboarding_snapshot_hash(client, serialize_onboarding(onboarding, saved_items))
    for document in client.documents or []:
        if document.get("category") == "onboarding_document" and document.get("snapshot_hash"):
            document["freshness"] = "current" if document.get("snapshot_hash") == current_hash else "stale"
            changed_freshness = True
    if changed_freshness:
        await client.save()

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
    data = onboarding_data(client)
    source_lead = await _source_lead_for_client(client)
    commercial = _commercial_data(client, source_lead)
    safe_name = "".join(ch if ch.isalnum() else "-" for ch in (client.company_name or client.name or "client")).strip("-").lower()[:40] or "client"
    filename = f"onboarding-{safe_name}-{uuid.uuid4().hex[:8]}.pdf"
    target_dir = upload_dir or Path("uploads") / "clients"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename

    primary_contact = next((contact for contact in contacts if getattr(contact, "is_primary_contact", False)), None)
    snapshot_hash = await onboarding_snapshot_hash(client, onboarding)

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    story: list[Any] = [Paragraph("Client Onboarding Summary", styles["Title"]), Spacer(1, 12)]

    def add_section(title: str, rows: list[tuple[str, Any]]) -> None:
        story.append(Paragraph(title, styles["Heading2"]))
        table = Table([[label, str(value or "Not provided")] for label, value in rows], colWidths=[150, 340])
        table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.extend([table, Spacer(1, 10)])

    add_section("Company / Client", [("Client", client.company_name or client.name), ("Account name", client.name), ("Industry", client.industry)])
    add_section("Primary Contact", [
        ("Name", primary_contact.full_name() if primary_contact else None),
        ("Designation", getattr(primary_contact, "designation", None)),
        ("Email", getattr(primary_contact, "email", None)),
        ("Phone", getattr(primary_contact, "phone", None)),
    ])
    add_section("Commercial", [
        ("Contract / deal value", commercial.get("deal_value")),
        ("Billing frequency", commercial.get("billing_frequency")),
        ("Payment terms", commercial.get("payment_terms")),
        ("Engagement start", commercial.get("engagement_start_date")),
        ("Billing contact", commercial.get("billing_contact")),
    ])
    requirements = data.get("requirements") or {}
    add_section("Requirements / Scope", [(key.replace("_", " ").title(), requirements.get(key)) for key in [
        "business_objective", "scope", "expected_deliverables", "target_audience", "important_deadlines",
        "competitors_references", "preferences", "special_requirements", "client_facing_notes",
    ]])
    add_section("Assets", [(item.get("name", "Asset"), item.get("status")) for item in list(data.get("assets") or [])] or [("Assets", "None recorded")])
    add_section("Access Status", [(item.get("name", "Access"), item.get("status")) for item in list(data.get("access") or [])] or [("Access", "None recorded")])
    add_section("Project / Kickoff", [
        ("Projects", ", ".join(project.name for project in projects)),
        ("Kickoff", kickoff.title if kickoff else None),
        ("Kickoff status", _status_value(kickoff.status) if kickoff else None),
        ("Kickoff date", getattr(kickoff, "meeting_date", None)),
    ])
    add_section("Confirmation", [("Onboarding progress", f"{onboarding['progress_percent']}%"), ("Client confirmation", "Please confirm or request changes on the shared page.")])
    SimpleDocTemplate(str(target), pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36).build(story)
    document = {
        "name": "Client Onboarding Document",
        "original_name": filename,
        "url": f"/api/v1/files/clients/{filename}",
        "type": "pdf",
        "category": "onboarding_document",
        "status": "generated",
        "generated_at": utc_now(),
        "generated_by": str(getattr(actor, "id", "")) if actor else None,
        "onboarding_progress_percent": onboarding["progress_percent"],
        "snapshot_hash": snapshot_hash,
        "freshness": "current",
        "sensitive": False,
    }
    client.documents = [doc for doc in (client.documents or []) if doc.get("category") != "onboarding_document"]
    client.documents.append(document)
    client.updated_at = utc_now()
    await client.save()
    await sync_client_onboarding(client, actor)
    return document
