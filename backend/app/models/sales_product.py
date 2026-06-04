from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field


class SalesProduct(Document):
    """Sales Product - linked to category; reusable in sales flows."""

    name: Indexed(str, unique=False)
    category_id: Optional[str] = None
    rate: float = 0.0
    unit: str = ""
    state: Optional[str] = None
    city: Optional[str] = None
    company_id: Optional[str] = None
    created_by: Optional[str] = None
    deleted: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_products"
        indexes = ["company_id", "category_id", "name", "deleted"]

    def unique_key(self) -> str:
        return f"{self.company_id}:{self.category_id}:{self.name.strip().lower()}"

