from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.core.file_validation import detect_mime_type
from app.services.cloudinary_storage import CloudinaryStorage


def _validate_uploaded_file(filename: str, file_content: bytes) -> str:
    file_ext = Path(filename or "").suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    detected_mime = detect_mime_type(file_content, filename)
    allowed_mime_types = {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "text/html",
        "text/plain",
        "text/markdown",
        "application/zip",
    }
    if detected_mime not in allowed_mime_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{detected_mime}' not allowed",
        )

    return file_ext


class FileService:
    detect_mime_type = staticmethod(detect_mime_type)
    validate_uploaded_file = staticmethod(_validate_uploaded_file)

    @staticmethod
    def resolve_upload_dir() -> Path:
        upload_dir = Path(__file__).resolve().parents[2] / settings.UPLOAD_DIR
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir

    @staticmethod
    def resolve_upload_path(filename: str) -> Path:
        return FileService.resolve_upload_dir() / Path(filename).name

    @staticmethod
    async def store_uploaded_file(
        file: UploadFile,
        *,
        upload_dir: Path,
        url_prefix: str,
        scope: str = "files",
        sensitive: bool = True,
    ) -> dict:
        file_content = await file.read()
        file_size = len(file_content)

        if file_size > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB",
            )

        file_ext = _validate_uploaded_file(file.filename or "", file_content)
        detected_mime = detect_mime_type(file_content, file.filename or "")
        if CloudinaryStorage.enabled():
            stored = CloudinaryStorage.upload(
                content=file_content,
                filename=file.filename or f"upload{file_ext}",
                mime_type=detected_mime,
                scope=scope,
                sensitive=sensitive,
            )
            return {
                "file_path": None,
                "file_url": stored["file_url"],
                "cloudinary_public_id": stored["public_id"],
                "cloudinary_resource_type": stored["resource_type"],
                "cloudinary_delivery_type": stored["delivery_type"],
                "filename": file.filename,
                "size": file_size,
                "type": detected_mime,
                "extension": file_ext,
                "unique_filename": Path(stored["public_id"]).name,
            }

        unique_filename = f"{uuid.uuid4()}{file_ext}"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / unique_filename

        with open(file_path, "wb") as handle:
            handle.write(file_content)

        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File upload failed - file not saved",
            )

        file_size_on_disk = file_path.stat().st_size
        if file_size_on_disk != file_size:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File upload failed - size mismatch",
            )

        return {
            "file_path": file_path,
            "file_url": f"{url_prefix}/{unique_filename}",
            "filename": file.filename,
            "size": file_size,
            "type": file.content_type or "application/octet-stream",
            "extension": file_ext,
            "unique_filename": unique_filename,
        }
