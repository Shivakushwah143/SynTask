from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, Optional
from uuid import uuid4

from fastapi import HTTPException, status

from app.models.ai_log import AIInteractionLog
from app.models.user import User, UserRole


ToolHandler = Callable[[dict[str, Any], "ToolContext"], Awaitable["ToolResult"]]


@dataclass(slots=True)
class ToolContext:
    current_user: User
    tool_name: str
    correlation_id: str = field(default_factory=lambda: uuid4().hex)
    request_id: str = field(default_factory=lambda: uuid4().hex)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def company_id(self) -> Optional[str]:
        return str(getattr(self.current_user, "company_id", "") or "") or None


@dataclass(slots=True)
class ToolResult:
    tool_name: str
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool": self.tool_name,
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "meta": self.meta,
        }


class BaseTool:
    name: str = ""
    description: str = ""
    required_roles: set[str] = set()
    requires_company: bool = True
    idempotent: bool = True

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        raise NotImplementedError

    def _check_permissions(self, context: ToolContext) -> None:
        user = context.current_user
        if self.requires_company and user.role != UserRole.SUPER_ADMIN and not context.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
        if self.required_roles and user.role.value not in self.required_roles and user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to use this tool")

    async def _write_audit(
        self,
        *,
        context: ToolContext,
        payload: dict[str, Any],
        result: ToolResult,
    ) -> None:
        try:
            await AIInteractionLog(
                feature=f"tool:{self.name}",
                role=context.current_user.role.value,
                provider="tool_layer",
                model=None,
                prompt_version="tool_layer_v1",
                prompt_role_key=self.name,
                status="success" if result.success else "failed",
                company_id=context.company_id,
                user_id=str(getattr(context.current_user, "id", "")),
                target_user_id=None,
                prompt=None,
                context={
                    "tool": self.name,
                    "payload": payload,
                    "correlation_id": context.correlation_id,
                    "request_id": context.request_id,
                    "metadata": context.metadata,
                },
                raw_response=None,
                parsed_response=result.to_dict(),
                error_message=result.error,
                fallback_chain=[],
                executed_actions=[],
                prompt_tokens=None,
                completion_tokens=None,
                total_tokens=None,
                latency_ms=None,
                response_size_bytes=None,
                fallback_used=False,
            ).insert()
        except Exception:
            return

    async def run(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        self._check_permissions(context)
        result = await self.execute(payload, context)
        await self._write_audit(context=context, payload=payload, result=result)
        return result
