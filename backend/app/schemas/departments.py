from typing import Optional

from pydantic import BaseModel, Field
from app.models.department import DepartmentType


class DepartmentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    manager_id: Optional[str] = None
    department_type: DepartmentType = DepartmentType.OPERATIONS


class DepartmentUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    manager_id: Optional[str] = None
    department_type: DepartmentType = DepartmentType.OPERATIONS
