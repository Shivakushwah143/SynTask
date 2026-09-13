"""
AI Security & Tool Governance layer.

Deterministically enforces that every AI-originated business-data access
or action stays within the authenticated user's current SynTask authority,
independent of Groq/LLM behaviour.

Core rule:
    LLM decides WHAT it wants to do
            ↓
    Backend determines WHETHER it may do it
            ↓
    Existing application service determines HOW
            ↓
    Database
"""
from app.ai.security.context import AISecurityContext, build_security_context
from app.ai.security.governance import (
    GovernanceDecision,
    authorize_capability,
    authorize_tool_execution,
    filter_authorized_tools,
)
from app.ai.security.audit import AISecurityEvent, record_security_event

__all__ = [
    "AISecurityContext",
    "build_security_context",
    "GovernanceDecision",
    "authorize_capability",
    "authorize_tool_execution",
    "filter_authorized_tools",
    "AISecurityEvent",
    "record_security_event",
]
