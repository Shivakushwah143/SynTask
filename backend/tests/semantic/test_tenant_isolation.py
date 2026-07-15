from datetime import datetime
from types import SimpleNamespace

import pytest

from app.semantic.embeddings import LocalEmbeddingProvider
from app.semantic.retrieval import KnowledgeRetriever
from app.semantic.vector_store import QdrantVectorStore
from app.semantic.chunking import SemanticChunker


@pytest.mark.asyncio
async def test_retrieval_never_returns_other_company_content():
    provider = LocalEmbeddingProvider()
    store = QdrantVectorStore()
    retriever = KnowledgeRetriever(provider, store, cache=None)

    a = SimpleNamespace(
        knowledge_id="k1",
        company_id="company-a",
        project_id="project-a",
        campaign_id=None,
        knowledge_type="meeting",
        source_entity="meeting",
        source_entity_id="m1",
        title="Company A meeting",
        summary="A",
        content="Company A secret",
        status="active",
        tags=[],
        importance=5,
        confidence=1.0,
        freshness=1.0,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    b = SimpleNamespace(
        knowledge_id="k2",
        company_id="company-b",
        project_id="project-b",
        campaign_id=None,
        knowledge_type="meeting",
        source_entity="meeting",
        source_entity_id="m2",
        title="Company B meeting",
        summary="B",
        content="Company B secret",
        status="active",
        tags=[],
        importance=5,
        confidence=1.0,
        freshness=1.0,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    for record in [a, b]:
        for chunk in SemanticChunker.chunk(knowledge=record):
            await store.store(chunk, await provider.embed(chunk.content))

    context = await retriever.retrieve(company_id="company-a", query="secret", limit=5)

    assert all(item.company_id == "company-a" for item in context.items)

