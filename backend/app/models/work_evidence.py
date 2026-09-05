"""Small project-resource and optional task-proof documents."""
from datetime import datetime
from enum import Enum

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.core.clock import utc_now


class TaskProofContext(str, Enum):
    PROGRESS_UPDATE = "progress_update"
    REVIEW_SUBMISSION = "review_submission"


class ProjectResource(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    name: str
    value: str
    created_by: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "project_resources"
        indexes = [IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("created_at", DESCENDING)])]


class TaskProof(Document):
    company_id: Indexed(str)
    task_id: Indexed(str)
    submitted_by: str
    name: str
    value: str
    category: str = "text"
    context: TaskProofContext
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "task_proofs"
        indexes = [IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING), ("created_at", DESCENDING)])]
