from pathlib import Path

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter

from app.rag.parsers import parse_document


def test_malformed_pdf_rejected(tmp_path: Path):
    path = tmp_path / "bad.pdf"
    path.write_bytes(b"%PDF not really")

    with pytest.raises(HTTPException) as exc:
        parse_document(path, "pdf")

    assert "malformed" in str(exc.value.detail).lower()


def test_encrypted_pdf_rejected(tmp_path: Path):
    path = tmp_path / "encrypted.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.encrypt("secret")
    with path.open("wb") as handle:
        writer.write(handle)

    with pytest.raises(HTTPException) as exc:
        parse_document(path, "pdf")

    assert "encrypted" in str(exc.value.detail).lower()


def test_pdf_page_count_limit_rejected(monkeypatch, tmp_path: Path):
    path = tmp_path / "one-page.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with path.open("wb") as handle:
        writer.write(handle)
    monkeypatch.setattr("app.core.config.settings.RAG_PDF_MAX_PAGES", 0)

    with pytest.raises(HTTPException) as exc:
        parse_document(path, "pdf")

    assert "page count" in str(exc.value.detail).lower()

