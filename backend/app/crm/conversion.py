"""
Won-stage conversion and transfer to the Clients module.

All conversion actions are idempotent: repeated clicks or retried requests reuse
the existing Client / Project / Invoice / notification records instead of creating
duplicates. References are stored on the lead itself (client_id, project_id,
invoice_id, account_manager_id, ...) and mirrored in timeline/activity events.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.timeline.publisher import publish_crm_timeline_event
from app.crm.pipeline import WON_STATUSES, apply_stage_status_change, normalize_stage_display, _serialize_lead, _user_display_name
from app.crm.models import SalesProspect
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.ownership_transfer import OwnershipTransfer
from app.models.user import User, UserRole, UserStatus
from app.services.notification_service import notification_service
from app.core.clock import utc_now


def _company_id_for_user(current_user: User) -> str:
    company_id = str(getattr(current_user, "company_id", "") or "").strip()
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _can_access_lead(current_user: User, prospect: SalesProspect) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _load_won_lead(current_user: User, lead_id: str) -> SalesProspect:
    prospect = await SalesProspect.get(lead_id)
    if not prospect or prospect.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    _can_access_lead(current_user, prospect)
    return prospect


async def _resolve_client(prospect: SalesProspect) -> Optional[Client]:
    client_id = getattr(prospect, "client_id", None)
    if client_id:
        client = await Client.get(client_id)
        if client:
            return client
    company_id = str(getattr(prospect, "company_id", "") or "")
    company_name = (getattr(prospect, "company_name", None) or "").strip()
    if company_name:
        return await Client.find_one(
            {
                "company_id": company_id,
                "deleted": False,
                "$or": [{"company_name": company_name}, {"name": company_name}, {"name": getattr(prospect, "prospect_name", None)}],
            }
        )
    return None


def _serialize_conversion(prospect: SalesProspect) -> Dict[str, Any]:
    return {
        "lead": _serialize_lead(prospect, normalize_stage_display(prospect.current_stage)),
        "conversion": {
            "won_status": getattr(prospect, "won_status", None),
            "client_id": getattr(prospect, "client_id", None),
            "project_id": getattr(prospect, "project_id", None),
            "invoice_id": getattr(prospect, "invoice_id", None),
            "account_manager_id": getattr(prospect, "account_manager_id", None),
            "welcome_email_sent_at": getattr(prospect, "welcome_email_sent_at", None),
            "ops_notified_at": getattr(prospect, "ops_notified_at", None),
            "converted_at": getattr(prospect, "converted_at", None),
            "transferred_at": getattr(prospect, "transferred_at", None),
            "transferred_by": getattr(prospect, "transferred_by", None),
        },
    }


async def _publish_event(event_name: str, prospect: SalesProspect, current_user: User, payload: Dict[str, Any]) -> None:
    await publish_crm_timeline_event(
        event_name=event_name,
        aggregate_type="sales_prospect",
        aggregate_id=str(prospect.id),
        company_id=str(prospect.company_id or getattr(current_user, "company_id", "")),
        actor_id=str(getattr(current_user, "id", "")),
        payload=payload,
        metadata={"surface": "crm", "workflow": "won_conversion"},
    )


class LeadConversionService:
    @staticmethod
    async def update_won_status(current_user: User, lead_id: str, won_status: str) -> Dict[str, Any]:
        prospect = await _load_won_lead(current_user, lead_id)
        normalized = str(won_status or "").strip().lower().replace(" ", "_")
        if normalized not in WON_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown won status '{won_status}'")

        current = str(getattr(prospect, "won_status", "") or "").strip().lower().replace(" ", "_")
        if current == normalized:
            return _serialize_conversion(prospect)
        if current and normalized != "transferred":
            # Only forward movement through the lifecycle is allowed.
            current_index = WON_STATUSES.index(current)
            target_index = WON_STATUSES.index(normalized)
            if target_index <= current_index:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot move Won status backward from '{current}' to '{normalized}'.",
                )
        if normalized == "transferred":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use the transfer action to mark a lead transferred.")

        now = utc_now()
        prospect.won_status = normalized
        apply_stage_status_change(prospect, stage_key="won", new_status=normalized, user=current_user, now=now)
        prospect.updated_at = now
        await prospect.save()
        await _publish_event(
            "WonStatusChanged",
            prospect,
            current_user,
            {"lead_id": str(prospect.id), "previous_status": current or None, "new_status": normalized, "timestamp": now.isoformat()},
        )
        return _serialize_conversion(prospect)

    @staticmethod
    async def create_invoice(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_won_lead(current_user, lead_id)
        if getattr(prospect, "won_status", None) not in ["payment_pending", "payment_received", "onboarding_started", "ready"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invoice creation requires a Won lead.")
        existing_invoice_id = getattr(prospect, "invoice_id", None)
        if existing_invoice_id:
            existing = await Invoice.get(existing_invoice_id)
            if existing:
                return {**_serialize_conversion(prospect), "invoice": _serialize_invoice(existing), "status": "reused"}

        client = await _resolve_client(prospect)
        if not client:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Create the client first (move the lead to Won and run conversion).")
        company_id = _company_id_for_user(current_user)
        now = utc_now()
        amount = float(getattr(prospect, "won_amount", 0) or 0)

        # Idempotency guard: a previously created invoice for this lead (before the
        # ref was stored) must not be duplicated.
        dup = await Invoice.find_one(
            {"company_id": company_id, "client_id": str(client.id), "notes": {"$regex": str(prospect.id)}}
        )
        if dup:
            prospect.invoice_id = str(dup.id)
            prospect.updated_at = now
            await prospect.save()
            return {**_serialize_conversion(prospect), "invoice": _serialize_invoice(dup), "status": "reused"}

        year = now.year
        count_this_year = await Invoice.find(
            {"company_id": company_id, "invoice_number": {"$regex": f"^INV-{year}-"}}
        ).count()
        invoice = Invoice(
            invoice_number=f"INV-{year}-{count_this_year + 1:04d}",
            company_id=company_id,
            invoice_type=InvoiceType.PROFORMA,
            include_tax=True,
            client_id=str(client.id),
            client_name=client.name,
            client_email=getattr(prospect, "email", None),
            client_contact=getattr(prospect, "phone", None) or client.contact,
            client_company_name=client.company_name,
            invoice_date=now,
            due_date=now + timedelta(days=30),
            items=[
                {
                    "description": f"{client.name} service agreement",
                    "quantity": 1,
                    "unit_price": amount,
                    "amount": amount,
                }
            ],
            subtotal=amount,
            tax_amount=0.0,
            total_amount=amount,
            currency="INR",
            status=InvoiceStatus.DRAFT,
            notes=f"Converted from won lead {prospect.prospect_name} ({prospect.id})",
            project_id=getattr(prospect, "project_id", None),
            created_by=str(getattr(current_user, "id", "")),
            created_at=now,
            updated_at=now,
        )
        await invoice.insert()
        prospect.invoice_id = str(invoice.id)
        prospect.updated_at = now
        await prospect.save()
        await _publish_event(
            "InvoiceCreated",
            prospect,
            current_user,
            {
                "lead_id": str(prospect.id),
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "client_id": str(client.id),
                "amount": amount,
                "timestamp": now.isoformat(),
            },
        )
        return {**_serialize_conversion(prospect), "invoice": _serialize_invoice(invoice), "status": "created"}

    @staticmethod
    async def assign_account_manager(current_user: User, lead_id: str, user_id: str) -> Dict[str, Any]:
        prospect = await _load_won_lead(current_user, lead_id)
        target = await User.get(str(user_id or ""))
        if not target or target.company_id != prospect.company_id or target.status != UserStatus.ACTIVE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account manager must be an active user in your company")

        if str(getattr(prospect, "account_manager_id", "") or "") == str(target.id):
            return _serialize_conversion(prospect)

        now = utc_now()
        previous = getattr(prospect, "account_manager_id", None) or getattr(prospect, "assigned_to", None)
        prospect.account_manager_id = str(target.id)
        prospect.updated_at = now
        await prospect.save()

        client = await _resolve_client(prospect)
        if client:
            previous_owner = getattr(client, "assigned_to", None)
            client.assigned_to = str(target.id)
            client.updated_at = now
            await client.save()
            transfer = OwnershipTransfer(
                company_id=str(prospect.company_id),
                entity_type="client",
                entity_id=str(client.id),
                from_user_id=str(previous_owner) if previous_owner else None,
                to_user_id=str(target.id),
                reason="account_manager_assignment",
                transferred_by=str(getattr(current_user, "id", "")),
                notes=f"Account manager assigned from won lead {prospect.prospect_name}",
            )
            await transfer.insert()

        await _publish_event(
            "AccountManagerAssigned",
            prospect,
            current_user,
            {
                "lead_id": str(prospect.id),
                "account_manager_id": str(target.id),
                "account_manager_name": f"{target.first_name or ''} {target.last_name or ''}".strip() or target.email,
                "previous_assignee": str(previous) if previous else None,
                "timestamp": now.isoformat(),
            },
        )
        return _serialize_conversion(prospect)

    @staticmethod
    async def send_welcome_email(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_won_lead(current_user, lead_id)
        if getattr(prospect, "welcome_email_sent_at", None):
            return {**_serialize_conversion(prospect), "welcome_email": {"status": "reused"}}
        if not getattr(prospect, "email", None):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This lead has no email address to send a welcome email to.")

        company_id = str(prospect.company_id)
        lead_name = prospect.prospect_name or "there"
        company_name = prospect.company_name or prospect.prospect_name or "your new partner"
        subject = f"Welcome aboard, {company_name}!"
        html = f"<p>Hi {lead_name},</p><p>We're delighted to welcome {company_name} to the SynTask family. Our team is ready to kick off and make this engagement a success.</p><p>Watch this space for onboarding next steps.</p>"
        text = f"Hi {lead_name}, we're delighted to welcome {company_name} to the SynTask family. Our team is ready to kick off and make this engagement a success."

        try:
            result = await notification_service.send_sales_email(
                company_id=company_id,
                lead_id=str(prospect.id),
                recipient_email=prospect.email,
                subject=subject,
                html=html,
                text=text,
                actor_id=str(getattr(current_user, "id", "")),
                actor_name=_user_display_name(current_user),
                related_user_id=getattr(prospect, "account_manager_id", None) or getattr(prospect, "assigned_to", None),
                lead_name=lead_name,
                idempotency_key=f"welcome-email:{prospect.id}",
            )
        except Exception as exc:
            return {**_serialize_conversion(prospect), "welcome_email": {"status": "failed", "error": str(exc)}}

        delivery = result.get("delivery") or {}
        if not delivery.get("success"):
            return {**_serialize_conversion(prospect), "welcome_email": {"status": "failed", "error": delivery.get("error") or "Email delivery failed"}}

        now = utc_now()
        prospect.welcome_email_sent_at = now
        prospect.updated_at = now
        await prospect.save()
        await _publish_event(
            "WelcomeEmailSent",
            prospect,
            current_user,
            {"lead_id": str(prospect.id), "recipient": prospect.email, "subject": subject, "timestamp": now.isoformat()},
        )
        return {**_serialize_conversion(prospect), "welcome_email": {"status": "sent", "notification_id": result.get("notification_id")}}

    @staticmethod
    async def notify_operations(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_won_lead(current_user, lead_id)
        if getattr(prospect, "ops_notified_at", None):
            return {**_serialize_conversion(prospect), "operations_notified": {"status": "reused"}}

        now = utc_now()
        company_id = str(prospect.company_id)
        recipient_id = getattr(prospect, "account_manager_id", None) or getattr(prospect, "assigned_to", None)
        try:
            if recipient_id:
                await notification_service.notify_salesperson(
                    company_id=company_id,
                    user_id=recipient_id,
                    title="Operations handoff required",
                    message=f"Onboarding for won lead {prospect.prospect_name} is ready. Hand off to Operations / Client Success.",
                    related_id=str(prospect.id),
                    related_type="lead",
                    metadata={"lead_name": prospect.prospect_name, "channel": "operations", "workflow": "won_conversion"},
                    idempotency_key=f"ops-notify:{prospect.id}",
                )
        except Exception as exc:
            return {**_serialize_conversion(prospect), "operations_notified": {"status": "failed", "error": str(exc)}}

        prospect.ops_notified_at = now
        prospect.updated_at = now
        await prospect.save()
        await _publish_event(
            "OperationsNotified",
            prospect,
            current_user,
            {
                "lead_id": str(prospect.id),
                "recipient_id": recipient_id,
                "client_id": getattr(prospect, "client_id", None),
                "project_id": getattr(prospect, "project_id", None),
                "timestamp": now.isoformat(),
            },
        )
        return {**_serialize_conversion(prospect), "operations_notified": {"status": "notified"}}

    @staticmethod
    async def transfer_to_clients(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_won_lead(current_user, lead_id)
        now = utc_now()

        if getattr(prospect, "transferred_at", None):
            return _serialize_conversion(prospect)

        if str(getattr(prospect, "current_stage", "")).lower() not in ["won", "closed won"] and prospect.status.value != "won":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only Won leads can be transferred to Clients.")

        won_status = str(getattr(prospect, "won_status", "") or "").strip().lower().replace(" ", "_")
        if won_status != "ready" and not current_user.role in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Complete the onboarding checklist (mark the lead Ready) before transferring to Clients.",
            )

        client = await _resolve_client(prospect)
        if client:
            client.status = "active"
            client.updated_at = now
            await client.save()

        prospect.won_status = "transferred"
        prospect.transferred_at = now
        prospect.transferred_by = str(getattr(current_user, "id", ""))
        apply_stage_status_change(prospect, stage_key="won", new_status="transferred", user=current_user, now=now)
        prospect.updated_at = now
        await prospect.save()

        await _publish_event(
            "LeadTransferredToClients",
            prospect,
            current_user,
            {
                "lead_id": str(prospect.id),
                "client_id": str(client.id) if client else None,
                "project_id": getattr(prospect, "project_id", None),
                "transferred_by": str(getattr(current_user, "id", "")),
                "timestamp": now.isoformat(),
            },
        )
        return _serialize_conversion(prospect)


def _serialize_invoice(invoice: Invoice) -> Dict[str, Any]:
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "client_id": invoice.client_id,
        "client_name": invoice.client_name,
        "status": invoice.status.value,
        "total_amount": invoice.total_amount,
        "invoice_date": invoice.invoice_date,
        "due_date": invoice.due_date,
    }
