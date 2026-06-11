"""
File content detection helpers that do not require native libmagic.
"""
from pathlib import Path
from typing import Optional


OFFICE_MIME_BY_EXTENSION = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _looks_like_text(data: bytes) -> Optional[str]:
    sample = data[:2048].lstrip()
    try:
        text = sample.decode("utf-8", errors="strict").lower()
    except UnicodeDecodeError:
        return None

    if text.startswith("<!doctype html") or text.startswith("<html") or b"<script" in sample.lower():
        return "text/html"
    return "text/plain"


def detect_mime_type(file_content: bytes, filename: str = "") -> str:
    """Detect common upload MIME types from file signatures."""
    ext = Path(filename or "").suffix.lower()
    header = file_content[:2048]

    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image/webp"
    if header.startswith(b"%PDF"):
        return "application/pdf"
    if header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "application/msword"
    if header.startswith(b"PK\x03\x04"):
        return OFFICE_MIME_BY_EXTENSION.get(ext, "application/zip")

    text_mime = _looks_like_text(header)
    if text_mime:
        return text_mime

    return "application/octet-stream"
