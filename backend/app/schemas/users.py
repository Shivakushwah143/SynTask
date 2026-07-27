from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    SUB_ADMIN = "sub_admin"
    MANAGER = "manager"
    LEAD = "lead"
    EMPLOYEE = "employee"


class CreateUserRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    role: UserRole
    reports_to: Optional[str] = None
    phone: Optional[str] = None
    password: str = Field(..., min_length=8, max_length=100)
    modules: List[str] = ["task"]


class UpdateUserRequest(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = None
    avatar: Optional[str] = None
    modules: Optional[List[str]] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    status: str
    company_id: Optional[str] = None
    modules: List[str]
    active_module: Optional[str] = None
    avatar: Optional[str] = None
    timezone: Optional[str] = None
    automatic_time: bool = True
    manual_time: Optional[str] = None
    hour_format: str = "12"
    show_seconds: bool = False

