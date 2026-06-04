"""
Invoice Management Models
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr
from enum import Enum


class InvoiceType(str, Enum):
    PROFORMA = "proforma"
    TAX = "tax"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    CANCELLED = "cancelled"


# InvoiceItem is stored as a dict in the Invoice.items list, not as a separate document


class Invoice(Document):
    """Invoice Model"""
    invoice_number: Indexed(str)  # Auto-generated: INV-YYYY-XXXX
    company_id: Indexed(str)
    
    # Invoice Type
    invoice_type: InvoiceType = InvoiceType.PROFORMA  # proforma or tax
    include_tax: bool = True  # Whether to calculate and include tax
    
    # Client Information
    client_id: str  # Reference to Client
    client_name: str
    client_email: Optional[EmailStr] = None
    client_contact: Optional[str] = None
    client_address: Optional[str] = None
    client_city: Optional[str] = None
    client_state: Optional[str] = None
    client_country: Optional[str] = None
    client_zip_code: Optional[str] = None
    client_company_name: Optional[str] = None
    
    # Invoice Details
    invoice_date: datetime = Field(default_factory=datetime.utcnow)
    due_date: Optional[datetime] = None
    
    # Items
    items: List[Dict[str, Any]] = Field(default_factory=list)  # List of invoice items
    
    # Financial Summary
    subtotal: float = 0.0  # Sum of all item amounts
    tax_rate: Optional[float] = None  # Overall tax rate if applicable
    tax_amount: float = 0.0
    total_amount: float = 0.0  # subtotal + tax_amount
    currency: str = "INR"  # Default to Indian Rupee
    
    # Payment Tracking
    payments: List[Dict[str, Any]] = Field(default_factory=list)  # List of payment records [{date, amount, method, reference, notes, received_by}]
    total_received: float = 0.0  # Sum of all payments
    tds_amount: float = 0.0  # Tax Deducted at Source
    outstanding_amount: float = 0.0  # total_amount - total_received - tds_amount
    
    # Additional Information
    notes: Optional[str] = None
    terms_and_conditions: Optional[str] = None
    
    # Status
    status: InvoiceStatus = InvoiceStatus.DRAFT
    
    # Email Information
    email_sent: bool = False
    email_sent_at: Optional[datetime] = None
    email_sent_to: Optional[str] = None
    
    # PDF File
    pdf_url: Optional[str] = None
    
    # Project Reference (optional)
    project_id: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str  # User ID who created the invoice
    
    class Settings:
        name = "invoices"
        indexes = [
            "company_id",
            "invoice_number",
            "client_id",
            "invoice_type",
            "status",
            "invoice_date",
        ]

