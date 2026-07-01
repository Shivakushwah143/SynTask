from app.semantic.embeddings import LocalEmbeddingProvider


import pytest


@pytest.mark.asyncio
async def test_local_embedding_provider_is_deterministic():
    provider = LocalEmbeddingProvider()
    first = await provider.embed("Fix login bug")
    second = await provider.embed("Fix login bug")

    assert first == second
    assert len(first) == provider.dimension
