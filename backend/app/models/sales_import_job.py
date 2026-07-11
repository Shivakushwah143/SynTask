"""
Sales Import Job - Tracks previewed and imported lead batches.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class SalesImportJob(Document):
    company_id: Indexed(str)
    created_by: Optional[str] = None
    filename: Optional[str] = None
    strategy: str = "round-robin"
    target_user_id: Optional[str] = None
    target_department_id: Optional[str] = None
    status: str = "previewed"
    total_rows: int = 0
    total_uploaded: int = 0
    skipped_rows: int = 0
    duplicate_rows: int = 0
    failed_rows: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[Dict[str, Any]] = Field(default_factory=list)
    preview_rows: List[Dict[str, Any]] = Field(default_factory=list)
    source_payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "sales_import_jobs"
        indexes = [
            "company_id",
            "status",
            "created_by",
            "created_at",
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]),
        ]
