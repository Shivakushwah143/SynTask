"""
AI Security & Governance API — Admin-only operational visibility.

Exposes:
    GET /ai-security/summary      — governance status overview
    GET /ai-security/events       — recent security events with filtering
    GET /ai-security/tool-policies — current tool policy registry (read-only)

All endpoints are Admin+ only. Records are tenant-scoped and
contain no sensitive tool result payloads.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.ai.security.audit import AISecurityEvent
from app.ai.security.policy import policy_registry
from app.ai.security.registry import register_all_policies
from app.ai.security.governance import GovernanceDecision
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()

# Ensure policies are registered when this module loads
register_all_policies()


# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------

def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


async def require_security_admin(current_user: User = Depends(get_current_user)) -> User:
    """Only Admin and Super Admin may view AI Security data."""
    if _role(current_user) not in {UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for AI Security endpoints",
        )
    return current_user


def _company_id(user: User) -> str:
    cid = getattr(user, "company_id", None)
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant scope required",
        )
    return str(cid)


# ---------------------------------------------------------------------------
# GET /ai-security/summary
# ---------------------------------------------------------------------------

@router.get("/summary", tags=["AI Security"])
async def get_security_summary(
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    current_user: User = Depends(require_security_admin),
) -> dict[str, Any]:
    """Governance status overview for the company.

    Returns:
        - policy_count: number of registered tool policies
        - event_count: total security events in the lookback window
        - deny_count: number of DENY decisions
        - allow_count: number of ALLOW decisions
        - top_denied_tools: most frequently denied tool names
        - top_denied_capabilities: most frequently missing capabilities
        - injection_signals: count of injection detections
    """
    company_id = _company_id(current_user)
    since = datetime.utcnow() - timedelta(days=days)

    try:
        events = await AISecurityEvent.find(
            AISecurityEvent.company_id == company_id,
            AISecurityEvent.created_at >= since,
        ).to_list()
    except Exception:
        logger.warning("Failed to query security events, returning empty summary")
        events = []

    # Aggregate
    allow_count = sum(1 for e in events if e.decision == GovernanceDecision.ALLOW.value)
    deny_count = sum(1 for e in events if e.decision == GovernanceDecision.DENY.value)
    approval_count = sum(1 for e in events if e.decision == GovernanceDecision.REQUIRE_APPROVAL.value)

    # Top denied tools
    deny_tools: dict[str, int] = {}
    deny_caps: dict[str, int] = {}
    injection_count = 0
    for e in events:
        if e.decision == GovernanceDecision.DENY.value:
            deny_tools[e.capability] = deny_tools.get(e.capability, 0) + 1
            if e.decision_code:
                deny_caps[e.decision_code] = deny_caps.get(e.decision_code, 0) + 1
        if e.injection_signal and e.injection_signal != "NONE":
            injection_count += 1

    top_denied_tools = sorted(deny_tools.items(), key=lambda x: x[1], reverse=True)[:10]
    top_denied_caps = sorted(deny_caps.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "period_days": days,
        "policy_count": len(policy_registry._policies),
        "event_count": len(events),
        "allow_count": allow_count,
        "deny_count": deny_count,
        "approval_count": approval_count,
        "top_denied_tools": [{"tool": t, "count": c} for t, c in top_denied_tools],
        "top_denied_reasons": [{"reason": r, "count": c} for r, c in top_denied_caps],
        "injection_detections": injection_count,
    }


# ---------------------------------------------------------------------------
# GET /ai-security/events
# ---------------------------------------------------------------------------

@router.get("/events", tags=["AI Security"])
async def get_security_events(
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    decision: Optional[str] = Query(None, description="Filter by decision: ALLOW, DENY, REQUIRE_APPROVAL"),
    agent: Optional[str] = Query(None, description="Filter by agent ID"),
    capability: Optional[str] = Query(None, description="Filter by capability/tool name"),
    limit: int = Query(50, ge=1, le=200, description="Max events to return"),
    current_user: User = Depends(require_security_admin),
) -> dict[str, Any]:
    """Recent security events with filtering.

    Returns paginated, tenant-scoped security events with safe metadata only.
    """
    company_id = _company_id(current_user)
    since = datetime.utcnow() - timedelta(days=days)

    try:
        query: dict[str, Any] = {
            "company_id": company_id,
            "created_at": {"$gte": since},
        }
        if decision:
            query["decision"] = decision
        if agent:
            query["agent"] = agent
        if capability:
            query["capability"] = {"$regex": capability, "$options": "i"}

        events = await AISecurityEvent.find(
            AISecurityEvent.company_id == company_id,
            AISecurityEvent.created_at >= since,
        ).sort([("created_at", -1)]).limit(limit).to_list()

        # Post-query filter for fields that may not be indexed
        filtered = []
        for e in events:
            if decision and e.decision != decision:
                continue
            if agent and e.agent != agent:
                continue
            if capability and capability.lower() not in (e.capability or "").lower():
                continue
            filtered.append({
                "event_id": e.event_id,
                "created_at": e.created_at.isoformat() + "Z" if e.created_at else None,
                "user_id": e.user_id,
                "role": e.role,
                "agent": e.agent,
                "capability": e.capability,
                "decision": e.decision,
                "decision_code": e.decision_code,
                "risk_level": e.risk_level,
                "injection_signal": e.injection_signal,
                "resource_type": e.resource_type,
                "resource_id_safe": e.resource_id_safe,
            })

        return {
            "total": len(filtered),
            "events": filtered,
        }

    except Exception as exc:
        logger.warning("Failed to query security events: %s", exc)
        return {"total": 0, "events": []}


# ---------------------------------------------------------------------------
# GET /ai-security/tool-policies
# ---------------------------------------------------------------------------

@router.get("/tool-policies", tags=["AI Security"])
async def get_tool_policies(
    agent: Optional[str] = Query(None, description="Filter by agent ID"),
    domain: Optional[str] = Query(None, description="Filter by domain"),
    current_user: User = Depends(require_security_admin),
) -> dict[str, Any]:
    """Current tool policy registry (read-only snapshot).

    Returns all registered governance policies with their capability
    requirements, risk levels, and agent assignments.
    """
    policies = []
    for tool_id, policy in policy_registry._policies.items():
        if agent and agent not in policy.agent_ids:
            continue
        if domain and policy.domain != domain:
            continue
        policies.append({
            "tool_id": policy.tool_id,
            "agent_ids": list(policy.agent_ids),
            "domain": policy.domain,
            "required_modules": list(policy.required_modules) if policy.required_modules else [],
            "required_capabilities": list(policy.required_capabilities) if policy.required_capabilities else [],
            "risk_level": policy.risk_level.value if hasattr(policy.risk_level, "value") else str(policy.risk_level),
            "sensitive_data_classes": [
                s.value if hasattr(s, "value") else str(s)
                for s in policy.sensitive_data_classes
            ] if policy.sensitive_data_classes else [],
            "tenant_scoped": policy.tenant_scoped,
            "approval_required": policy.approval_required,
            "write_allowed": policy.write_allowed,
        })

    # Gather unique values for filters
    all_agents = set()
    all_domains = set()
    for p in policy_registry._policies.values():
        all_agents.update(p.agent_ids)
        all_domains.add(p.domain)

    return {
        "total": len(policies),
        "policies": policies,
        "filter_options": {
            "agents": sorted(all_agents),
            "domains": sorted(all_domains),
        },
        "policy_version_hash": policy_registry.policy_version_hash(),
    }
