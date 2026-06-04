from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field


class SalesCategory(Document):
    """Sales Category - used for products and sales tracker."""

    name: Indexed(str, unique=False)  # uniqueness enforced per company_id
    company_id: Optional[str] = None
    created_by: Optional[str] = None
    deleted: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_categories"
        indexes = ["company_id", "name", "deleted"]

    def unique_key(self) -> str:
        return f"{self.company_id}:{self.name.strip().lower()}"

