from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, Field

from app.api.dependencies import get_project_by_id
from app.core.rbac_visibility import can_view_owned_record
from app.models.client import Client
from app.models.crm_company import CRMCompany
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect
from app.models.task import Task
from app.models.user import User, UserRole


class StructuredRecordType(str, Enum):
    CURRENT_USER = "current_user"
    TENANT = "tenant"
    COMPANY = "company"
    CLIENT = "client"
    LEAD = "lead"
    CONTACT = "contact"
    PROJECT = "project"
    TASK = "task"
    SUBTASK = "subtask"
    USER = "user"
    MEETING = "meeting"


class StructuredReadStatus(str, Enum):
    AVAILABLE = "available"
    MISSING = "missing"
    FORBIDDEN = "forbidden"
    UNAVAILABLE = "unavailable"
    STALE = "stale"


class StructuredMemoryRecord(BaseModel):
    record_type: str
    record_id: str | None = None
    tenant_scope: dict[str, Any]
    fields: dict[str, Any] = Field(default_factory=dict)
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_updated_at: datetime | None = None
    freshness_status: str = "current"
    authority: str = "STRUCTURED_MEMORY"
    authorization: dict[str, Any] = Field(default_factory=dict)
    status: StructuredReadStatus = StructuredReadStatus.AVAILABLE
    error: str | None = None
    sensitivity: str = "internal"
    external_model_allowed: bool = True


class ProposedAction(BaseModel):
    action_type: str
    target_record_type: str
    target_record_id: str
    proposed_changes: dict[str, Any]
    requesting_user: str
    tenant_scope: dict[str, Any]
    reason: str
    source_context_references: list[dict[str, Any]] = Field(default_factory=list)
    requires_approval: bool = True
    idempotency_key: str = "pending-approval-gateway"


class StructuredMemoryRequest(BaseModel):
    record_type: StructuredRecordType
    record_id: str | None = None
    query: str | None = None
    requested_fields: list[str] = Field(default_factory=list)


@dataclass
class StructuredMemoryRepositories:
    get_project_by_id: Callable[[str, str | None], Awaitable[tuple[Any | None, str | None]]] = get_project_by_id


SAFE_FIELDS: dict[StructuredRecordType, set[str]] = {
    StructuredRecordType.CURRENT_USER: {"id", "first_name", "last_name", "email", "role", "status", "company_id", "department_id", "reports_to", "ancestors", "modules", "updated_at"},
    StructuredRecordType.TENANT: {"company_id"},
    StructuredRecordType.COMPANY: {"id", "name", "email", "phone", "website", "industry", "company_size", "primary_contact_id", "created_by", "updated_by", "updated_at"},
    StructuredRecordType.CLIENT: {"id", "name", "email", "contact", "status", "company_name", "industry", "project_ids", "assigned_to", "updated_at"},
    StructuredRecordType.LEAD: {"id", "prospect_name", "company_name", "crm_company_id", "contact_id", "current_stage", "status", "interest_level", "assigned_to", "due_date", "updated_at"},
    StructuredRecordType.CONTACT: {"id", "first_name", "last_name", "email", "company_name", "crm_company_id", "designation", "relationship_type", "created_by", "updated_at"},
    StructuredRecordType.PROJECT: {"id", "project_id", "name", "key", "status", "lead_id", "assigned_to", "assigned_user_ids", "team_member_ids", "delivery_date", "updated_at"},
    StructuredRecordType.TASK: {"id", "title", "project_id", "project_object_id", "status", "priority", "assigned_to", "created_by", "due_date", "health_status", "parent_task_id", "updated_at"},
    StructuredRecordType.SUBTASK: {"id", "title", "project_id", "project_object_id", "status", "priority", "assigned_to", "created_by", "due_date", "health_status", "parent_task_id", "updated_at"},
    StructuredRecordType.USER: {"id", "first_name", "last_name", "email", "role", "status", "company_id", "department_id", "reports_to", "ancestors", "modules", "updated_at"},
    StructuredRecordType.MEETING: {"id", "title", "description", "created_by", "host_id", "participant_ids", "meeting_date", "meeting_time", "duration", "status", "updated_at"},
}

SENSITIVE_BLOCKLIST = {"password_hash", "two_factor_secret", "password_reset_token", "zoom_password", "zoom_start_url", "projects_budget"}


class StructuredMemoryService:
    def __init__(self, repositories: StructuredMemoryRepositories | None = None) -> None:
        self.repositories = repositories or StructuredMemoryRepositories()

    async def read(self, *, current_user: User, request: StructuredMemoryRequest) -> StructuredMemoryRecord:
        if not getattr(current_user, "company_id", None) and current_user.role != UserRole.SUPER_ADMIN:
            return self._result(current_user, request.record_type, status=StructuredReadStatus.FORBIDDEN, error="missing_server_scope")
        try:
            record = await self._load_record(current_user=current_user, request=request)
            if record is None:
                return self._result(current_user, request.record_type, status=StructuredReadStatus.MISSING)
            if not await self._authorized(current_user, request.record_type, record):
                return self._result(current_user, request.record_type, record=record, status=StructuredReadStatus.FORBIDDEN)
            return self._result(current_user, request.record_type, record=record, requested_fields=request.requested_fields)
        except Exception as exc:
            return self._result(current_user, request.record_type, status=StructuredReadStatus.UNAVAILABLE, error=type(exc).__name__)

    async def _load_record(self, *, current_user: User, request: StructuredMemoryRequest) -> Any | None:
        if request.record_type == StructuredRecordType.CURRENT_USER:
            return current_user
        if request.record_type == StructuredRecordType.TENANT:
            return {"company_id": current_user.company_id}
        if not request.record_id:
            return None
        if request.record_type == StructuredRecordType.PROJECT:
            project, _ = await self.repositories.get_project_by_id(request.record_id, current_user.company_id)
            return project
        model = {
            StructuredRecordType.COMPANY: CRMCompany,
            StructuredRecordType.CLIENT: Client,
            StructuredRecordType.LEAD: SalesProspect,
            StructuredRecordType.CONTACT: SalesContact,
            StructuredRecordType.TASK: Task,
            StructuredRecordType.SUBTASK: Task,
            StructuredRecordType.USER: User,
            StructuredRecordType.MEETING: Meeting,
        }.get(request.record_type)
        return await model.get(request.record_id) if model else None

    async def _authorized(self, current_user: User, record_type: StructuredRecordType, record: Any) -> bool:
        if current_user.role == UserRole.SUPER_ADMIN:
            return True
        if isinstance(record, dict):
            return bool(current_user.company_id)
        if getattr(record, "company_id", None) != current_user.company_id:
            return False
        if getattr(record, "deleted", False):
            return False
        if record_type in {StructuredRecordType.LEAD, StructuredRecordType.CONTACT, StructuredRecordType.COMPANY}:
            return self._has_module(current_user, "sales")
        if record_type == StructuredRecordType.PROJECT:
            return self._can_view_project(current_user, record)
        if record_type in {StructuredRecordType.TASK, StructuredRecordType.SUBTASK}:
            return await can_view_owned_record(current_user, record, ownership_fields=("assigned_to", "created_by"))
        if record_type == StructuredRecordType.MEETING:
            ids = {str(getattr(record, "created_by", "")), str(getattr(record, "host_id", "")), *[str(uid) for uid in getattr(record, "participant_ids", [])]}
            return current_user.role in {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD} or str(current_user.id) in ids
        if record_type == StructuredRecordType.USER:
            return await can_view_owned_record(current_user, record, ownership_fields=("id", "reports_to", "created_by"))
        return True

    def _can_view_project(self, current_user: User, project: Project) -> bool:
        if current_user.role == UserRole.ADMIN:
            return True
        user_id = str(current_user.id)
        return user_id in {str(project.lead_id or ""), str(project.assigned_to or ""), str(project.created_by or "")} or user_id in [str(uid) for uid in project.team_member_ids + project.assigned_user_ids]

    def _has_module(self, current_user: User, module: str) -> bool:
        return current_user.role in {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE} and module in (getattr(current_user, "modules", []) or [])

    def _result(
        self,
        current_user: User,
        record_type: StructuredRecordType,
        *,
        record: Any | None = None,
        requested_fields: list[str] | None = None,
        status: StructuredReadStatus = StructuredReadStatus.AVAILABLE,
        error: str | None = None,
    ) -> StructuredMemoryRecord:
        fields = self._minimized_fields(record_type, record, requested_fields or []) if record is not None and status == StructuredReadStatus.AVAILABLE else {}
        return StructuredMemoryRecord(
            record_type=record_type.value,
            record_id=self._record_id(record),
            tenant_scope={"company_id": getattr(current_user, "company_id", None), "tenant_id": getattr(current_user, "company_id", None)},
            fields=fields,
            source_updated_at=getattr(record, "updated_at", None) if record is not None else None,
            authorization={"status": "authorized" if status == StructuredReadStatus.AVAILABLE else status.value, "user_id": str(getattr(current_user, "id", "")), "role": getattr(getattr(current_user, "role", ""), "value", str(getattr(current_user, "role", "")))},
            status=status,
            error=error,
            sensitivity="internal",
            external_model_allowed=status == StructuredReadStatus.AVAILABLE,
        )

    def _minimized_fields(self, record_type: StructuredRecordType, record: Any, requested_fields: list[str]) -> dict[str, Any]:
        allowed = SAFE_FIELDS[record_type] - SENSITIVE_BLOCKLIST
        selected = [field for field in requested_fields if field in allowed] or sorted(allowed)
        payload: dict[str, Any] = {}
        for field in selected:
            if field == "id":
                payload[field] = self._record_id(record)
            elif isinstance(record, dict):
                payload[field] = record.get(field)
            else:
                value = getattr(record, field, None)
                payload[field] = value.value if hasattr(value, "value") else value
        return payload

    def _record_id(self, record: Any | None) -> str | None:
        if record is None:
            return None
        if isinstance(record, dict):
            return record.get("id") or record.get("company_id")
        return str(getattr(record, "id", "")) or None
