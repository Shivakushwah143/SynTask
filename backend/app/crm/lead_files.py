from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException, UploadFile, status

from app.timeline.publisher import publish_crm_timeline_event
from app.models.sales_lead_file import SalesLeadFile
from app.crm.models import SalesProspect
from app.models.user import User, UserRole
from app.services.file_service import FileService


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _can_access_lead(current_user: User, prospect: SalesProspect) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return True


async def _load_lead(lead_id: str, current_user: User) -> SalesProspect:
    prospect = await SalesProspect.get(lead_id)
    if not prospect or prospect.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    _can_access_lead(current_user, prospect)
    return prospect


def _file_metadata(file_record: SalesLeadFile) -> Dict[str, Any]:
    return {
        "id": str(file_record.id),
        "lead_id": file_record.lead_id,
        "company_id": file_record.company_id,
        "file_url": file_record.file_url,
        "download_url": file_record.file_url,
        "file_name": file_record.file_name,
        "original_name": file_record.original_name,
        "file_type": file_record.file_type,
        "mime_type": file_record.mime_type,
        "file_size": file_record.file_size,
        "uploaded_by": file_record.uploaded_by,
        "uploaded_by_name": file_record.uploaded_by_name,
        "deleted_by": file_record.deleted_by,
        "deleted_by_name": file_record.deleted_by_name,
        "deleted": file_record.deleted,
        "deleted_at": file_record.deleted_at,
        "uploaded_at": file_record.created_at,
        "updated_at": file_record.updated_at,
    }


def _safe_delete_file(file_url: str) -> None:
    filename = Path(file_url or "").name
    if not filename:
        return
    file_path = FileService.resolve_upload_path(filename)
    if file_path.exists():
        file_path.unlink()


class CRMLeadFilesService:
    @staticmethod
    async def list_files(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_lead(lead_id, current_user)
        files = await SalesLeadFile.find(
            {
                "company_id": str(prospect.company_id),
                "lead_id": str(prospect.id),
                "deleted": False,
            }
        ).sort("-created_at").to_list()
        return {
            "lead_id": str(prospect.id),
            "lead_name": prospect.prospect_name,
            "files": [_file_metadata(file_record) for file_record in files],
            "total": len(files),
        }

    @staticmethod
    async def upload_file(current_user: User, lead_id: str, file: UploadFile) -> Dict[str, Any]:
        prospect = await _load_lead(lead_id, current_user)
        stored = await FileService.store_uploaded_file(file, upload_dir=FileService.resolve_upload_dir(), url_prefix="/api/v1/files")
        now = datetime.now()
        file_record = SalesLeadFile(
            lead_id=str(prospect.id),
            company_id=str(prospect.company_id),
            file_url=stored["file_url"],
            file_name=stored["filename"] or Path(stored["file_url"]).name,
            original_name=stored["filename"],
            file_type=stored["extension"].lstrip(".") if stored.get("extension") else None,
            mime_type=stored["type"],
            file_size=stored["size"],
            uploaded_by=str(getattr(current_user, "id", "")),
            uploaded_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
            created_at=now,
            updated_at=now,
        )
        try:
            await file_record.insert()
        except Exception:
            _safe_delete_file(stored["file_url"])
            raise

        await publish_crm_timeline_event(
            event_name="FileUploaded",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=str(prospect.company_id),
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "file_id": str(file_record.id),
                "file_name": file_record.file_name,
                "file_url": file_record.file_url,
                "file_size": file_record.file_size,
                "file_type": file_record.file_type,
                "uploaded_by": file_record.uploaded_by,
                "uploaded_by_name": file_record.uploaded_by_name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "files"},
        )

        return {
            "message": "File uploaded successfully",
            "file": _file_metadata(file_record),
        }

    @staticmethod
    async def delete_file(current_user: User, lead_id: str, file_id: str) -> Dict[str, Any]:
        prospect = await _load_lead(lead_id, current_user)
        file_record = await SalesLeadFile.get(file_id)
        if not file_record or file_record.deleted or file_record.lead_id != str(prospect.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        if file_record.company_id != str(prospect.company_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        now = datetime.now()
        file_record.deleted = True
        file_record.deleted_at = now
        file_record.deleted_by = str(getattr(current_user, "id", ""))
        file_record.deleted_by_name = _display_name(current_user, str(getattr(current_user, "id", "system")))
        file_record.updated_at = now
        await file_record.save()

        _safe_delete_file(file_record.file_url)

        await publish_crm_timeline_event(
            event_name="FileDeleted",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=str(prospect.company_id),
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "file_id": str(file_record.id),
                "file_name": file_record.file_name,
                "file_url": file_record.file_url,
                "file_size": file_record.file_size,
                "file_type": file_record.file_type,
                "deleted_by": file_record.deleted_by,
                "deleted_by_name": file_record.deleted_by_name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "files"},
        )

        return {
            "message": "File deleted successfully",
            "file": _file_metadata(file_record),
        }

