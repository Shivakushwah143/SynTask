"""
Page/Documentation Models - Jira-like Pages
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class PageStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Page(Document):
    """Page Model - For documentation and knowledge base"""
    title: str
    content: str  # HTML or Markdown content
    company_id: Indexed(str)
    project_id: Optional[str] = None  # Can be linked to a project or be standalone
    
    # Author
    created_by: str  # User ID
    created_by_name: Optional[str] = None
    updated_by: Optional[str] = None  # User ID who last updated
    updated_by_name: Optional[str] = None
    
    # Page Details
    status: PageStatus = PageStatus.DRAFT
    template: Optional[str] = None  # e.g., "blank", "product_requirements", "decision", "meeting_notes"
    
    # Organization
    parent_page_id: Optional[str] = None  # For nested pages/hierarchy
    space_id: Optional[str] = None  # For organizing pages into spaces
    
    # Metadata
    labels: List[str] = []  # Tags/labels for categorization
    attachments: List[str] = []  # File URLs
    
    # Collaboration
    watchers: List[str] = []  # User IDs watching this page
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    published_at: Optional[datetime] = None
    
    class Settings:
        name = "pages"
        indexes = [
            "company_id",
            "project_id",
            "created_by",
            "status",
            "parent_page_id",
            "space_id",
        ]



