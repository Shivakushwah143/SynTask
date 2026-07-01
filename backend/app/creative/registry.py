from __future__ import annotations

from typing import Dict, Iterable, List, Type

from app.creative.analyzers import (
    AccessibilityAnalyzer,
    BrandAnalyzer,
    ColorAnalyzer,
    LogoAnalyzer,
    MarketingAnalyzer,
    QualityAnalyzer,
    RequirementAnalyzer,
    TypographyAnalyzer,
    UXAnalyzer,
)
from app.creative.analyzers.base import BaseCreativeAnalyzer


class AnalyzerRegistry:
    def __init__(self) -> None:
        self._analyzers: Dict[str, BaseCreativeAnalyzer] = {}
        self.register(BrandAnalyzer())
        self.register(TypographyAnalyzer())
        self.register(ColorAnalyzer())
        self.register(LogoAnalyzer())
        self.register(RequirementAnalyzer())
        self.register(MarketingAnalyzer())
        self.register(UXAnalyzer())
        self.register(AccessibilityAnalyzer())
        self.register(QualityAnalyzer())

    def register(self, analyzer: BaseCreativeAnalyzer) -> None:
        self._analyzers[analyzer.key] = analyzer

    def list(self) -> List[BaseCreativeAnalyzer]:
        return list(self._analyzers.values())

    def get(self, key: str) -> BaseCreativeAnalyzer | None:
        return self._analyzers.get(key)

