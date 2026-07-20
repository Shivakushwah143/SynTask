from __future__ import annotations

from dataclasses import dataclass
import csv
import html
from html.parser import HTMLParser
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

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


def _safe_zip(path: Path) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Office document is malformed") from exc
    total = sum(info.file_size for info in archive.infolist())
    if total > settings.RAG_OFFICE_MAX_UNCOMPRESSED_BYTES:
        archive.close()
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Office document exceeds decompressed size limit")
    bad_names = [info.filename for info in archive.infolist() if ".." in Path(info.filename).parts or info.filename.startswith("/")]
    if bad_names:
        archive.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Office document contains unsafe paths")
    return archive


def _xml_text_from_root(root: ET.Element) -> list[str]:
    texts = []
    for elem in root.iter():
        if elem.tag.endswith("}t") and elem.text:
            texts.append(elem.text)
    return texts


def _xml_text(xml_bytes: bytes) -> list[str]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Office XML is malformed") from exc
    return _xml_text_from_root(root)


def _parse_docx(path: Path) -> list[ParsedSection]:
    sections: list[ParsedSection] = []
    with _safe_zip(path) as archive:
        names = set(archive.namelist())
        if any(name.startswith("word/vbaProject") for name in names):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Macro-enabled DOCX content is not supported")
        if "word/document.xml" not in names:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="DOCX missing document body")
        texts = _xml_text(archive.read("word/document.xml"))
        if texts:
            sections.append(ParsedSection(text="\n".join(texts), location={"type": "docx", "section": "document"}))
        table_names = [name for name in names if name.startswith("word/tables/")]
        for index, name in enumerate(table_names, start=1):
            texts = _xml_text(archive.read(name))
            if texts:
                sections.append(ParsedSection(text="\n".join(texts), location={"type": "docx_table", "table": index, "section": name}))
    if not sections:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="DOCX contains no extractable text")
    return sections


def _parse_pptx(path: Path) -> list[ParsedSection]:
    sections: list[ParsedSection] = []
    with _safe_zip(path) as archive:
        names = set(archive.namelist())
        if any("vbaProject" in name for name in names):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Macro-enabled PPTX content is not supported")
        slide_names = sorted(name for name in names if re.match(r"ppt/slides/slide\d+\.xml$", name))
        if len(slide_names) > settings.RAG_PPTX_MAX_SLIDES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="PPTX exceeds maximum slide count")
        notes_names = {Path(name).stem.replace("notesSlide", "slide"): name for name in names if name.startswith("ppt/notesSlides/notesSlide")}
        for index, name in enumerate(slide_names, start=1):
            texts = _xml_text(archive.read(name))
            note_texts = _xml_text(archive.read(notes_names.get(f"slide{index}"))) if notes_names.get(f"slide{index}") else []
            merged = "\n".join([*texts, *([f"Speaker notes: {' '.join(note_texts)}"] if note_texts else [])])
            if merged.strip():
                sections.append(ParsedSection(text=merged, location={"type": "pptx_slide", "slide": index, "section": Path(name).name}))
    if not sections:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PPTX contains no extractable text")
    return sections


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="XLSX shared strings are malformed") from exc
    return ["".join(_xml_text_from_root(item)) for item in root.iter() if item.tag.endswith("}si")]


def _parse_xlsx(path: Path) -> list[ParsedSection]:
    sections: list[ParsedSection] = []
    with _safe_zip(path) as archive:
        names = set(archive.namelist())
        if any("vbaProject" in name or name.endswith(".bin") for name in names):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Macro or embedded binary XLSX content is not supported")
        sheet_names = sorted(name for name in names if re.match(r"xl/worksheets/sheet\d+\.xml$", name))
        if len(sheet_names) > settings.RAG_XLSX_MAX_SHEETS:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="XLSX exceeds maximum sheet count")
        shared = _xlsx_shared_strings(archive)
        for sheet_index, name in enumerate(sheet_names, start=1):
            root = ET.fromstring(archive.read(name))
            rows = []
            for row_index, row in enumerate([elem for elem in root.iter() if elem.tag.endswith("}row")], start=1):
                if row_index > settings.RAG_XLSX_MAX_ROWS:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="XLSX exceeds maximum row count")
                values = []
                for cell in [elem for elem in row if elem.tag.endswith("}c")]:
                    cell_ref = cell.attrib.get("r", "")
                    cell_type = cell.attrib.get("t", "")
                    value_elem = next((child for child in cell if child.tag.endswith("}v")), None)
                    formula_elem = next((child for child in cell if child.tag.endswith("}f")), None)
                    if formula_elem is not None:
                        values.append(f"{cell_ref}=[formula-not-executed]")
                    elif value_elem is not None and value_elem.text is not None:
                        if cell_type == "s":
                            try:
                                idx = int(value_elem.text)
                            except ValueError:
                                idx = -1
                            value = shared[idx] if 0 <= idx < len(shared) else ""
                        else:
                            value = value_elem.text
                        values.append(f"{cell_ref}={value}")
                    elif cell_type == "inlineStr":
                        inline_text = " ".join(_xml_text_from_root(cell))
                        if inline_text:
                            values.append(f"{cell_ref}={inline_text}")
                if values:
                    rows.append(" | ".join(values))
            if rows:
                sections.append(ParsedSection(text="\n".join(rows), location={"type": "xlsx_sheet", "sheet": sheet_index, "section": Path(name).name}))
    if not sections:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="XLSX contains no extractable text")
    return sections


def _parse_csv(path: Path) -> list[ParsedSection]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file must be UTF-8 encoded") from exc
    rows = []
    reader = csv.reader(text.splitlines())
    for row_index, row in enumerate(reader, start=1):
        if row_index > settings.RAG_CSV_MAX_ROWS:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="CSV exceeds maximum row count")
        rows.append(f"row {row_index}: " + " | ".join(row))
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV contains no rows")
    return [ParsedSection(text="\n".join(rows), location={"type": "csv", "section": "rows"})]


class VisibleHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "iframe", "object", "embed"}:
            self.hidden += 1
        if tag in {"h1", "h2", "h3", "p", "li", "tr", "title"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "iframe", "object", "embed"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden and data.strip():
            self.parts.append(html.unescape(data.strip()))


def _parse_html(path: Path) -> list[ParsedSection]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="HTML file must be UTF-8 encoded") from exc
    parser = VisibleHTMLParser()
    parser.feed(text)
    visible = " ".join(" ".join(parser.parts).split())
    if not visible:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="HTML contains no visible text")
    return [ParsedSection(text=visible, location={"type": "html", "section": "visible_content"})]


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

    if document_type == "docx":
        return _parse_docx(path)
    if document_type == "pptx":
        return _parse_pptx(path)
    if document_type == "xlsx":
        return _parse_xlsx(path)
    if document_type == "csv":
        return _parse_csv(path)
    if document_type == "html":
        return _parse_html(path)

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document type")
