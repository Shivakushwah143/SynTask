from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.core.rbac_visibility import require_owned_record_access
from app.crm import documents
from app.models.crm_activity import CRMActivityPriority, CRMActivityStatus
from app.models.sales_discovery_audit import SalesAudit, SalesDiscovery, SalesWorkspaceStatus
from app.models.sales_product import SalesProduct
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole
from app.services.notification_service import notification_service


EDIT_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}

DISCOVERY_SECTIONS = [
    "business_information",
    "current_marketing",
    "problems",
    "goals",
    "budget",
    "decision_maker",
    "competitors",
    "timeline",
    "summary",
]
AUDIT_SECTIONS = [
    "website",
    "google_presence",
    "social_media",
    "seo",
    "competitors",
    "swot",
    "recommendations",
]


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set)):
        return any(_has_value(item) for item in value)
    if isinstance(value, dict):
        return any(_has_value(item) for item in value.values())
    return True


def _deep_merge(existing: Any, patch: Any) -> Any:
    if isinstance(existing, dict) and isinstance(patch, dict):
        merged = dict(existing)
        for key, value in patch.items():
            merged[key] = _deep_merge(merged.get(key), value)
        return merged
    return deepcopy(patch)


def _completion(sections: list[str], workspace: Any) -> dict[str, Any]:
    checklist = []
    for section in sections:
        done = _has_value(getattr(workspace, section, None))
        checklist.append({"key": section, "label": section.replace("_", " ").title(), "complete": done})
    complete_count = sum(1 for item in checklist if item["complete"])
    percent = round((complete_count / len(checklist)) * 100) if checklist else 0
    return {"percent": percent, "checklist": checklist}


def _serialize(workspace: SalesDiscovery | SalesAudit) -> dict[str, Any]:
    data = workspace.model_dump()
    data["id"] = str(workspace.id)
    data["status"] = workspace.status.value
    return data


async def _lead_for_user(current_user: User, lead_id: str) -> SalesProspect:
    lead = await SalesProspect.get(lead_id)
    if not lead or lead.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    await require_owned_record_access(current_user, lead, ownership_fields=("assigned_to", "assigned_by", "created_by"))
    return lead


def _assert_can_edit(current_user: User) -> None:
    if current_user.role not in EDIT_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _activity(lead: SalesProspect, current_user: User, title: str, metadata: Optional[dict[str, Any]] = None) -> None:
    actor_name = f"{getattr(current_user, 'first_name', '') or ''} {getattr(current_user, 'last_name', '') or ''}".strip() or getattr(current_user, "email", "")
    await notification_service.update_crm_activity(
        company_id=str(lead.company_id),
        entity_type="lead",
        entity_id=str(lead.id),
        activity_type="note",
        title=title,
        description=title,
        owner_id=str(current_user.id),
        owner_name=actor_name,
        status=CRMActivityStatus.COMPLETED.value,
        priority=CRMActivityPriority.MEDIUM.value,
        due_date=None,
        scheduled_at=None,
        created_by=str(current_user.id),
        created_by_name=actor_name,
        metadata=metadata or {},
        idempotency_key=f"sales-discovery-audit:{lead.id}:{title}:{utc_now().timestamp()}",
    )


async def get_discovery(current_user: User, lead_id: str) -> dict[str, Any]:
    lead = await _lead_for_user(current_user, lead_id)
    discovery = await SalesDiscovery.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    if not discovery:
        discovery = SalesDiscovery(company_id=str(lead.company_id), lead_id=str(lead.id), created_by=str(current_user.id), updated_by=str(current_user.id))
        discovery.completion = _completion(DISCOVERY_SECTIONS, discovery)
        await discovery.insert()
        await _activity(lead, current_user, "Discovery started", {"discovery_id": str(discovery.id), "version": discovery.version})
    return {"discovery": _serialize(discovery)}


async def patch_discovery(current_user: User, lead_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _assert_can_edit(current_user)
    lead = await _lead_for_user(current_user, lead_id)
    discovery = (await get_discovery(current_user, lead_id))["discovery"]
    document = await SalesDiscovery.get(discovery["id"])
    for section in DISCOVERY_SECTIONS:
        if section in payload:
            setattr(document, section, _deep_merge(getattr(document, section, {}), payload[section]))
    if "budget" in payload:
        budget_value = payload.get("budget", {}).get("expected_budget")
        if budget_value not in (None, ""):
            lead.budget = float(budget_value)
            lead.updated_at = utc_now()
            await lead.save()
    if "decision_maker" in payload:
        decision_name = payload.get("decision_maker", {}).get("name") or payload.get("decision_maker", {}).get("final_approver")
        if decision_name:
            lead.decision_maker = decision_name
            lead.updated_at = utc_now()
            await lead.save()
    if "timeline" in payload:
        target_timeline = payload.get("timeline", {}).get("target_timeframe") or payload.get("timeline", {}).get("expected_duration")
        if target_timeline:
            lead.timeline = target_timeline
            lead.updated_at = utc_now()
            await lead.save()
    document.status = SalesWorkspaceStatus.IN_PROGRESS if document.status == SalesWorkspaceStatus.DRAFT else document.status
    document.version += 1
    document.updated_by = str(current_user.id)
    document.updated_at = utc_now()
    document.completion = _completion(DISCOVERY_SECTIONS, document)
    await document.save()
    await _activity(lead, current_user, "Discovery updated", {"discovery_id": str(document.id), "version": document.version})
    return {"discovery": _serialize(document)}


def _discovery_missing(discovery: SalesDiscovery) -> list[str]:
    missing = []
    if not _has_value(discovery.business_information):
        missing.append("Business information")
    if not _has_value(discovery.problems.get("selected") or discovery.problems.get("notes")):
        missing.append("Primary problem")
    if not _has_value(discovery.goals.get("primary_goal")):
        missing.append("Primary business goal")
    if not _has_value(discovery.budget.get("budget_confirmed")):
        missing.append("Budget status")
    if not _has_value(discovery.decision_maker.get("identified") or discovery.decision_maker.get("name")):
        missing.append("Decision maker")
    return missing


async def complete_discovery(current_user: User, lead_id: str) -> dict[str, Any]:
    _assert_can_edit(current_user)
    lead = await _lead_for_user(current_user, lead_id)
    await get_discovery(current_user, lead_id)
    discovery = await SalesDiscovery.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    missing = _discovery_missing(discovery)
    if missing:
        raise HTTPException(status_code=422, detail={"code": "DISCOVERY_COMPLETION_BLOCKED", "message": "Discovery is almost complete.", "missing_items": missing})
    discovery.status = SalesWorkspaceStatus.COMPLETED
    discovery.completed_at = utc_now()
    discovery.completed_by = str(current_user.id)
    discovery.updated_by = str(current_user.id)
    discovery.updated_at = utc_now()
    discovery.completion = _completion(DISCOVERY_SECTIONS, discovery)
    await discovery.save()
    lead.discovery_outcome = lead.discovery_outcome or "need_proposal"
    lead.updated_at = utc_now()
    await lead.save()
    await _activity(lead, current_user, "Discovery completed", {"discovery_id": str(discovery.id), "version": discovery.version})
    return {"discovery": _serialize(discovery)}


async def get_audit(current_user: User, lead_id: str) -> dict[str, Any]:
    lead = await _lead_for_user(current_user, lead_id)
    audit = await SalesAudit.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    if not audit:
        audit = SalesAudit(company_id=str(lead.company_id), lead_id=str(lead.id), created_by=str(current_user.id), updated_by=str(current_user.id))
        audit.completion = _completion(AUDIT_SECTIONS, audit)
        await audit.insert()
        await _activity(lead, current_user, "Audit started", {"audit_id": str(audit.id), "version": audit.version})
    return {"audit": _serialize(audit)}


async def patch_audit(current_user: User, lead_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _assert_can_edit(current_user)
    lead = await _lead_for_user(current_user, lead_id)
    await get_audit(current_user, lead_id)
    audit = await SalesAudit.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    for section in AUDIT_SECTIONS + ["findings", "audit_source"]:
        if section in payload:
            setattr(audit, section, _deep_merge(getattr(audit, section, {}), payload[section]))
    audit.status = SalesWorkspaceStatus.IN_PROGRESS if audit.status == SalesWorkspaceStatus.DRAFT else audit.status
    audit.version += 1
    audit.updated_by = str(current_user.id)
    audit.updated_at = utc_now()
    audit.completion = _completion(AUDIT_SECTIONS, audit)
    await audit.save()
    if "recommendations" in payload:
        await _activity(lead, current_user, "Recommendation added", {"audit_id": str(audit.id), "version": audit.version})
    else:
        await _activity(lead, current_user, "Audit updated", {"audit_id": str(audit.id), "version": audit.version})
    return {"audit": _serialize(audit)}


async def complete_audit(current_user: User, lead_id: str) -> dict[str, Any]:
    _assert_can_edit(current_user)
    lead = await _lead_for_user(current_user, lead_id)
    await get_audit(current_user, lead_id)
    audit = await SalesAudit.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    if not _proposal_recommendations(audit):
        raise HTTPException(status_code=422, detail={"code": "AUDIT_COMPLETION_BLOCKED", "message": "Audit needs at least one proposal recommendation.", "missing_items": ["At least one recommendation marked Include in proposal"]})
    audit.status = SalesWorkspaceStatus.COMPLETED
    audit.completed_at = utc_now()
    audit.completed_by = str(current_user.id)
    audit.updated_by = str(current_user.id)
    audit.updated_at = utc_now()
    audit.completion = _completion(AUDIT_SECTIONS, audit)
    await audit.save()
    await _activity(lead, current_user, "Audit completed", {"audit_id": str(audit.id), "version": audit.version})
    return {"audit": _serialize(audit)}


def _proposal_recommendations(audit: Optional[SalesAudit]) -> list[dict[str, Any]]:
    if not audit:
        return []
    return [item for item in (audit.recommendations or []) if item.get("include_in_proposal")]


async def _product_map(company_id: str, recommendations: list[dict[str, Any]], product_ids: Optional[list[str]] = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    products = await SalesProduct.find({"company_id": company_id, "deleted": False}).to_list()
    items = []
    unmapped = []
    selected_product_ids = {str(item) for item in (product_ids or []) if item}
    for product in products:
        if str(product.id) not in selected_product_ids:
            continue
        items.append({
            "description": product.name,
            "quantity": "1",
            "unit": product.unit or "service",
            "unit_price": str(product.rate or 0),
            "discount": "0",
            "tax_rate": "18",
            "tax_type": "gst",
            "display_order": len(items),
            "sales_product_id": str(product.id),
            "source": "lead_product",
        })
    for index, rec in enumerate(recommendations):
        service = str(rec.get("suggested_service") or rec.get("category") or rec.get("title") or "").lower()
        matched = next((product for product in products if service and (service in product.name.lower() or product.name.lower() in service)), None)
        description = rec.get("title") or rec.get("suggested_service") or "Recommended service"
        if matched:
            items.append({
                "description": matched.name,
                "quantity": "1",
                "unit": matched.unit or "service",
                "unit_price": str(matched.rate or 0),
                "discount": "0",
                "tax_rate": "18",
                "tax_type": "gst",
                "display_order": len(items),
                "source_recommendation": rec.get("title"),
                "sales_product_id": str(matched.id),
            })
        else:
            items.append({"description": description, "quantity": "1", "unit": "service", "unit_price": "0", "discount": "0", "tax_rate": "18", "tax_type": "gst", "display_order": len(items), "source_recommendation": rec.get("title"), "mapping_status": "unmapped", "requires_pricing": True})
            unmapped.append({"title": description, "suggested_service": rec.get("suggested_service"), "message": "Recommended service is not mapped to a Sales Product."})
    return items, unmapped


async def generate_quotation_draft(current_user: User, lead_id: str) -> dict[str, Any]:
    _assert_can_edit(current_user)
    lead = await _lead_for_user(current_user, lead_id)
    discovery = await SalesDiscovery.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    audit = await SalesAudit.find_one({"company_id": str(lead.company_id), "lead_id": str(lead.id)})
    recommendations = _proposal_recommendations(audit)
    lead_problem = getattr(lead, "pain_points", None) or getattr(lead, "requirement", None)
    lead_goal = getattr(lead, "requirement", None) or getattr(lead, "next_action", None)
    lead_products = list(getattr(lead, "product_ids", None) or [])
    missing = []
    if not _has_value(getattr(lead, "company_name", None) or getattr(lead, "prospect_name", None)) and (not discovery or not _has_value(discovery.business_information)):
        missing.append("Business/customer identity")
    if not _has_value(lead_problem) and (not discovery or not _has_value(discovery.problems.get("selected") or discovery.problems.get("notes"))):
        missing.append("Primary problem")
    if not _has_value(lead_goal) and (not discovery or not _has_value(discovery.goals.get("primary_goal"))):
        missing.append("Primary business goal")
    if not recommendations and not lead_products:
        missing.append("At least one recommendation/service")
    if missing:
        raise HTTPException(status_code=422, detail={"code": "QUOTATION_GENERATION_BLOCKED", "message": "Complete these items before generating quotation.", "missing_items": missing})

    items, unmapped = await _product_map(str(lead.company_id), recommendations, lead_products)
    discovery_snapshot = _serialize(discovery) if discovery else None
    audit_snapshot = _serialize(audit) if audit else None
    source_snapshot = {
        "generated_from": {
            "discovery": {"id": str(discovery.id), "version": discovery.version, "updated_at": discovery.updated_at.isoformat() if discovery and discovery.updated_at else None} if discovery else None,
            "audit": {"id": str(audit.id), "version": audit.version, "updated_at": audit.updated_at.isoformat() if audit and audit.updated_at else None} if audit else None,
        },
        "discovery": discovery_snapshot,
        "audit": audit_snapshot,
        "unmapped_recommendations": unmapped,
    }
    objective = (discovery.goals.get("primary_goal") if discovery else None) or lead_goal or ""
    requirements = (", ".join(discovery.problems.get("selected") or []) or discovery.problems.get("notes") if discovery else None) or lead_problem or ""
    recommendation_lines = [f"- {rec.get('title') or rec.get('suggested_service')}: {rec.get('description') or ''}".strip() for rec in recommendations]
    payload = {
        "document_type": "quotation",
        "title": f"Quotation Draft for {lead.company_name or lead.prospect_name or 'Lead'}",
        "items": items,
        "terms": "Draft generated from Discovery and Audit. Review scope, pricing, taxes, discounts, validity, and payment terms before sending.",
        "notes": "\n".join([
            f"Primary objective: {objective}",
            f"Client requirements: {requirements}",
            "Recommended solution:",
            *recommendation_lines,
        ]),
        "scope": "\n".join(recommendation_lines),
        "deliverables": "\n".join(recommendation_lines),
        "proposal_context": {
            "client_requirements": requirements,
            "objectives": objective,
            "timeline": discovery.timeline if discovery else getattr(lead, "timeline", None),
            "budget_context": discovery.budget if discovery else {"expected_budget": getattr(lead, "budget", None)},
            "current_challenges": audit.swot.get("weaknesses") if audit else [],
            "opportunity_statement": audit.swot.get("opportunities") if audit else [],
        },
        "source_snapshot": source_snapshot,
    }
    result = await documents.create_document(current_user, lead_id, payload)
    document = result["document"]
    await _activity(lead, current_user, "Quotation draft generated from Discovery/Audit", {"crm_document_id": document["id"], "generated_from": source_snapshot["generated_from"]})
    return {**result, "unmapped_recommendations": unmapped}
