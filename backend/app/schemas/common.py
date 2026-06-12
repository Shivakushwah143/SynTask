from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel


T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = "OK"
    data: Optional[T] = None


class PaginatedResponse(BaseModel, Generic[T]):
    success: bool = True
    items: List[T]
    total: int
    skip: int
    limit: int
    has_more: bool


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    error_code: Optional[str] = None
