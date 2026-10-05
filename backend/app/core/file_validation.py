"""
File content detection helpers that do not require native libmagic.
"""
from pathlib import Path
from typing import Optional


OFFICE_MIME_BY_EXTENSION = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

    # Video signatures
    if header.startswith(b"\x1a\x45\xdf\xa3"):  # EBML container (webm/mkv)
        return "video/webm" if ext == ".webm" else "video/x-matroska"
    if header[4:8] == b"ftyp":  # ISO BMFF container (mp4/mov/m4v)
        return "video/quicktime" if ext == ".mov" else "video/mp4"
    if header.startswith(b"RIFF") and header[8:12] == b"AVI ":
        return "video/x-msvideo"
    if header.startswith(b"OggS"):
        return "video/ogg" if ext in (".ogv", ".ogg") else "audio/ogg"

    # Audio signatures
    if header.startswith(b"ID3") or header.startswith(b"\xff\xfb") or header.startswith(b"\xff\xf3"):
        return "audio/mpeg"
    if header.startswith(b"RIFF") and header[8:12] == b"WAVE":
        return "audio/wav"
    if header.startswith(b"fLaC"):
        return "audio/flac"

    text_mime = _looks_like_text(header)
    if text_mime:
        return text_mime

    return "application/octet-stream"
