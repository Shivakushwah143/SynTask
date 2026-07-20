from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import settings


@dataclass(slots=True)
class ParsedSection:
    text: str
    location: dict


PROMPT_INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all previous instructions",
    "system prompt",
    "developer message",
    "reveal your instructions",
    "bypass",
    "jailbreak",
    "act as system",
]


def detect_prompt_injection(text: str) -> bool:
    lowered = (text or "").lower()
    return any(pattern in lowered for pattern in PROMPT_INJECTION_PATTERNS)


def parse_document(path: Path, document_type: str) -> list[ParsedSection]:
    if document_type in {"txt", "markdown"}:
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text file must be UTF-8 encoded") from exc
        return [ParsedSection(text=text, location={"type": "file", "page": None, "section": "body"})]

    if document_type == "pdf":
        try:
            from pypdf import PdfReader
        except Exception as exc:  # pragma: no cover - dependency presence is environment-specific
            raise RuntimeError("pypdf is required for PDF ingestion") from exc

        try:
            reader = PdfReader(str(path))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF is malformed or unsupported") from exc
        if reader.is_encrypted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Encrypted PDFs are not supported")
        if len(reader.pages) > settings.RAG_PDF_MAX_PAGES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="PDF exceeds maximum page count")

        sections: list[ParsedSection] = []
        for index, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"PDF page {index} could not be parsed") from exc
            if text.strip():
                sections.append(ParsedSection(text=text, location={"type": "pdf_page", "page": index, "section": f"page {index}"}))
        if not sections:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF contains no extractable text")
        return sections

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document type")

