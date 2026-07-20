from __future__ import annotations

from pydantic import BaseModel, Field


class ContextPackage(BaseModel):
    run_id: str
    company_id: str
    tenant_id: str
    citations: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

