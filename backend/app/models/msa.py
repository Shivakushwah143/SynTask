"""
Master Service Agreement (MSA) Model
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr
from enum import Enum


class MSAStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"  # Sent to client for signature
    STAFFING_SIGNED = "staffing_signed"  # Staffing company signed, waiting for client
    CLIENT_SIGNED = "client_signed"  # Client signed, waiting for staffing company
    COMPLETED = "completed"  # Both parties signed
    CANCELLED = "cancelled"
    REJECTED = "rejected"  # Client rejected


class MSA(Document):
    """Master Service Agreement Model"""
    # Association
    company_id: Indexed(str)  # Staffing company
    client_id: Indexed(str)  # Client
    
    # MSA Details
    msa_number: Optional[str] = None  # Auto-generated MSA number
    agreement_title: Optional[str] = None  # Agreement title (e.g., "Master Service Agreement 2025")
    effective_date: Optional[datetime] = None
    
    # Company Details (Staffing Company - from Company model)
    company_name: str
    company_address: Optional[str] = None
    company_city: Optional[str] = None
    company_state: Optional[str] = None
    company_country: Optional[str] = None
    company_zip_code: Optional[str] = None
    company_cin: Optional[str] = None  # Corporate Identity Number / GST
    
    # Header Customization
    company_logo_url: Optional[str] = None  # Company logo for header
    company_logo_public_id: Optional[str] = None
    header_background_color: Optional[str] = None  # Hex color code (e.g., "#1F2937")
    
    # Company Signatory Details
    company_signatory_name: Optional[str] = None  # Authorized signatory name
    company_signatory_email: Optional[EmailStr] = None  # Signatory email
    company_signature_file_url: Optional[str] = None  # Company signature file (separate from stamp)
    company_signature_public_id: Optional[str] = None
    
    # Client Details (from Client model)
    client_name: str
    client_company_name: Optional[str] = None
    client_address: Optional[str] = None
    client_city: Optional[str] = None
    client_state: Optional[str] = None
    client_country: Optional[str] = None
    client_zip_code: Optional[str] = None
    client_identifier: Optional[str] = None  # Tax ID, Registration Number, etc.
    client_email: Optional[EmailStr] = None
    client_contact: Optional[str] = None
    
    # Template Content
    content: str = ""  # HTML/text content of the MSA (editable)
    
    # E-Signatures
    staffing_company_signature: Optional[Dict[str, Any]] = Field(default_factory=dict)  # {signature_image, signed_by, signed_at}
    client_signature: Optional[Dict[str, Any]] = Field(default_factory=dict)  # {signature_image, signed_by, signed_at}
    
    # Stamp
    stamp_image_url: Optional[str] = None  # URL to stamp image (company stamp)
    stamp_image_public_id: Optional[str] = None
    client_stamp_url: Optional[str] = None  # URL to client stamp image
    client_stamp_public_id: Optional[str] = None
    
    # Status
    status: MSAStatus = MSAStatus.DRAFT
    
    # Email Tracking
    email_sent: bool = False
    email_sent_at: Optional[datetime] = None
    email_sent_to: Optional[EmailStr] = None
    
    # Client Access Token (for public e-signature page)
    signature_token: Optional[str] = None  # Unique token for client to access and sign
    signature_token_expires_at: Optional[datetime] = None
    
    # Notes
    notes: Optional[str] = None
    
    # Template
    is_template: bool = False  # Whether this MSA is saved as a template
    template_name: Optional[str] = None  # Template name if saved as template
    
    # MSA Type
    msa_type: str = "client"  # "client" or "candidate"
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str  # User ID who created the MSA
    completed_at: Optional[datetime] = None  # When both parties signed
    sent_date: Optional[datetime] = None  # When MSA was sent to client
    signed_date: Optional[datetime] = None  # When both parties signed (same as completed_at)
    
    class Settings:
        name = "msas"
        indexes = [
            "company_id",
            "client_id",
            "status",
            "signature_token",
            "created_by",
        ]
