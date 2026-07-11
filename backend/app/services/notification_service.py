from __future__ import annotations

import json
import logging
import inspect
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from app.core.config import settings
from app.crm.timeline import publish_crm_timeline_event
from app.models.ai_log import AIInteractionLog
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.notification import Notification, NotificationType

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_str(value: Any) -> str:
    return str(value or "").strip()


def _hash_payload(payload: dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return sha256(normalized.encode("utf-8")).hexdigest()


@dataclass(slots=True)
class DeliveryResult:
    provider: str
    success: bool
    status: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    attempts: int = 1
    raw_response: dict[str, Any] = field(default_factory=dict)
    idempotency_key: Optional[str] = None
    delivered_at: Optional[datetime] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "success": self.success,
            "status": self.status,
            "message_id": self.message_id,
            "error": self.error,
            "attempts": self.attempts,
            "raw_response": self.raw_response,
            "idempotency_key": self.idempotency_key,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
        }


class EmailService:
    def __init__(self) -> None:
        self.api_key = getattr(settings, "BREVO_API_KEY", None)
        self.base_url = getattr(settings, "BREVO_BASE_URL", "https://api.brevo.com/v3").rstrip("/")
        self.timeout_seconds = int(getattr(settings, "BREVO_TIMEOUT_SECONDS", 20) or 20)
        self.retry_attempts = int(getattr(settings, "BREVO_RETRY_ATTEMPTS", 3) or 3)
        self.sender_email = getattr(settings, "BREVO_SENDER_EMAIL", None) or getattr(settings, "MAIL_FROM", None)
        self.sender_name = getattr(settings, "BREVO_SENDER_NAME", "SynTask")
        self.reply_to = getattr(settings, "BREVO_REPLY_TO", None)

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.sender_email)

    @staticmethod
    def render_template(template: str, variables: Optional[dict[str, Any]] = None) -> str:
        rendered = template or ""
        for key, value in (variables or {}).items():
            rendered = rendered.replace(f"{{{{{key}}}}}", "" if value is None else str(value))
        return rendered

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        html: str,
        text: str,
        attachments: Optional[list[dict[str, Any]]] = None,
        template_variables: Optional[dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> DeliveryResult:
        payload = {
            "sender": {"name": self.sender_name, "email": self.sender_email},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html,
            "textContent": text,
        }
        if self.reply_to:
            payload["replyTo"] = {"email": self.reply_to}
        if template_variables:
            payload["params"] = template_variables
        if attachments:
            payload["attachment"] = attachments

        if not self.configured:
            return DeliveryResult(
                provider="brevo",
                success=False,
                status="not_configured",
                error="Brevo is not configured",
                attempts=0,
                raw_response={},
                idempotency_key=idempotency_key,
            )

        body = json.dumps(payload).encode("utf-8")
        last_error: Optional[str] = None
        for attempt in range(1, self.retry_attempts + 1):
            req = urllib_request.Request(
                f"{self.base_url}/smtp/email",
                data=body,
                method="POST",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "api-key": self.api_key,
                },
            )
            try:
                with urllib_request.urlopen(req, timeout=self.timeout_seconds) as response:
                    raw = response.read().decode("utf-8") if response else "{}"
                    parsed = json.loads(raw or "{}")
                    message_id = parsed.get("messageId") or parsed.get("message_id")
                    return DeliveryResult(
                        provider="brevo",
                        success=True,
                        status="delivered",
                        message_id=message_id,
                        attempts=attempt,
                        raw_response=parsed,
                        idempotency_key=idempotency_key,
                        delivered_at=_now(),
                    )
            except urllib_error.HTTPError as exc:
                raw = exc.read().decode("utf-8") if hasattr(exc, "read") else ""
                last_error = f"Brevo HTTP {exc.code}: {raw or exc.reason}"
                if exc.code < 500:
                    break
            except Exception as exc:  # pragma: no cover - network failures are environment-specific
                last_error = str(exc)
            time.sleep(min(0.5 * attempt, 1.5))

        return DeliveryResult(
            provider="brevo",
            success=False,
            status="failed",
            error=last_error or "Brevo delivery failed",
            attempts=self.retry_attempts,
            raw_response={},
            idempotency_key=idempotency_key,
        )


# Backward-compatible alias retained for existing tests and callers.
BrevoEmailProvider = EmailService


class WhatsAppNoopProvider:
    async def send_message(
        self,
        *,
        to_number: str,
        message: str,
        idempotency_key: Optional[str] = None,
    ) -> DeliveryResult:
        return DeliveryResult(
            provider="whatsapp",
            success=False,
            status="not_configured",
            error="WhatsApp provider is interface only",
            attempts=0,
            idempotency_key=idempotency_key,
        )


class NotificationService:
    def __init__(
        self,
        *,
        email_service: Optional[EmailService] = None,
        email_provider: Optional[EmailService] = None,
    ) -> None:
        self.email_service = email_service or email_provider or EmailService()
        self.whatsapp_provider = WhatsAppNoopProvider()

    @staticmethod
    def normalize_email_payload(payload: dict[str, Any]) -> dict[str, Any]:
        recipients = payload.get("recipients") or {}
        return {
            "to": payload.get("to") or recipients.get("to") or [],
            "cc": payload.get("cc") or recipients.get("cc") or [],
            "bcc": payload.get("bcc") or recipients.get("bcc") or [],
            "subject": _safe_str(payload.get("subject")),
            "html": _safe_str(payload.get("html") or payload.get("body_html")),
            "text": _safe_str(payload.get("text") or payload.get("body_text")),
            "template_id": payload.get("template_id"),
            "template_name": payload.get("template_name"),
            "template_variables": payload.get("template_variables") or {},
            "related_entity_type": payload.get("related_entity_type"),
            "related_entity_id": payload.get("related_entity_id"),
            "related_module": payload.get("related_module"),
            "attachments": payload.get("attachments") or [],
        }

    async def preview_email(
        self,
        *,
        payload: dict[str, Any],
        actor_id: str,
        company_id: str,
    ) -> dict[str, Any]:
        normalized = self.normalize_email_payload(payload)
        html = self.email_service.render_template(normalized["html"], normalized["template_variables"])
        text = self.email_service.render_template(normalized["text"], normalized["template_variables"])
        subject = self.email_service.render_template(normalized["subject"], normalized["template_variables"])
        await self.record_audit_event(
            company_id=company_id,
            user_id=actor_id,
            feature="previewNotificationEmail",
            status="success",
            payload=normalized,
            parsed_response={"preview": True},
            executed_actions=[{"tool": "previewNotificationEmail", "status": "success"}],
        )
        return {
            "subject": subject,
            "html": html,
            "text": text,
            "template_id": normalized["template_id"],
            "template_name": normalized["template_name"],
        }

    async def send_notification_email(
        self,
        *,
        payload: dict[str, Any],
        actor_id: str,
        actor_name: str,
        company_id: str,
        sender_email: Optional[str] = None,
        sender_name: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        related_module: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        normalized = self.normalize_email_payload(payload)
        recipients = [email for email in normalized["to"] if email]
        if not recipients:
            raise ValueError("At least one recipient is required")

        primary_recipient = str(recipients[0]).strip()
        marker = idempotency_key or _hash_payload(
            {
                "company_id": company_id,
                "actor_id": actor_id,
                "to": normalized["to"],
                "cc": normalized["cc"],
                "bcc": normalized["bcc"],
                "subject": normalized["subject"],
                "html": normalized["html"],
                "text": normalized["text"],
                "template_id": normalized["template_id"],
                "template_variables": normalized["template_variables"],
                "related_entity_type": related_entity_type or normalized["related_entity_type"],
                "related_entity_id": related_entity_id or normalized["related_entity_id"],
                "related_module": related_module or normalized["related_module"],
                "attachments": normalized["attachments"],
            }
        )
        html = self.email_service.render_template(normalized["html"], normalized["template_variables"])
        text = self.email_service.render_template(normalized["text"], normalized["template_variables"])
        subject = self.email_service.render_template(normalized["subject"], normalized["template_variables"])

        email_result = await self.email_service.send_email(
            to_email=primary_recipient,
            subject=subject,
            html=html,
            text=text,
            attachments=normalized["attachments"],
            template_variables=normalized["template_variables"],
            idempotency_key=marker,
        )
        metadata = {
            "to": normalized["to"],
            "cc": normalized["cc"],
            "bcc": normalized["bcc"],
            "template_id": normalized["template_id"],
            "template_name": normalized["template_name"],
            "template_variables": normalized["template_variables"],
            "provider": email_result.provider,
            "delivery": email_result.to_dict(),
            "sender_email": sender_email,
            "sender_name": sender_name,
            "related_entity_type": related_entity_type or normalized["related_entity_type"],
            "related_entity_id": related_entity_id or normalized["related_entity_id"],
            "related_module": related_module or normalized["related_module"],
            "provider_response": email_result.raw_response,
        }
        notification = await self.notify_salesperson(
            company_id=company_id,
            user_id=actor_id,
            title=subject or "Email notification",
            message=text or subject or "Email sent",
            related_id=related_entity_id or normalized["related_entity_id"],
            related_type=related_entity_type or normalized["related_entity_type"] or related_module,
            metadata={**metadata, "status": email_result.status},
            idempotency_key=marker,
        )
        notification.email_sent = email_result.success
        notification.email_sent_at = _now() if email_result.success else notification.email_sent_at
        notification.metadata = {**(notification.metadata or {}), **metadata}
        if hasattr(notification, "save"):
            save_result = notification.save()
            if inspect.isawaitable(save_result):
                await save_result
        await self.record_audit_event(
            company_id=company_id,
            user_id=actor_id,
            feature="sendNotificationEmail",
            status="success" if email_result.success else "failed",
            payload=normalized,
            parsed_response=email_result.to_dict(),
            error_message=email_result.error,
            executed_actions=[{"tool": "sendNotificationEmail", "status": email_result.status, "notification_id": str(notification.id)}],
            correlation_id=marker,
            idempotency_key=marker,
        )
        if related_entity_id or normalized["related_entity_id"]:
            await self.record_timeline_event(
                event_name="NotificationEmailSent" if email_result.success else "NotificationEmailFailed",
                aggregate_type=related_entity_type or normalized["related_entity_type"] or "crm_entity",
                aggregate_id=related_entity_id or normalized["related_entity_id"] or str(notification.id),
                company_id=company_id,
                actor_id=actor_id,
                payload={
                    "notification_id": str(notification.id),
                    "subject": subject,
                    "status": email_result.status,
                    "provider": email_result.provider,
                    "delivery": email_result.to_dict(),
                },
                metadata={"surface": "crm", "workflow": "notification_email"},
                correlation_id=marker,
            )
        return {
            "notification_id": str(notification.id),
            "status": "sent" if email_result.success else "failed",
            "delivery": email_result.to_dict(),
            "notification": {
                "id": str(notification.id),
                "subject": subject,
                "recipients": normalized["to"],
                "cc": normalized["cc"],
                "bcc": normalized["bcc"],
                "provider": email_result.provider,
                "related_entity_type": related_entity_type or normalized["related_entity_type"],
                "related_entity_id": related_entity_id or normalized["related_entity_id"],
                "related_module": related_module or normalized["related_module"],
            },
        }

    async def record_audit_event(
        self,
        *,
        company_id: str,
        user_id: str,
        feature: str,
        status: str,
        payload: dict[str, Any],
        parsed_response: dict[str, Any],
        error_message: Optional[str] = None,
        target_user_id: Optional[str] = None,
        executed_actions: Optional[list[dict[str, Any]]] = None,
        correlation_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> AIInteractionLog:
        log = AIInteractionLog(
            feature=feature,
            role="sales_agent",
            provider="notification_service",
            model=None,
            prompt_version="notification_service_v1",
            prompt_role_key=feature,
            status=status,
            company_id=company_id,
            user_id=user_id,
            target_user_id=target_user_id,
            prompt=None,
            context={
                "payload": payload,
                "correlation_id": correlation_id,
                "idempotency_key": idempotency_key,
            },
            raw_response=None,
            parsed_response=parsed_response,
            error_message=error_message,
            fallback_chain=[],
            executed_actions=executed_actions or [],
            prompt_tokens=None,
            completion_tokens=None,
            total_tokens=None,
            latency_ms=None,
            response_size_bytes=None,
            fallback_used=False,
            created_at=_now(),
        )
        await log.insert()
        return log

    async def record_timeline_event(
        self,
        *,
        event_name: str,
        aggregate_type: str,
        aggregate_id: str,
        company_id: str,
        actor_id: str,
        payload: dict[str, Any],
        project_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
    ) -> Any:
        return await publish_crm_timeline_event(
            event_name=event_name,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            company_id=company_id,
            actor_id=actor_id,
            payload=payload,
            project_id=project_id,
            metadata=metadata or {"surface": "crm", "workflow": "notification_service"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

    async def update_crm_activity(
        self,
        *,
        company_id: str,
        entity_type: str,
        entity_id: str,
        activity_type: str,
        title: str,
        description: Optional[str],
        owner_id: Optional[str],
        owner_name: Optional[str],
        status: str,
        priority: str,
        due_date: Optional[datetime],
        scheduled_at: Optional[datetime],
        created_by: str,
        created_by_name: str,
        metadata: Optional[dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> CRMActivity:
        marker = idempotency_key or _hash_payload(
            {
                "company_id": company_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "activity_type": activity_type,
                "title": title,
                "status": status,
                "priority": priority,
                "due_date": due_date,
                "scheduled_at": scheduled_at,
                "metadata": metadata or {},
            }
        )
        existing = await CRMActivity.find_one(
            {
                "company_id": company_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "activity_type": activity_type,
                "deleted": False,
                "metadata.idempotency_key": marker,
            }
        )
        if existing:
            return existing

        activity = CRMActivity(
            company_id=company_id,
            entity_type=entity_type,
            entity_id=entity_id,
            activity_type=activity_type,
            title=title,
            description=description,
            status=CRMActivityStatus(status),
            priority=CRMActivityPriority(priority),
            owner_id=owner_id,
            owner_name=owner_name,
            due_date=due_date,
            scheduled_at=scheduled_at,
            created_by=created_by,
            created_by_name=created_by_name,
            updated_by=created_by,
            updated_by_name=created_by_name,
            created_at=_now(),
            updated_at=_now(),
            metadata={**(metadata or {}), "idempotency_key": marker},
        )
        await activity.insert()
        return activity

    async def notify_salesperson(
        self,
        *,
        company_id: str,
        user_id: str,
        title: str,
        message: str,
        related_id: Optional[str] = None,
        related_type: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Notification:
        marker = idempotency_key or _hash_payload(
            {
                "company_id": company_id,
                "user_id": user_id,
                "title": title,
                "message": message,
                "related_id": related_id,
                "related_type": related_type,
                "metadata": metadata or {},
            }
        )
        existing = await Notification.find_one(
            {
                "company_id": company_id,
                "user_id": user_id,
                "title": title,
                "message": message,
                "related_id": related_id,
                "related_type": related_type,
                "metadata.idempotency_key": marker,
            }
        )
        if existing:
            return existing

        notification = Notification(
            company_id=company_id,
            user_id=user_id,
            type=NotificationType.MENTION,
            title=title,
            message=message,
            related_id=related_id,
            related_type=related_type,
            metadata={**(metadata or {}), "idempotency_key": marker},
            created_at=_now(),
        )
        await notification.insert()
        return notification

    async def send_sales_email(
        self,
        *,
        company_id: str,
        lead_id: str,
        recipient_email: str,
        subject: str,
        html: str,
        text: str,
        actor_id: str,
        actor_name: str,
        related_user_id: Optional[str] = None,
        lead_name: Optional[str] = None,
        template_variables: Optional[dict[str, Any]] = None,
        attachments: Optional[list[dict[str, Any]]] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        marker = idempotency_key or _hash_payload(
            {
                "company_id": company_id,
                "lead_id": lead_id,
                "recipient_email": recipient_email,
                "subject": subject,
                "html": html,
                "text": text,
                "attachments": attachments or [],
                "template_variables": template_variables or {},
            }
        )
        notification = await self.notify_salesperson(
            company_id=company_id,
            user_id=related_user_id or actor_id,
            title=subject,
            message=text,
            related_id=lead_id,
            related_type="lead",
            metadata={"lead_name": lead_name, "channel": "email", "subject": subject},
            idempotency_key=marker,
        )
        email_result = self.email_service.send_email(
            to_email=recipient_email,
            subject=subject,
            html=html,
            text=text,
            attachments=attachments,
            template_variables=template_variables,
            idempotency_key=marker,
        )
        result = await email_result if inspect.isawaitable(email_result) else email_result
        notification.email_sent = result.success
        notification.email_sent_at = _now() if result.success else notification.email_sent_at
        notification.metadata = {**(notification.metadata or {}), "delivery": result.to_dict()}
        if hasattr(notification, "save"):
            save_result = notification.save()
            if inspect.isawaitable(save_result):
                await save_result
        await self.record_audit_event(
            company_id=company_id,
            user_id=actor_id,
            feature="sendSalesEmail",
            status="success" if result.success else "failed",
            payload={"lead_id": lead_id, "recipient_email": recipient_email, "subject": subject},
            parsed_response=result.to_dict(),
            error_message=result.error,
            target_user_id=related_user_id,
            executed_actions=[{"tool": "sendSalesEmail", "status": result.status, "notification_id": str(notification.id)}],
            correlation_id=marker,
            idempotency_key=marker,
        )
        await self.record_timeline_event(
            event_name="SalesEmailSent" if result.success else "SalesEmailFailed",
            aggregate_type="sales_prospect",
            aggregate_id=lead_id,
            company_id=company_id,
            actor_id=actor_id,
            payload={
                "lead_id": lead_id,
                "recipient_email": recipient_email,
                "subject": subject,
                "status": result.status,
                "notification_id": str(notification.id),
                "delivery": result.to_dict(),
            },
            metadata={"surface": "crm", "workflow": "notification_service"},
            correlation_id=marker,
        )
        return {
            "notification_id": str(notification.id),
            "delivery": result.to_dict(),
        }

    async def send_whatsapp_message(
        self,
        *,
        company_id: str,
        lead_id: str,
        to_number: str,
        message: str,
        actor_id: str,
        related_user_id: Optional[str] = None,
        lead_name: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        marker = idempotency_key or _hash_payload(
            {
                "company_id": company_id,
                "lead_id": lead_id,
                "to_number": to_number,
                "message": message,
            }
        )
        whatsapp_result = self.whatsapp_provider.send_message(
            to_number=to_number,
            message=message,
            idempotency_key=marker,
        )
        result = await whatsapp_result if inspect.isawaitable(whatsapp_result) else whatsapp_result
        await self.record_audit_event(
            company_id=company_id,
            user_id=actor_id,
            feature="sendWhatsAppMessage",
            status="success" if result.success else "failed",
            payload={"lead_id": lead_id, "to_number": to_number, "message": message},
            parsed_response=result.to_dict(),
            error_message=result.error,
            target_user_id=related_user_id,
            executed_actions=[{"tool": "sendWhatsAppMessage", "status": result.status}],
            correlation_id=marker,
            idempotency_key=marker,
        )
        await self.record_timeline_event(
            event_name="WhatsAppMessageSent" if result.success else "WhatsAppMessageFailed",
            aggregate_type="sales_prospect",
            aggregate_id=lead_id,
            company_id=company_id,
            actor_id=actor_id,
            payload={
                "lead_id": lead_id,
                "to_number": to_number,
                "message": message,
                "status": result.status,
            },
            metadata={"surface": "crm", "workflow": "notification_service"},
            correlation_id=marker,
        )
        return {"delivery": result.to_dict()}


notification_service = NotificationService()
