"""
Issue Linking Model - Link issues together (relates to, blocks, etc.)
"""
from datetime import datetime
from typing import Optional
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class LinkType(str, Enum):
    RELATES_TO = "relates_to"
    BLOCKS = "blocks"
    IS_BLOCKED_BY = "is_blocked_by"
    CLONES = "clones"
    IS_CLONED_BY = "is_cloned_by"
    DUPLICATES = "duplicates"
    IS_DUPLICATED_BY = "is_duplicated_by"
    DEPENDS_ON = "depends_on"
    IS_DEPENDED_ON_BY = "is_depended_on_by"


class IssueLink(Document):
    """Issue Link Model - Links between tasks/issues"""
    source_task_id: Indexed(str)  # The task that has the link
    destination_task_id: Indexed(str)  # The task being linked to
    company_id: str
    
    # Link Type
    link_type: LinkType
    
    # Direction (outward or inward)
    is_outward: bool = True  # True if source -> destination, False if destination -> source
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "issue_links"
        indexes = [
            "source_task_id",
            "destination_task_id",
            "company_id",
            "link_type",
        ]


