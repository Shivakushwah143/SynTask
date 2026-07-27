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
