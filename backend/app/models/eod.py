"""
End of Day report models.
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class EODReport(Document):
    """One daily work report per employee per working day."""

    employee_id: Indexed(str)
    company_id: Indexed(str)
    report_date: date
    worked_on: str
    blockers: Optional[str] = None
    tomorrow_plan: Optional[str] = None

    completed_task_ids: List[str] = Field(default_factory=list)
    in_progress_task_ids: List[str] = Field(default_factory=list)
    assigned_today_task_ids: List[str] = Field(default_factory=list)
    total_working_seconds: float = 0.0

    ai_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "eod_reports"
        indexes = [
            "employee_id",
            "company_id",
            "report_date",
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("report_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("report_date", DESCENDING)]),
            IndexModel([("employee_id", ASCENDING), ("report_date", ASCENDING)], unique=True),
        ]
