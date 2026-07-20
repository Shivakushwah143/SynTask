from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from uuid import uuid4

from app.core.config import settings
from app.rag.parsers import ParsedSection


@dataclass(slots=True)
class RAGChunkDraft:
    chunk_id: str
    ordinal: int
    text: str
    location: dict
    checksum: str


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _word_chunks(text: str, max_words: int, overlap_words: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(start + max_words, len(words))
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start = max(0, end - overlap_words)
    return chunks


def chunk_sections(sections: list[ParsedSection]) -> list[RAGChunkDraft]:
    max_words = max(50, int(settings.RAG_CHUNK_MAX_TOKENS * 0.75))
    overlap_words = max(0, int(settings.RAG_CHUNK_OVERLAP_TOKENS * 0.75))
    drafts: list[RAGChunkDraft] = []
    ordinal = 0
    for section in sections:
        normalized = re.sub(r"\s+", " ", section.text or "").strip()
        for text in _word_chunks(normalized, max_words, overlap_words):
            ordinal += 1
            drafts.append(
                RAGChunkDraft(
                    chunk_id=str(uuid4()),
                    ordinal=ordinal,
                    text=text,
                    location={**section.location, "ordinal": ordinal},
                    checksum=_checksum(text),
                )
            )
    return drafts

