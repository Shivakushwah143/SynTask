from __future__ import annotations

import hashlib
import base64
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import cloudinary
import cloudinary.utils
import requests
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

IMAGE_MIME_PREFIX = "image/"


def _cloudinary_configured() -> bool:
    return bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)


# Configure the Cloudinary SDK once at import time.
if _cloudinary_configured():
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


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


def _ensure_cloudinary_sdk_configured() -> None:
    """Ensure the Cloudinary SDK is configured (re-configures if credentials changed)."""
    cfg = cloudinary.config()
    if cfg.cloud_name != settings.CLOUDINARY_CLOUD_NAME or cfg.api_key != settings.CLOUDINARY_API_KEY:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )


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

        # Cloudinary signed delivery URL format (matches the SDK output and the
        # docs at cloudinary.com/documentation/delivery_url_signatures):
        #   /{cloud}/{resource_type}/{delivery_type}/s--{sig}--/{transformations}/{public_id}
        # The signed string is exactly what follows the s--{sig}-- component:
        # any transformations (e.g. fl_attachment), then the versioned public_id.
        #
        # storage_url (captured at upload time) can already be a signed URL for
        # legacy/affected rows, so before re-signing we repeatedly strip stale
        # signature components (s--XXXXXXXX--/) and fl_attachment/ wrappers that
        # may have been nested into the stored path by earlier code. Leaving any
        # of them in place makes Cloudinary reject the URL with 400 Bad Request.
        delivery_tail = public_id.lstrip("/")
        parsed = urlparse(storage_url or "")
        marker = f"/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/{delivery_type}/"
        if parsed.scheme and marker in parsed.path:
            tail = parsed.path.split(marker, 1)[1].lstrip("/")
            if tail:
                delivery_tail = tail

        previous = None
        while previous != delivery_tail:
            previous = delivery_tail
            delivery_tail = re.sub(
                r"^(?:s--[A-Za-z0-9_-]+--|fl_attachment)/", "", delivery_tail
            )

        transformation = "fl_attachment/" if attachment else ""
        signature = _delivery_signature(f"{transformation}{delivery_tail}")
        signed_path = (
            f"/{settings.CLOUDINARY_CLOUD_NAME}/{resource_type}/{delivery_type}/"
            f"s--{signature}--/{transformation}{delivery_tail}"
        )

        if parsed.scheme:
            return urlunparse((parsed.scheme, parsed.netloc, signed_path, "", "", ""))
        return f"https://res.cloudinary.com{signed_path}"

    @staticmethod
    def download_content(
        public_id: str,
        *,
        resource_type: str = "image",
        delivery_type: str = "authenticated",
        storage_url: str | None = None,
    ) -> bytes | None:
        """Download raw bytes from a Cloudinary-stored file.

        Uses the official Cloudinary SDK ``private_download_url()`` to generate
        a properly signed API download URL, then fetches the content
        server-side.  ``authenticated`` resources are never exposed through
        unsigned URLs.

        Returns ``None`` when Cloudinary is not configured, the SDK is not
        configured, or the download fails after logging the Cloudinary error.
        """
        if not CloudinaryStorage.enabled() or not public_id:
            return None

        _ensure_cloudinary_sdk_configured()
        cfg = cloudinary.config()
        if not cfg.api_key or not cfg.api_secret:
            logger.error(
                "Cloudinary SDK not configured — cannot generate download URL | public_id=%s",
                public_id,
            )
            return None

        # Determine the file format from the public_id extension.
        file_format = Path(public_id).suffix.lstrip(".") or "pdf"
        # Strip the extension from public_id for the SDK call (it re-appends it).
        id_without_ext = public_id
        if file_format and public_id.endswith(f".{file_format}"):
            id_without_ext = public_id[: -(len(file_format) + 1)]

        try:
            url = cloudinary.utils.private_download_url(
                public_id=id_without_ext,
                format=file_format,
                resource_type=resource_type,
                type=delivery_type,
            )
        except Exception:
            logger.exception(
                "Failed to generate Cloudinary download URL | public_id=%s resource_type=%s",
                public_id,
                resource_type,
            )
            return None

        try:
            resp = requests.get(url, timeout=30)
        except requests.RequestException:
            logger.exception(
                "HTTP request to Cloudinary failed | public_id=%s url_prefix=%s",
                public_id,
                url[:120],
            )
            return None

        if resp.status_code != 200:
            cld_error = resp.headers.get("X-Cld-Error") or ""
            logger.error(
                "Cloudinary download failed | status=%s public_id=%s resource_type=%s "
                "X-Cld-Error=%s body_prefix=%s",
                resp.status_code,
                public_id,
                resource_type,
                cld_error,
                (resp.text[:200] if resp.text else ""),
            )
            return None

        content = resp.content
        if not content or not content.startswith(b"%PDF"):
            logger.error(
                "Cloudinary returned non-PDF content | public_id=%s content_len=%d starts_with=%r",
                public_id,
                len(content),
                content[:8] if content else b"",
            )
            return None

        return content

    @staticmethod
    def download_response(
        public_id: str,
        *,
        resource_type: str = "image",
        delivery_type: str = "authenticated",
        storage_url: str | None = None,
        attachment: bool = False,
    ) -> requests.Response | None:
        """Open a streaming HTTP response to a stored Cloudinary file (server-side).

        Used by backend-controlled file delivery so sensitive HR documents are
        proxied through the SynTask backend instead of redirecting the browser
        cross-origin to Cloudinary. The signed delivery URL is built here and
        fetched by the backend; the client only ever receives bytes from
        SynTask, so signatures and Cloudinary credentials are never exposed.

        The caller is responsible for closing the returned response once the
        stream has been consumed. Returns ``None`` (with structured logs) when
        Cloudinary is not configured, the URL cannot be built, the request
        fails, or the resource is not retrievable.
        """
        if not CloudinaryStorage.enabled() or not public_id:
            return None

        url = CloudinaryStorage.signed_url(
            public_id,
            resource_type=resource_type,
            delivery_type=delivery_type,
            storage_url=storage_url,
            attachment=attachment,
        )
        if not url:
            logger.error(
                "Cloudinary delivery URL could not be built | public_id=%s "
                "resource_type=%s delivery_type=%s",
                public_id,
                resource_type,
                delivery_type,
            )
            return None

        try:
            resp = requests.get(url, stream=True, timeout=30)
        except requests.RequestException:
            logger.exception(
                "Cloudinary delivery request failed | public_id=%s resource_type=%s delivery_type=%s",
                public_id,
                resource_type,
                delivery_type,
            )
            return None

        if resp.status_code != 200:
            cld_error = resp.headers.get("X-Cld-Error") or ""
            logger.error(
                "Cloudinary delivery failed | status=%s public_id=%s resource_type=%s "
                "delivery_type=%s X-Cld-Error=%s body_prefix=%s",
                resp.status_code,
                public_id,
                resource_type,
                delivery_type,
                cld_error,
                (resp.text[:200] if resp.text else ""),
            )
            resp.close()
            return None
        return resp

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
