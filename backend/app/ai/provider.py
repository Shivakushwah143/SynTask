from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional


@dataclass(slots=True)
class AIProviderResult:
    content: str
    model: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    raw_response: Optional[dict[str, Any]] = None


class AIProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        context: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> AIProviderResult:
        raise NotImplementedError

