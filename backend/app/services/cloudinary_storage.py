from __future__ import annotations

import hashlib
import base64
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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
    secret = (settings.CLOUDINARY_API_SECRET or "").strip()
    return hashlib.sha1(f"{payload}{secret}".encode("utf-8")).hexdigest()


def _resource_type(mime_type: str) -> str:
    return "image" if mime_type.startswith(IMAGE_MIME_PREFIX) else "auto"


def _delivery_signature(path_to_sign: str) -> str:
    secret = (settings.CLOUDINARY_API_SECRET or "").strip()
    digest = hashlib.sha1(f"{path_to_sign}{secret}".encode("utf-8")).digest()
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

        Uses Cloudinary signed delivery URLs for authenticated/private files.
        """
        if not CloudinaryStorage.enabled() or not public_id:
            return None
        if delivery_type == "upload":
            if not storage_url:
                return f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/upload/{public_id}"
            return storage_url

        delivery_path = public_id
        if storage_url:
            parsed = urlparse(storage_url)
            marker = f"/{resource_type}/{delivery_type}/"
            if marker in parsed.path:
                delivery_path = parsed.path.split(marker, 1)[1]

        signature = _delivery_signature(delivery_path)
        return (
            f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}/"
            f"{resource_type}/{delivery_type}/s--{signature}--/{delivery_path}"
        )

    @staticmethod
    def download_content(
        public_id: str,
        resource_type: str = "auto",
        delivery_type: str = "authenticated",
        storage_url: str | None = None,
    ) -> bytes | None:
        """Download file content from Cloudinary server-side.

        Generates a signed delivery URL internally and fetches the bytes.
        Never exposes the Cloudinary URL to clients — the raw bytes are
        returned for direct streaming through the backend.
        """
        if not CloudinaryStorage.enabled() or not public_id:
            return None
        url = CloudinaryStorage.signed_url(
            public_id,
            resource_type=resource_type,
            delivery_type=delivery_type,
            storage_url=storage_url,
        )
        if not url:
            return None
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code >= 400:
                return None
            return resp.content
        except requests.RequestException:
            return None

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
