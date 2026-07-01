from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import Iterable

import numpy as np


class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError

    async def embed_many(self, texts: Iterable[str]) -> list[list[float]]:
        return [await self.embed(text) for text in texts]


class LocalEmbeddingProvider(EmbeddingProvider):
    def __init__(self, dimension: int = 256) -> None:
        self.dimension = dimension

    @staticmethod
    @lru_cache(maxsize=4096)
    def _cached_embed(text: str, dimension: int) -> tuple[float, ...]:
        vector = np.zeros(dimension, dtype=np.float32)
        tokens = [token for token in text.lower().split() if token]
        if not tokens:
            return tuple(vector.tolist())
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            for index in range(0, len(digest), 4):
                bucket = int.from_bytes(digest[index:index + 4], "little") % dimension
                vector[bucket] += 1.0
        norm = float(np.linalg.norm(vector))
        if norm > 0:
            vector /= norm
        return tuple(vector.tolist())

    async def embed(self, text: str) -> list[float]:
        return list(self._cached_embed(text or "", self.dimension))

