"""
Sensitive data projection — independent capability-based filtering of
composite tool results BEFORE they are passed to the LLM.

Authorization to access an employee does NOT automatically authorize every
nested HR property. Each section is independently projected based on the
user's current effective capabilities.
"""
from __future__ import annotations

import logging
from typing import Any

from app.ai.security.context import AISecurityContext

logger = logging.getLogger(__name__)


def project_employee_360(
    context: AISecurityContext,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Project employee_360 result based on user's capabilities.

    Independently gates each section:
        - profile (base — always visible if tool is allowed)
        - attendance → requires attendance or employee_management.view
        - leave → requires leave_management.view
        - documents → requires employee_management.view
        - onboarding → requires employee_management.view
        - recruitment → requires recruitment.view
        - payroll → requires salary_management.view or payroll.view
    """
    if not isinstance(result, dict) or "error" in result:
        return result

    projected: dict[str, Any] = {}

    # Base profile — always included (tool governance already verified access)
    if "employee" in result:
        projected["employee"] = result["employee"]
    elif "profile" in result:
        projected["profile"] = result["profile"]

    # Attendance — gated
    if "attendance" in result:
        if context.has_any_capability(["attendance", "attendance_policy.view", "employee_management.view"]):
            projected["attendance"] = result["attendance"]
        else:
            projected["attendance"] = _redacted_section("attendance")

    # Leave — gated
    if "leave" in result or "leave_balance" in result:
        if context.has_any_capability(["leave_management.view", "employee_management.view"]):
            if "leave" in result:
                projected["leave"] = result["leave"]
            if "leave_balance" in result:
                projected["leave_balance"] = result["leave_balance"]
        else:
            if "leave" in result:
                projected["leave"] = _redacted_section("leave")
            if "leave_balance" in result:
                projected["leave_balance"] = _redacted_section("leave_balance")

    # Documents — gated
    if "documents" in result:
        if context.has_capability("employee_management.view"):
            projected["documents"] = result["documents"]
        else:
            projected["documents"] = _redacted_section("documents")

    # Onboarding — gated
    if "onboarding" in result:
        if context.has_capability("employee_management.view"):
            projected["onboarding"] = result["onboarding"]

    # Recruitment history — gated
    if "recruitment" in result or "recruitment_history" in result:
        if context.has_any_capability(["recruitment.view", "recruitment.candidates.view"]):
            if "recruitment" in result:
                projected["recruitment"] = result["recruitment"]
            if "recruitment_history" in result:
                projected["recruitment_history"] = result["recruitment_history"]

    # Payroll — heavily gated
    if "payroll" in result or "salary" in result or "payslip" in result:
        if context.has_any_capability(["salary_management.view", "payroll.view"]):
            if "payroll" in result:
                projected["payroll"] = result["payroll"]
            if "salary" in result:
                projected["salary"] = result["salary"]
            if "payslip" in result:
                projected["payslip"] = result["payslip"]
        else:
            if "payroll" in result:
                projected["payroll"] = _redacted_section("payroll")
            if "salary" in result:
                projected["salary"] = _redacted_section("salary")
            if "payslip" in result:
                projected["payslip"] = _redacted_section("payslip")

    # Carry through any other top-level keys that aren't sensitive
    for key, value in result.items():
        if key not in projected and key not in (
            "employee", "profile", "attendance", "leave", "leave_balance",
            "documents", "onboarding", "recruitment", "recruitment_history",
            "payroll", "salary", "payslip", "error",
        ):
            projected[key] = value

    return projected


def project_candidate_360(
    context: AISecurityContext,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Project candidate_360 result based on user's capabilities.

    Independently gates:
        - profile (base)
        - applications, scores → requires recruitment.candidates.view
        - interviews, feedback → requires recruitment.interviews.view
        - offers → requires recruitment.offers.manage or recruitment.view
    """
    if not isinstance(result, dict) or "error" in result:
        return result

    projected: dict[str, Any] = {}

    # Base profile
    for key in ("candidate", "profile", "basic_info"):
        if key in result:
            projected[key] = result[key]

    # Applications & scores
    if context.has_any_capability(["recruitment.candidates.view", "recruitment.view"]):
        for key in ("applications", "scores", "resume"):
            if key in result:
                projected[key] = result[key]

    # Interviews & feedback
    if context.has_any_capability(["recruitment.interviews.view", "recruitment.view"]):
        for key in ("interviews", "feedback", "interview_feedback"):
            if key in result:
                projected[key] = result[key]

    # Offers
    if context.has_any_capability(["recruitment.offers.manage", "recruitment.view"]):
        if "offers" in result:
            projected["offers"] = result["offers"]

    # Timeline (non-sensitive)
    if "timeline" in result:
        projected["timeline"] = result["timeline"]

    return projected


def _redacted_section(section_name: str) -> dict[str, Any]:
    """Return a safe redacted placeholder for unauthorized sections."""
    return {
        "_redacted": True,
        "_reason": "insufficient_permissions",
        "_section": section_name,
    }


def project_tool_result(
    context: AISecurityContext,
    tool_name: str,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Apply capability-based projection to any tool result.

    Dispatches to the appropriate projection function based on tool name.
    Unknown tools pass through unchanged (tool governance already validated access).
    """
    projectors = {
        "get_employee_360": project_employee_360,
        "get_candidate_360": project_candidate_360,
    }

    projector = projectors.get(tool_name)
    if projector:
        return projector(context, result)

    return result
