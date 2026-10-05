from io import BytesIO

import pytest
from fastapi import UploadFile

from app.services.cloudinary_storage import CloudinaryStorage
from app.services.file_service import FileService


@pytest.mark.asyncio
async def test_store_uploaded_file_uses_cloudinary_when_enabled(monkeypatch, tmp_path):
    calls = {}

    def fake_upload(**kwargs):
        calls.update(kwargs)
        return {
            "file_url": "https://res.cloudinary.com/demo/image/upload/v1/syntask/avatars/test.png",
            "public_id": "syntask/avatars/test",
            "resource_type": "image",
            "delivery_type": "upload",
        }

    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    monkeypatch.setattr(CloudinaryStorage, "upload", staticmethod(fake_upload))

    upload = UploadFile(filename="avatar.png", file=BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16))
    stored = await FileService.store_uploaded_file(
        upload,
        upload_dir=tmp_path,
        url_prefix="/uploads/avatars",
        scope="avatars",
        sensitive=False,
    )

    assert stored["file_url"].startswith("https://res.cloudinary.com/")
    assert stored["cloudinary_public_id"] == "syntask/avatars/test"
    assert calls["mime_type"] == "image/png"
    assert calls["scope"] == "avatars"
    assert calls["sensitive"] is False
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_store_uploaded_file_keeps_local_fallback(monkeypatch, tmp_path):
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: False))

    upload = UploadFile(filename="note.txt", file=BytesIO(b"hello"))
    stored = await FileService.store_uploaded_file(
        upload,
        upload_dir=tmp_path,
        url_prefix="/uploads",
    )

    assert stored["file_url"].startswith("/uploads/")
    assert stored["file_path"].exists()
    assert stored["file_path"].read_bytes() == b"hello"


def test_cloudinary_signed_url_uses_delivery_signature(monkeypatch):
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_API_SECRET", "secret")

    url = CloudinaryStorage.signed_url(
        "syntask/hr/resume",
        resource_type="image",
        delivery_type="authenticated",
        storage_url="https://res.cloudinary.com/demo/image/authenticated/v123/syntask/hr/resume.pdf",
    )

    assert url.startswith("https://res.cloudinary.com/demo/image/authenticated/s--")
    assert url.endswith("--/v123/syntask/hr/resume.pdf")
    assert "signature=" not in url


def test_cloudinary_signed_url_keeps_upload_url(monkeypatch):
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    stored_url = "https://res.cloudinary.com/demo/image/upload/v123/syntask/hr/resume.pdf"

    assert CloudinaryStorage.signed_url(
        "syntask/hr/resume",
        resource_type="image",
        delivery_type="upload",
        storage_url=stored_url,
    ) == stored_url


def test_cloudinary_signed_url_attachment_places_fl_after_signature(monkeypatch):
    """fl_attachment is a transformation and must follow the s-- signature, inside the signed string."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_API_SECRET", "secret")

    url = CloudinaryStorage.signed_url(
        "syntask/hr/doc",
        resource_type="image",
        delivery_type="authenticated",
        attachment=True,
        storage_url="https://res.cloudinary.com/demo/image/authenticated/v123/syntask/hr/doc.pdf",
    )

    # Delivery type comes first, then the signature, then the transformation.
    assert url.startswith("https://res.cloudinary.com/demo/image/authenticated/s--")
    assert "/demo/image/fl_attachment/authenticated/" not in url
    assert url.count("s--") == 1
    assert url.endswith("--/fl_attachment/v123/syntask/hr/doc.pdf")


def test_cloudinary_signed_url_strips_old_signature_from_storage_url(monkeypatch):
    """When storage_url contains a previously signed URL, the old signature must be stripped."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_API_SECRET", "secret")

    url = CloudinaryStorage.signed_url(
        "syntask/hr/doc",
        resource_type="image",
        delivery_type="authenticated",
        storage_url="https://res.cloudinary.com/demo/image/authenticated/s--OLD_SIGN--/v456/syntask/hr/doc.pdf",
    )

    # Old signature must NOT appear in the URL
    assert "OLD_SIGN" not in url
    # Must have exactly one signature segment
    assert url.count("s--") == 1
    # Must end with the versioned public_id
    assert url.endswith("--/v456/syntask/hr/doc.pdf")


def test_cloudinary_signed_url_strips_old_signature_with_attachment(monkeypatch):
    """Attachment + stale signature in storage_url must both be handled correctly."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_API_SECRET", "secret")

    url = CloudinaryStorage.signed_url(
        "syntask/hr/doc",
        resource_type="image",
        delivery_type="authenticated",
        attachment=True,
        storage_url="https://res.cloudinary.com/demo/image/authenticated/s--OLD_SIGN--/v789/syntask/hr/doc.pdf",
    )

    assert "OLD_SIGN" not in url
    assert url.startswith("https://res.cloudinary.com/demo/image/authenticated/s--")
    assert url.count("s--") == 1
    assert url.endswith("--/fl_attachment/v789/syntask/hr/doc.pdf")


def test_cloudinary_signed_url_strips_deeply_nested_stale_signatures(monkeypatch):
    """Repeated re-signing of an already-signed storage_url nests signatures; all must be removed."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr("app.services.cloudinary_storage.settings.CLOUDINARY_API_SECRET", "secret")

    url = CloudinaryStorage.signed_url(
        "syntask/hr/doc",
        resource_type="image",
        delivery_type="authenticated",
        attachment=True,
        storage_url=(
            "https://res.cloudinary.com/demo/image/authenticated/"
            "s--OUTER_SIGN--/fl_attachment/s--INNER_SIGN--/v1788772577/"
            "syntask/hr/doc.pdf"
        ),
    )

    assert "OUTER_SIGN" not in url
    assert "INNER_SIGN" not in url
    assert "fl_attachment/authenticated" not in url
    assert url.startswith("https://res.cloudinary.com/demo/image/authenticated/s--")
    assert url.count("s--") == 1
    assert url.endswith("--/fl_attachment/v1788772577/syntask/hr/doc.pdf")
