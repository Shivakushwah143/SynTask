"""
Dynamic Capability Selector — reduces Groq token usage by sending only
the tools relevant to the user's question.

Group executive tools into capability packs (sourced from the Company
Capability Registry) and score each pack against the message.  The
top-scoring packs supply the tool subset.

Key improvements:
- Entity-context awareness: when user is viewing an employee page, boost HR packs.
- Per-tool selection: pull only the most relevant tools from a pack, not all tools.
- Target 2-5 tools normally, 4-6 for cross-domain.
"""
from __future__ import annotations

import re
from typing import Any

from app.agents.company_capability_registry import (
    get_all_domains,
    get_domain,
)

# ---------------------------------------------------------------------------
# Pack definitions: derived from the Company Capability Registry
# ---------------------------------------------------------------------------

def _build_packs_from_registry() -> dict[str, list[str]]:
    """Build capability packs dynamically from the company registry."""
    packs: dict[str, list[str]] = {}
    for domain in get_all_domains():
        if domain.tool_names:
            packs[domain.domain_id] = list(domain.tool_names)
    return packs


CAPABILITY_PACKS: dict[str, list[str]] = _build_packs_from_registry()

# ---------------------------------------------------------------------------
# Keyword → pack scoring rules (derived from registry)
# ---------------------------------------------------------------------------

def _build_keyword_scores() -> list[tuple[re.Pattern[str], dict[str, float]]]:
    """Build keyword scoring rules from the company registry."""
    rules: list[tuple[re.Pattern[str], dict[str, float]]] = []
    for domain in get_all_domains():
        if domain.keyword_pattern and domain.keyword_scores:
            rules.append((domain.keyword_pattern, domain.keyword_scores))
    return rules


_KEYWORD_PACK_SCORES: list[tuple[re.Pattern[str], dict[str, float]]] = (
    _build_keyword_scores()
)

# ---------------------------------------------------------------------------
# Entity-context boost rules
# ---------------------------------------------------------------------------

_ENTITY_PACK_BOOSTS: dict[str, dict[str, float]] = {
    "selected_employee_id": {"hr_employees": 2.0, "hr_attendance_leave": 1.0, "hr_payroll": 1.0, "hr_documents": 1.0},
    "selected_candidate_id": {"hr_recruitment": 3.0},
    "selected_job_id": {"hr_recruitment": 3.0},
    "selected_project_id": {"projects": 3.0, "tasks": 1.0},
    "selected_client_id": {"clients": 3.0, "client_delivery": 1.0},
    "selected_lead_id": {"sales_crm": 3.0},
    "selected_user_id": {"tasks": 2.0, "hr_employees": 1.0},
    "selected_task_id": {"tasks": 3.0, "projects": 1.0},
    "selected_invoice_id": {"finance": 3.0},
    "selected_meeting_id": {"meetings": 3.0},
    "selected_deal_id": {"sales_crm": 3.0},
    "selected_sprint_id": {"sprints_epics": 3.0, "projects": 1.0},
    "selected_epic_id": {"sprints_epics": 3.0, "projects": 0.5},
    "selected_department_id": {"organization": 3.0, "hr_employees": 1.0},
}


def _score_packs(message: str, entity_context: dict[str, Any] | None = None) -> dict[str, float]:
    """Score each capability pack against the message + entity context."""
    scores: dict[str, float] = {pack: 0.0 for pack in CAPABILITY_PACKS}
    for pattern, pack_boosts in _KEYWORD_PACK_SCORES:
        if pattern.search(message):
            for pack, boost in pack_boosts.items():
                if pack in scores:
                    scores[pack] += boost

    # Entity-context boost: if user is viewing an entity, boost relevant packs
    if entity_context:
        for ctx_key, boosts in _ENTITY_PACK_BOOSTS.items():
            if ctx_key in entity_context:
                for pack, boost in boosts.items():
                    if pack in scores:
                        scores[pack] += boost
    return scores


def _select_tools_from_pack(
    pack_name: str,
    pack_tools: list[str],
    all_tool_schemas: list[dict[str, Any]],
    message: str,
    max_from_pack: int = 3,
) -> list[str]:
    """Select the most relevant tools from a single pack based on message content.

    Instead of returning ALL tools from a pack, pick the subset that best
    matches the message keywords.  This prevents a recruitment query from
    pulling attendance/payroll tools.
    """
    tool_name_to_schema = {t["function"]["name"]: t for t in all_tool_schemas}

    # Score individual tools against the message
    scored: list[tuple[float, str]] = []
    msg_lower = message.lower()
    for tool_name in pack_tools:
        schema = tool_name_to_schema.get(tool_name)
        if not schema:
            continue
        desc = schema.get("function", {}).get("description", "").lower()
        # Simple relevance: count word overlap between message and tool description
        msg_words = set(re.findall(r'\w{3,}', msg_lower))
        desc_words = set(re.findall(r'\w{3,}', desc))
        overlap = len(msg_words & desc_words)
        scored.append((overlap, tool_name))

    # Sort by relevance, take top N
    scored.sort(key=lambda x: x[0], reverse=True)
    return [name for _, name in scored[:max_from_pack]]


def select_tools(
    message: str,
    all_tool_schemas: list[dict[str, Any]],
    *,
    entity_context: dict[str, Any] | None = None,
    max_tools: int = 6,
    min_tools: int = 2,
) -> list[dict[str, Any]]:
    """Return the subset of tool schemas most relevant to the message.

    1. Score packs by keyword overlap + entity context boost.
    2. For each top-scoring pack, select the most relevant tools (not all).
    3. Clamp to ``min_tools``..``max_tools``.
    """
    scores = _score_packs(message, entity_context)

    # Token budget: 2-5 tools for normal requests, up to 6 for cross-domain
    # investigations.
    meaningful_hits = sum(1 for s in scores.values() if s >= 1.0)
    selection_cap = max_tools if meaningful_hits >= 3 else min(max_tools, 5)

    # Sort packs by score descending
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)

    # Collect tool names from packs, selecting best tools per pack
    selected_names: set[str] = set()
    packs_used: list[str] = []

    for pack_name, score in ranked:
        if score <= 0 and len(selected_names) >= min_tools:
            break
        if len(selected_names) >= selection_cap:
            break
        pack_tools = CAPABILITY_PACKS.get(pack_name, [])
        if not pack_tools:
            continue
        # Select top tools from this pack, not all
        max_from_pack = min(3, selection_cap - len(selected_names))
        picked = _select_tools_from_pack(pack_name, pack_tools, all_tool_schemas, message, max_from_pack)
        new_tools = [t for t in picked if t not in selected_names]
        if new_tools:
            selected_names.update(new_tools)
            packs_used.append(pack_name)

    # If no keywords matched at all, fall back to company_overview
    if not selected_names:
        selected_names.update(CAPABILITY_PACKS.get("company_overview", []))
        packs_used.append("company_overview")

    # Build tool schema subset, preserving original order
    tool_name_to_schema = {t["function"]["name"]: t for t in all_tool_schemas}
    selected = [tool_name_to_schema[name] for name in selected_names if name in tool_name_to_schema]

    # Clamp
    selected = selected[:selection_cap]
    if len(selected) < min_tools:
        # Add back from full list to meet minimum
        for t in all_tool_schemas:
            if t["function"]["name"] not in selected_names:
                selected.append(t)
                if len(selected) >= min_tools:
                    break

    return selected, packs_used  # type: ignore[return-value]


def is_cross_domain(message: str, entity_context: dict[str, Any] | None = None) -> bool:
    """Heuristic: does the message span multiple domains?

    Used to decide whether to allow 3 Groq calls (complex) vs 2 (normal).
    """
    scores = _score_packs(message, entity_context)
    # Count packs with a meaningful score (>= 1.0 domain hit).  Cross-domain
    # investigations surface several weakly-boosted packs (company_overview,
    # tasks, projects, clients, sales_crm), so counting >= 1.0 keeps those
    # recognisable without changing single-domain queries.
    meaningful_hits = sum(1 for s in scores.values() if s >= 1.0)
    return meaningful_hits >= 3
