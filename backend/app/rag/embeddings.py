from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable

from app.core.config import settings


class RAGEmbeddingProvider(ABC):
    dimensions: int
    model: str

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError

    async def embed_many(self, texts: Iterable[str]) -> list[list[float]]:
        return [await self.embed(text) for text in texts]


class OpenAIEmbeddingProvider(RAGEmbeddingProvider):
    def __init__(self, *, model: str | None = None, dimensions: int | None = None) -> None:
        self.model = model or settings.OPENAI_EMBEDDING_MODEL
        self.dimensions = dimensions or settings.OPENAI_EMBEDDING_DIMENSIONS

    async def embed(self, text: str) -> list[float]:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=settings.AI_TIMEOUT)
        response = await client.embeddings.create(
            model=self.model,
            input=text or "",
            dimensions=self.dimensions,
        )
        vector = list(response.data[0].embedding)
        if len(vector) != self.dimensions:
            raise RuntimeError("Embedding dimensions do not match configured index dimensions")
        return vector

