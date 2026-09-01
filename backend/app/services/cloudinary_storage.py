from __future__ import annotations

import hashlib
import base64
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import requests
from fastapi import HTTPException, status

from app.core.config import settings


IMAGE_MIME_PREFIX = "image/"


def _cloudinary_configured() -> bool:
    return bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)


def _sign(params: dict[str, Any]) -> str:
    payload = "&".join(
        f"{key}={value}"
        for key, value in sorted(params.items())
        if value is not None and value != "" and key not in {"file", "api_key", "resource_type"}
    )
    return hashlib.sha1(f"{payload}{settings.CLOUDINARY_API_SECRET}".encode("utf-8")).hexdigest()


def _resource_type(mime_type: str) -> str:
    return "image" if mime_type.startswith(IMAGE_MIME_PREFIX) else "auto"


def _delivery_signature(path_to_sign: str) -> str:
    digest = hashlib.sha1(f"{path_to_sign}{settings.CLOUDINARY_API_SECRET}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")[:8]


class CloudinaryStorage:
    @staticmethod
    def enabled() -> bool:
        return settings.STORAGE_BACKEND.lower() == "cloudinary" and _cloudinary_configured()

    @staticmethod
    def public_id(scope: str, filename: str) -> str:
        stem = Path(filename or "file").stem[:80] or "file"
        return f"{settings.CLOUDINARY_UPLOAD_FOLDER}/{scope}/{uuid.uuid4().hex}-{stem}"

    @staticmethod
    def upload(
        *,
        content: bytes,
        filename: str,
        mime_type: str,
        scope: str,
        sensitive: bool = True,
    ) -> dict[str, Any]:
        if not CloudinaryStorage.enabled():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cloudinary storage is not configured",
            )

        resource_type = _resource_type(mime_type)
        public_id = CloudinaryStorage.public_id(scope, filename)
        params: dict[str, Any] = {
            "api_key": settings.CLOUDINARY_API_KEY,
            "timestamp": int(time.time()),
            "public_id": public_id,
            "type": "authenticated" if sensitive else "upload",
        }
        params["signature"] = _sign(params)

        url = f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/upload"
        try:
            response = requests.post(
                url,
                data=params,
                files={"file": (filename, content, mime_type)},
                timeout=30,
            )
        except requests.RequestException as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cloudinary upload failed",
            ) from exc

        if response.status_code >= 400:
            try:
                cloudinary_message = response.json().get("error", {}).get("message") or response.text[:300]
            except Exception:
                cloudinary_message = response.text[:300]
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "File upload failed at the storage provider: "
                    + (cloudinary_message or "unknown error")
                ),
            )

        payload = response.json()
        return {
            "file_url": payload.get("secure_url") or payload.get("url"),
            "public_id": payload.get("public_id") or public_id,
            "resource_type": payload.get("resource_type") or resource_type,
            "delivery_type": payload.get("type") or params["type"],
            "bytes": payload.get("bytes"),
        }

    @staticmethod
    def signed_url(
        public_id: str,
        resource_type: str = "image",
        delivery_type: str = "authenticated",
        expires_in: int = 3600,
        attachment: bool = False,
        storage_url: str | None = None,
    ) -> str | None:
        """Build a short-lived signed delivery URL for a stored Cloudinary file.

        Used for secure preview/download of ``authenticated`` resources so
        confidential HR documents are never exposed through an unsigned URL.
        Returns ``None`` when Cloudinary is not configured.
        """
        if not CloudinaryStorage.enabled() or not public_id:
            return None
        if delivery_type == "upload":
            if not storage_url:
                return f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/upload/{public_id}"
            return storage_url

        delivery_tail = None
        parsed = urlparse(storage_url or "")
        marker = f"/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/{delivery_type}/"
        if parsed.scheme and marker in parsed.path:
            delivery_tail = parsed.path.split(marker, 1)[1].lstrip("/")
        if not delivery_tail:
            delivery_tail = public_id.lstrip("/")

        if attachment and not delivery_tail.startswith("fl_attachment/"):
            delivery_tail = f"fl_attachment/{delivery_tail}"
        signature = _delivery_signature(delivery_tail)
        signed_path = f"/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/{delivery_type}/s--{signature}--/{delivery_tail}"
        if parsed.scheme:
            return urlunparse((parsed.scheme, parsed.netloc, signed_path, "", "", ""))
        return f"https://res.cloudinary.com{signed_path}"

    @staticmethod
    def delete(public_id: str, resource_type: str = "image", delivery_type: str = "upload") -> None:
        if not public_id or not CloudinaryStorage.enabled():
            return
        params: dict[str, Any] = {
            "api_key": settings.CLOUDINARY_API_KEY,
            "timestamp": int(time.time()),
            "public_id": public_id,
            "type": delivery_type,
        }
        params["signature"] = _sign(params)
        url = f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/destroy"
        try:
            requests.post(url, data=params, timeout=15)
        except requests.RequestException:
            return
