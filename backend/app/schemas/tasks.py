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
    task_type: str = "standard"
    measurement_type: Optional[str] = None
    custom_measurement_label: Optional[str] = None
    target_quantity: Optional[int] = Field(None, ge=1)
    target_unit: Optional[str] = None


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
    task_type: Optional[str] = None
    measurement_type: Optional[str] = None
    custom_measurement_label: Optional[str] = None
    target_quantity: Optional[int] = Field(None, ge=1)
    target_unit: Optional[str] = None


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
    task_type: str = "standard"
    measurement_type: Optional[str] = None
    custom_measurement_label: Optional[str] = None
    target_quantity: Optional[int] = None
    target_unit: Optional[str] = None
    completed_quantity: int = 0
    remaining_quantity: Optional[int] = None


class UpdateProductionProgressRequest(BaseModel):
    completed_quantity: int = Field(..., ge=0)
    notes: Optional[str] = Field(None, max_length=2000)
    proof_name: Optional[str] = Field(None, max_length=120)
    proof_value: Optional[str] = Field(None, max_length=2048)


class ProductionEmployeeMetric(BaseModel):
    employee_id: str
    employee_name: str
    department: Optional[str] = None
    task_id: str
    task_title: str
    measurement_type: Optional[str] = None
    measurement_label: Optional[str] = None
    target_quantity: int
    target_unit: Optional[str] = None
    completed_quantity: int = 0
    remaining_quantity: int = 0
    completion_percentage: float = 0.0


class ProductionDashboardResponse(BaseModel):
    employees: List[ProductionEmployeeMetric] = []
    team_total_target: int = 0
    team_total_completed: int = 0
    team_total_remaining: int = 0
    team_completion_percentage: float = 0.0
