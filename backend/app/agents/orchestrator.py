from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from app.agents.email_draft import EMAIL_DRAFT_OUTPUT_SCHEMA_VERSION, EmailDraftAgentOutput, detect_sensitive_terms
from app.agents.budget import AgentBudgetController, BudgetExceeded
from app.agents.registry import AgentRegistry
from app.agents.schemas import AgentRunCreateRequest, AgentRunResponse, GenericAgentOutput
from app.agents.state_machine import AgentRunStateMachine
from app.agents.tools import tool_registry
from app.ai.provider_router import ProviderRouter
from app.models.agent import ActionProposal, AgentRun, AgentRunEvent, AgentRunState
from app.models.user import User
from app.rag.context_package import ContextPackageBuilder, sanitize_for_model_context
from app.rag.permissions import RAGScope


SENSITIVE_METADATA_KEYS = {"prompt", "raw_context", "context_package", "secret", "password", "token"}


def sanitize_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    clean = {}
    for key, value in (metadata or {}).items():
        if key.lower() in SENSITIVE_METADATA_KEYS:
            continue
        clean[key] = value
    return clean


class AgentOrchestrator:
    def __init__(
        self,
        *,
        registry: AgentRegistry | None = None,
        context_builder: ContextPackageBuilder | None = None,
        provider_router: ProviderRouter | None = None,
        budget_controller: AgentBudgetController | None = None,
    ) -> None:
        self.registry = registry or AgentRegistry()
        self.context_builder = context_builder or ContextPackageBuilder()
        self.provider_router = provider_router or ProviderRouter()
        self.budget_controller = budget_controller or AgentBudgetController()
        self.state_machine = AgentRunStateMachine()

    async def create_run(self, *, current_user: User, payload: AgentRunCreateRequest) -> AgentRunResponse:
        if not getattr(current_user, "company_id", None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")
        definition = await self.registry.get_definition(agent_id=payload.agent_id, version=payload.agent_version)
        self._authorize_definition(current_user=current_user, definition=definition, payload=payload)
        existing = await AgentRun.find_one(
            AgentRun.tenant_id == current_user.company_id,
            AgentRun.requesting_user_id == str(current_user.id),
            AgentRun.agent_id == payload.agent_id,
            AgentRun.idempotency_key == payload.idempotency_key,
        )
        if existing:
            return self._response(existing)

        run = AgentRun(
            run_id=str(uuid4()),
            tenant_id=current_user.company_id,
            requesting_user_id=str(current_user.id),
            agent_id=definition.agent_id,
            agent_version=definition.version,
            trigger_type=payload.trigger_type,
            project_id=payload.project_id,
            task_id=payload.task_id,
            department_id=payload.department_id,
            retrieval_profile_version=definition.retrieval_profile_version,
            prompt_version=definition.prompt_version,
            output_schema_version=definition.output_schema_version,
            idempotency_key=payload.idempotency_key,
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        )
        try:
            await run.insert()
        except DuplicateKeyError:
            duplicate = await AgentRun.find_one(
                AgentRun.tenant_id == current_user.company_id,
                AgentRun.requesting_user_id == str(current_user.id),
                AgentRun.agent_id == payload.agent_id,
                AgentRun.idempotency_key == payload.idempotency_key,
            )
            if duplicate:
                return self._response(duplicate)
            raise
        await self._event(run=run, event_type="run_created", actor_id=str(current_user.id), new_state=run.state.value)
        try:
            await self._advance(run, AgentRunState.QUEUED, actor_id=str(current_user.id), reason="queued")
            await self._advance(run, AgentRunState.GATHERING_CONTEXT, actor_id=str(current_user.id), reason="context")
            scope = RAGScope(
                company_id=current_user.company_id,
                tenant_id=current_user.company_id,
                user_id=str(current_user.id),
                role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                project_id=payload.project_id,
                department_id=payload.department_id or getattr(current_user, "department_id", None),
                current_user=current_user,
            )
            package = await self.context_builder.build(
                scope=scope,
                session_id=payload.session_id,
                conversation_id=payload.conversation_id,
                query=payload.query,
                retrieval_profile_id=definition.retrieval_profile_id,
                structured_context_ids=self._structured_context_ids(payload.input_payload),
                trace_id=run.run_id,
            )
            run.context_package_id = package.context_package_id
            if package.clarification_required:
                await self._advance(run, AgentRunState.BLOCKED_MISSING_DATA, actor_id=str(current_user.id), reason="missing_context")
                run.sanitized_result = {"warnings": package.warnings, "missing_data": ["clarification_required"]}
                await run.save()
                return self._response(run)
            await self._advance(run, AgentRunState.PROCESSING, actor_id=str(current_user.id), reason="provider")
            model_context = sanitize_for_model_context(package).model_dump(mode="json")
            tool_registry.assert_no_unregistered_tools(definition.allowed_tool_ids)
            estimated_tokens = max(1, len(payload.query.split()) + len(str(model_context).split()))
            reservation = self.budget_controller.reserve(
                budget_policy=definition.budget_policy,
                estimated_tokens=estimated_tokens,
                estimated_cost=estimated_tokens * 0.000005,
            )
            prompt = self._prompt(definition=definition, query=payload.query)
            result = await self.provider_router.generate(
                task_type="complex_reasoning",
                prompt=prompt,
                context=model_context,
                output_schema=self._output_schema(definition),
                tenant_policy=definition.provider_policy_id and {"policy_id": definition.provider_policy_id},
                data_sensitivity="internal",
            )
            run.provider = result.provider
            run.model = result.model
            run.token_usage = self.budget_controller.reconcile(
                reservation=reservation,
                actual_tokens=result.total_tokens or 0,
                actual_cost=result.estimated_cost,
            )
            run.estimated_cost = result.estimated_cost
            await self._advance(run, AgentRunState.VALIDATING, actor_id=str(current_user.id), reason="validate")
            parsed = self._validate_provider_output(definition=definition, parsed=result.parsed or {}, input_payload=payload.input_payload)
            run.sanitized_result = self._sanitize_result(parsed)
            if parsed.get("proposed_actions"):
                proposal_ids = await self._create_proposals(run=run, actions=parsed.get("proposed_actions") or [], definition=definition)
                run.proposed_action_ids = proposal_ids
                await self._advance(run, AgentRunState.PROPOSED, actor_id=str(current_user.id), reason="proposal")
                await self._advance(run, AgentRunState.AWAITING_APPROVAL, actor_id=str(current_user.id), reason="approval_required")
            else:
                await self._advance(run, AgentRunState.COMPLETED, actor_id=str(current_user.id), reason="completed")
            await run.save()
            return self._response(run)
        except (ValidationError, ValueError) as exc:
            await self._handle_repair_or_fail(run=run, current_user=current_user, reason=type(exc).__name__)
            return self._response(run)
        except BudgetExceeded as exc:
            run.error_category = "budget_exceeded"
            run.sanitized_result = {"error": str(exc)}
            await self._advance(run, AgentRunState.FAILED, actor_id=str(current_user.id), reason="budget_exceeded")
            await run.save()
            return self._response(run)
        except Exception as exc:
            run.error_category = type(exc).__name__
            run.sanitized_result = {"error": type(exc).__name__}
            target = AgentRunState.FAILED if run.state != AgentRunState.GATHERING_CONTEXT else AgentRunState.BLOCKED_MISSING_DATA
            await self._advance(run, target, actor_id=str(current_user.id), reason=type(exc).__name__)
            await run.save()
            return self._response(run)

    async def cancel_run(self, *, current_user: User, run_id: str) -> AgentRun:
        run = await self._visible_run(current_user=current_user, run_id=run_id)
        await self._advance(run, AgentRunState.CANCELLED, actor_id=str(current_user.id), reason="cancelled")
        await run.save()
        return run

    async def get_run(self, *, current_user: User, run_id: str) -> AgentRun:
        return await self._visible_run(current_user=current_user, run_id=run_id)

    async def events(self, *, current_user: User, run_id: str) -> list[dict[str, Any]]:
        run = await self._visible_run(current_user=current_user, run_id=run_id)
        events = await AgentRunEvent.find(AgentRunEvent.tenant_id == run.tenant_id, AgentRunEvent.run_id == run.run_id).sort("occurred_at").to_list()
        return [event.model_dump(mode="json") for event in events]

    async def proposals(self, *, current_user: User, run_id: str) -> list[dict[str, Any]]:
        run = await self._visible_run(current_user=current_user, run_id=run_id)
        proposals = await ActionProposal.find(ActionProposal.tenant_id == run.tenant_id, ActionProposal.run_id == run.run_id).to_list()
        return [proposal.model_dump(mode="json") for proposal in proposals]

    async def _visible_run(self, *, current_user: User, run_id: str) -> AgentRun:
        run = await AgentRun.find_one(AgentRun.run_id == run_id)
        if not run or run.tenant_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found")
        if run.requesting_user_id != str(current_user.id) and current_user.role.value not in {"admin", "super_admin", "manager", "lead"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent run access denied")
        return run

    def _authorize_definition(self, *, current_user: User, definition, payload: AgentRunCreateRequest) -> None:
        role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if definition.allowed_roles and role not in definition.allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent role denied")
        if payload.trigger_type not in definition.allowed_trigger_types:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent trigger denied")
        if "project_id" in definition.required_scopes and not payload.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id is required")
        if not set(definition.allowed_tool_ids).isdisjoint(set(definition.forbidden_tool_ids)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent tool policy invalid")

    async def _handle_repair_or_fail(self, *, run: AgentRun, current_user: User, reason: str) -> None:
        try:
            self.state_machine.validate_repair_allowed(run)
            await self._advance(run, AgentRunState.REPAIRING, actor_id=str(current_user.id), reason=reason)
            run.repair_attempts += 1
            await self._advance(run, AgentRunState.FAILED, actor_id=str(current_user.id), reason="repair_failed")
        except Exception:
            run.error_category = reason
            if run.state != AgentRunState.FAILED:
                await self._advance(run, AgentRunState.FAILED, actor_id=str(current_user.id), reason=reason)
        await run.save()

    async def _advance(self, run: AgentRun, target: AgentRunState, *, actor_id: str, reason: str) -> None:
        previous = run.state.value
        self.state_machine.transition(run, target, expected_revision=run.state_revision)
        await run.save()
        await self._event(run=run, event_type="state_transition", actor_id=actor_id, previous_state=previous, new_state=target.value, reason=reason)

    async def _event(self, *, run: AgentRun, event_type: str, actor_id: str, previous_state: str | None = None, new_state: str | None = None, reason: str | None = None, metadata: dict[str, Any] | None = None) -> None:
        event = AgentRunEvent(
            event_id=str(uuid4()),
            run_id=run.run_id,
            tenant_id=run.tenant_id,
            previous_state=previous_state,
            new_state=new_state,
            event_type=event_type,
            actor_type="user",
            actor_id=actor_id,
            reason=reason,
            metadata=sanitize_metadata(metadata or {}),
        )
        await event.insert()

    async def _create_proposals(self, *, run: AgentRun, actions: list[dict[str, Any]], definition) -> list[str]:
        proposal_ids = []
        for index, action in enumerate(actions):
            proposal = ActionProposal(
                proposal_id=str(uuid4()),
                run_id=run.run_id,
                tenant_id=run.tenant_id,
                action_type=str(action.get("action_type") or "proposed_update"),
                target_record_type=action.get("target_record_type"),
                target_record_id=action.get("target_record_id"),
                proposed_changes=action.get("proposed_changes") or {},
                reason=str(action.get("reason") or "Agent proposed action requires approval"),
                evidence_references=action.get("evidence_references") or [],
                risk_level=str(action.get("risk_level") or "low"),
                required_approver_roles=definition.approval_policy.get("required_approver_roles", []),
                expires_at=datetime.utcnow() + timedelta(hours=24),
                idempotency_key=hashlib.sha256(f"{run.run_id}:{index}:{action}".encode("utf-8")).hexdigest(),
            )
            await proposal.insert()
            proposal_ids.append(proposal.proposal_id)
        return proposal_ids

    def _sanitize_result(self, result: dict[str, Any]) -> dict[str, Any]:
        clean = dict(result or {})
        clean.pop("raw_context", None)
        clean.pop("prompt", None)
        return clean

    def _output_schema(self, definition):
        if definition.output_schema_version == EMAIL_DRAFT_OUTPUT_SCHEMA_VERSION:
            return EmailDraftAgentOutput
        return GenericAgentOutput

    def _validate_provider_output(self, *, definition, parsed: dict[str, Any], input_payload: dict[str, Any] | None = None) -> dict[str, Any]:
        parsed = self._apply_draft_warning_guards(definition=definition, parsed=parsed, input_payload=input_payload or {})
        schema = self._output_schema(definition)
        validated = schema.model_validate(parsed).model_dump(mode="json")
        if definition.approval_policy.get("draft_only") is True and validated.get("proposed_actions"):
            raise ValueError("Draft-only agents cannot create proposed actions")
        return validated

    def _apply_draft_warning_guards(self, *, definition, parsed: dict[str, Any], input_payload: dict[str, Any]) -> dict[str, Any]:
        if definition.output_schema_version != EMAIL_DRAFT_OUTPUT_SCHEMA_VERSION:
            return parsed
        guarded = dict(parsed or {})
        warnings = dict(guarded.get("warnings") or {})
        if input_payload.get("internal_or_external") == "external":
            warnings["external_recipient"] = True
        sensitive = detect_sensitive_terms(
            input_payload.get("purpose"),
            input_payload.get("user_instructions"),
            input_payload.get("call_to_action"),
            guarded.get("subject"),
            guarded.get("body"),
        )
        existing_sensitive = list(warnings.get("sensitive_data") or [])
        warnings["sensitive_data"] = list(dict.fromkeys([*existing_sensitive, *sensitive]))
        attachment_names = [str(item) for item in (input_payload.get("attachment_names") or []) if str(item).strip()]
        if attachment_names:
            existing_reminders = list(warnings.get("attachment_reminders") or [])
            reminders = [f"{name} is mention-only; no attachment was uploaded or added." for name in attachment_names]
            warnings["attachment_reminders"] = list(dict.fromkeys([*existing_reminders, *reminders]))
        recipient = guarded.get("recipient") or {}
        if not recipient.get("email"):
            warnings["missing_recipient"] = True
        guarded["warnings"] = warnings
        return guarded

    def _structured_context_ids(self, input_payload: dict[str, Any]) -> dict[str, str | None]:
        related = input_payload.get("related_context") or {}
        recipient = input_payload.get("recipient") or {}
        context_ids = {
            "project_id": related.get("project_id"),
            "client_id": related.get("client_id"),
            "lead_id": related.get("lead_id"),
            "task_id": related.get("task_id"),
            "meeting_id": related.get("meeting_id"),
            "company_record_id": related.get("company_record_id"),
        }
        record_type = recipient.get("record_type")
        record_id = recipient.get("record_id")
        if record_type and record_id:
            context_ids[f"recipient_{record_type}_id"] = record_id
        return context_ids

    def _prompt(self, *, definition, query: str) -> str:
        return f"Agent {definition.agent_id}@{definition.version}. Return schema-valid JSON only. User request: {query}"

    def _response(self, run: AgentRun) -> AgentRunResponse:
        return AgentRunResponse(
            run_id=run.run_id,
            agent_id=run.agent_id,
            agent_version=run.agent_version,
            state=run.state.value,
            state_revision=run.state_revision,
            context_package_id=run.context_package_id,
            provider=run.provider,
            model=run.model,
            sanitized_result=run.sanitized_result,
            proposed_action_ids=run.proposed_action_ids,
            token_usage=run.token_usage,
            estimated_cost=run.estimated_cost,
            error_category=run.error_category,
        )
