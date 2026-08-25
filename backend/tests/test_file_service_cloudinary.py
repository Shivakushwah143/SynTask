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
