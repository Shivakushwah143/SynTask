"""
Persistent AI conversation threads.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class AIConversationMessage(BaseModel):
    id: str = Field(default_factory=lambda: f"msg_{uuid4().hex}")
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    intent: Optional[str] = None
    tokens_used: Optional[int] = None


class AIConversationState(BaseModel):
    last_intent: Optional[str] = None
    pending_action: Optional[str] = None
    conversation_phase: str = "active"


class AIConversation(Document):
    conversation_id: Indexed(str)
    user_id: Indexed(str)
    company_id: Optional[str] = None
    role: Indexed(str)
    messages: List[AIConversationMessage] = Field(default_factory=list)
    state: AIConversationState = Field(default_factory=AIConversationState)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "ai_conversations"
        indexes = [
            "conversation_id",
            "company_id",
            "user_id",
            "role",
            "updated_at",
            IndexModel([("conversation_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("updated_at", DESCENDING)]),
        ]
