from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Optional
from xml.sax.saxutils import escape

from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pymongo import ReturnDocument

from app.core.clock import utc_now
from app.core.config import settings
from app.core.database import get_database
from app.core.rbac_visibility import require_owned_record_access
from app.models.crm_activity import CRMActivityPriority, CRMActivityStatus
from app.models.crm_document import CRMDocument, CRMDocumentEvent, CRMDocumentSequence, CRMDocumentStatus, CRMDocumentType
from app.models.sales_prospect import SalesProspect
from app.models.user import User
from app.services.file_service import FileService
from app.services.notification_service import notification_service

MONEY = Decimal("0.01")
UPLOAD_DIR = Path(__file__).resolve().parents[2] / settings.UPLOAD_DIR / "crm-documents"


def _money(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(MONEY, rounding=ROUND_HALF_UP)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _display_name(user: User) -> str:
    return f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip() or getattr(user, "email", "") or str(user.id)


def _public_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/public/crm-documents/{token}"


def _parse_optional_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value)
    try:
        if len(text) == 10:
            return datetime.fromisoformat(f"{text}T00:00:00")
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date value")


def _safe_pdf_file(document: CRMDocument) -> Path:
    raw = document.pdf_file_path or document.source_file_path or ""
    path = Path(raw).resolve()
    root = UPLOAD_DIR.resolve()
    if not raw or root not in path.parents:
        raise HTTPException(status_code=404, detail="PDF not found")
    if not path.exists() or path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=404, detail="PDF not found")
    return path


async def _lead_for_user(current_user: User, lead_id: str) -> SalesProspect:
    lead = await SalesProspect.get(lead_id)
    if not lead or lead.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    await require_owned_record_access(current_user, lead, ownership_fields=("assigned_to", "assigned_by", "created_by"))
    return lead


async def _document_for_user(current_user: User, lead_id: str, document_id: str) -> tuple[SalesProspect, CRMDocument]:
    lead = await _lead_for_user(current_user, lead_id)
    document = await CRMDocument.get(document_id)
    if not document or document.company_id != str(lead.company_id) or document.lead_id != str(lead.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return lead, document


def calculate_totals(items: list[dict[str, Any]], overall_discount: Any = 0) -> dict[str, Decimal]:
    subtotal = Decimal("0")
    discount_total = _money(overall_discount)
    tax_total = Decimal("0")
    normalized = []
    for index, item in enumerate(items or []):
        quantity = _money(item.get("quantity", 1))
        unit_price = _money(item.get("unit_price", 0))
        discount = _money(item.get("discount", 0))
        tax_rate = _money(item.get("tax_rate", 0))
        taxable = max(Decimal("0"), quantity * unit_price - discount)
        tax = (taxable * tax_rate / Decimal("100")).quantize(MONEY, rounding=ROUND_HALF_UP)
        line_total = (taxable + tax).quantize(MONEY, rounding=ROUND_HALF_UP)
        subtotal += taxable
        discount_total += discount
        tax_total += tax
        normalized.append({
            "description": str(item.get("description") or "Item"),
            "quantity": str(quantity),
            "unit": str(item.get("unit") or "unit"),
            "unit_price": str(unit_price),
            "discount": str(discount),
            "tax_rate": str(tax_rate),
            "tax_type": str(item.get("tax_type") or "gst"),
            "line_total": str(line_total),
            "display_order": int(item.get("display_order", index)),
        })
    grand_total = max(Decimal("0"), subtotal + tax_total - _money(overall_discount)).quantize(MONEY, rounding=ROUND_HALF_UP)
    return {
        "subtotal": subtotal.quantize(MONEY),
        "discount_total": discount_total.quantize(MONEY),
        "tax_total": tax_total.quantize(MONEY),
        "grand_total": grand_total,
        "items": normalized,
    }


async def _next_document_number(company_id: str, document_type: CRMDocumentType) -> str:
    year = utc_now().year
    collection = get_database()[CRMDocumentSequence.Settings.name]
    result = await collection.find_one_and_update(
        {"company_id": company_id, "document_type": document_type.value, "year": year},
        {
            "$inc": {"next_number": 1},
            "$setOnInsert": {
                "company_id": company_id,
                "year": year,
                "document_type": document_type.value,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    number = int((result or {}).get("next_number", 1))
    prefix = "QUO" if document_type == CRMDocumentType.QUOTATION else "CON"
    return f"{prefix}-{year}-{number:04d}"


async def _event(document: CRMDocument, event_type: str, actor: Optional[User] = None, **metadata: Any) -> None:
    actor_name = _display_name(actor) if actor else None
    await CRMDocumentEvent(
        company_id=document.company_id,
        lead_id=document.lead_id,
        document_id=str(document.id),
        event_type=event_type,
        actor_id=str(actor.id) if actor else None,
        actor_name=actor_name,
        ip_address=metadata.pop("ip_address", None),
        user_agent=metadata.pop("user_agent", None),
        metadata=metadata,
    ).insert()
    await notification_service.update_crm_activity(
        company_id=document.company_id,
        entity_type="lead",
        entity_id=document.lead_id,
        activity_type="note",
        title=f"{document.document_type.value.title()} {event_type.replace('_', ' ')}",
        description=f"{document.document_number} {event_type.replace('_', ' ')}",
        owner_id=str(actor.id) if actor else document.created_by,
        owner_name=actor_name,
        status=CRMActivityStatus.COMPLETED.value,
        priority=CRMActivityPriority.MEDIUM.value,
        due_date=None,
        scheduled_at=None,
        created_by=str(actor.id) if actor else document.created_by or "system",
        created_by_name=actor_name or "System",
        metadata={"crm_document_id": str(document.id), "event_type": event_type},
        idempotency_key=f"crm-document:{document.id}:{event_type}:{metadata.get('idempotency_key') or utc_now().timestamp()}",
    )


def serialize(document: CRMDocument, include_token: bool = False) -> dict[str, Any]:
    data = document.model_dump()
    data["id"] = str(document.id)
    data["document_type"] = document.document_type.value
    data["status"] = document.status.value
    for key in ["subtotal", "discount_total", "tax_total", "grand_total"]:
        data[key] = str(getattr(document, key))
    if not include_token:
        data.pop("token_hash", None)
    return data


def public_serialize(document: CRMDocument) -> dict[str, Any]:
    data = serialize(document)
    for key in ["company_id", "lead_id", "created_by", "token_hash", "token_expires_at", "token_revoked_at", "send_error", "pdf_file_path", "source_file_path"]:
        data.pop(key, None)
    snapshot = data.get("content_snapshot") or {}
    lead = dict(snapshot.get("lead") or {})
    snapshot["lead"] = {key: lead.get(key) for key in ["name", "company_name", "email", "phone"] if lead.get(key)}
    data["content_snapshot"] = snapshot
    return data


async def list_documents(current_user: User, lead_id: str) -> dict[str, Any]:
    lead = await _lead_for_user(current_user, lead_id)
    documents = await CRMDocument.find({"company_id": str(lead.company_id), "lead_id": str(lead.id)}).sort("-created_at").to_list()
    return {"documents": [serialize(document) for document in documents]}


async def create_document(current_user: User, lead_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    lead = await _lead_for_user(current_user, lead_id)
    document_type = CRMDocumentType(payload.get("document_type") or CRMDocumentType.QUOTATION.value)
    totals = calculate_totals(payload.get("items") or [], payload.get("overall_discount") or 0)
    document = CRMDocument(
        company_id=str(lead.company_id),
        lead_id=str(lead.id),
        document_type=document_type,
        document_number=await _next_document_number(str(lead.company_id), document_type),
        title=payload.get("title") or f"{document_type.value.title()} for {lead.company_name or lead.prospect_name or 'Lead'}",
        currency=payload.get("currency") or "INR",
        subtotal=totals["subtotal"],
        discount_total=totals["discount_total"],
        tax_total=totals["tax_total"],
        grand_total=totals["grand_total"],
        valid_until=_parse_optional_datetime(payload.get("valid_until")),
        terms=payload.get("terms"),
        notes=payload.get("notes"),
        content_snapshot={
            "lead": {"name": lead.prospect_name, "company_name": lead.company_name, "email": str(lead.email or ""), "phone": lead.phone},
            "items": totals["items"],
            "parties": payload.get("parties"),
            "scope": payload.get("scope"),
            "deliverables": payload.get("deliverables"),
            "price": payload.get("price"),
            "payment_schedule": payload.get("payment_schedule"),
            "start_date": payload.get("start_date"),
            "end_date": payload.get("end_date"),
            "confidentiality": payload.get("confidentiality"),
            "termination": payload.get("termination"),
            "clauses": payload.get("clauses") or [],
            "proposal_context": payload.get("proposal_context") or {},
            "source_snapshot": payload.get("source_snapshot") or {},
        },
        created_by=str(current_user.id),
    )
    await document.insert()
    await _event(document, "created", current_user)
    return {"document": serialize(document)}


async def update_document(current_user: User, lead_id: str, document_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _, document = await _document_for_user(current_user, lead_id, document_id)
    if document.status not in {CRMDocumentStatus.DRAFT, CRMDocumentStatus.CHANGES_REQUESTED}:
        raise HTTPException(status_code=400, detail="Only draft or change-requested documents can be edited")
    totals = calculate_totals(payload.get("items") or document.content_snapshot.get("items") or [], payload.get("overall_discount") or 0)
    for field in ["title", "currency", "terms", "notes", "valid_until"]:
        if field in payload:
            setattr(document, field, _parse_optional_datetime(payload[field]) if field == "valid_until" else payload[field])
    document.subtotal = totals["subtotal"]
    document.discount_total = totals["discount_total"]
    document.tax_total = totals["tax_total"]
    document.grand_total = totals["grand_total"]
    document.content_snapshot = {**(document.content_snapshot or {}), "items": totals["items"]}
    document.updated_at = utc_now()
    await document.save()
    await _event(document, "updated", current_user)
    return {"document": serialize(document)}


async def create_contract_from_document(current_user: User, lead_id: str, document_id: str) -> dict[str, Any]:
    _, source = await _document_for_user(current_user, lead_id, document_id)
    if source.document_type != CRMDocumentType.QUOTATION:
        raise HTTPException(status_code=400, detail="Contracts can be created only from quotations")
    if source.status != CRMDocumentStatus.ACCEPTED:
        raise HTTPException(status_code=400, detail="Contract can be created only from an accepted quotation")
    contract = CRMDocument(
        company_id=source.company_id,
        lead_id=source.lead_id,
        document_type=CRMDocumentType.CONTRACT,
        document_number=await _next_document_number(source.company_id, CRMDocumentType.CONTRACT),
        title=f"Contract from {source.document_number}",
        currency=source.currency,
        subtotal=source.subtotal,
        discount_total=source.discount_total,
        tax_total=source.tax_total,
        grand_total=source.grand_total,
        terms=source.terms,
        notes=source.notes,
        content_snapshot={**(source.content_snapshot or {}), "source_document_id": str(source.id), "source_document_number": source.document_number},
        created_by=str(current_user.id),
    )
    await contract.insert()
    await _event(contract, "created_from_quotation", current_user, source_document_id=str(source.id))
    return {"document": serialize(contract)}


async def upload_pdf(current_user: User, lead_id: str, file: UploadFile, document_type: str = "contract", title: Optional[str] = None) -> dict[str, Any]:
    lead = await _lead_for_user(current_user, lead_id)
    content = await file.read()
    await file.seek(0)
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    if FileService.detect_mime_type(content, file.filename or "") != "application/pdf":
        raise HTTPException(status_code=400, detail="Only valid PDF uploads are allowed")
    stored = await FileService.store_uploaded_file(file, upload_dir=UPLOAD_DIR, url_prefix="/uploads/crm-documents", scope="crm-documents")
    dtype = CRMDocumentType(document_type)
    document = CRMDocument(
        company_id=str(lead.company_id),
        lead_id=str(lead.id),
        document_type=dtype,
        document_number=await _next_document_number(str(lead.company_id), dtype),
        title=title or stored.get("filename") or f"{dtype.value.title()} PDF",
        source_file_path=str(stored.get("file_path") or ""),
        source_file_url=stored.get("file_url"),
        source_file_name=stored.get("filename"),
        created_by=str(current_user.id),
    )
    await document.insert()
    await _event(document, "uploaded_pdf", current_user)
    return {"document": serialize(document)}


def _pdf_path(document: CRMDocument) -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR / f"{document.document_number}.pdf"


async def generate_pdf(current_user: User, lead_id: str, document_id: str) -> dict[str, Any]:
    _, document = await _document_for_user(current_user, lead_id, document_id)
    path = _pdf_path(document)
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=A4)
    snapshot = document.content_snapshot or {}
    lead = snapshot.get("lead") or {}

    def p(value: Any, style: str = "Normal"):
        return Paragraph(escape(str(value or "")), styles[style])

    def footer(canvas, pdf_doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(A4[0] - 36, 24, f"Page {pdf_doc.page}")
        canvas.restoreState()

    story = [
        p("SynTask", "Title"),
        p(f"{document.document_type.value.title()} {document.document_number}", "Heading2"),
        p(document.title),
        p(f"Issue date: {utc_now().date().isoformat()}"),
        Spacer(1, 12),
    ]
    story.append(p(f"Client: {lead.get('company_name') or lead.get('name') or 'Lead'}"))
    story.append(p(f"Contact: {lead.get('email') or lead.get('phone') or '-'}"))
    if document.valid_until:
        story.append(p(f"Valid until: {document.valid_until.date().isoformat()}"))

    if document.document_type == CRMDocumentType.CONTRACT:
        for label, key in [
            ("Parties", "parties"),
            ("Scope of work", "scope"),
            ("Deliverables", "deliverables"),
            ("Price", "price"),
            ("Payment schedule", "payment_schedule"),
            ("Start date", "start_date"),
            ("End date", "end_date"),
            ("Confidentiality", "confidentiality"),
            ("Termination", "termination"),
        ]:
            if snapshot.get(key):
                story += [Spacer(1, 10), p(label, "Heading3"), p(snapshot.get(key))]
        clauses = snapshot.get("clauses") or []
        if clauses:
            story += [Spacer(1, 10), p("Additional clauses", "Heading3")]
            for clause in clauses:
                story.append(p(clause))
    else:
        rows = [["Description", "Qty", "Unit Price", "Tax %", "Total"]]
        for item in snapshot.get("items") or []:
            rows.append([escape(str(item.get("description") or "")), item.get("quantity"), item.get("unit_price"), item.get("tax_rate"), item.get("line_total")])
        rows += [["", "", "", "Subtotal", str(document.subtotal)], ["", "", "", "Tax", str(document.tax_total)], ["", "", "", "Total", str(document.grand_total)]]
        table = Table(rows)
        table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey)]))
        story += [Spacer(1, 12), table]

    story += [Spacer(1, 12), p("Terms", "Heading3"), p(document.terms or ""), p("Notes", "Heading3"), p(document.notes or "")]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    document.pdf_file_path = str(path)
    document.updated_at = utc_now()
    await document.save()
    await _event(document, "pdf_generated", current_user)
    return {"document": serialize(document), "pdf_url": f"/api/v1/crm/leads/{lead_id}/documents/{document_id}/pdf"}


async def pdf_response(current_user: User, lead_id: str, document_id: str) -> FileResponse:
    _, document = await _document_for_user(current_user, lead_id, document_id)
    path = _safe_pdf_file(document)
    return FileResponse(path, media_type="application/pdf", filename=f"{document.document_number}.pdf")


async def create_share_link(current_user: User, lead_id: str, document_id: str, regenerate: bool = False) -> dict[str, Any]:
    _, document = await _document_for_user(current_user, lead_id, document_id)
    if document.status in {CRMDocumentStatus.ACCEPTED, CRMDocumentStatus.REJECTED, CRMDocumentStatus.CANCELLED}:
        raise HTTPException(status_code=400, detail="Finalized documents cannot be shared")
    if not document.pdf_file_path and not document.source_file_path:
        await generate_pdf(current_user, lead_id, document_id)
        document = await CRMDocument.get(str(document.id))
    if document.token_hash and not document.token_revoked_at and document.token_expires_at and document.token_expires_at > utc_now() and not regenerate:
        raise HTTPException(status_code=409, detail="A valid link already exists. Regenerate to get a new URL.")
    token = secrets.token_urlsafe(32)
    document.token_hash = _hash_token(token)
    document.token_expires_at = utc_now() + timedelta(days=30)
    document.token_revoked_at = None
    if document.status == CRMDocumentStatus.DRAFT:
        document.status = CRMDocumentStatus.SENT
        document.sent_at = utc_now()
    document.updated_at = utc_now()
    await document.save()
    await _event(document, "link_created", current_user, expires_at=document.token_expires_at.isoformat())
    return {"document": serialize(document), "public_link": _public_url(token), "expires_at": document.token_expires_at}


async def revoke_share_link(current_user: User, lead_id: str, document_id: str) -> dict[str, Any]:
    _, document = await _document_for_user(current_user, lead_id, document_id)
    document.token_revoked_at = utc_now()
    document.updated_at = utc_now()
    await document.save()
    await _event(document, "token_revoked", current_user)
    return {"document": serialize(document)}


async def send_document(current_user: User, lead_id: str, document_id: str, recipient_email: Optional[str] = None) -> dict[str, Any]:
    lead, document = await _document_for_user(current_user, lead_id, document_id)
    if document.status in {CRMDocumentStatus.ACCEPTED, CRMDocumentStatus.REJECTED, CRMDocumentStatus.CANCELLED}:
        raise HTTPException(status_code=400, detail="Finalized documents cannot be sent")
    if not document.pdf_file_path and not document.source_file_path:
        await generate_pdf(current_user, lead_id, document_id)
        document = await CRMDocument.get(str(document.id))
    token = secrets.token_urlsafe(32)
    document.token_hash = _hash_token(token)
    document.token_expires_at = utc_now() + timedelta(days=30)
    document.token_revoked_at = None
    document.sent_to = recipient_email or str(lead.email or "")
    if not document.sent_to:
        raise HTTPException(status_code=400, detail="Recipient email required")
    public_link = _public_url(token)
    result = await notification_service.send_sales_email(
        company_id=document.company_id,
        lead_id=document.lead_id,
        recipient_email=document.sent_to,
        subject=f"{document.title} - {document.document_number}",
        html=f"<p>Please review {document.document_number}.</p><p><a href=\"{public_link}\">Open document</a></p>",
        text=f"Please review {document.document_number}: {public_link}",
        actor_id=str(current_user.id),
        actor_name=_display_name(current_user),
        lead_name=lead.prospect_name,
        idempotency_key=f"crm-document-send:{document.id}:{document.sent_to}",
    )
    delivery = result.get("delivery", {})
    if delivery.get("success"):
        document.status = CRMDocumentStatus.SENT
        document.sent_at = utc_now()
        document.send_error = None
        await _event(document, "sent", current_user)
    else:
        document.send_error = delivery.get("error") or delivery.get("status")
    document.updated_at = utc_now()
    await document.save()
    return {"document": serialize(document), "public_link": public_link if delivery.get("success") else None, "delivery": delivery}


async def cancel_document(current_user: User, lead_id: str, document_id: str) -> dict[str, Any]:
    _, document = await _document_for_user(current_user, lead_id, document_id)
    document.status = CRMDocumentStatus.CANCELLED
    document.token_revoked_at = utc_now()
    document.updated_at = utc_now()
    await document.save()
    await _event(document, "token_revoked", current_user)
    return {"document": serialize(document)}


async def public_document(token: str, mark_viewed: bool = True, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> CRMDocument:
    document = await CRMDocument.find_one({"token_hash": _hash_token(token)})
    if not document or document.token_revoked_at or not document.token_expires_at or document.token_expires_at < utc_now():
        raise HTTPException(status_code=404, detail="Document link is invalid or expired")
    if document.status == CRMDocumentStatus.CANCELLED:
        raise HTTPException(status_code=404, detail="Document link is invalid or expired")
    if mark_viewed and document.status == CRMDocumentStatus.SENT:
        document.status = CRMDocumentStatus.VIEWED
        document.viewed_at = utc_now()
        await document.save()
        await _event(document, "viewed", None, ip_address=ip_address, user_agent=user_agent, idempotency_key="first-view")
    return document


async def public_action(token: str, action: str, payload: dict[str, Any], ip_address: Optional[str], user_agent: Optional[str]) -> dict[str, Any]:
    document = await public_document(token, mark_viewed=False)
    requested = {
        "accept": CRMDocumentStatus.ACCEPTED,
        "reject": CRMDocumentStatus.REJECTED,
        "changes": CRMDocumentStatus.CHANGES_REQUESTED,
    }[action]
    terminal = {CRMDocumentStatus.ACCEPTED, CRMDocumentStatus.REJECTED}
    if document.status in terminal and document.status != requested:
        raise HTTPException(status_code=409, detail="Document response already recorded")
    if document.status == requested:
        return {"document": document, "idempotent": True}
    if action == "accept":
        if not payload.get("accepted"):
            raise HTTPException(status_code=400, detail="Acceptance confirmation required")
        document.accepted_at = utc_now()
    elif action == "reject":
        document.rejected_at = utc_now()
    document.status = requested
    document.updated_at = utc_now()
    await document.save()
    await _event(document, action if action != "changes" else "change_requested", None, ip_address=ip_address, user_agent=user_agent, signer=payload.get("name"), email=payload.get("email"), comment=payload.get("comment"))
    return {"document": document, "idempotent": False}
