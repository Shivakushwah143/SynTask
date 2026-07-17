from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from beanie.odm.operators.find.comparison import In

from app.models.ai_conversation import AIConversation, AIConversationMessage, AIConversationState
from app.models.ai_memory import ClientMemory, CompanyMemory, ProjectMemory, UserMemory
from app.models.client import Client, ClientStatus
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole


class AIMemoryService:
    """Tenant-scoped memory retrieval and update helpers for the existing AI pipeline."""

    COMPANY_MEMORY_ROLES = {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}

    @staticmethod
    def _serialize_memory(memory: Any) -> dict[str, Any]:
        return {
            "id": str(memory.id),
            "title": memory.title,
            "content": memory.content,
            "memory_type": memory.memory_type,
            "source": memory.source,
            "importance": memory.importance,
            "tags": list(memory.tags or []),
            "metadata": dict(memory.metadata or {}),
            "last_seen_at": memory.last_seen_at,
            "created_at": memory.created_at,
        }

    @staticmethod
    def _summarize_message(text: str, max_length: int = 260) -> str:
        normalized = " ".join(text.strip().split())
        if len(normalized) <= max_length:
            return normalized
        return f"{normalized[: max_length - 3]}..."

    @staticmethod
    def _normalize_history_item(item: Any) -> dict[str, Any]:
        if isinstance(item, dict):
            return {
                "role": item.get("role", "user"),
                "content": item.get("content", ""),
            }
        return {
            "role": getattr(item, "role", "user"),
            "content": getattr(item, "content", ""),
        }

    @staticmethod
    def _detect_memory_type(text: str) -> str:
        lowered = text.lower()
        if any(token in lowered for token in ["decided", "decision", "approved", "confirmed", "final"]):
            return "important_decision"
        if any(token in lowered for token in ["prefer", "preference", "usually", "always", "default"]):
            return "user_preference"
        if any(token in lowered for token in ["report", "summary", "blocker", "risk"]):
            return "recent_report"
        return "previous_conversation"

    @staticmethod
    async def _upsert_project_memory(project: Project, current_user: User) -> None:
        memory = await ProjectMemory.find_one(
            ProjectMemory.company_id == project.company_id,
            ProjectMemory.project_id == (project.project_id or str(project.id)),
            ProjectMemory.memory_type == "active_project",
        )
        content = (
            f"{project.name} is a {getattr(project.type, 'value', project.type)} project with status {project.status.value}. "
            f"Lead: {project.lead_id or project.assigned_to or 'unassigned'}."
        )
        now = datetime.now()
        if memory:
            memory.title = project.name
            memory.content = content
            memory.updated_by = str(current_user.id)
            memory.last_seen_at = now
            memory.updated_at = now
            await memory.save()
            return

        await ProjectMemory(
            company_id=project.company_id,
            project_id=project.project_id or str(project.id),
            title=project.name,
            content=content,
            memory_type="active_project",
            source="system_project",
            importance=3,
            tags=["project", project.status.value, getattr(project.type, "value", project.type)],
            metadata={
                "project_object_id": str(project.id),
                "project_key": project.key,
                "status": project.status.value,
            },
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
        ).insert()

    @staticmethod
    async def _upsert_client_memory(client: Client, current_user: User) -> None:
        memory = await ClientMemory.find_one(
            ClientMemory.company_id == client.company_id,
            ClientMemory.client_id == str(client.id),
            ClientMemory.memory_type == "client_context",
        )
        content = (
            f"{client.name} is a {client.status.value} client"
            f"{f' in {client.industry}' if client.industry else ''}. "
            f"Projects: {', '.join(client.project_ids[:5]) if client.project_ids else 'none linked'}."
        )
        now = datetime.now()
        if memory:
            memory.title = client.name
            memory.content = content
            memory.updated_by = str(current_user.id)
            memory.last_seen_at = now
            memory.updated_at = now
            await memory.save()
            return

        await ClientMemory(
            company_id=client.company_id,
            client_id=str(client.id),
            title=client.name,
            content=content,
            memory_type="client_context",
            source="system_client",
            importance=3,
            tags=["client", client.status.value, *(client.tags or [])],
            metadata={
                "client_status": client.status.value,
                "project_ids": list(client.project_ids or []),
                "assigned_to": client.assigned_to,
            },
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
        ).insert()

    async def sync_operational_memory(
        self,
        current_user: User,
        project_ids: list[str],
    ) -> list[str]:
        if not current_user.company_id:
            return []

        visible_project_ids = list(dict.fromkeys([item for item in project_ids if item]))
        project_filters: list[Any] = [
            Project.company_id == current_user.company_id,
            Project.status == ProjectStatus.ACTIVE,
        ]
        if visible_project_ids:
            project_filters.append(In(Project.project_id, visible_project_ids))
        elif current_user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
            return []

        projects = await Project.find(*project_filters).sort("-updated_at").limit(10).to_list()
        for project in projects:
            await self._upsert_project_memory(project, current_user)

        synced_project_ids = [project.project_id or str(project.id) for project in projects]
        if not synced_project_ids:
            return []

        clients = await Client.find({
            "company_id": current_user.company_id,
            "status": ClientStatus.ACTIVE.value,
            "project_ids": {"$in": synced_project_ids},
        }).sort("-updated_at").limit(10).to_list()
        for client in clients:
            await self._upsert_client_memory(client, current_user)

        return synced_project_ids

    async def retrieve_for_context(
        self,
        current_user: User,
        *,
        query: str,
        access_scope: str,
        project_ids: list[str],
        limit: int = 5,
    ) -> dict[str, Any]:
        if not current_user.company_id:
            return {}

        synced_project_ids = await self.sync_operational_memory(current_user, project_ids)
        visible_project_ids = list(dict.fromkeys([*project_ids, *synced_project_ids]))

        memory_sort = [("importance", -1), ("last_seen_at", -1)]

        user_future = UserMemory.find(
            UserMemory.company_id == current_user.company_id,
            UserMemory.user_id == str(current_user.id),
        ).sort(memory_sort).limit(limit).to_list()

        company_future = CompanyMemory.find(
            CompanyMemory.company_id == current_user.company_id,
        ).sort(memory_sort).limit(limit).to_list()

        project_future = ProjectMemory.find(
            ProjectMemory.company_id == current_user.company_id,
            In(ProjectMemory.project_id, visible_project_ids),
        ).sort(memory_sort).limit(limit).to_list() if visible_project_ids else ProjectMemory.find(
            ProjectMemory.company_id == current_user.company_id,
        ).sort(memory_sort).limit(limit).to_list()

        client_query: dict[str, Any] = {"company_id": current_user.company_id}
        if visible_project_ids:
            client_query["metadata.project_ids"] = {"$in": visible_project_ids}
        client_future = ClientMemory.find(client_query).sort(memory_sort).limit(limit).to_list()

        user_memories = await user_future
        company_memories = await company_future if current_user.role in self.COMPANY_MEMORY_ROLES else []
        project_memories = await project_future if access_scope in {"team", "company", "platform", "department"} or visible_project_ids else []
        client_memories = await client_future if access_scope in {"team", "company", "platform", "department"} or visible_project_ids else []

        memories = {
            "query": query,
            "previous_conversations": [
                self._serialize_memory(item)
                for item in user_memories
                if item.memory_type == "previous_conversation"
            ],
            "user_preferences": [
                self._serialize_memory(item)
                for item in user_memories
                if item.memory_type == "user_preference"
            ],
            "important_decisions": [
                self._serialize_memory(item)
                for item in [*user_memories, *company_memories]
                if item.memory_type == "important_decision"
            ],
            "recent_reports": [
                self._serialize_memory(item)
                for item in [*user_memories, *company_memories]
                if item.memory_type == "recent_report"
            ],
            "active_projects": [self._serialize_memory(item) for item in project_memories],
            "clients": [self._serialize_memory(item) for item in client_memories],
        }
        memories["memory_count"] = sum(
            len(value)
            for key, value in memories.items()
            if isinstance(value, list) and key != "query"
        )
        return memories

    async def remember_chat(
        self,
        current_user: User,
        *,
        user_message: str,
        assistant_message: str,
        context: dict[str, Any],
    ) -> None:
        if not current_user.company_id:
            return

        memory_type = self._detect_memory_type(user_message)
        now = datetime.now()
        await UserMemory(
            company_id=current_user.company_id,
            user_id=str(current_user.id),
            title=f"Chat: {self._summarize_message(user_message, 80)}",
            content=(
                f"User: {self._summarize_message(user_message)}\n"
                f"Assistant: {self._summarize_message(assistant_message)}"
            ),
            memory_type=memory_type,
            source="ai_chat",
            importance=4 if memory_type in {"important_decision", "user_preference"} else 2,
            tags=["chat", context.get("intent", "general"), context.get("access_scope", "self")],
            metadata={
                "role": current_user.role.value,
                "intent": context.get("intent"),
                "access_scope": context.get("access_scope"),
            },
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
            last_seen_at=now,
            created_at=now,
            updated_at=now,
        ).insert()

        if memory_type == "important_decision" and current_user.role in self.COMPANY_MEMORY_ROLES:
            await CompanyMemory(
                company_id=current_user.company_id,
                title=f"Decision: {self._summarize_message(user_message, 80)}",
                content=self._summarize_message(user_message),
                memory_type="important_decision",
                source="ai_chat",
                importance=4,
                tags=["decision", current_user.role.value],
                metadata={"created_from_user_id": str(current_user.id)},
                created_by=str(current_user.id),
                updated_by=str(current_user.id),
                last_seen_at=now,
                created_at=now,
                updated_at=now,
            ).insert()

    async def get_or_create_conversation(
        self,
        current_user: User,
        conversation_id: str | None = None,
    ) -> AIConversation:
        if conversation_id:
            existing = await AIConversation.find_one(
                AIConversation.conversation_id == conversation_id,
            )
            if existing:
                if existing.user_id != str(current_user.id):
                    raise ValueError("Conversation does not belong to the current user")
                if existing.company_id and current_user.company_id and existing.company_id != current_user.company_id:
                    raise ValueError("Conversation does not belong to the current company")
                return existing

        now = datetime.now()
        conversation = AIConversation(
            conversation_id=conversation_id or str(uuid4()),
            user_id=str(current_user.id),
            company_id=current_user.company_id,
            role=current_user.role.value,
            messages=[],
            state=AIConversationState(),
            created_at=now,
            updated_at=now,
        )
        await conversation.insert()
        return conversation

    @staticmethod
    def get_conversation_history(conversation: AIConversation, limit: int = 10) -> list[dict[str, Any]]:
        messages = list(conversation.messages or [])[-limit:]
        return [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "timestamp": message.timestamp,
                "intent": message.intent,
                "tokens_used": message.tokens_used,
            }
            for message in messages
        ]

    async def remember_conversation_turn(
        self,
        conversation: AIConversation,
        *,
        user_message: str,
        assistant_message: str,
        context: dict[str, Any],
        assistant_tokens_used: int | None = None,
    ) -> AIConversation:
        now = datetime.now()
        if isinstance(conversation.state, dict):
            conversation.state = AIConversationState.model_validate(conversation.state)
        intent = context.get("intent")
        suggested_actions = list(context.get("suggested_actions") or [])
        pending_action = context.get("pending_action")
        if pending_action is None and suggested_actions:
            first_action = suggested_actions[0]
            if isinstance(first_action, dict):
                pending_action = first_action.get("label") or first_action.get("type")
            else:
                pending_action = getattr(first_action, "label", None) or getattr(first_action, "type", None)

        conversation.messages.extend(
            [
                AIConversationMessage(
                    role="user",
                    content=user_message,
                    timestamp=now,
                    intent=intent,
                ),
                AIConversationMessage(
                    role="assistant",
                    content=assistant_message,
                    timestamp=now,
                    intent=intent,
                    tokens_used=assistant_tokens_used,
                ),
            ]
        )
        conversation.state.last_intent = intent or conversation.state.last_intent
        conversation.state.pending_action = pending_action
        conversation.state.conversation_phase = "active"
        conversation.updated_at = now
        await conversation.save()
        return conversation

    async def remember_report(
        self,
        current_user: User,
        *,
        report_type: str,
        summary: str,
        context: dict[str, Any],
    ) -> None:
        if not current_user.company_id:
            return

        now = datetime.now()
        report_scope = context.get("report_scope", "self")
        await UserMemory(
            company_id=current_user.company_id,
            user_id=str(current_user.id),
            title=f"{report_type.title()} report",
            content=self._summarize_message(summary, 400),
            memory_type="recent_report",
            source="daily_report",
            importance=3,
            tags=["report", report_type, report_scope],
            metadata={
                "report_type": report_type,
                "report_scope": report_scope,
                "report_date": context.get("report_date"),
            },
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
            last_seen_at=now,
            created_at=now,
            updated_at=now,
        ).insert()

        if current_user.role in self.COMPANY_MEMORY_ROLES:
            await CompanyMemory(
                company_id=current_user.company_id,
                title=f"{report_type.title()} report",
                content=self._summarize_message(summary, 400),
                memory_type="recent_report",
                source="daily_report",
                importance=3,
                tags=["report", report_type, report_scope],
                metadata={
                    "report_type": report_type,
                    "report_scope": report_scope,
                    "report_date": context.get("report_date"),
                    "created_from_user_id": str(current_user.id),
                },
                created_by=str(current_user.id),
                updated_by=str(current_user.id),
                last_seen_at=now,
                created_at=now,
                updated_at=now,
            ).insert()

