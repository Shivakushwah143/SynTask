"""
Resource-level authorization — validates that referenced resources
belong to the authenticated user's tenant and are accessible under
their current permissions.
"""
from __future__ import annotations

import logging
from typing import Any

from app.ai.security.context import AISecurityContext

logger = logging.getLogger(__name__)


async def validate_resource_access(
    context: AISecurityContext,
    resource_type: str,
    resource_id: str,
    company_id_field: str = "company_id",
) -> bool:
    """Validate that a resource belongs to the user's tenant.

    Performs a lightweight check against the database to confirm:
    1. The resource exists
    2. The resource belongs to the user's company (tenant isolation)

    Returns True if access is allowed, False otherwise.
    """
    if not resource_id or not resource_id.strip():
        return False

    try:
        if resource_type == "employee":
            from app.models.employee_profile import EmployeeProfile
            doc = await EmployeeProfile.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "user":
            from app.models.user import User
            doc = await User.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "candidate":
            from app.models.candidate import Candidate
            doc = await Candidate.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "job":
            from app.models.job_opening import JobOpening
            doc = await JobOpening.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "project":
            from app.models.project import Project
            doc = await Project.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "client":
            from app.models.client import Client
            doc = await Client.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "task":
            from app.models.task import Task
            doc = await Task.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "attendance":
            from app.models.attendance import Attendance
            doc = await Attendance.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "leave":
            from app.models.leave import LeaveRequest
            doc = await LeaveRequest.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "payroll":
            from app.models.payroll import PayrollPeriod
            doc = await PayrollPeriod.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        elif resource_type == "document":
            from app.models.hr_document import HRDocument
            doc = await HRDocument.get(resource_id)
            if not doc:
                return False
            return str(getattr(doc, company_id_field, "")) == context.company_id

        # Unknown resource type — fail closed
        logger.warning("Unknown resource type '%s' — denying access", resource_type)
        return False

    except Exception as exc:
        logger.exception("Resource access validation failed for %s:%s", resource_type, resource_id)
        return False


def extract_resource_ids_from_args(
    tool_name: str,
    arguments: dict[str, Any],
) -> list[tuple[str, str]]:
    """Extract resource type + ID pairs from tool arguments.

    Returns list of (resource_type, resource_id) tuples for validation.
    """
    mappings = {
        "employee_id": "employee",
        "user_id": "user",
        "candidate_id": "candidate",
        "job_id": "job",
        "project_id": "project",
        "project_object_id": "project",
        "client_id": "client",
        "task_id": "task",
        "attendance_id": "attendance",
        "leave_id": "leave",
        "payroll_id": "payroll",
        "document_id": "document",
    }

    results = []
    for arg_key, resource_type in mappings.items():
        value = arguments.get(arg_key)
        if value and isinstance(value, str) and value.strip():
            results.append((resource_type, value.strip()))
    return results
