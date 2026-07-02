from __future__ import annotations

import hashlib
import mimetypes
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image

from app.creative.types import NormalizedAsset


class AssetNormalizer:
    @staticmethod
    def _safe_path(file_url: str) -> str:
        return Path(file_url).name

    @staticmethod
    def _uploads_root() -> Path:
        return Path(__file__).resolve().parents[2] / "uploads"

    @classmethod
    def _resolve_file_path(cls, file_url: str) -> Optional[Path]:
        filename = cls._safe_path(file_url)
        candidate = cls._uploads_root() / filename
        if candidate.exists():
            return candidate
        project_candidate = cls._uploads_root() / "projects" / filename
        if project_candidate.exists():
            return project_candidate
        return None

    @classmethod
    def normalize(
        cls,
        *,
        asset_id: str,
        file_name: str,
        file_url: str,
        source_type: str,
        mime_type: str | None = None,
        file_size: int | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> NormalizedAsset:
        resolved = cls._resolve_file_path(file_url)
        width = height = None
        dominant_colors: list[str] = []
        digest = None
        inferred_mime = mime_type or mimetypes.guess_type(file_name)[0]
        page_count = None

        if resolved and resolved.exists():
            digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
            try:
                if inferred_mime and inferred_mime.startswith("image/"):
                    with Image.open(resolved) as img:
                        width, height = img.size
                        image = img.convert("RGB").resize((32, 32))
                        palette = image.getcolors(32 * 32) or []
                        palette.sort(key=lambda item: item[0], reverse=True)
                        dominant_colors = [
                            "#{:02x}{:02x}{:02x}".format(*color)
                            for _, color in palette[:5]
                        ]
                elif inferred_mime == "application/pdf":
                    page_count = 1
            except Exception:
                pass

        preview_url = file_url
        return NormalizedAsset(
            asset_id=asset_id,
            file_name=file_name,
            file_url=file_url,
            source_type=source_type,
            mime_type=inferred_mime,
            file_size=file_size,
            width=width,
            height=height,
            page_count=page_count,
            digest=digest,
            dominant_colors=dominant_colors,
            metadata=metadata or {},
            preview_url=preview_url,
        )

