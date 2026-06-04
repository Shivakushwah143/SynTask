"""
Internal Chat System Models
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class MessageType(str, Enum):
    TEXT = "text"
    FILE = "file"
    IMAGE = "image"


class Conversation(Document):
    """Chat Conversation Model"""
    company_id: Indexed(str)
    participants: List[str]  # List of User IDs
    created_by: str  # User ID who created the conversation
    last_message: Optional[str] = None  # Last message preview
    last_message_at: Optional[datetime] = None
    last_message_by: Optional[str] = None  # User ID
    unread_count: dict = Field(default_factory=dict)  # {user_id: count}
    is_group: bool = False
    group_name: Optional[str] = None  # For group chats
    group_admins: List[str] = Field(default_factory=list)  # List of admin User IDs for groups
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "conversations"
        indexes = [
            "company_id",
            "participants",
            "created_by",
        ]


class ChatMessage(Document):
    """Chat Message Model"""
    conversation_id: Indexed(str)
    company_id: Indexed(str)
    sender_id: str  # User ID
    sender_name: str
    sender_role: str
    message_type: MessageType = MessageType.TEXT
    content: str  # Text content or file description
    file_url: Optional[str] = None  # URL to uploaded file
    file_name: Optional[str] = None  # Original file name
    file_size: Optional[int] = None  # File size in bytes
    file_type: Optional[str] = None  # MIME type
    
    # Read receipts
    read_by: List[str] = []  # List of User IDs who read the message
    read_at: dict = Field(default_factory=dict)  # {user_id: timestamp}
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_edited: bool = False
    is_deleted: bool = False
    
    class Settings:
        name = "chat_messages"
        indexes = [
            "conversation_id",
            "company_id",
            "sender_id",
            "created_at",
        ]

