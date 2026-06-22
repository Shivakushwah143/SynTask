"""
Email tasks. Keep SMTP work out of request handlers.
"""
import asyncio
from datetime import datetime
from typing import Any, Dict, Optional

from app.worker.celery_app import celery_app


def _run(coro):
    return asyncio.run(coro)


async def _ensure_db():
    from app.core.database import init_db

    await init_db()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email_task(self, email: str, token: str, name: Optional[str] = None):
    try:
        from app.core.email import send_password_reset_email

        return _run(send_password_reset_email(email=email, reset_token=token, user_name=name))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email_task(
    self,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role: str,
    created_by_name: Optional[str] = None,
):
    try:
        from app.core.email import send_welcome_email

        return _run(send_welcome_email(email, password, first_name, last_name, role, created_by_name))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_task_assignment_email_task(self, payload: Dict[str, Any]):
    try:
        from app.core.email import send_task_assignment_email

        due_date = payload.get("task_due_date")
        if isinstance(due_date, str):
            payload["task_due_date"] = datetime.fromisoformat(due_date)
        return _run(send_task_assignment_email(**payload))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_invoice_email_task(self, invoice_data: Dict[str, Any], client_email: str, client_name: str):
    try:
        from app.core.email import send_invoice_email

        return _run(send_invoice_email(invoice_data, client_email, client_name))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_msa_signature_email_task(self, msa_id: str, sender_user_id: str):
    try:
        from app.core.email import send_msa_signature_email
        from app.models.msa import MSA
        from app.models.user import User

        async def _send():
            await _ensure_db()
            msa = await MSA.get(msa_id)
            sender = await User.get(sender_user_id)
            if not msa or not sender:
                return False
            return await send_msa_signature_email(msa, sender)

        return _run(_send())
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_msa_signed_confirmation_email_task(self, msa_id: str):
    try:
        from app.core.email import send_msa_signed_confirmation_email
        from app.models.msa import MSA

        async def _send():
            await _ensure_db()
            msa = await MSA.get(msa_id)
            if not msa:
                return False
            return await send_msa_signed_confirmation_email(msa)

        return _run(_send())
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_msa_signed_copy_to_client_task(self, msa_id: str):
    try:
        from app.core.email import send_msa_signed_copy_to_client
        from app.models.msa import MSA

        async def _send():
            await _ensure_db()
            msa = await MSA.get(msa_id)
            if not msa:
                return False
            return await send_msa_signed_copy_to_client(msa)

        return _run(_send())
    except Exception as exc:
        raise self.retry(exc=exc)
