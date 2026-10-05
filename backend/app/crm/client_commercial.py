from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from beanie.exceptions import CollectionWasNotInitialized
from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.core.clock import ClockService
from app.models.client import Client, ClientStatus
from app.models.client_service import ClientService, ClientServiceStatus
from app.models.invoice import Invoice, InvoiceStatus
from app.models.msa import MSA, MSAStatus
from app.models.user import User


RENEWAL_STATUSES = {"upcoming", "discussion_started", "terms_sent", "renewed", "renewal_failed", "churned"}
CHURN_REASONS = {
    "Price",
    "Budget",
    "Poor Service",
    "Delivery Delay",
    "Communication Issue",
    "Competitor",
    "No Longer Needed",
    "Business Closed",
    "Other",
}


def _as_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _serialize_dt(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return ClockService.parse_to_utc(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date")


def _payment_terms(client: Client) -> Optional[str]:
    onboarding = ((client.lifecycle_metadata or {}).get("onboarding") or {}).get("commercial") or {}
    renewal = (client.lifecycle_metadata or {}).get("renewal") or {}
    return renewal.get("payment_terms") or onboarding.get("payment_terms")


def _billing_frequency(client: Client) -> Optional[str]:
    onboarding = ((client.lifecycle_metadata or {}).get("onboarding") or {}).get("commercial") or {}
    renewal = (client.lifecycle_metadata or {}).get("renewal") or {}
    return renewal.get("billing_frequency") or onboarding.get("billing_frequency") or (client.client_type.value if client.client_type else None)


async def load_client_finance(client: Client, invoices: Optional[List[Invoice]] = None, services: Optional[List[ClientService]] = None) -> Dict[str, Any]:
    if invoices is None:
        try:
            invoices = await Invoice.find({"company_id": str(client.company_id), "client_id": str(client.id)}).sort("-invoice_date").to_list()
        except CollectionWasNotInitialized:
            invoices = []
    if services is None:
        try:
            services = await ClientService.find({"company_id": str(client.company_id), "client_id": str(client.id)}).to_list()
        except CollectionWasNotInitialized:
            services = []
    try:
        agreements = await MSA.find(
            {"company_id": str(client.company_id), "client_id": str(client.id), "status": {"$in": [MSAStatus.COMPLETED, MSAStatus.CLIENT_SIGNED, MSAStatus.STAFFING_SIGNED]}}
        ).sort("-updated_at").to_list()
    except CollectionWasNotInitialized:
        agreements = []

    now = utc_now()
    total_invoiced = sum(_as_float(getattr(invoice, "total_amount", 0)) for invoice in invoices if getattr(invoice, "status", None) != InvoiceStatus.CANCELLED)
    total_paid = sum(_as_float(getattr(invoice, "total_received", 0)) for invoice in invoices if getattr(invoice, "status", None) != InvoiceStatus.CANCELLED)
    outstanding = sum(_as_float(getattr(invoice, "outstanding_amount", 0)) for invoice in invoices if getattr(invoice, "status", None) not in {InvoiceStatus.CANCELLED, InvoiceStatus.PAID})
    overdue_invoices = [
        invoice for invoice in invoices
        if getattr(invoice, "status", None) not in {InvoiceStatus.CANCELLED, InvoiceStatus.PAID}
        and _as_float(getattr(invoice, "outstanding_amount", 0)) > 0
        and getattr(invoice, "due_date", None)
        and invoice.due_date < now
    ]
    next_invoice = next(
        (
            invoice for invoice in sorted(invoices, key=lambda item: item.due_date or datetime.max)
            if getattr(invoice, "status", None) not in {InvoiceStatus.CANCELLED, InvoiceStatus.PAID} and getattr(invoice, "due_date", None) and invoice.due_date >= now
        ),
        None,
    )
    active_service_value = sum(_as_float(service.pricing_value) for service in services if getattr(service, "status", None) == ClientServiceStatus.ACTIVE)
    total_service_value = sum(_as_float(service.pricing_value) for service in services)
    contract_value = _as_float(client.budget) or total_service_value or total_invoiced
    monthly_value = active_service_value if _billing_frequency(client) == "monthly" else 0

    return {
        "contract_value": contract_value,
        "monthly_value": monthly_value,
        "client_value": contract_value,
        "total_invoiced": total_invoiced,
        "total_paid": total_paid,
        "outstanding": outstanding,
        "overdue": sum(_as_float(invoice.outstanding_amount) for invoice in overdue_invoices),
        "overdue_count": len(overdue_invoices),
        "next_invoice": {
            "id": str(next_invoice.id),
            "invoice_number": next_invoice.invoice_number,
            "due_date": next_invoice.due_date,
            "outstanding_amount": getattr(next_invoice, "outstanding_amount", 0),
        } if next_invoice else None,
        "payment_terms": _payment_terms(client),
        "billing_frequency": _billing_frequency(client),
        "agreement_count": len(agreements),
        "latest_agreement": {
            "id": str(agreements[0].id),
            "msa_number": agreements[0].msa_number,
            "status": agreements[0].status.value if getattr(agreements[0], "status", None) else None,
            "effective_date": agreements[0].effective_date,
            "completed_at": agreements[0].completed_at,
        } if agreements else None,
    }


def current_renewal(client: Client) -> Dict[str, Any]:
    metadata = dict(client.lifecycle_metadata or {})
    return dict(metadata.get("renewal") or {})


def churn_details(client: Client) -> Dict[str, Any]:
    metadata = dict(client.lifecycle_metadata or {})
    return dict(metadata.get("churn") or {})


def _append_history(metadata: Dict[str, Any], key: str, entry: Dict[str, Any]) -> None:
    history_key = f"{key}_history"
    metadata[history_key] = list(metadata.get(history_key) or []) + [entry]


async def save_renewal_details(client: Client, current_user: User, payload: Dict[str, Any], *, mark_started: bool = False) -> Dict[str, Any]:
    now = utc_now()
    metadata = dict(client.lifecycle_metadata or {})
    renewal = dict(metadata.get("renewal") or {})
    if mark_started and not renewal.get("status"):
        renewal["status"] = "discussion_started"
        renewal["started_at"] = now.isoformat()
    for key in ("renewal_owner_id", "renewal_status", "notes", "payment_terms", "billing_frequency"):
        if key in payload and payload[key] is not None:
            target_key = "status" if key == "renewal_status" else key
            value = payload[key].strip() if isinstance(payload[key], str) else payload[key]
            if target_key == "status" and value and value not in RENEWAL_STATUSES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid renewal status")
            renewal[target_key] = value
    if payload.get("renewal_date") is not None:
        renewal["renewal_date"] = _serialize_dt(_parse_date(payload.get("renewal_date")))
    if payload.get("contract_end_date") is not None:
        renewal["contract_end_date"] = _serialize_dt(_parse_date(payload.get("contract_end_date")))
    if payload.get("renewal_value") is not None:
        renewal["renewal_value"] = _as_float(payload.get("renewal_value"))
    renewal["updated_at"] = now.isoformat()
    renewal["updated_by"] = str(current_user.id)
    metadata["renewal"] = renewal
    _append_history(metadata, "renewal", {"action": "renewal_updated", "at": now.isoformat(), "actor": str(current_user.id), "snapshot": dict(renewal)})
    client.lifecycle_metadata = metadata
    client.updated_at = now
    await client.save()
    return renewal


async def mark_client_renewed(client: Client, current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = utc_now()
    metadata = dict(client.lifecycle_metadata or {})
    previous = dict(metadata.get("renewal") or {})
    renewal = dict(previous)
    renewal["status"] = "renewed"
    renewal["renewed_at"] = now.isoformat()
    renewal["updated_by"] = str(current_user.id)
    for key in ("notes", "payment_terms", "billing_frequency"):
        if payload.get(key) is not None:
            renewal[key] = payload.get(key)
    if payload.get("renewal_date") is not None:
        renewal["renewal_date"] = _serialize_dt(_parse_date(payload.get("renewal_date")))
    if payload.get("contract_end_date") is not None:
        end_date = _parse_date(payload.get("contract_end_date"))
        renewal["contract_end_date"] = _serialize_dt(end_date)
        client.delivery_date = end_date
    if payload.get("renewal_value") is not None:
        renewal["renewal_value"] = _as_float(payload.get("renewal_value"))
        client.budget = renewal["renewal_value"]
    metadata["renewal"] = renewal
    _append_history(metadata, "renewal", {"action": "renewed", "at": now.isoformat(), "actor": str(current_user.id), "previous": previous, "snapshot": dict(renewal)})
    client.lifecycle_metadata = metadata
    client.status = ClientStatus.ACTIVE
    client.lifecycle_reason = payload.get("notes") or "Client renewed"
    client.updated_at = now
    await client.save()
    return renewal


async def mark_client_churned(client: Client, current_user: User, payload: Dict[str, Any], *, end_active_services: bool = True) -> Dict[str, Any]:
    reason = str(payload.get("churn_reason") or payload.get("reason") or "").strip()
    end_date = _parse_date(payload.get("end_date"))
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Churn reason is required")
    if reason not in CHURN_REASONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid churn reason")
    if not end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Churn end date is required")

    now = utc_now()
    revenue_lost = payload.get("revenue_lost")
    if revenue_lost is None:
        finance = await load_client_finance(client)
        revenue_lost = finance["monthly_value"] or finance["client_value"]
    churn = {
        "reason": reason,
        "end_date": end_date.isoformat(),
        "notes": payload.get("notes"),
        "revenue_lost": _as_float(revenue_lost),
        "churned_at": now.isoformat(),
        "churned_by": str(current_user.id),
    }
    metadata = dict(client.lifecycle_metadata or {})
    metadata["churn"] = churn
    renewal = dict(metadata.get("renewal") or {})
    if renewal:
        renewal["status"] = "churned"
        metadata["renewal"] = renewal
    _append_history(metadata, "churn", {"action": "churned", "at": now.isoformat(), "actor": str(current_user.id), "snapshot": dict(churn)})

    ended_services: List[str] = []
    if end_active_services:
        try:
            services = await ClientService.find({"company_id": str(client.company_id), "client_id": str(client.id), "status": ClientServiceStatus.ACTIVE}).to_list()
        except CollectionWasNotInitialized:
            services = []
        for service in services:
            service.status = ClientServiceStatus.ENDED
            service.end_date = service.end_date or end_date
            service.updated_at = now
            await service.save()
            ended_services.append(str(service.id))

    client.lifecycle_metadata = metadata
    client.status = ClientStatus.CHURNED
    client.lifecycle_reason = reason
    client.delivery_date = end_date
    client.updated_at = now
    await client.save()
    return {**churn, "ended_service_ids": ended_services}


async def archive_client(client: Client, current_user: User, reason: str) -> Dict[str, Any]:
    if not reason or not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archive reason is required")
    now = utc_now()
    metadata = dict(client.lifecycle_metadata or {})
    archive = {"reason": reason.strip(), "archived_at": now.isoformat(), "archived_by": str(current_user.id)}
    metadata["archive"] = archive
    _append_history(metadata, "archive", {"action": "archived", "at": now.isoformat(), "actor": str(current_user.id), "snapshot": archive})
    client.lifecycle_metadata = metadata
    client.status = ClientStatus.ARCHIVED
    client.lifecycle_reason = reason.strip()
    client.updated_at = now
    await client.save()
    return archive


def renewal_due_hint(client: Client, finance: Dict[str, Any]) -> Dict[str, Any]:
    renewal = current_renewal(client)
    contract_end_raw = renewal.get("contract_end_date") or _serialize_dt(client.delivery_date)
    due = False
    try:
        contract_end = _parse_date(contract_end_raw) if isinstance(contract_end_raw, str) else contract_end_raw
        due = bool(contract_end and contract_end <= utc_now() + timedelta(days=30) and renewal.get("status") not in {"renewed", "churned"})
    except HTTPException:
        contract_end = None
    return {
        "renewal": renewal,
        "churn": churn_details(client),
        "renewal_due": due,
        "contract_end_date": contract_end,
        "payment_terms": finance.get("payment_terms"),
        "billing_frequency": finance.get("billing_frequency"),
    }
