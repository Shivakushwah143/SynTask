from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.core.file_validation import detect_mime_type
from app.services.cloudinary_storage import CloudinaryStorage


def _validate_uploaded_file(
    filename: str,
    file_content: bytes,
    *,
    allow_any_type: bool = False,
) -> str:
    """Validate an uploaded file.

    When ``allow_any_type`` is True (used by the general-purpose upload endpoint
    that backs task/project attachments), any extension and MIME type is accepted
    so videos, spreadsheets, PDFs, and other files can be attached. The filename
    is still sanitized and the file size is still capped by the caller.
    """
    file_ext = Path(filename or "").suffix.lower()
    if allow_any_type:
        return file_ext

    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    detected_mime = detect_mime_type(file_content, filename)
    # Video/audio MIME entries are reserved for future extension additions to
    # settings.ALLOWED_EXTENSIONS: today the extension check above gates first,
    # so strict-mode endpoints (avatar, RAG sources, etc.) still reject videos.
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
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-matroska",
        "video/x-msvideo",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/flac",
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
        allow_any_type: bool = False,
        max_size: int | None = None,
    ) -> dict:
        file_content = await file.read()
        file_size = len(file_content)

        size_limit = max_size if max_size is not None else settings.MAX_UPLOAD_SIZE
        if file_size > size_limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File is too large: {file_size / 1024 / 1024:.1f} MB exceeds the "
                    f"maximum allowed size of {size_limit / 1024 / 1024:.0f} MB"
                ),
            )

        file_ext = _validate_uploaded_file(
            file.filename or "",
            file_content,
            allow_any_type=allow_any_type,
        )
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
