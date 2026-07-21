# Milestone 08: General Email Draft Agent

Status: Blocked

## Objective

Implement a company-aware General Email Draft Agent for authenticated SynTask employees.

The agent generates editable email drafts only.

It must not send email, access unauthorized records, guess recipient addresses, create sales sequences, schedule communication, or execute business mutations.

---

## Canonical References

Read and follow:

* `AGENTS.md`
* `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`
* `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`
* `docs/milestones/MILESTONE_07_READ_ONLY_PROJECT_AGENT.md`
* `docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md`
* Existing Milestone 6 and Milestone 7 agent implementation and tests

Do not duplicate or replace canonical documentation.

---

## Current Platform Status

* RAG and Memory foundation: Implemented; business-corpus production evaluation remains in progress.
* Shared Agent Platform: Completed in Milestone 6.
* Read-only Project Agent: Completed in Milestone 7.
* General Email Draft Agent: Blocked in Milestone 8 pending real-service and full-suite verification.
* Task Performance Insights Agent: In Progress in Milestone 9.

Search existing documentation for outdated milestone status tables and update them consistently.

Before Milestone 8 completion:

```text
Agent product planning: Complete
Agent architecture planning: Complete
Shared Agent Platform: Completed — Milestone 6
Project Agent: Completed — Milestone 7 read-only pilot
General Email Draft Agent: Blocked — Milestone 8 pending real-service and full-suite verification
Task Performance Insights Agent: In Progress — Milestone 9
```

After Milestone 8 acceptance:

```text
General Email Draft Agent: Completed — Milestone 8
```

---

## Existing Foundation

Reuse the existing Shared Agent Platform:

* `AgentDefinition`
* `SpecialistDefinition`
* `AgentRun`
* `AgentRunEvent`
* `ActionProposal`
* Agent Orchestrator
* `ContextPackageBuilder`
* Structured Memory
* RAG
* Working Memory
* `ProviderRouter`
* Code-controlled `ToolRegistry`
* Deny-by-default tool policy
* Output-schema validation
* One repair maximum
* Idempotency
* Budget controls
* Sanitized audit events
* Retention controls
* Feature-flagged agent APIs

Do not create a second agent runtime, provider abstraction, context builder, memory system, RAG implementation, audit system, or budget system.

---

## Scope

Implement:

* One versioned General Email Draft Agent.
* Strict request and output schemas.
* Authenticated employee access.
* Tenant-safe and record-safe context retrieval.
* Company-aware tone and template retrieval.
* Draft-only generation.
* Internal and external email warnings.
* Sensitive-data detection and warnings.
* Authorized record references.
* Existing AI/Agents UI integration.
* Editable subject and body.
* Copy and regenerate actions.
* Evaluation dataset.
* Backend, API, permission, security, integration, and frontend tests.
* Milestone documentation and completion evidence.

Suggested agent key:

```text
general_email_draft_agent
```

Suggested initial version:

```text
v1
```

---

## Explicit Exclusions

Do not implement:

* Email sending.
* SMTP.
* Gmail.
* Microsoft 365.
* Outlook.
* Exchange.
* Connector Gateway execution.
* Email delivery status.
* Automatic recipient lookup outside authorized records.
* Guessed recipient email addresses.
* Automatic CC or BCC.
* Automatic file attachment.
* Bulk email.
* Marketing campaigns.
* Sales outreach sequences.
* Automated follow-ups.
* Scheduled emails.
* Celery email jobs.
* Task Performance Insights Agent.
* Business mutation execution.
* Approval execution.
* Project Agent changes unrelated to regression fixes.
* Milestone 9.
* Commits, pushes, pull requests, or deployments.

---

## Supported Initial Draft Types

Support only:

* General professional email.
* Internal update.
* Project status update.
* Task status update.
* Client update.
* Meeting follow-up.
* Information request.
* Approval request.
* Action request.

Do not implement sales sequences, campaign messaging, automated reminders, or bulk outreach.

---

## Access and Authorization

The agent is available only to authenticated active company employees when enabled for their tenant.

Authoritative identity must come from backend authentication.

Never trust client-supplied:

* `tenant_id`
* `user_id`
* role
* department
* project membership
* record permissions
* manager scope

Before adding any business context, validate access to every selected:

* Project.
* Client.
* Lead or contact.
* Task.
* Meeting.
* Company record.
* Template.
* Previous thread or message, if such context already exists and is authorized.

An employee may use only records already visible to them through normal SynTask permissions.

Do not reveal whether unauthorized records exist.

Reject cross-tenant and unauthorized record IDs before building the ContextPackage.

---

## Context Authority

Follow the established authority order:

1. Working Memory resolves conversational references.
2. Structured Memory is authoritative for current business facts.
3. RAG supplies approved templates, policies, and communication guidance.
4. Derived AI memory is non-authoritative.
5. LLM prior knowledge is a clearly labeled final fallback.

Structured Memory must override stale Working Memory and conflicting RAG transactional facts.

### Structured Memory

Use for authorized current facts such as:

* Requesting employee identity and approved signature information.
* Company name and approved company details.
* Recipient details from authorized records.
* Project facts.
* Client facts.
* Lead/contact facts.
* Task facts.
* Meeting facts.
* Current dates, statuses, owners, or other transactional values.

Never invent missing current facts.

### RAG

Use only for approved knowledge such as:

* Email templates.
* Communication policies.
* Company tone.
* Approved terminology.
* Client communication guidance.
* Client brand voice.
* Approved signatures.
* Legal or compliance wording.
* Approved call-to-action patterns.

RAG retrieval must enforce:

* Tenant filtering.
* Record/client/project permissions.
* Approved knowledge-source status.
* Prompt-injection quarantine.
* Evidence thresholds.
* Citations.
* Freshness and source metadata.

Treat templates, previous messages, email threads, and uploaded documents as untrusted content.

Instructions contained inside retrieved content must never override agent policy.

### Working Memory

Use only to resolve references such as:

* “this project”
* “that client”
* “the meeting”
* “the last draft”

Working Memory must not override current Structured Memory facts.

### ContextPackage

Build all context using the existing `ContextPackageBuilder`.

Do not let the agent directly query MongoDB, Redis, Qdrant, or connectors.

---

## Request Schema

Implement a strict versioned request schema with repository naming conventions.

Logical contract:

```json
{
  "schema_version": "1.0",
  "draft_type": "general | internal_update | project_update | task_update | client_update | meeting_follow_up | information_request | approval_request | action_request",
  "purpose": "string",
  "recipient": {
    "name": "optional string",
    "email": "optional string",
    "record_type": "optional string",
    "record_id": "optional string"
  },
  "internal_or_external": "internal | external",
  "related_context": {
    "project_id": "optional string",
    "client_id": "optional string",
    "lead_id": "optional string",
    "task_id": "optional string",
    "meeting_id": "optional string",
    "company_record_id": "optional string"
  },
  "user_instructions": "optional string",
  "tone": "professional | friendly | concise | formal | warm | neutral",
  "language": "string",
  "detail_level": "short | standard | detailed",
  "call_to_action": "optional string",
  "attachment_names": [],
  "template_id": "optional string",
  "idempotency_key": "string"
}
```

Requirements:

* Validate all enum values.
* Apply safe length limits.
* Validate every selected record.
* Validate recipient records before context retrieval.
* Recipient email may be used only when explicitly supplied by the user or retrieved from an authorized record.
* Do not infer or construct recipient addresses.
* Attachment names are mention-only.
* Reject raw system prompts.
* Reject tool definitions.
* Reject provider selection overrides.
* Reject tenant and identity overrides.
* Reject arbitrary retrieval filters.
* Reject arbitrary policy or template prompt text.
* Personalization may change presentation only.
* Personalization must not change facts, permissions, evidence, warnings, risk, or policy.

---

## Recipient Rules

The agent must never guess a recipient email address.

Allowed recipient behavior:

1. User explicitly supplies a recipient email.
2. User selects an authorized record that already contains a recipient email.
3. User supplies only a name and asks for a draft without an address.

When no verified email exists:

* Generate the email content when otherwise safe.
* Return recipient email as `null`.
* Add a missing-recipient warning.
* Do not fabricate an address.

Never:

* Infer addresses from company domains.
* Construct common patterns such as `firstname.lastname@company.com`.
* Search external sources.
* Add hidden recipients.
* Add CC/BCC automatically.
* replace a user-provided recipient silently.

---

## Output Schema

Implement a strict versioned Email Draft Agent output schema.

Logical contract:

```json
{
  "schema_version": "1.0",
  "agent": {
    "key": "general_email_draft_agent",
    "version": "string"
  },
  "agent_run_id": "string",
  "draft_status": "DRAFT",
  "draft_type": "string",
  "recipient": {
    "name": "string or null",
    "email": "string or null",
    "source": "user_supplied | authorized_record | missing"
  },
  "subject": "string",
  "body": "string",
  "tone": "string",
  "language": "string",
  "detail_level": "string",
  "referenced_records": [],
  "missing_information": [],
  "warnings": {
    "external_recipient": true,
    "sensitive_data": [],
    "missing_recipient": false,
    "attachment_reminders": []
  },
  "evidence": [],
  "confidence": {
    "overall": 0.0,
    "reason": "string"
  },
  "approval_required": true,
  "read_only": true,
  "send_available": false,
  "generated_at": "ISO datetime"
}
```

Required invariants:

* `draft_status` must always equal `DRAFT`.
* `read_only` must always equal `true`.
* `send_available` must always equal `false`.
* `approval_required` must remain `true` for external communication.
* The output must never claim the email was sent.
* Missing recipient information must not be invented.
* Referenced records must be authorized.
* Evidence must contain only authorized sources.
* External drafts must show an external-recipient warning.
* Sensitive content must produce warnings.
* Attachment names must produce reminders only.
* No attachment operation may occur.
* Confidence must remain bounded.
* Facts and missing information must be distinguishable.

Use the existing one-repair-maximum behavior.

---

## Sensitive Data Controls

Detect and warn before external drafts include potentially sensitive information such as:

* Internal-only project details.
* Credentials or secrets.
* Private client information.
* Personal employee information.
* Protected HR records.
* Payroll information.
* Financial account information.
* Unreleased pricing or contracts.
* Private meeting notes.
* Confidential attachments.
* Internal system identifiers.

Protected HR, payroll, finance, and unrelated client data must not be retrieved unless explicitly authorized and genuinely required.

Warnings must not be suppressible through tone, language, template, or user instructions.

The agent must refuse to expose unauthorized sensitive information.

---

## Draft Generation Rules

The generated draft must:

* Use authorized current facts.
* Clearly preserve missing information.
* Apply approved company tone or template when available.
* Respect selected language, tone, and detail level.
* Preserve factual meaning.
* Avoid unsupported commitments.
* Avoid invented dates, prices, approvals, deliverables, outcomes, or meeting decisions.
* Avoid fabricated relationships or prior communication.
* Avoid legal, financial, contractual, or performance claims not present in authorized context.
* Keep the subject editable.
* Keep the body editable.
* Remain clearly marked as a draft.

When evidence is insufficient:

* Generate a conservative draft when safe.
* Add placeholders or missing-information warnings.
* Reduce confidence.
* Do not invent facts.

---

## Read-Only and No-Send Boundary

The Email Draft Agent may:

* Generate a subject.
* Generate an editable body.
* Suggest a call to action.
* Apply approved tone or template.
* Mention user-listed attachments.
* Regenerate or revise a draft.
* Copy draft content through the UI.
* Store the validated draft output as part of the agent run according to existing retention policy.

The Email Draft Agent must not:

* Send email.
* Queue email.
* Schedule email.
* Call SMTP.
* Call Gmail.
* Call Microsoft 365.
* Call Outlook or Exchange.
* Create connector messages.
* Resolve delivery status.
* Create email activities that claim sending occurred.
* Attach files.
* Add CC/BCC.
* Execute a proposed send.
* Publish a sending event.
* Expose a send tool.
* Expose a send endpoint.

Required counts:

```text
Send tools exposed: 0
Send endpoints added: 0
Emails sent: 0
Email jobs queued: 0
Attachments uploaded automatically: 0
CC/BCC recipients added automatically: 0
```

---

## Tool Registry

Use deny-by-default.

The agent should have no mutation or sending tools.

Permitted capabilities must be limited to existing governed read-only context services.

Do not register:

* SMTP handlers.
* Gmail handlers.
* Microsoft 365 handlers.
* Connector handlers.
* Attachment handlers.
* Scheduling handlers.
* Email activity mutation handlers.
* Arbitrary HTTP tools.

Add tests proving send and mutation tools are unavailable.

---

## Agent API Scope

Extend the existing feature-flagged agent API using repository conventions.

Logical operations:

* Create Email Draft Agent run.
* Read an authorized Email Draft Agent run.
* List the requesting employee’s authorized Email Draft Agent runs when consistent with current agent history design.
* Regenerate by creating a new idempotent run or approved repository pattern.

Suggested logical endpoint:

```text
POST /api/v1/agents/email-draft/runs
```

Use the repository’s actual routing conventions after inspection.

Requirements:

* Authenticate user.
* Resolve tenant from authentication.
* Validate all selected context.
* Build ContextPackage after authorization.
* Route through existing Agent Orchestrator.
* Call providers only through ProviderRouter.
* Validate output.
* Persist sanitized run and audit events.
* Apply idempotency.
* Apply budget controls.
* Return safe output.

Do not add:

* `/send`
* `/schedule`
* `/approve-and-send`
* `/execute`
* connector endpoints
* attachment upload endpoints under the agent

Do not expose raw prompts, secrets, complete ContextPackages, or unrestricted provider payloads.

---

## UI Scope

Inspect the existing AI/Agents page and SynTask design system.

Integrate the Email Draft Agent into the existing AI/Agents experience.

Do not create:

* A duplicate AI Hub.
* A disconnected standalone application.
* A separate email client.
* A connector management UI.
* A sending screen.

Provide:

* Email type selector.
* Recipient selector or manual recipient input.
* Internal/external selector.
* Authorized context selector.
* Purpose.
* Additional instructions.
* Tone selector.
* Language selector.
* Length/detail selector.
* Call-to-action input.
* Attachment-name reminders.
* Template selector when authorized templates exist.
* Generate Draft action.
* Editable subject.
* Editable body.
* Warning area.
* Evidence/source area.
* Copy Draft action.
* Regenerate action.
* Draft history when consistent with existing agent history UI.

Do not add a Send button.

Display prominently:

```text
Draft only. This email has not been sent.
```

For external drafts, also show:

```text
External recipient: Review facts, sensitive information, recipients and attachments before sending outside SynTask.
```

Match existing SynTask:

* Colors.
* Typography.
* Spacing.
* Cards.
* Inputs.
* Buttons.
* Responsive behavior.
* Loading patterns.
* Empty states.
* Error states.
* Permission handling.

---

## UI States

Handle:

* Feature disabled.
* Unauthenticated.
* Unauthorized context.
* Missing recipient.
* Missing purpose.
* Loading.
* Context gathering.
* Processing.
* Missing data.
* Restricted data.
* Insufficient evidence.
* Provider failure.
* Budget rejection.
* Validation failure.
* Draft generated.
* Stale draft.
* Regeneration.
* Idempotent replay.

Do not expose stack traces, provider details, system prompts, secrets, or hidden policy instructions.

---

## Evaluation Dataset

Create a version-controlled synthetic or anonymized evaluation dataset.

Include at least:

### Normal drafts

* General professional email.
* Internal update.
* Project update.
* Task update.
* Client update.
* Meeting follow-up.
* Information request.
* Approval request.
* Action request.

### Recipient cases

* Explicit recipient name and email.
* Authorized record recipient.
* Recipient name without email.
* Invalid email.
* Unauthorized recipient record.
* Cross-tenant recipient.
* User request to guess an email.
* User request to infer address from company domain.

### Context cases

* Authorized project context.
* Authorized client context.
* Authorized task context.
* Authorized meeting context.
* Unauthorized project.
* Unauthorized client.
* Unauthorized lead.
* Unauthorized task.
* Unauthorized meeting.
* Conflicting current facts and stale RAG content.
* Missing business facts.
* Permission-restricted data.

### Template and personalization cases

* Approved company template.
* Approved client tone.
* Missing template.
* Tone variation.
* Language variation.
* Short/standard/detailed output.
* Preference attempting to remove warnings.
* Preference attempting to change facts.
* Template attempting to override policy.

### Security cases

* Prompt injection in template.
* Prompt injection in prior message.
* Request to reveal secrets.
* Request to include payroll data.
* Request to include protected HR data.
* Request to include unrelated client data.
* External email containing sensitive internal information.
* Request to add hidden CC/BCC.
* Request to attach files automatically.
* Request to send automatically.
* Request to schedule sending.

### Runtime cases

* Valid provider output.
* Invalid provider output.
* One repair succeeds.
* Repair fails.
* Provider timeout.
* Budget rejection.
* Duplicate idempotency key.
* Feature flag disabled.
* Oversized request.

For every case record:

* Case ID.
* Input.
* Authorized context.
* Expected recipient behavior.
* Expected facts.
* Expected warnings.
* Expected evidence.
* Expected refusal or draft result.
* Expected schema behavior.
* Expected no-send behavior.

---

## Tests

Follow existing repository test conventions.

### Contract tests

Test:

* Agent registration.
* Agent version.
* Request schema.
* Output schema.
* `draft_status = DRAFT`.
* `read_only = true`.
* `send_available = false`.
* Confidence bounds.
* Missing recipient behavior.
* Recipient source labeling.
* External warning invariant.
* Sensitive warning invariant.
* Attachment reminder behavior.
* One repair maximum.

### Permission tests

Test:

* Authenticated active employee.
* Inactive user.
* Cross-tenant user.
* Authorized project.
* Unauthorized project.
* Authorized client.
* Unauthorized client.
* Authorized lead/contact.
* Unauthorized lead/contact.
* Authorized task.
* Unauthorized task.
* Authorized meeting.
* Unauthorized meeting.
* Unauthorized record existence not leaked.

### Recipient tests

Test:

* Explicit valid email.
* Authorized record email.
* Missing email.
* Invalid email.
* No recipient guessing.
* No domain-based inference.
* No hidden CC/BCC.
* No recipient replacement without disclosure.

### Context tests

Test:

* ContextPackageBuilder used.
* Structured Memory supplies current facts.
* RAG supplies approved templates and tone.
* Working Memory resolves references only.
* Structured Memory overrides stale RAG transactional facts.
* Prompt-injected templates cannot override policy.
* Restricted context omitted.
* No direct MongoDB, Redis, Qdrant, or connector access.

### Security tests

Test:

* Cross-tenant isolation.
* Unauthorized context rejection.
* Protected HR exclusion.
* Payroll exclusion.
* Finance information restriction.
* Sensitive external warning.
* Secret masking.
* Raw prompt not persisted by default.
* Complete ContextPackage not persisted by default.
* No send tools.
* No send endpoints.
* No sending events.
* No scheduling behavior.
* No automatic attachment behavior.

### API tests

Test:

* Create draft run.
* Read authorized run.
* List authorized runs when implemented.
* Invalid request.
* Missing recipient.
* Unauthorized context.
* Cross-tenant context.
* Provider failure.
* Validation failure.
* Idempotent replay.
* Budget rejection.
* Feature disabled.
* Safe serialization.
* No send endpoint exists.

### Audit tests

Test:

* Agent key and version.
* Requesting identity.
* Tenant.
* Authorized context references.
* Provider/model metadata.
* Schema version.
* Warnings.
* Budget usage.
* Idempotency.
* Sanitized output.
* No secret or full raw-context persistence.

### Integration tests

Use real services where supported:

* MongoDB for runs and audit persistence.
* Redis for Working Memory when involved.
* Qdrant for approved template/policy retrieval.
* Existing RAG permission filters.

Verify:

* Tenant-safe retrieval.
* Authorized template retrieval.
* Real idempotency behavior.
* Real run persistence.
* No send or mutation execution.

### Frontend tests

Test:

* Agent appears in existing AI/Agents UI.
* Feature flag.
* Authentication/permission behavior.
* Form validation.
* Recipient behavior.
* Draft rendering.
* Editable subject.
* Editable body.
* External warning.
* Sensitive warning.
* Attachment reminder.
* Copy action.
* Regenerate action.
* No Send button.
* Failure states.
* Responsive behavior where current tests support it.

### Regression tests

Run:

* Milestone 8 tests.
* Milestone 7 Project Agent tests.
* Milestone 6 shared agent tests.
* Relevant auth and permission tests.
* RAG non-integration tests.
* Real MongoDB/Redis/Qdrant tests.
* Relevant frontend tests.
* Full backend suite.
* Relevant full frontend suite.
* Compile/type/lint checks.

Do not hide failures using broad skips, deleted tests, weakened assertions, or unjustified `xfail`.

---

## Acceptance Criteria

Milestone 8 passes only when:

### Architecture

* General Email Draft Agent uses the existing shared agent runtime.
* ContextPackageBuilder is used.
* ProviderRouter is used.
* No second runtime or provider client exists.
* Agent code has no direct MongoDB, Redis, Qdrant, SMTP, Gmail, or Microsoft 365 access.

### Access

* Authenticated active employees can use the agent when enabled.
* Tenant isolation is enforced.
* Record-level permissions are enforced.
* Unauthorized context exposure equals zero.
* Cross-tenant leakage equals zero.

### Recipient safety

* Guessed recipient addresses equal zero.
* Domain-based inferred addresses equal zero.
* Hidden recipients added equal zero.
* Missing recipient emails remain missing.
* Recipient source is explicit.

### Draft boundary

* Every output is marked `DRAFT`.
* Every output has `send_available = false`.
* Automatic sends equal zero.
* Send endpoints equal zero.
* Send tools equal zero.
* Queued email jobs equal zero.
* Automatic attachments equal zero.
* The UI has no Send button.

### Context and quality

* Structured Memory provides current facts.
* RAG provides approved templates and tone.
* Working Memory cannot override current facts.
* Prompt-injected templates cannot override policy.
* Missing information is disclosed.
* External drafts always show warnings.
* Sensitive external content produces warnings.
* Output schema validation passes.
* One repair maximum remains enforced.

### UI

* Email Draft Agent is integrated into the existing AI/Agents experience.
* Subject and body are editable.
* Copy and regenerate actions work.
* Warnings are visible.
* No duplicate AI Hub is created.
* Existing Project Agent remains functional.

### Verification

* Targeted Milestone 8 tests pass.
* Milestone 6 and 7 regressions pass.
* Real-service tests continue passing where applicable.
* Full-suite results are reported honestly.
* Remaining failures are individually classified when relevant.
* RAG business-corpus production evaluation is not overstated.
* No Milestone 9 functionality is introduced.

---

## Implementation Progress

* [x] Repository and documentation preflight completed.
* [x] Outdated milestone/status displays updated.
* [x] Email Draft Agent definition implemented.
* [x] Request schema implemented.
* [x] Output schema implemented.
* [x] Recipient safety rules implemented.
* [x] Permission and selected-record validation implemented.
* [x] Email Draft ContextPackage profile implemented.
* [x] Structured Memory context implemented.
* [x] RAG template/tone retrieval implemented.
* [x] Working Memory reference resolution implemented.
* [x] Draft-only Orchestrator path implemented.
* [x] Email Draft API implemented.
* [x] Run retrieval/history implemented where applicable.
* [x] No-send ToolRegistry proof completed.
* [x] Security and permission tests passing.
* [x] Existing AI/Agents UI entry implemented.
* [x] Draft request form implemented.
* [x] Editable subject/body implemented.
* [x] External and sensitive warnings implemented.
* [x] Copy action implemented.
* [x] Regenerate action implemented.
* [x] Frontend tests passing.
* [x] Evaluation dataset implemented.
* [x] Evaluation validation tests passing.
* [ ] Real-service integration tests passing.
* [x] Milestone 6 and 7 regression tests passing.
* [ ] Full backend/frontend verification completed.
* [x] No-send count proof completed.
* [x] Documentation synchronized.
* [ ] Final completion report recorded.
* [ ] Milestone status changed to Completed.

---

## Completion Evidence

### Stage 1: Repository And Documentation Preflight

Completed on 2026-07-21.

Files reviewed:

* `AGENTS.md`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`
* `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`
* `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`
* `docs/milestones/MILESTONE_07_READ_ONLY_PROJECT_AGENT.md`
* `docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md`

Findings:

* Next incomplete Milestone 8 item was repository and documentation preflight.
* Milestone 8 scope remains draft-only General Email Draft Agent.
* No send, SMTP, Gmail, Microsoft 365, Outlook, Exchange, connector, scheduling, business mutation, Task Performance, or Milestone 9 work is allowed.
* Milestone 8 must use existing Shared Agent Platform, Agent Orchestrator, ContextPackageBuilder, Structured Memory, RAG, Working Memory, ProviderRouter, ToolRegistry, idempotency, budget, audit, and retention controls.
* Status search found milestone/status references in product, architecture, user-flow, Milestone 8, and Milestone 9 docs. Updating outdated milestone/status displays is the next checklist item and was not performed in this stage.
* Current worktree already contains uncommitted Milestone 7/Milestone 8-adjacent files from prior stages; none were reverted.

Commands:

* `Get-Content -Raw AGENTS.md`
* `Get-Content -Raw docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`
* `Get-Content -First 120 docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`
* `Select-String -Path docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md -Pattern "General Email Draft Agent|Milestone 8|Email Draft|send|SMTP|Gmail|Microsoft 365|Draft" -Context 2,4`
* `Select-String -Path docs/milestones/MILESTONE_07_READ_ONLY_PROJECT_AGENT.md -Pattern "Status:|Implementation Progress|Project Agent API|Project Agent UI|Evaluation dataset|Milestone 7 verification" -Context 0,2`
* `Select-String -Path docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md -Pattern "ContextPackage|Structured Memory|RAG|Working Memory|tenant|permission|agent" -Context 1,3`
* `rg -n "General Email Draft Agent|Milestone 8|Email Draft Agent|Project Agent:|Task Performance Insights Agent|Agent product planning|Agent architecture planning" docs README.md backend frontend -g "*.md" -g "*.jsx" -g "*.js"`
* `python -m pytest backend/tests/agents -q`

Tests:

* Agent regression tests: 18 passed, 5 skipped, 34 warnings.

Security evidence:

* No application code changed in this stage.
* No send endpoint, send tool, connector, scheduler, mutation executor, or Milestone 9 code added.

Remaining caveats:

* Outdated milestone/status displays remain the next incomplete item.
* No Milestone 8 agent definition, schema, API, UI, or evaluation dataset has been implemented yet.

### Stage 2: Email Draft Agent Contract, API, UI, Dataset, And Focused Verification

Completed on 2026-07-21.

Files:

* `backend/app/agents/email_draft.py`
* `backend/app/api/v1/endpoints/agents.py`
* `backend/app/core/config.py`
* `backend/tests/agents/test_email_draft_contract.py`
* `backend/tests/agents/test_email_draft_evaluation_dataset.py`
* `backend/tests/agents/test_agent_api_boundaries.py`
* `backend/tests/agents/evaluation/email_draft_eval_v1.json`
* `frontend/src/api/agents.js`
* `frontend/src/pages/AIHub.jsx`
* `docs/milestones/MILESTONE_09_TASK_PERFORMANCE_INSIGHTS_AGENT.md`

Behavior:

* Added versioned `general_email_draft_agent` definition with version `v1`.
* Added strict `EmailDraftAgentRequest` and `EmailDraftAgentOutput` schemas.
* Added draft invariants: `draft_status = DRAFT`, `read_only = true`, `send_available = false`.
* Added recipient source contract and missing-recipient invariant.
* Added sensitive-term detection contract for secrets, payroll, protected HR, financial accounts, confidential, and internal-only content.
* Added deny-by-default no-send tool policy. Email Draft Agent has no allowed tools and explicitly forbids send, SMTP, Gmail, Microsoft 365, Outlook, Exchange, connector, scheduling, attachment, CC/BCC, activity mutation, and sales sequence tools.
* Added feature-gated `POST /api/v1/agents/email-draft/runs`.
* Added `EMAIL_DRAFT_AGENT_ENABLED` flag.
* Added selected-context validation for project, task, client, lead, meeting, company record, user recipient, sales lead recipient, sales contact recipient, and client recipient before orchestrator handoff.
* Added Email Draft Agent entry to existing AI Hub with draft type, recipient, internal/external, purpose, instructions, tone, detail, call-to-action, attachment-name reminder, Generate Draft, editable subject/body, Copy Draft, and Regenerate.
* No Send button, send endpoint, send tool, connector, scheduler, CC/BCC, auto-attachment, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment was added.
* Updated Milestone 9 status display so it no longer claims Milestone 8 is complete before acceptance.
* Added synthetic evaluation dataset with 18 cases across normal drafts, recipient behavior, recipient security, context permissions, authority conflicts, template prompt injection, personalization security, sensitive data, hidden BCC, auto-send rejection, idempotency, and feature flag behavior.

Commands:

* `python -m pytest backend/tests/agents/test_email_draft_contract.py backend/tests/agents/test_agent_api_boundaries.py -q`
* `python -m pytest backend/tests/agents/test_email_draft_contract.py backend/tests/agents/test_email_draft_evaluation_dataset.py backend/tests/agents/test_agent_api_boundaries.py -q`
* `python -m compileall backend/app/agents backend/app/api/v1/endpoints/agents.py backend/tests/agents`
* `cd frontend; npx.cmd eslint src/pages/AIHub.jsx src/api/agents.js --max-warnings 0`
* `python -m pytest backend/tests/agents -q`
* `npm.cmd -C frontend run build`
* `npm.cmd -C frontend run lint`
* `python -m pytest backend/tests -q`
* `rg -n "email-draft/(send|schedule|execute|approve)|send_email|smtp_send|gmail_send|microsoft_365_send|outlook_send|queue_email|schedule_email" backend/app backend/tests/agents frontend/src/pages/AIHub.jsx frontend/src/api/agents.js`

Results:

* Email Draft contract/API focused tests: 13 passed, 4 warnings.
* Email Draft contract/API/evaluation focused tests: 14 passed, 4 warnings.
* Compile check: passed.
* Targeted frontend lint for changed AI Hub/API files: passed.
* Agent regression tests: 27 passed, 5 skipped, 34 warnings.
* Frontend build: failed on existing CSS minifier issue: `Unexpected token Ident("tbody")`.
* Repo-wide frontend lint: failed on existing unrelated errors outside changed files.
* Full backend suite: 288 passed, 13 failed, 9 skipped, 49 warnings.

Security evidence:

* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.
* Email jobs queued by Email Draft Agent: 0.
* Connector calls added: 0.
* Automatic attachments added: 0.
* CC/BCC automation added: 0.
* `POST /api/v1/agents/email-draft/send` returns 404 in API boundary test.

Remaining caveats:

* Milestone 8 cannot be marked complete while full backend and frontend verification fail.
* Real-service integration and full-suite verification remain before release acceptance.
* External warning is present in UI and output contract; sensitive warning is present in backend contract but not yet fully wired into provider/orchestrator output and UI warning rendering.

### Stage 3: Email Draft ContextPackage Profile

Completed on 2026-07-21.

Files:

* `backend/app/rag/retrieval_profiles.py`
* `backend/app/rag/context_package.py`
* `backend/app/agents/orchestrator.py`
* `backend/tests/agents/test_email_draft_contract.py`
* `backend/tests/rag/test_context_package.py`

Behavior:

* Added `email_draft_templates` retrieval profile version `email-draft-templates-v1`.
* Profile is tenant-scoped and allows draft-only email templates, communication policy, brand guidance, client communication guidance, and approved signatures.
* Profile forbids protected HR, payroll, finance, credentials, connector messages, and email delivery status.
* Profile requires draft-only, prompt-injection quarantine, and citation policies.
* `ContextPackageBuilder.build()` now accepts `retrieval_profile_id` and passes it to compatible retrieval services with working-memory context.
* `AgentOrchestrator` now passes each agent definition's retrieval profile into `ContextPackageBuilder`.
* Existing retrieval service fakes without profile support remain compatible.
* No email send, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `python -m compileall backend/app/rag/context_package.py backend/app/rag/retrieval_profiles.py backend/app/agents/orchestrator.py backend/app/agents/email_draft.py`
* `python -m pytest backend/tests/agents/test_email_draft_contract.py backend/tests/rag/test_context_package.py -q`

Results:

* Compile check: passed.
* Focused ContextPackage/profile tests: 15 passed.

Security evidence:

* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.
* Connector calls added: 0.
* Automatic attachments added: 0.
* CC/BCC automation added: 0.
* Retrieval profile excludes protected HR, payroll, finance, credential, connector-message, and delivery-status source types.

Remaining caveats:

* This stage implements the profile and orchestration handoff only.
* Real Qdrant email-template corpus verification, Working Memory reference resolution, and email-specific output validation remain incomplete.

### Stage 4: Email Draft Structured Memory Context

Completed on 2026-07-21.

Files:

* `backend/app/rag/context_package.py`
* `backend/app/agents/orchestrator.py`
* `backend/tests/agents/test_email_draft_contract.py`
* `backend/tests/rag/test_context_package.py`

Behavior:

* `ContextPackageBuilder` now loads Structured Memory for `email_draft_templates` profile even when the query routes to RAG policy/template retrieval.
* Email Draft structured context always includes current authenticated user and tenant scope.
* Selected authorized context IDs are converted into explicit Structured Memory reads for project, task, client, lead, meeting, company record, and recipient records.
* Orchestrator derives selected context IDs from validated `input_payload.related_context` and `input_payload.recipient.record_type/record_id`.
* Client-supplied `tenant_id` and `user_id` are ignored for structured context selection.
* Existing non-email ContextPackage behavior remains compatible.
* No email sending, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `python -m compileall backend/app/rag/context_package.py backend/app/agents/orchestrator.py backend/tests/agents/test_email_draft_contract.py backend/tests/rag/test_context_package.py`
* `python -m pytest backend/tests/agents/test_email_draft_contract.py backend/tests/rag/test_context_package.py backend/tests/rag/test_structured_memory.py -q`

Results:

* Compile check: passed.
* Focused Structured Memory/ContextPackage tests: 23 passed.

Security evidence:

* Tenant and user identity still come from authenticated server scope.
* Structured Memory service remains permission-gated per record.
* Client-supplied tenant/user override fields are not used for context selection.
* Unauthorized or missing Structured Memory reads are recorded as missing/errors, not exposed as raw records.
* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.

Remaining caveats:

* This stage wires explicit structured context reads, but does not verify real MongoDB service integration in this turn.
* Real-service integration and full-suite verification remain incomplete.

### Stage 5: Email Draft RAG Template And Tone Retrieval

Completed on 2026-07-21.

Files:

* `backend/app/rag/models.py`
* `backend/app/rag/qdrant_store.py`
* `backend/app/rag/hybrid_retrieval.py`
* `backend/app/worker/tasks/rag_tasks.py`
* `backend/tests/rag/test_milestone4_retrieval.py`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`

Behavior:

* Added approved email knowledge source types: `email_template`, `communication_policy`, `brand_guideline`, `client_communication_guidance`, and `approved_signature`.
* RAG indexing now writes `source_type` into Qdrant payloads.
* Qdrant store now indexes `source_type` and supports list filters through `MatchAny`.
* Hybrid retrieval now applies profile `allowed_source_types` to Qdrant filters.
* Citation assembly now rejects profile-forbidden source types and non-allowed source types even if a bad payload appears in results.
* Email Draft retrieval profile remains tenant-scoped and limited to approved email templates, tone guidance, approved terminology, client communication guidance, and signatures.
* No email sending, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `python -m compileall backend/app/rag/hybrid_retrieval.py backend/app/rag/qdrant_store.py backend/app/rag/models.py backend/app/worker/tasks/rag_tasks.py backend/tests/rag/test_milestone4_retrieval.py`
* `python -m pytest backend/tests/rag/test_milestone4_retrieval.py backend/tests/rag/test_context_package.py backend/tests/agents/test_email_draft_contract.py -q`
* `python -m pytest backend/tests/rag/test_retrieval_tenant_isolation.py backend/tests/rag/test_milestone4_retrieval.py -q`

Results:

* Compile check: passed.
* Focused RAG/profile/context tests: 26 passed, 1 warning.
* RAG tenant/filter tests: 12 passed, 1 warning.

Security evidence:

* Qdrant retrieval filters include `source_type` for profile-bound retrieval.
* Citation guard drops forbidden source types such as payroll before model context.
* Tenant/company/approval/deleted/status filters remain in force.
* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.

Remaining caveats:

* Real Qdrant email-template corpus retrieval was not run this turn.
* Existing manually uploaded RAG sources must be classified with email-specific `source_type` values before this profile can retrieve them.
* Real-service integration and full-suite verification remain incomplete.

### Stage 8: External And Sensitive Warnings

Completed on 2026-07-21.

Files:

* `backend/app/agents/orchestrator.py`
* `backend/tests/agents/test_email_draft_contract.py`
* `frontend/src/pages/AIHub.jsx`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`

Behavior:

* Orchestrator now forces `warnings.external_recipient = true` for external Email Draft Agent requests before schema validation.
* Orchestrator now detects sensitive terms across request purpose, user instructions, call-to-action, generated subject, and generated body.
* Sensitive warning labels are merged with provider warnings and cannot be suppressed by provider output.
* Attachment names now become warning reminders only; no upload or attachment operation occurs.
* Missing recipient warning is forced when validated draft output has no recipient email.
* AI Hub now renders backend sensitive-data warnings, missing-recipient warnings, and attachment reminders.
* No email sending, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `python -m compileall backend/app/agents/orchestrator.py backend/tests/agents/test_email_draft_contract.py`
* `python -m pytest backend/tests/agents/test_email_draft_contract.py backend/tests/agents/test_agent_api_boundaries.py -q`
* `cd frontend; npx.cmd eslint src/pages/AIHub.jsx --max-warnings 0`

Results:

* Compile check: passed.
* Focused Email Draft contract/API tests: 19 passed, 4 warnings.
* Targeted AI Hub lint: passed.

Security evidence:

* External warnings are server-enforced from request audience.
* Sensitive warnings are server-enforced from request and generated draft text.
* Attachment handling remains reminder-only.
* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.
* Connector calls added: 0.

Remaining caveats:

* Real provider and real-service integration not run this turn.
* Full backend/frontend verification remains incomplete.

### Stage 7: Draft-Only Orchestrator Path

Completed on 2026-07-21.

Files:

* `backend/app/agents/orchestrator.py`
* `backend/tests/agents/test_email_draft_contract.py`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`

Behavior:

* Orchestrator now selects `EmailDraftAgentOutput` when agent definition uses `email-draft-output-v1`.
* Provider output is validated through the selected schema before persistence.
* Email Draft output invariants are enforced in Orchestrator validation: `DRAFT`, `read_only = true`, `send_available = false`, no sent/queued/scheduled claims, bounded confidence, missing-recipient warning.
* Draft-only definitions cannot create proposed actions.
* Generic agent output behavior remains unchanged for non-email agents.
* No email sending, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `python -m compileall backend/app/agents/orchestrator.py backend/app/agents/email_draft.py backend/tests/agents/test_email_draft_contract.py`
* `python -m pytest backend/tests/agents/test_email_draft_contract.py backend/tests/agents/test_agent_api_boundaries.py backend/tests/rag/test_context_package.py -q`

Results:

* Compile check: passed.
* Focused Email Draft Orchestrator/API/ContextPackage tests: 31 passed, 4 warnings.

Security evidence:

* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.
* Draft-only proposed actions are blocked before proposal creation.
* Raw prompts and raw context remain stripped by existing sanitization.

Remaining caveats:

* Provider repair behavior for invalid Email Draft output was not exercised against real provider in this turn.
* External and sensitive warning rendering remains incomplete.

### Stage 6: Email Draft Working Memory Reference Resolution

Completed on 2026-07-21.

Files:

* `backend/app/rag/context_package.py`
* `backend/tests/rag/test_context_package.py`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`

Behavior:

* Email Draft ContextPackage path now resolves Working Memory references for `this project`, `this task`, `this client`, `this lead`, `this company`, `this meeting`, selected recipient/contact/client/lead/user, and `last draft`/`previous draft`.
* Resolved references are recorded in `resolved_reference_bindings`.
* Resolved project/task/client/lead/company/meeting/recipient IDs feed Structured Memory reads.
* Explicit server-validated `structured_context_ids` continue to override Working Memory references for Structured Memory selection.
* Working Memory does not override Structured Memory facts; it only resolves IDs and draft references.
* No email sending, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `python -m compileall backend/app/rag/context_package.py backend/tests/rag/test_context_package.py`
* `python -m pytest backend/tests/rag/test_context_package.py backend/tests/rag/test_working_memory.py backend/tests/agents/test_email_draft_contract.py -q`

Results:

* Compile check: passed.
* Focused Working Memory/ContextPackage tests: 28 passed.

Security evidence:

* Working Memory references bind only sanitized IDs already present in tenant/user-scoped session memory.
* `last draft` binds only prior `general_email_draft_agent` run ID from scoped Working Memory.
* Explicit validated context IDs override conversational references before Structured Memory reads.
* Send endpoints added: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.

Remaining caveats:

* Real Redis Working Memory integration was not run this turn.
* Email-specific output validation remains incomplete.

### Stage 9: Real-Service And Full Verification Attempt

Attempted on 2026-07-21.

Status: Blocked.

Files:

* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`

Behavior:

* No application code was changed in this stage.
* Docker was checked inside and outside the sandbox.
* MongoDB, Redis, and Qdrant localhost ports were checked.
* Real MongoDB, Redis, and Qdrant integration tests were executed with integration flags enabled.
* Focused Milestone 8, Milestone 7, Milestone 6, RAG, and Working Memory tests were rerun.
* Full backend suite, frontend build, frontend lint, and no-send scan were rerun.
* Milestone status changed to `Blocked`; not `Complete`.
* No email sending, connector, scheduling, attachment, CC/BCC, business mutation, Task Performance, Milestone 9, commit, push, pull request, or deployment work was added.

Commands:

* `docker ps --format "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"`
* `docker version`
* `Test-NetConnection localhost -Port 27017`
* `Test-NetConnection localhost -Port 6379`
* `Test-NetConnection localhost -Port 6333`
* `$env:RUN_MONGO_INTEGRATION='1'; $env:RUN_REDIS_INTEGRATION='1'; $env:RUN_QDRANT_INTEGRATION='1'; python -m pytest backend/tests/agents/integration/test_agent_platform_mongo.py backend/tests/rag/integration/test_structured_memory_mongo.py backend/tests/rag/integration/test_working_memory_redis.py backend/tests/rag/integration/test_qdrant_rag_flow.py -q`
* `python -m pytest backend/tests/agents backend/tests/rag/test_context_package.py backend/tests/rag/test_milestone4_retrieval.py backend/tests/rag/test_working_memory.py backend/tests/rag/test_structured_memory.py -q`
* `python -m pytest backend/tests -q`
* `npm.cmd -C frontend run build`
* `npm.cmd -C frontend run lint`
* `rg -n "email-draft/(send|schedule|execute|approve)|send_email|smtp_send|gmail_send|microsoft_365_send|outlook_send|queue_email|schedule_email|connector_send|attach_file|add_cc|add_bcc" backend/app backend/tests/agents frontend/src/pages/AIHub.jsx frontend/src/api/agents.js`

Results:

* Docker check: failed because Docker Desktop Linux engine pipe was missing.
* MongoDB port 27017: closed.
* Redis port 6379: closed.
* Qdrant port 6333: closed.
* Real-service integration tests: 3 failed, 6 errors because MongoDB, Redis, and Qdrant were unavailable or not configured.
* Focused Milestone 8/Milestone 7/Milestone 6/RAG/Working Memory tests: 70 passed, 5 skipped, 35 warnings.
* Full backend suite: 300 passed, 13 failed, 9 skipped, 50 warnings.
* Frontend build: failed on existing CSS minifier issue `Unexpected token Ident("tbody")`.
* Frontend lint: failed on existing unrelated lint errors outside the Email Draft Agent changes.

Security evidence:

* `POST /api/v1/agents/email-draft/send` exists only as a negative API boundary test and returns 404 in focused tests.
* Send endpoints added by Email Draft Agent: 0.
* Send tools allowed by Email Draft Agent: 0.
* Emails sent by Email Draft Agent: 0.
* Email jobs queued by Email Draft Agent: 0.
* Connector calls added by Email Draft Agent: 0.
* Automatic attachments added by Email Draft Agent: 0.
* CC/BCC automation added by Email Draft Agent: 0.
* No-send scan findings are restricted to forbidden-tool constants, negative tests, Project Agent forbidden-tool list, and existing non-Agent email infrastructure.

Blockers:

* Real-service gate is blocked because Docker daemon is unavailable and MongoDB, Redis, and Qdrant are not reachable on localhost.
* Full backend suite still has 13 failures outside the focused Milestone 8 path.
* Frontend build still fails on existing generated CSS minifier issue.
* Frontend repo-wide lint still fails on unrelated existing lint errors.

Recommended next step:

* Continue Milestone 8 remediation.

For every completed checklist item, record:

* Files.
* Behavior.
* Tests.
* Pass/fail/skip counts.
* Security evidence.
* Remaining caveats.

Do not mark an item complete without evidence.

---

## Required Completion Report

At completion, update this file and return:

### 1. Final Status

Use exactly one:

* PASS
* PARTIAL
* BLOCKED
* FAIL

### 2. Scope Implemented

List only implemented capabilities.

### 3. Explicitly Excluded Scope

Confirm that no sending, connector, scheduling, Task Performance, business mutation, Milestone 9, commit, push, pull request, or deployment work was performed.

### 4. Files Created

List exact paths.

### 5. Files Modified

List exact paths.

### 6. Agent Definition and Schemas

Report:

* Agent key.
* Version.
* Request schema.
* Output schema.
* Draft invariants.
* Recipient rules.

### 7. API Behavior

Report:

* Method.
* Path.
* Permission.
* Feature flag.
* Request/response schema.
* Draft-only behavior.

### 8. UI Behavior

Report:

* Entry point.
* Form controls.
* Editable fields.
* Warnings.
* Copy/regenerate behavior.
* Confirmation that no Send button exists.

### 9. Context and Evidence

Report:

* Structured Memory sources.
* RAG sources/profile.
* Working Memory usage.
* Authority conflict behavior.
* Permission filtering.
* Citation/evidence behavior.

### 10. Recipient Safety Evidence

Report counts for:

* Guessed recipient addresses.
* Inferred domain addresses.
* Hidden CC/BCC recipients.
* Unauthorized recipient disclosures.
* Missing recipient values incorrectly fabricated.

All counts must equal zero.

### 11. No-Send Proof

Report counts for:

* Emails sent.
* Send tools exposed.
* Send endpoints added.
* Email jobs queued.
* Connector calls.
* Automatic attachments.
* Sending events emitted.

All counts must equal zero.

### 12. Security Verification

Report:

* Tenant isolation.
* Unauthorized context rejection.
* Protected HR/payroll/finance exclusion.
* Prompt-injection tests.
* Sensitive external warnings.
* Secret masking.
* Raw prompt/context persistence behavior.
* Budget enforcement.
* Idempotency.
* One repair maximum.

### 13. Evaluation Dataset

Report:

* Path.
* Case count.
* Categories.
* Synthetic/anonymized status.

### 14. Test Results

Provide exact commands and:

* Passed.
* Failed.
* Skipped.
* Duration when available.

Include:

* Milestone 8 tests.
* Milestone 7 tests.
* Milestone 6 tests.
* Permission/auth tests.
* RAG tests.
* Real-service tests.
* Frontend tests.
* Full backend suite.
* Relevant frontend suite.
* Compile/type/lint checks.

### 15. Acceptance Matrix

Mark each acceptance criterion:

* PASS
* PARTIAL
* FAIL
* BLOCKED

Include evidence.

### 16. Status Table Updates

List all status displays/documents updated.

### 17. Remaining Risks and Blockers

Include:

* Existing full-suite failures.
* Incomplete RAG business-corpus production evaluation.
* Any Milestone 9 prerequisites.

### 18. Recommended Next Step

Recommend only:

* Continue Milestone 8 remediation.
* Begin Milestone 9 planning.
* Begin Milestone 9 implementation only after explicit authorization.
* Stop because a security or architecture blocker remains.

Do not begin Milestone 9.

### 19. Git and Deployment Confirmation

State:

* No commit was created.
* No push was performed.
* No pull request was opened.
* No deployment was performed.

---

## Final Restrictions

Do not:

* Send email.
* Add Gmail, Microsoft 365, SMTP, Outlook, or Exchange integration.
* Add scheduled emails.
* Add Celery email execution.
* Add Sales Outreach sequences.
* Guess recipients.
* Add CC/BCC.
* Attach files automatically.
* Expose sending tools.
* Add sending endpoints.
* Implement Task Performance Insights.
* Modify Project Agent behavior except verified regression fixes.
* Implement Milestone 9.
* Commit.
* Push.
* Open a pull request.
* Deploy.

Stop after Milestone 8 completion and verification.
