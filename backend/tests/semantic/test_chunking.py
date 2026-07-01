from types import SimpleNamespace

from app.semantic.chunking import SemanticChunker


def test_semantic_chunking_uses_sections():
    knowledge = SimpleNamespace(
        knowledge_id="k1",
        company_id="c1",
        project_id="p1",
        campaign_id=None,
        knowledge_type="creative",
        source_entity="creative_review",
        source_entity_id="r1",
        title="Brand Review",
        summary="Summary",
        content="# Overview\nFirst section.\n\n## Notes\nSecond section.",
        status="active",
        tags=["brand"],
        importance=4,
        confidence=0.9,
        freshness=0.8,
        created_at=None,
        updated_at=None,
    )

    chunks = SemanticChunker.chunk(knowledge=knowledge)

    assert len(chunks) == 2
    assert chunks[0].content.startswith("Overview")
    assert chunks[1].content.startswith("Notes")
