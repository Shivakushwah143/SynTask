"""
Permission-aware schema exposure — filters tool schemas before they are
sent to the LLM based on the user's authorized capabilities.

This is optimization + exposure reduction.
The actual security boundary is execution-time authorization in governance.py.

Defense in depth:
    1. Filter schemas BEFORE relevance selection (this module)
    2. Re-authorize BEFORE execution (governance.py)
"""
from __future__ import annotations

import logging
from typing import Any

from app.ai.security.context import AISecurityContext
from app.ai.security.governance import authorize_capability

logger = logging.getLogger(__name__)


def filter_hr_schemas_for_context(
    context: AISecurityContext,
    schemas: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Filter HR tool schemas based on user's capabilities.

    Only schemas the user is authorized to execute are exposed to the LLM.
    This prevents the LLM from even attempting to call unauthorized tools.
    """
    return _filter_schemas_by_policy(context, schemas, "hr_operations")


def filter_executive_schemas_for_context(
    context: AISecurityContext,
    schemas: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Filter Executive tool schemas based on user's capabilities."""
    return _filter_schemas_by_policy(context, schemas, "executive_operations")


def filter_schemas_for_agent(
    context: AISecurityContext,
    schemas: list[dict[str, Any]],
    agent_id: str,
) -> list[dict[str, Any]]:
    """Generic schema filter for any agent."""
    return _filter_schemas_by_policy(context, schemas, agent_id)


def _filter_schemas_by_policy(
    context: AISecurityContext,
    schemas: list[dict[str, Any]],
    agent_id: str,
) -> list[dict[str, Any]]:
    """Core filtering logic — authorizes each schema against governance."""
    authorized: list[dict[str, Any]] = []

    for schema in schemas:
        tool_name = schema.get("function", {}).get("name", "")
        if not tool_name:
            continue

        result = authorize_capability(context, tool_name, agent_id)
        if result.allowed:
            authorized.append(schema)
        else:
            logger.debug(
                "Schema '%s' hidden from %s: %s",
                tool_name,
                agent_id,
                result.reason.value if result.reason else "denied",
            )

    return authorized


def build_schema_filter_summary(
    context: AISecurityContext,
    all_schemas: list[dict[str, Any]],
    agent_id: str,
) -> dict[str, Any]:
    """Build a summary of schema filtering for audit/debug purposes.

    Returns safe metadata only — no sensitive tool results.
    """
    tool_names = [
        s.get("function", {}).get("name", "unknown")
        for s in all_schemas
    ]

    authorized = filter_schemas_for_agent(context, all_schemas, agent_id)
    authorized_names = [
        s.get("function", {}).get("name", "unknown")
        for s in authorized
    ]

    return {
        "total_schemas": len(all_schemas),
        "authorized_schemas": len(authorized),
        "hidden_count": len(all_schemas) - len(authorized),
        "agent": agent_id,
        "role": context.role,
    }
