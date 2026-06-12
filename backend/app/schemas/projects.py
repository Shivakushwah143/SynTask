from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    project_id: Optional[str] = Field(None, max_length=100)
    project_type: Optional[str] = None
    status: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    project_id: Optional[str] = None
    company_id: str
    status: Optional[str] = None
    created_at: datetime
    updated_at: datetime
