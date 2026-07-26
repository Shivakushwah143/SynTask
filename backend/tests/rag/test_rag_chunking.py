from app.rag.chunking import chunk_sections
from app.rag.parsers import ParsedSection


def test_rag_chunk_sections_preserves_location_and_order():
    sections = [ParsedSection(text="one two three " * 400, location={"page": 3, "section": "page 3"})]

    chunks = chunk_sections(sections)

    assert chunks
    assert chunks[0].ordinal == 1
    assert chunks[0].location["page"] == 3
    assert chunks[0].checksum
