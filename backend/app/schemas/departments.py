from typing import Optional

from pydantic import BaseModel, Field


class DepartmentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    manager_id: Optional[str] = None


class DepartmentUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    manager_id: Optional[str] = None

