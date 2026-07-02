from __future__ import annotations

from typing import Any, Dict, List

from app.creative.analyzers.base import BaseCreativeAnalyzer
from app.creative.types import AnalyzerResult, NormalizedAsset
from app.models.creative_review import CreativeIssueSeverity, CreativeReviewContext


def _score_from_issues(base: float, issue_count: int, penalty: float = 10.0) -> float:
    return max(0.0, min(100.0, base - (issue_count * penalty)))


def _dominant_has_bright(asset: NormalizedAsset) -> bool:
    return any(color.lower().startswith("#") for color in asset.dominant_colors)


class BrandAnalyzer(BaseCreativeAnalyzer):
    key = "brand"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        brand_rules = context.brand_guidelines or {}
        issues = []
        text = self._asset_text(asset)
        guidelines_text = self._context_text(context)
        brand_name = str(brand_rules.get("brand_name") or context.project.get("name") or "").lower()

        if brand_name and brand_name not in text and brand_name not in guidelines_text:
            issues.append(self._make_issue(
                "brand",
                "Brand name not clearly represented",
                "The creative does not clearly reinforce the brand identity in the asset content.",
                CreativeIssueSeverity.MEDIUM,
                0.78,
                evidence={"brand_name": brand_name, "file_name": asset.file_name},
                suggested_fix="Make the brand identity visible in headline treatment, logo placement, or color system.",
            ))

        if brand_rules.get("required_colors") and not asset.dominant_colors:
            issues.append(self._make_issue(
                "brand",
                "Brand colors could not be verified",
                "No dominant colors were extracted from the asset, so brand color alignment could not be confirmed.",
                CreativeIssueSeverity.LOW,
                0.62,
                evidence={"required_colors": brand_rules.get("required_colors")},
                suggested_fix="Re-export the asset or use a source file with consistent brand colors.",
            ))

        severity = CreativeIssueSeverity.HIGH if any(issue.severity == CreativeIssueSeverity.HIGH for issue in issues) else CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        score = _score_from_issues(92.0, len(issues), penalty=8.0)
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.82, {"brand_name": brand_name})


class TypographyAnalyzer(BaseCreativeAnalyzer):
    key = "typography"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        asset_text = self._asset_text(asset)
        if len(asset_text) < 40:
            issues.append(self._make_issue(
                "typography",
                "Insufficient text hierarchy evidence",
                "There is not enough text content to verify heading hierarchy or text hierarchy consistency.",
                CreativeIssueSeverity.LOW,
                0.55,
                evidence={"text_length": len(asset_text)},
                suggested_fix="Include more copy or upload a full-resolution source so hierarchy can be reviewed.",
            ))
        if asset.width and asset.width < 1080:
            issues.append(self._make_issue(
                "typography",
                "Potential text readability risk",
                "A low-resolution asset may blur text at campaign display sizes.",
                CreativeIssueSeverity.MEDIUM,
                0.72,
                evidence={"width": asset.width, "height": asset.height},
                suggested_fix="Export at a higher resolution or use vector artwork for text-heavy compositions.",
            ))
        severity = CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        score = _score_from_issues(94.0, len(issues), penalty=7.0)
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.76, {})


class ColorAnalyzer(BaseCreativeAnalyzer):
    key = "color"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        brand_colors = [str(c).lower() for c in (context.brand_guidelines or {}).get("required_colors", [])]
        asset_colors = [str(c).lower() for c in asset.dominant_colors]
        if brand_colors and asset_colors and not any(color in brand_colors for color in asset_colors):
            issues.append(self._make_issue(
                "color",
                "Colors do not match brand palette",
                "The dominant colors in the asset are outside the configured brand palette.",
                CreativeIssueSeverity.HIGH,
                0.84,
                evidence={"brand_colors": brand_colors, "asset_colors": asset_colors},
                suggested_fix="Shift the palette toward the approved brand colors.",
            ))
        severity = CreativeIssueSeverity.HIGH if issues else CreativeIssueSeverity.LOW
        score = _score_from_issues(96.0, len(issues), penalty=12.0)
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.9, {"brand_colors": brand_colors})


class LogoAnalyzer(BaseCreativeAnalyzer):
    key = "logo"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        rules = context.brand_guidelines or {}
        required_logo = str(rules.get("logo_name") or rules.get("logo_text") or "").lower()
        text = self._asset_text(asset)
        if required_logo and required_logo not in text:
            issues.append(self._make_issue(
                "logo",
                "Logo usage could not be validated",
                "The asset does not appear to include the expected logo or logo reference.",
                CreativeIssueSeverity.MEDIUM,
                0.73,
                evidence={"required_logo": required_logo, "file_name": asset.file_name},
                suggested_fix="Place the approved logo according to brand spacing rules.",
            ))
        score = _score_from_issues(93.0, len(issues), penalty=9.0)
        severity = CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.8, {})


class RequirementAnalyzer(BaseCreativeAnalyzer):
    key = "requirements"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        requirement_text = " ".join(
            str(item) for item in (
                context.client_requirements + context.deliverables + context.designer_notes
            )
        ).lower()
        asset_text = self._asset_text(asset)

        if "cta" in requirement_text or "call to action" in requirement_text:
            if "cta" not in asset_text and "call to action" not in asset_text:
                issues.append(self._make_issue(
                    "requirement",
                    "Missing call to action",
                    "The review context requires a CTA, but it was not found in the creative content.",
                    CreativeIssueSeverity.HIGH,
                    0.8,
                    evidence={"requirements": requirement_text[:300], "asset_text": asset_text[:300]},
                    related_requirement="CTA",
                    suggested_fix="Add a visible CTA with clear action language and contrast.",
                ))

        if context.deliverables:
            if not any(item.get("status") == "approved" for item in context.deliverables if isinstance(item, dict)):
                issues.append(self._make_issue(
                    "requirement",
                    "Deliverable status unresolved",
                    "The asset cannot be matched to an approved deliverable in the current context.",
                    CreativeIssueSeverity.MEDIUM,
                    0.68,
                    evidence={"deliverables": context.deliverables},
                    suggested_fix="Link the asset to a deliverable or confirm the expected output format.",
                ))

        score = _score_from_issues(95.0, len(issues), penalty=11.0)
        severity = CreativeIssueSeverity.HIGH if any(issue.severity == CreativeIssueSeverity.HIGH for issue in issues) else CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.81, {})


class MarketingAnalyzer(BaseCreativeAnalyzer):
    key = "marketing"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        text = self._asset_text(asset)
        if any(term in text for term in ["learn more", "sign up", "buy now", "book now", "contact us"]):
            pass
        else:
            issues.append(self._make_issue(
                "marketing",
                "Conversion message is weak or missing",
                "The creative does not include a clear conversion cue or campaign CTA language.",
                CreativeIssueSeverity.MEDIUM,
                0.7,
                evidence={"asset_text": text[:240]},
                suggested_fix="Add a specific benefit-led CTA aligned to the campaign objective.",
            ))
        score = _score_from_issues(90.0, len(issues), penalty=9.0)
        severity = CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.76, {})


class UXAnalyzer(BaseCreativeAnalyzer):
    key = "ux"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        if asset.width and asset.height and asset.width < asset.height:
            issues.append(self._make_issue(
                "ux",
                "Layout orientation may limit channel fit",
                "The asset is portrait-oriented, which may reduce fit for some campaign placements.",
                CreativeIssueSeverity.LOW,
                0.6,
                evidence={"width": asset.width, "height": asset.height},
                suggested_fix="Produce placement-specific versions for the target channel mix.",
            ))
        if asset.width and asset.width < 1200:
            issues.append(self._make_issue(
                "ux",
                "Small canvas may reduce hierarchy clarity",
                "The canvas size suggests text and spacing may be hard to read at scale.",
                CreativeIssueSeverity.MEDIUM,
                0.74,
                evidence={"width": asset.width, "height": asset.height},
                suggested_fix="Re-export at a larger size or revise spacing hierarchy.",
            ))
        score = _score_from_issues(91.0, len(issues), penalty=8.0)
        severity = CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.78, {})


class AccessibilityAnalyzer(BaseCreativeAnalyzer):
    key = "accessibility"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        if len(asset.dominant_colors) <= 1:
            issues.append(self._make_issue(
                "accessibility",
                "Contrast could not be validated",
                "The asset metadata does not provide enough color contrast detail to confirm accessibility compliance.",
                CreativeIssueSeverity.MEDIUM,
                0.65,
                evidence={"dominant_colors": asset.dominant_colors},
                suggested_fix="Provide a layered source file or ensure text contrast is manually reviewed.",
            ))
        if asset.width and asset.width < 900:
            issues.append(self._make_issue(
                "accessibility",
                "Text may be too small on mobile placements",
                "Low canvas width can lead to unreadable text in smaller placements.",
                CreativeIssueSeverity.MEDIUM,
                0.69,
                evidence={"width": asset.width},
                suggested_fix="Increase font size and simplify the copy hierarchy for mobile placements.",
            ))
        score = _score_from_issues(88.0, len(issues), penalty=10.0)
        severity = CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.7, {})


class QualityAnalyzer(BaseCreativeAnalyzer):
    key = "quality"
    version = "1.0.0"

    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        issues = []
        if asset.file_size and asset.file_size > 8 * 1024 * 1024:
            issues.append(self._make_issue(
                "quality",
                "Large file may indicate export bloat",
                "The asset file size is high and may not be optimized for delivery.",
                CreativeIssueSeverity.LOW,
                0.68,
                evidence={"file_size": asset.file_size},
                suggested_fix="Optimize the export without degrading the visual quality.",
            ))
        if asset.width and asset.width < 1600:
            issues.append(self._make_issue(
                "quality",
                "Resolution may be insufficient for reuse",
                "The asset resolution may be too low for repurposing across channels.",
                CreativeIssueSeverity.MEDIUM,
                0.72,
                evidence={"width": asset.width, "height": asset.height},
                suggested_fix="Export a higher-resolution master for reuse.",
            ))
        score = _score_from_issues(92.0, len(issues), penalty=7.0)
        severity = CreativeIssueSeverity.MEDIUM if issues else CreativeIssueSeverity.LOW
        return AnalyzerResult(self.key, self.version, score, issues, severity, 0.79, {})

