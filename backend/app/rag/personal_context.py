from __future__ import annotations

from typing import Any

from app.agents.capability_packs import RoleCapabilityPack, role_capability_pack
from app.agents.routing import AgentRoute
from app.models.user import User
from app.rag.context_package import SanitizedModelContext


def build_personal_model_context(
    *,
    base_context: dict[str, Any],
    current_user: User,
    workspace_context: dict[str, Any],
    preferences: dict[str, Any],
    route: AgentRoute | dict[str, Any],
    capability_pack: RoleCapabilityPack | dict[str, Any] | None = None,
) -> dict[str, Any]:
    if isinstance(route, dict):
        route = AgentRoute(
            intent=route["intent"],
            agent_id=route["agent_id"],
            agent_version=route["agent_version"],
            routing_reason=route["routing_reason"],
            confidence=route["confidence"],
            required_context_sections=route["required_context_sections"],
            read_only=route.get("read_only", True),
            action_intent=route.get("action_intent", False),
            approval_required=route.get("approval_required", False),
            risk_level=route.get("risk_level", "normal"),
            fallback_behavior=route.get("fallback_behavior", "run_selected_agent"),
            specialist_id=route.get("specialist_id"),
            metadata=route.get("metadata") or {},
        )
    if isinstance(capability_pack, dict):
        pack = RoleCapabilityPack(
            role=capability_pack["role"],
            accessible_agents=capability_pack["accessible_agents"],
            default_context_scope=capability_pack["default_context_scope"],
            allowed_read_tools=capability_pack.get("allowed_read_tools") or [],
            proposal_only_actions=capability_pack.get("proposal_only_actions") or [],
            forbidden_operations=capability_pack.get("forbidden_operations") or [],
            approval_requirements=capability_pack.get("approval_requirements") or [],
            sensitive_data_restrictions=capability_pack.get("sensitive_data_restrictions") or [],
            default_response_behavior=capability_pack.get("default_response_behavior") or {},
        )
    else:
        pack = capability_pack or role_capability_pack(
        current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        modules=list(getattr(current_user, "modules", []) or []),
        )
    identity_context = {
        "company_id": getattr(current_user, "company_id", None),
        "tenant_id": getattr(current_user, "company_id", None),
        "user_id": str(getattr(current_user, "id", "")),
        "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        "department_id": getattr(current_user, "department_id", None),
        "designation": getattr(current_user, "designation", None),
        "timezone": getattr(current_user, "timezone", None) or "UTC",
        "language": preferences.get("language") or "en",
        "authority": "authenticated_backend_user",
    }
    permission_context = {
        "role_capability_pack": pack.model_context(),
        "allowed_agents": pack.accessible_agents,
        "allowed_read_tools": pack.allowed_read_tools,
        "prohibited_operations": pack.forbidden_operations,
        "approval_requirements": pack.approval_requirements,
        "data_sensitivity_restrictions": pack.sensitive_data_restrictions,
        "authority": "backend_authorization_and_role_pack",
    }
    request_context = {
        "original_user_request": base_context.get("original_query"),
        "resolved_request": base_context.get("resolved_query"),
        "detected_intent": route.intent,
        "routing": route.model_context(),
        "required_output_schema": route.agent_id,
        "authority": "deterministic_router_v1",
    }
    personal_preferences = {
        "preferred_language": preferences.get("language"),
        "preferred_response_detail": preferences.get("response_detail"),
        "saved_preferences": (preferences.get("personal_memory") or {}).get("memories") or [],
        "source": "explicit_request_or_saved_user_preference",
        "cannot_override": ["permissions", "structured_records", "approval_policy", "safety_policy"],
        "authority": "user_controlled_preference",
    }
    return {
        "context_package_id": base_context.get("context_package_id"),
        "trace_id": base_context.get("trace_id"),
        "identity_context": identity_context,
        "permission_context": permission_context,
        "workspace_context": {
            **(workspace_context or {}),
            "authority": "server_validated_workspace_context",
        },
        "working_memory": {
            "status": "included_from_context_package",
            "items": _items_by_authority(base_context, "WORKING_MEMORY"),
            "authority": "server_owned_working_memory",
        },
        "personal_preferences": personal_preferences,
        "structured_memory": {
            "status": base_context.get("structured_memory_status"),
            "items": _items_by_authority(base_context, "STRUCTURED_MEMORY"),
            "authority": "authorized_structured_memory",
        },
        "approved_rag_evidence": {
            "items": _items_by_authority(base_context, "RAG_DOCUMENT"),
            "citations": base_context.get("citations") or [],
            "authority": "approved_tenant_scoped_rag",
            "untrusted_input": True,
        },
        "request_context": request_context,
        "missing_conflicting_or_stale_data": {
            "warnings": base_context.get("warnings") or [],
            "clarification_required": base_context.get("clarification_required") or False,
            "evidence_decision": base_context.get("evidence_decision"),
        },
        "budget_context": {
            "context_minimized": True,
            "provider_payload_policy": "provider-context-envelope-v1",
        },
    }


def _items_by_authority(context: dict[str, Any], authority: str) -> list[dict[str, Any]]:
    return [item for item in (context.get("items") or []) if item.get("authority_type") == authority]
