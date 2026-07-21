from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EvidenceDecisionType(str, Enum):
    SUFFICIENT_EVIDENCE = "SUFFICIENT_EVIDENCE"
    PARTIAL_EVIDENCE = "PARTIAL_EVIDENCE"
    CONFLICTING_EVIDENCE = "CONFLICTING_EVIDENCE"
    STALE_EVIDENCE = "STALE_EVIDENCE"
    NO_EVIDENCE = "NO_EVIDENCE"
    UNAUTHORIZED = "UNAUTHORIZED"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"


class EvidenceDecision(BaseModel):
    decision: EvidenceDecisionType
    reason: str
    missing_information: list[str] = Field(default_factory=list)
    confidence: float


class EvidenceDecisionService:
    def decide(
        self,
        *,
        citations: list[dict[str, Any]],
        structured_status: str = "not_requested",
        conflicts: list[str] | None = None,
        source_unavailable: bool = False,
        min_score: float = 0.2,
    ) -> EvidenceDecision:
        if source_unavailable:
            return EvidenceDecision(decision=EvidenceDecisionType.SOURCE_UNAVAILABLE, reason="Required source unavailable", missing_information=["source"], confidence=0.0)
        if conflicts:
            return EvidenceDecision(decision=EvidenceDecisionType.CONFLICTING_EVIDENCE, reason="Authorized evidence conflicts", confidence=0.45)
        if structured_status in {"forbidden", "unauthorized"}:
            return EvidenceDecision(decision=EvidenceDecisionType.UNAUTHORIZED, reason="Structured source unauthorized", confidence=0.0)
        if not citations:
            return EvidenceDecision(decision=EvidenceDecisionType.NO_EVIDENCE, reason="No approved authorized evidence found", missing_information=["citation"], confidence=0.0)
        best = max(float(item.get("score", 0.0) or 0.0) for item in citations)
        if best < min_score:
            return EvidenceDecision(decision=EvidenceDecisionType.PARTIAL_EVIDENCE, reason="Evidence below threshold", confidence=best)
        return EvidenceDecision(decision=EvidenceDecisionType.SUFFICIENT_EVIDENCE, reason="Approved authorized evidence meets threshold", confidence=min(best, 1.0))
