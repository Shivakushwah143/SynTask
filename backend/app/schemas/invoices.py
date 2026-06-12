from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CreateInvoiceRequest(BaseModel):
    client_id: str
    items: List[Dict[str, Any]] = []
    notes: Optional[str] = None
    tax_rate: Optional[float] = None


class InvoiceResponse(BaseModel):
    id: str
    invoice_number: str
    company_id: str
    client_id: str
    status: str
    subtotal: float
    tax_amount: float
    total_amount: float
    created_at: datetime
    updated_at: datetime
