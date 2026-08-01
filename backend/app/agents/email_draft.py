from __future__ import annotations

import re
from datetime import datetime

from app.core.clock import aware_utc_now
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.agent import AgentDefinition


EMAIL_DRAFT_AGENT_ID = "general_email_draft_agent"
EMAIL_DRAFT_AGENT_VERSION = "v1"
EMAIL_DRAFT_INPUT_SCHEMA_VERSION = "email-draft-input-v1"
EMAIL_DRAFT_OUTPUT_SCHEMA_VERSION = "email-draft-output-v1"
EMAIL_DRAFT_RETRIEVAL_PROFILE_ID = "email_draft_templates"
EMAIL_DRAFT_RETRIEVAL_PROFILE_VERSION = "email-draft-templates-v1"
EMAIL_DRAFT_PROMPT_ID = "general_email_draft_agent"
EMAIL_DRAFT_PROMPT_VERSION = "general-email-draft-v1"
EMAIL_DRAFT_PROVIDER_POLICY_ID = "email-draft-read-only"
EMAIL_DRAFT_EVALUATION_SET_VERSION = "email-draft-eval-v1"

EMAIL_DRAFT_FORBIDDEN_TOOL_IDS = [
    "send_email",
    "smtp_send",
    "gmail_send",
    "microsoft_365_send",
    "outlook_send",
    "exchange_send",
    "queue_email",
    "schedule_email",
    "connector_send",
    "upload_attachment",
    "attach_file",
    "add_cc",
    "add_bcc",
    "create_activity",
    "create_sales_sequence",
]

SENSITIVE_TERMS = {
    "password": "secret",
    "api key": "secret",
    "token": "secret",
    "payroll": "payroll",
    "salary": "payroll",
    "bank account": "financial_account",
    "tax id": "financial_account",
    "protected hr": "protected_hr",
    "disciplinary": "protected_hr",
    "confidential": "confidential",
    "internal only": "internal_only",
}

POLICY_INJECTION_PATTERNS = (
    "ignore previous instructions",
    "ignore policy",
    "system prompt",
    "developer message",
    "tool definition",
    "provider override",
    "retrieval filter",
    "send automatically",
    "schedule sending",
    "add hidden cc",
    "add hidden bcc",
)


class EmailDraftType(str, Enum):
    GENERAL = "general"
    INTERNAL_UPDATE = "internal_update"
    PROJECT_UPDATE = "project_update"
    TASK_UPDATE = "task_update"
    CLIENT_UPDATE = "client_update"
    MEETING_FOLLOW_UP = "meeting_follow_up"
    INFORMATION_REQUEST = "information_request"
    APPROVAL_REQUEST = "approval_request"
    ACTION_REQUEST = "action_request"


class EmailAudience(str, Enum):
    INTERNAL = "internal"
    EXTERNAL = "external"


class EmailTone(str, Enum):
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    CONCISE = "concise"
    FORMAL = "formal"
    WARM = "warm"
    NEUTRAL = "neutral"


class EmailDetailLevel(str, Enum):
    SHORT = "short"
    STANDARD = "standard"
    DETAILED = "detailed"


class RecipientSource(str, Enum):
    USER_SUPPLIED = "user_supplied"
    AUTHORIZED_RECORD = "authorized_record"
    MISSING = "missing"


class EmailDraftRecipientRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[EmailStr] = None
    record_type: Optional[Literal["client", "lead", "contact", "user"]] = None
    record_id: Optional[str] = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_record_pair(self) -> "EmailDraftRecipientRequest":
        if bool(self.record_type) != bool(self.record_id):
            raise ValueError("recipient record_type and record_id must be supplied together")
        return self


class EmailDraftRelatedContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: Optional[str] = Field(default=None, max_length=128)
    client_id: Optional[str] = Field(default=None, max_length=128)
    lead_id: Optional[str] = Field(default=None, max_length=128)
    task_id: Optional[str] = Field(default=None, max_length=128)
    meeting_id: Optional[str] = Field(default=None, max_length=128)
    company_record_id: Optional[str] = Field(default=None, max_length=128)


class EmailDraftAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    draft_type: EmailDraftType
    purpose: str = Field(min_length=1, max_length=2000)
    recipient: EmailDraftRecipientRequest = Field(default_factory=EmailDraftRecipientRequest)
    internal_or_external: EmailAudience
    related_context: EmailDraftRelatedContext = Field(default_factory=EmailDraftRelatedContext)
    user_instructions: Optional[str] = Field(default=None, max_length=4000)
    tone: EmailTone = EmailTone.PROFESSIONAL
    language: str = Field(default="en", min_length=2, max_length=32)
    detail_level: EmailDetailLevel = EmailDetailLevel.STANDARD
    call_to_action: Optional[str] = Field(default=None, max_length=1000)
    attachment_names: list[str] = Field(default_factory=list, max_length=20)
    template_id: Optional[str] = Field(default=None, max_length=128)
    session_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    conversation_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    idempotency_key: str = Field(min_length=8, max_length=128)

    @field_validator("purpose", "user_instructions", "call_to_action")
    @classmethod
    def reject_policy_override_text(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        lowered = value.lower()
        if any(pattern in lowered for pattern in POLICY_INJECTION_PATTERNS):
            raise ValueError("Request contains unsupported policy override or sending instruction")
        return value

    @field_validator("attachment_names")
    @classmethod
    def reject_blank_attachment_names(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("attachment_names cannot contain blank values")
        return value


class EmailDraftAgentIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: Literal["general_email_draft_agent"] = EMAIL_DRAFT_AGENT_ID
    version: str = EMAIL_DRAFT_AGENT_VERSION


class EmailDraftRecipientOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    email: Optional[EmailStr] = None
    source: RecipientSource


class EmailDraftReferencedRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_type: str = Field(min_length=1, max_length=64)
    record_id: str = Field(min_length=1, max_length=128)
    permission_status: Literal["authorized"] = "authorized"


class EmailDraftEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: str = Field(min_length=1, max_length=64)
    source_id: str = Field(min_length=1, max_length=128)
    title: Optional[str] = Field(default=None, max_length=256)
    citation_id: Optional[str] = Field(default=None, max_length=128)


class EmailDraftWarnings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_recipient: bool = False
    sensitive_data: list[str] = Field(default_factory=list, max_length=20)
    missing_recipient: bool = False
    attachment_reminders: list[str] = Field(default_factory=list, max_length=20)


class EmailDraftConfidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall: float = Field(ge=0.0, le=1.0)
    reason: str = Field(min_length=1, max_length=1000)


class EmailDraftAgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    agent: EmailDraftAgentIdentity = Field(default_factory=EmailDraftAgentIdentity)
    agent_run_id: str = Field(min_length=1, max_length=128)
    draft_status: Literal["DRAFT"] = "DRAFT"
    draft_type: EmailDraftType
    recipient: EmailDraftRecipientOutput
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=12000)
    tone: EmailTone
    language: str = Field(min_length=2, max_length=32)
    detail_level: EmailDetailLevel
    referenced_records: list[EmailDraftReferencedRecord] = Field(default_factory=list, max_length=50)
    missing_information: list[str] = Field(default_factory=list, max_length=50)
    warnings: EmailDraftWarnings = Field(default_factory=EmailDraftWarnings)
    evidence: list[EmailDraftEvidence] = Field(default_factory=list, max_length=100)
    confidence: EmailDraftConfidence
    approval_required: bool = True
    read_only: Literal[True] = True
    send_available: Literal[False] = False
    generated_at: datetime = Field(default_factory=aware_utc_now)

    @model_validator(mode="after")
    def validate_draft_invariants(self) -> "EmailDraftAgentOutput":
        if self.recipient.source == RecipientSource.MISSING and self.recipient.email is not None:
            raise ValueError("Missing recipient cannot include an email")
        if self.recipient.email is None and not self.warnings.missing_recipient:
            raise ValueError("Missing recipient email requires warning")
        if self.draft_type and self.warnings.external_recipient and not self.approval_required:
            raise ValueError("External drafts require approval")
        sent_pattern = re.compile(r"\b(sent|delivered|queued|scheduled)\b", re.IGNORECASE)
        if sent_pattern.search(self.subject) or sent_pattern.search(self.body[:500]):
            raise ValueError("Draft output must not claim sending or scheduling occurred")
        return self


def detect_sensitive_terms(*values: str | None) -> list[str]:
    found: list[str] = []
    text = " ".join(value or "" for value in values).lower()
    for term, label in SENSITIVE_TERMS.items():
        if term in text and label not in found:
            found.append(label)
    return found


def email_draft_agent_definition(created_by: str = "system") -> AgentDefinition:
    now = aware_utc_now()
    return AgentDefinition.model_construct(
        agent_id=EMAIL_DRAFT_AGENT_ID,
        version=EMAIL_DRAFT_AGENT_VERSION,
        name="General Email Draft Agent",
        description="Company-aware draft-only email composition for authenticated employees.",
        department="communications",
        objective=(
            "Generate editable email drafts from authorized SynTask context, approved tone guidance, and explicit "
            "employee instructions without sending, scheduling, attaching files, or mutating business records."
        ),
        allowed_trigger_types=["manual"],
        allowed_roles=["super_admin", "admin", "manager", "lead", "employee"],
        required_scopes=["tenant_id"],
        required_structured_domains=["current_user", "company", "project", "task", "client", "meeting", "lead"],
        retrieval_profile_id=EMAIL_DRAFT_RETRIEVAL_PROFILE_ID,
        retrieval_profile_version=EMAIL_DRAFT_RETRIEVAL_PROFILE_VERSION,
        allowed_tool_ids=[],
        forbidden_tool_ids=EMAIL_DRAFT_FORBIDDEN_TOOL_IDS,
        input_schema_version=EMAIL_DRAFT_INPUT_SCHEMA_VERSION,
        output_schema_version=EMAIL_DRAFT_OUTPUT_SCHEMA_VERSION,
        prompt_id=EMAIL_DRAFT_PROMPT_ID,
        prompt_version=EMAIL_DRAFT_PROMPT_VERSION,
        provider_policy_id=EMAIL_DRAFT_PROVIDER_POLICY_ID,
        memory_policy={
            "working_memory": "resolve_references_only",
            "structured_memory": "authoritative_current_business_facts",
            "rag": "approved_templates_tone_and_policy_only",
        },
        personalization_policy={
            "allowed": ["tone", "language", "detail_level"],
            "forbidden": ["facts", "permissions", "warnings", "recipient_source", "send_policy"],
        },
        approval_policy={"draft_only": True, "send_available": False, "approval_required_for_external": True},
        budget_policy={"max_repair_attempts": 1, "max_tokens_per_run": 4000},
        timeout_seconds=30,
        maximum_retries=0,
        evaluation_set_version=EMAIL_DRAFT_EVALUATION_SET_VERSION,
        enabled=False,
        published=False,
        created_at=now,
        created_by=created_by,
        retired_at=None,
    )
