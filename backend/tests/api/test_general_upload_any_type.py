"""
Tests for the general-purpose file upload behavior:

1. ``store_uploaded_file(..., allow_any_type=True)`` accepts videos and other
   non-whitelisted types (used by the general ``/files/upload`` endpoint that
   backs task attachments).
2. Strict mode (default) still rejects disallowed types.
3. Size errors produce a clear 413 message that includes the actual file size
   and the limit, instead of a vague message.
4. Video/audio MIME detection works for common signatures.
"""
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile

from app.core.file_validation import detect_mime_type
from app.services.cloudinary_storage import CloudinaryStorage
from app.services.file_service import FileService


@pytest.mark.asyncio
async def test_any_type_upload_accepts_video(monkeypatch, tmp_path):
    """A .mp4 video upload must succeed when allow_any_type=True (local fallback)."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: False))

    # Minimal ISO BMFF signature: bytes 4..8 == b"ftyp"
    mp4_bytes = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 32
    upload = UploadFile(filename="demo-video.mp4", file=BytesIO(mp4_bytes))
    stored = await FileService.store_uploaded_file(
        upload,
        upload_dir=tmp_path,
        url_prefix="/uploads",
        allow_any_type=True,
    )

    assert stored["file_url"].startswith("/uploads/")
    assert stored["file_path"].exists()
    assert stored["file_path"].suffix == ".mp4"


@pytest.mark.asyncio
async def test_strict_mode_still_rejects_video(monkeypatch, tmp_path):
    """Without allow_any_type, videos remain rejected (avatar/RAG uploads stay strict)."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: False))

    mp4_bytes = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 32
    upload = UploadFile(filename="demo-video.mp4", file=BytesIO(mp4_bytes))
    with pytest.raises(HTTPException) as exc_info:
        await FileService.store_uploaded_file(
            upload,
            upload_dir=tmp_path,
            url_prefix="/uploads",
        )
    assert exc_info.value.status_code == 400
    assert "not allowed" in exc_info.value.detail


@pytest.mark.asyncio
async def test_size_error_message_is_clear(monkeypatch, tmp_path):
    """413 detail must state the actual size and the limit in MB."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: False))

    # 11 MB of content exceeds the default 10 MB limit
    oversized = b"\x00" * (11 * 1024 * 1024)
    upload = UploadFile(filename="big.xlsx", file=BytesIO(oversized))
    with pytest.raises(HTTPException) as exc_info:
        await FileService.store_uploaded_file(
            upload,
            upload_dir=tmp_path,
            url_prefix="/uploads",
            allow_any_type=True,
        )
    assert exc_info.value.status_code == 413
    assert "11.0 MB" in exc_info.value.detail
    assert "10 MB" in exc_info.value.detail


@pytest.mark.asyncio
async def test_custom_max_size_override(monkeypatch, tmp_path):
    """max_size param allows the general endpoint to raise the limit."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: False))

    # 20 MB passes with a 200 MB override but would fail the 10 MB default
    content = b"\x00" * (20 * 1024 * 1024)
    upload = UploadFile(filename="clip.mp4", file=BytesIO(content))
    stored = await FileService.store_uploaded_file(
        upload,
        upload_dir=tmp_path,
        url_prefix="/uploads",
        allow_any_type=True,
        max_size=200 * 1024 * 1024,
    )
    assert stored["file_path"].exists()
    assert stored["size"] == len(content)


def test_cloudinary_failure_surfaces_provider_message(monkeypatch):
    """When the storage provider rejects a file (e.g. its own size limit), the
    detail must include the provider's message so the user sees a clear error."""
    monkeypatch.setattr(CloudinaryStorage, "enabled", staticmethod(lambda: True))

    class FakeResponse:
        status_code = 400
        text = '{"error":{"message":"File size too large"}}'

        def json(self):
            return {"error": {"message": "File size too large"}}

    monkeypatch.setattr(
        "app.services.cloudinary_storage.requests.post",
        lambda *args, **kwargs: FakeResponse(),
    )

    with pytest.raises(HTTPException) as exc_info:
        CloudinaryStorage.upload(
            content=b"\x00" * 64,
            filename="big-video.mp4",
            mime_type="video/mp4",
            scope="files",
        )
    assert exc_info.value.status_code == 502
    assert "File size too large" in exc_info.value.detail
    assert "storage provider" in exc_info.value.detail


def test_detect_mime_type_video_and_audio_signatures():
    assert detect_mime_type(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom", "clip.mp4") == "video/mp4"
    assert detect_mime_type(b"\x00\x00\x00\x18ftypqt  \x00\x00\x00\x00qt  ", "clip.mov") == "video/quicktime"
    assert detect_mime_type(b"\x1a\x45\xdf\xa3\x01\x00\x00\x00", "clip.webm") == "video/webm"
    assert detect_mime_type(b"ID3\x04\x00\x00\x00\x00\x00\x00", "song.mp3") == "audio/mpeg"
    assert detect_mime_type(b"RIFF\x24\x00\x00\x00WAVEfmt ", "sound.wav") == "audio/wav"
    assert detect_mime_type(b"fLaC\x00\x00\x00\x22", "song.flac") == "audio/flac"
