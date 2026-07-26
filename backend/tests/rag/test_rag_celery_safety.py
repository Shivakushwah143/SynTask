import pytest

from app.worker.tasks import rag_tasks


@pytest.mark.asyncio
async def test_worker_does_not_index_unapproved_source(monkeypatch):
    class Source:
        source_id = None
        approval_status = "pending"
        status = "pending_approval"

        @classmethod
        async def find_one(cls, *args, **kwargs):
            return cls()

    class Version:
        version_id = None

        @classmethod
        async def find_one(cls, *args, **kwargs):
            return cls()

    monkeypatch.setattr(rag_tasks, "RAGKnowledgeSource", Source)
    monkeypatch.setattr(rag_tasks, "RAGKnowledgeSourceVersion", Version)

    result = await rag_tasks._process_source_version("s1", "v1")

    assert result == {"status": "not_approved"}
