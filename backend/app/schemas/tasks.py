from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=10000)
    project_id: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[datetime] = None
    tags: List[str] = []
    story_points: Optional[int] = Field(None, ge=0, le=100)
    estimated_hours: Optional[float] = Field(None, ge=0)


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = None
    story_points: Optional[int] = Field(None, ge=0, le=100)
    estimated_hours: Optional[float] = Field(None, ge=0)


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assigned_to: Optional[str] = None
    created_by: str
    project_id: Optional[str] = None
    project_object_id: Optional[str] = None
    due_date: Optional[datetime] = None
    tags: List[str] = []
    created_at: datetime
    updated_at: datetime
