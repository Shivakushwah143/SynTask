"""
IMAP-based recruitment inbox sync.
"""
from __future__ import annotations

import asyncio
import base64
import email
import imaplib
import logging
import re
from datetime import datetime, timezone
from email.message import Message
from typing import Optional

from app.core.config import settings
from app.models.company import Company, CompanyStatus
from app.models.user import User
from app.recruitment.models import ImportStatus, RecruitmentImportJob
from app.recruitment.repositories import JobRepository
from app.recruitment.services import RecruitmentInboxService
from app.core.clock import parse_to_utc, utc_now

logger = logging.getLogger(__name__)


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text


def _html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style).*?>.*?(</\\1>)", " ", html or "")
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    html = re.sub(r"&nbsp;", " ", html)
    html = re.sub(r"&amp;", "&", html)
    html = re.sub(r"\s+", " ", html)
    return html.strip()


def _message_address(header_value: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not header_value:
        return None, None
    parsed = email.utils.getaddresses([header_value])
    if not parsed:
        return None, None
    name, addr = parsed[0]
    return (name or None), (addr.lower().strip() if addr else None)


def _decode_part_bytes(part: Message) -> bytes:
    payload = part.get_payload(decode=True)
    return payload or b""


def _extract_body(message: Message) -> tuple[Optional[str], Optional[str]]:
    text_body = None
    html_body = None
    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            disposition = str(part.get_content_disposition() or "").lower()
            if disposition == "attachment":
                continue
            if content_type == "text/plain" and text_body is None:
                payload = _decode_part_bytes(part)
                charset = part.get_content_charset() or "utf-8"
                try:
                    text_body = payload.decode(charset, errors="replace")
                except Exception:
                    text_body = payload.decode("utf-8", errors="replace")
            elif content_type == "text/html" and html_body is None:
                payload = _decode_part_bytes(part)
                charset = part.get_content_charset() or "utf-8"
                try:
                    html_body = payload.decode(charset, errors="replace")
                except Exception:
                    html_body = payload.decode("utf-8", errors="replace")
    else:
        payload = _decode_part_bytes(message)
        charset = message.get_content_charset() or "utf-8"
        try:
            text_body = payload.decode(charset, errors="replace")
        except Exception:
            text_body = payload.decode("utf-8", errors="replace")
    return text_body, html_body


def _extract_attachments(message: Message) -> list[dict]:
    attachments: list[dict] = []
    for part in message.walk():
        disposition = str(part.get_content_disposition() or "").lower()
        filename = part.get_filename()
        if disposition != "attachment" and not filename:
            continue
        content = _decode_part_bytes(part)
        if not content:
            continue
        attachments.append(
            {
                "filename": filename or "attachment.bin",
                "content_base64": base64.b64encode(content).decode("ascii"),
                "mime_type": part.get_content_type(),
                "size": len(content),
            }
        )
    return attachments


async def _resolve_company() -> Company | None:
    if not settings.IMAP_TARGET_COMPANY_EMAIL:
        return None
    return await Company.find_one(
        {
            "email": settings.IMAP_TARGET_COMPANY_EMAIL,
            "status": CompanyStatus.ACTIVE,
        }
    )


async def _resolve_target_job(company_id: str) -> Optional[str]:
    job = await JobRepository.get_recent_jobs(company_id, limit=1)
    if not job:
        return None
    return str(job[0].id)


async def _create_inbox_item(
    *,
    company_id: str,
    job_id: Optional[str],
    external_message_id: str,
    sender_email: Optional[str],
    sender_name: Optional[str],
    subject: Optional[str],
    body_preview: Optional[str],
    attachments: list[dict],
    received_at: datetime,
) -> tuple[RecruitmentImportJob, bool]:
    existing = await RecruitmentImportJob.find_one(
        {
            "company_id": company_id,
            "external_message_id": external_message_id,
            "source": "imap",
        }
    )
    if existing:
        return existing, False

    item = RecruitmentImportJob(
        company_id=company_id,
        source="imap",
        job_id=job_id,
        external_message_id=external_message_id,
        sender_email=sender_email,
        sender_name=sender_name,
        subject=subject,
        body_preview=body_preview,
        attachments=attachments,
        result={
            "candidate_name": sender_name,
            "candidate_phone": None,
            "received_at": received_at.isoformat(),
            "source": "imap",
        },
        status=ImportStatus.PENDING,
        created_at=received_at,
        updated_at=received_at,
    )
    await item.insert()
    return item, True


async def sync_inbox_once() -> dict[str, int]:
    if not settings.IMAP_ENABLED:
        return {"synced_count": 0, "created_count": 0, "processed_count": 0}
    if not settings.IMAP_HOST or not settings.IMAP_USERNAME or not settings.IMAP_PASSWORD:
        logger.warning("IMAP sync is enabled but credentials are incomplete.")
        return {"synced_count": 0, "created_count": 0, "processed_count": 0}

    company = await _resolve_company()
    if not company:
        logger.warning("IMAP sync skipped: target company not found or inactive.")
        return {"synced_count": 0, "created_count": 0, "processed_count": 0}

    def _read_messages() -> list[dict]:
        client_factory = imaplib.IMAP4_SSL if settings.IMAP_SSL else imaplib.IMAP4
        client = client_factory(settings.IMAP_HOST, settings.IMAP_PORT)
        client.login(settings.IMAP_USERNAME, settings.IMAP_PASSWORD)
        client.select(settings.IMAP_FOLDER)
        typ, data = client.search(None, "ALL")
        if typ != "OK":
            client.logout()
            return []
        uids = data[0].split() if data and data[0] else []
        messages: list[dict] = []
        for uid in uids:
            typ, fetch_data = client.fetch(uid, "(RFC822 UID FLAGS INTERNALDATE)")
            if typ != "OK" or not fetch_data:
                continue
            raw_bytes = None
            flags = ""
            uid_value = uid.decode("ascii", errors="ignore")
            internal_date = None
            for item in fetch_data:
                if isinstance(item, tuple) and len(item) >= 2:
                    raw_bytes = item[1]
                    meta = item[0].decode("utf-8", errors="ignore") if isinstance(item[0], bytes) else str(item[0])
                    uid_match = re.search(r"UID (\d+)", meta)
                    if uid_match:
                        uid_value = uid_match.group(1)
                    flags_match = re.search(r"FLAGS \((.*?)\)", meta)
                    if flags_match:
                        flags = flags_match.group(1)
                    date_match = re.search(r'INTERNALDATE "([^"]+)"', meta)
                    if date_match:
                        try:
                            internal_date = email.utils.parsedate_to_datetime(date_match.group(1))
                        except Exception:
                            internal_date = None
            if not raw_bytes:
                continue
            message = email.message_from_bytes(raw_bytes)
            messages.append(
                {
                    "uid": uid_value,
                    "flags": flags,
                    "internal_date": internal_date,
                    "message": message,
                }
            )

        if settings.IMAP_MARK_SEEN and uids:
            try:
                client.store(b",".join(uids), "+FLAGS", "\\Seen")
            except Exception:
                logger.exception("Failed to mark IMAP messages as seen")
        client.logout()
        return messages

    messages = await asyncio.to_thread(_read_messages)
    saved = 0
    auto_processed = 0
    for item in messages:
        message: Message = item["message"]
        subject = message.get("subject")
        sender_name, sender_email = _message_address(message.get("from"))
        message_id = message.get("message-id") or item["uid"]
        received_at = item["internal_date"] or utc_now()
        text_body, html_body = _extract_body(message)
        attachments = _extract_attachments(message)
        body_source = text_body or (html_body and _html_to_text(html_body)) or ""
        body_preview = _clean_text(body_source)[:500] if body_source else None
        job_id = await _resolve_target_job(company_id=str(company.id))
        inbox_item, created = await _create_inbox_item(
            company_id=str(company.id),
            job_id=job_id,
            external_message_id=str(message_id),
            sender_email=sender_email,
            sender_name=sender_name,
            subject=_clean_text(subject) if subject else None,
            body_preview=body_preview,
            attachments=attachments,
            received_at=parse_to_utc(received_at),
        )
        if created:
            saved += 1

        has_resume = any(
            (attachment.get("filename") or "").lower().endswith((".pdf", ".doc", ".docx", ".rtf"))
            for attachment in attachments
        )
        if has_resume and job_id and inbox_item.status not in {ImportStatus.IMPORTED, ImportStatus.PROCESSING}:
            try:
                await RecruitmentInboxService.process_import(str(company.id), str(inbox_item.id))
                auto_processed += 1
            except Exception:
                logger.exception("Failed to auto-process IMAP recruitment message %s", message_id)

    return {"synced_count": saved, "created_count": saved, "processed_count": auto_processed}


async def get_imap_sync_status() -> dict[str, object]:
    company = await _resolve_company()
    configured = bool(
        settings.IMAP_ENABLED
        and settings.IMAP_HOST
        and settings.IMAP_USERNAME
        and settings.IMAP_PASSWORD
    )
    return {
        "enabled": bool(settings.IMAP_ENABLED),
        "configured": configured,
        "host": settings.IMAP_HOST,
        "folder": settings.IMAP_FOLDER,
        "poll_seconds": settings.IMAP_POLL_SECONDS,
        "mark_seen": settings.IMAP_MARK_SEEN,
        "target_company_email": settings.IMAP_TARGET_COMPANY_EMAIL,
        "resolved_company_id": str(company.id) if company else None,
        "resolved_company_name": getattr(company, "name", None) if company else None,
    }


async def run_imap_recruitment_sync_loop() -> None:
    if not settings.IMAP_ENABLED:
        logger.info("IMAP recruitment sync disabled.")
        return

    logger.info(
        "Starting IMAP recruitment sync for %s folder %s",
        settings.IMAP_TARGET_COMPANY_EMAIL or "unknown-company",
        settings.IMAP_FOLDER,
    )
    poll_seconds = max(30, int(settings.IMAP_POLL_SECONDS))
    from app.core.leader import try_acquire_leader
    while True:
        if not await try_acquire_leader("imap_recruitment_sync", ttl_seconds=max(20, poll_seconds - 10)):
            await asyncio.sleep(poll_seconds)
            continue
        try:
            saved = await sync_inbox_once()
            if saved["synced_count"]:
                logger.info("IMAP recruitment sync saved %s message(s).", saved["synced_count"])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("IMAP recruitment sync failed")
        await asyncio.sleep(poll_seconds)
