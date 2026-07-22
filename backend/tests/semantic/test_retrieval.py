from datetime import datetime

import pytest

from app.semantic.contracts import KnowledgeContext, RetrievedKnowledgeItem
from app.semantic.embeddings import LocalEmbeddingProvider
from app.semantic.retrieval import KnowledgeRetriever
from app.semantic.vector_store import QdrantVectorStore
from app.semantic.chunking import SemanticChunker


class FakeCache:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, context, ttl=300):
        self.values[key] = context


@pytest.mark.asyncio
async def test_retriever_filters_by_company_and_project():
    provider = LocalEmbeddingProvider()
    store = QdrantVectorStore()
    retriever = KnowledgeRetriever(provider, store, FakeCache())

    from types import SimpleNamespace

    knowledge_a = SimpleNamespace(
        knowledge_id="k1",
        company_id="company-a",
        project_id="project-a",
        campaign_id=None,
        knowledge_type="task",
        source_entity="task",
        source_entity_id="t1",
        title="Fix login bug",
        summary="Login bug",
        content="Fix login bug in auth",
        status="active",
        tags=["login"],
        importance=4,
        confidence=0.9,
        freshness=0.9,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    knowledge_b = SimpleNamespace(
        knowledge_id="k2",
        company_id="company-b",
        project_id="project-b",
        campaign_id=None,
        knowledge_type="task",
        source_entity="task",
        source_entity_id="t2",
        title="Other work",
        summary="Other",
        content="Different company record",
        status="active",
        tags=[],
        importance=4,
        confidence=0.9,
        freshness=0.9,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    for record in [knowledge_a, knowledge_b]:
        for chunk in SemanticChunker.chunk(knowledge=record):
            await store.store(chunk, await provider.embed(chunk.content))

    context = await retriever.retrieve(company_id="company-a", query="login", project_id="project-a", limit=5)

    assert context.company_id == "company-a"
    assert len(context.items) == 1
    assert context.items[0].company_id == "company-a"

