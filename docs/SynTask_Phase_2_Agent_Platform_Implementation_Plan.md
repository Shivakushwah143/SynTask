# SynTask Phase 2 Agent Platform Implementation Plan

Status: focused planning draft; do not implement agents yet
Date: 2026-07-20

Milestone 10 status note, 2026-07-23: Essential Department Specialist Packs are implemented as governed `SpecialistDefinition` profiles under the existing Project Agent and remain blocked from completion until API boundary, Milestone 6-9 regression, real-service, full-suite, human-review, cost, and latency gates pass. No autonomous subagents, direct specialist endpoints, connectors, scheduling, approval execution, or business mutations were added.

## Contract Lock Addendum For Milestone 6

Milestone 6 is approved for Shared Agent Platform Foundation only. It must implement versioned definitions, run persistence, state machine, orchestrator, code-controlled tool registry, ContextPackage integration, ProviderRouter integration, output-schema validation, one controlled repair attempt, proposed action contracts, approval proposal boundary, audit events, idempotency, concurrency protection, budgets, evaluation hooks and minimal secured API boundaries.

Milestone 6 must not implement Project Agent behavior, task-specific specialist behavior, Task Performance Insights Agent, General Email Draft Agent, connector integration, business mutation execution, scheduling or Milestone 7.

Contract locks:

- Published `AgentDefinition` versions are immutable; edits create new versions.
- Disabled or retired definitions cannot start runs.
- Definitions may narrow user permissions but never expand them.
- No arbitrary Python import path or executable code may be stored in definitions or tools.
- No production specialist agent is enabled in Milestone 6.
- Specialists cannot call specialists; only Orchestrator may select/invoke specialists.
- All tool handlers are registered in server-side code; data records may configure policy but cannot define executable imports.
- Tools are denied by default.
- Agent run creation requires server-validated idempotency key scoped by tenant, requesting identity, agent and key.
- Duplicate requests must return existing run, not call provider, create proposal, duplicate audit or charge usage again.
- Raw prompts, raw ContextPackages, secrets, protected HR records and complete retrieved documents are not persisted by default.

State machine locks:

```text
CREATED -> QUEUED -> GATHERING_CONTEXT -> PROCESSING -> VALIDATING -> COMPLETED
VALIDATING -> PROPOSED -> AWAITING_APPROVAL
GATHERING_CONTEXT -> BLOCKED_MISSING_DATA
BLOCKED_MISSING_DATA -> QUEUED
PROCESSING -> FAILED
VALIDATING -> REPAIRING
REPAIRING -> VALIDATING
REPAIRING -> FAILED
Any nonterminal -> CANCELLED
Any expired nonterminal -> EXPIRED
```

Future-only states `APPROVED`, `EXECUTING`, `EXECUTED` and `REJECTED` may be defined but must not be entered in Milestone 6.

Canonical Phase 2 AI agent user-story source remains missing from this repository: `SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`. The approval attachment references it but does not include the document content in this workspace, so no duplicate or invented canonical copy was created.

## 1. Repository Capability And Gap Assessment

Canonical sources used:

- `docs/SynTask_Phase_2_AI_Memory_and_RAG_Foundation_FRD.md`
- `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`
- `docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md`
- `docs/diagrams/architecture.md`
- `docs/user-flows/projects-tasks.md`
- `docs/user-flows/ai-productivity.md`
- Existing models for `Project`, `Task`, `Department`, `User`, `Client`, `SalesProspect`, `ContentCalendarItem`, `EODReport`, `TimeLog`, `TimesheetEntry`, `LeaveRequest`, and `Meeting`

Missing canonical source:

- `SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md` is referenced by the RAG FRD but is not present in this workspace. This plan preserves its named Phase 2 intent where visible in existing docs and avoids creating a duplicate file.

Current capability:

- Central RAG, Structured Memory, Working Memory, Memory Router, Provider Router, governance, feedback, and retrieval evaluation foundations exist or are planned in the RAG foundation.
- Existing project/task domain models support project scope, task hierarchy, priorities, dependencies, owners, dates, progress, time logs, comments, EOD reports, departments, role hierarchy, and client linkage.
- Existing AI chat, AI hub, prioritization, and creative review flows must remain intact.

Gaps before agent implementation:

- No Agent Registry, Specialist Registry, Agent Run Orchestrator, Tool Registry, Approval Gateway, or canonical Agent Run Audit model exists yet.
- No deterministic metric service exists for Task Performance Insights.
- No canonical email draft schema or draft-only approval boundary exists yet.
- Existing `docs/marketing/MARKETING_AGENT_IMPLEMENTATION.md` describes a built marketing support agent with autonomous tools. For Phase 2 planning, that document is treated as legacy implementation evidence, not a governance model for new agents.

## 2. Shared Architecture Decision

Do not create one separately deployed AI service or model instance per project or task.

Future design:

- One versioned Project Agent definition.
- Logical project-scoped run per request.
- Mandatory authenticated `project_id` for Project Agent runs.
- Versioned task-specialist profiles.
- Central Agent Orchestrator.
- Central ContextPackage.
- Central MemoryRouter.
- Central provider routing.
- Central tool registry.
- Central approval gateway.
- Central audit and evaluation system.

A task specialist is initially a governed capability/profile, not an uncontrolled autonomous process. No agent or specialist may directly access MongoDB, Redis, Qdrant, Gmail, Microsoft 365, SMTP, WhatsApp, Meta, LinkedIn, or any external connector.

Every run must record:

- `tenant_id` derived from authentication.
- Requesting user or service identity.
- `project_id` where applicable.
- `task_id` where applicable.
- Department and industry profile.
- Agent version and specialist version.
- ContextPackage ID.
- Retrieval-profile version.
- Prompt version.
- Provider and model.
- Tool allow-list.
- Output-schema version.
- Proposed actions.
- Approval requirement.
- Audit trace.
- Evaluation metadata.
- Cost and token usage.

## 3. Responsibility Matrix

| Component | Owns | Must not own |
|---|---|---|
| Agent Orchestrator | run lifecycle, agent selection, context request, provider call, output validation, audit | direct data access, connector sending, business mutations |
| Project Agent | project reasoning, planning, specialist delegation, proposal consolidation | record creation/editing/deletion in initial release |
| Task Specialist Profile | bounded domain guidance for one task category | autonomous process, direct specialist-to-specialist calls |
| Task Performance Insights Agent | explanations of deterministic operational metrics | HR decisions, secret scoring, protected-characteristic analysis |
| Email Draft Agent | draft-only internal/external email composition | sending, guessed recipients, undisclosed recipients, attachments |
| ContextPackage | authorized context assembly | business action execution |
| Structured Memory | current authorized business facts | free-form recommendations |
| RAG | approved document evidence and citations | authoritative transactional facts |
| Provider Router | model selection, fallback, budget metadata | permission decisions |
| Tool Registry | allow-list metadata and risk classification | bypassing approval |
| Approval Gateway | human approval and future safe execution | generating recommendations |
| Connector Gateway | channel normalization and delivery audit | department intelligence or long-term memory |

WhatsApp, Meta, LinkedIn, Microsoft 365, Gmail, and SMTP are connectors, not agents.

## 4. Project Agent FRD

Purpose:

The Project Agent operates inside one authorized SynTask project. It helps project managers, team leads, and authorized project members understand project state, plan work, break deliverables into tasks, define acceptance criteria, identify dependencies, identify blockers, suggest priorities, suggest owners based on authorized membership and workload, explain missing information, and prepare proposed changes for human approval.

Initial release:

- Read-only.
- Draft/proposal output only.
- No project/task record creation, edit, assignment, deletion, or status change.

Mandatory scope:

- Authenticated tenant.
- Authorized user.
- Explicit accessible `project_id`.
- Current project data from Structured Memory.
- Current task/subtask data from Structured Memory.
- Approved project/client documents from RAG.
- Current session state from Working Memory.
- Versioned Project Agent retrieval profile.

Working Memory may resolve "this project" or "this task", but current business values must be re-read from Structured Memory. The agent must never retrieve another project unless the requesting user has access and explicitly selects it.

Input schema groups:

- Project record: `Project.name`, `key`, `project_id`, `description`, `company_id`, `client_id`, `type`, `status`, `lead_id`, `assigned_to`, `assigned_user_ids`, `team_member_ids`, dates, milestones.
- Client: `Client.name`, `company_name`, `industry`, `project_ids`, approved non-sensitive notes.
- Tasks/subtasks: `Task.title`, `description`, `status`, `priority`, `progress_percentage`, dates, `assigned_to`, `department_id`, `dependencies`, `parent_task_id`, `estimated_hours`, `actual_hours`, `story_points`.
- Time and work context: `TimeLog`, `TimeTrackingSummary`, `TimesheetEntry`, `EODReport`.
- Meetings: `Meeting.title`, dates, participants, status, safe summaries where available.
- Approved templates, policies, briefs, and SOPs from RAG.
- User request and current UI/page context.

Output schema groups:

- Project summary.
- Progress status.
- Missing information.
- Risk list.
- Blocker list.
- Work breakdown.
- Milestone proposals.
- Task/subtask proposals.
- Acceptance criteria.
- Dependency proposals.
- Estimate suggestions.
- Owner suggestions.
- Deadline warnings.
- Specialist outputs.
- Confidence.
- Evidence and record references.
- Proposed actions.
- Approval requirements.

Each output item must label:

- Current structured fact.
- RAG/document guidance.
- AI recommendation.
- Proposed mutation.
- Missing or stale data.

## 5. Task Specialist Contract And Selection Flow

`TaskSpecialistDefinition` contract:

```text
specialist_id
version
name
department
applicable_industries
supported_task_categories
objective
required_context
retrieval_profile
allowed_tools
forbidden_tools_actions
input_schema
output_schema
prompt_version
provider_policy
quality_checks
evidence_requirements
approval_requirements
evaluation_set_version
budget
maximum_fan_out
enabled_status
```

Selection flow:

1. Project Agent validates authenticated user and explicit `project_id`.
2. Orchestrator loads current project/task facts through ContextPackage.
3. Deterministic classifier reads task type, department, project type, client industry, requested output, available data, allowed tools, and specialist evaluation status.
4. Classifier filters profiles by exact supported categories and permissions.
5. Classifier rejects profiles missing evaluation approval.
6. Project Agent delegates to at most the configured number of specialists.
7. Specialist returns schema-valid output to Project Agent.
8. Project Agent consolidates, flags conflicts, and emits proposals requiring approval.

Do not select a specialist merely because its prose description is semantically similar. If no evaluated specialist matches, return generic Project Agent guidance or `specialist_unavailable`. Do not invent a new specialist.

Initial generic specialists:

- Task Decomposition Specialist: deliverables into tasks/subtasks, acceptance criteria, prerequisites.
- Risk and Dependency Specialist: blockers, sequencing issues, missing dependencies.
- Execution Guidance Specialist: task-specific instructions from approved docs.
- Quality Review Specialist: output review against acceptance criteria and standards.
- Estimate and Capacity Specialist: estimate suggestions and capacity warnings; no final assignment.

Orchestration limits:

- Maximum specialists per run.
- Maximum sequential handoffs.
- Maximum parallel fan-out.
- Token and cost limits.
- Timeout and retry limit.
- Duplicate-work prevention.
- Output-schema validation.
- Conflict handling.
- Parent Project Agent consolidation.

In first release, specialists cannot call other specialists.

## 6. Department And Industry Pack Proposal

Packs are configuration-driven and versioned. Do not hardcode department names throughout business logic.

Repository-aligned department types:

- sales
- marketing
- hr
- finance
- support
- operations

Repository-aligned project types:

- software
- business
- marketing
- operations
- other

Initial packs:

- Digital Marketing pack: Content Task Specialist, SEO Task Specialist, Paid Ads Task Specialist, Social Media Task Specialist, Creative Review Specialist, Campaign Analytics Specialist.
- Software/Technology pack: Requirements Specialist, Frontend Task Specialist, Backend Task Specialist, QA/Test Specialist, DevOps/Deployment Specialist, Security Review Specialist.
- Sales pack: Lead Research Specialist, Proposal Specialist, Follow-up Planning Specialist, CRM Data Quality Specialist.
- HR pack: Recruitment Workflow Specialist, Interview Planning Specialist, Onboarding Task Specialist.
- Operations pack: Process Task Specialist, Dependency Specialist, Capacity Specialist.

Pack configuration should include `department_type`, `project_type`, optional `client.industry`, enabled specialist IDs, required evaluations, default retrieval profiles, and tool allow-lists.

## 7. Task Performance Insights Agent FRD

Use explicit name: Task Performance Insights Agent.

Purpose:

Analyze operational performance using task completion, planned versus completed work, on-time/overdue tasks, cycle time, estimate accuracy, reopened/reworked tasks, blockers, dependencies, workload, capacity, EOD submissions, EOD-reported progress, missing EODs, reliable task/time tracking, scope changes, and authorized leave/availability.

Access:

- Tenant administrators.
- Department managers.
- Project managers.
- Team leads within permitted hierarchy.

Users see only employees, projects, and departments they are authorized to manage.

Authority:

- Structured Memory is authoritative for metrics.
- RAG is only for approved performance definitions, policies, and reporting guidance.
- EOD entries are employee-reported context, not unquestionable performance truth.

Required labels:

- Verified task facts.
- Employee-reported EOD information.
- Missing data.
- Conflicting data.
- Estimated/inferred insights.
- Confidence.

Outputs:

- Team performance summary.
- Project performance summary.
- Department performance summary.
- Completion trends.
- Overdue trends.
- Workload imbalance.
- Repeated blockers.
- Estimate variance.
- Rework patterns.
- EOD completeness.
- Data-quality warnings.
- Coaching/management suggestions.
- Recommended operational actions.
- Supporting record references.
- Confidence and freshness.

Prohibited behavior:

- Decide hiring, firing, promotion, salary, or discipline.
- Produce secret employee scores.
- Rank employees from different roles using raw task counts.
- Treat more completed tasks as automatically better performance.
- Penalize employees for approved leave.
- Ignore task difficulty, dependencies, scope changes, or blocked work.
- Use protected HR characteristics.
- Present incomplete EOD data as fact.
- Expose individual data to unauthorized managers.

Canonical numeric metrics must be calculated deterministically in application code. LLM may explain metrics; LLM must not calculate canonical metrics from prose.

## 8. Canonical Metric Dictionary

| Metric | Formula | Required fields | Missing-data behavior | Individual display |
|---|---|---|---|---|
| `completion_rate` | completed tasks / eligible assigned tasks in range | `Task.status`, `assigned_to`, date range | label incomplete if assignments/status missing | safe with role normalization |
| `on_time_completion_rate` | completed on/before due date / completed tasks with due date | `completed_at`, `due_date`, `status` | exclude tasks without due date; report exclusion count | safe |
| `overdue_rate` | overdue open tasks / open tasks with due date | `status`, `due_date`, current time | exclude missing due date; report gap | safe |
| `blocked_task_rate` | blocked tasks / eligible tasks | blocker field if added, dependency status, EOD blockers | if blocker source only EOD, label employee-reported | safe with caveat |
| `cycle_time` | completed_at - start_date or first in-progress timestamp | `start_date`, `completed_at`, status history if available | lower confidence without state history | safe |
| `estimate_variance` | actual_hours - estimated_hours, also percentage variance | `estimated_hours`, `actual_hours`, time logs | exclude missing estimates; report sample size | safe |
| `reopen_or_rework_rate` | reopened/reworked tasks / completed tasks | status history, comments/rework markers | unavailable until history exists; do not infer from prose alone | safe only with trace |
| `workload_count` | active assigned tasks per user | `assigned_to`, `status` | exclude completed/cancelled | safe with role normalization |
| `workload_effort` | sum estimated hours or story points for active tasks | `estimated_hours` or `story_points`, `status` | label unavailable if estimates absent | safe with caveat |
| `EOD_completion_rate` | submitted EODs / expected working days | `EODReport.report_date`, attendance/calendar policy | approved leave excluded | safe |
| `task_to_EOD_consistency` | EOD completed/in-progress task IDs matching task records / EOD task refs | `EODReport.*_task_ids`, `Task.status` | label conflict; never treat EOD as truth | safe with caveat |
| `dependency_delay` | tasks delayed by incomplete dependencies / tasks with dependencies | `Task.dependencies`, dependency statuses, due dates | unavailable if dependencies not modeled | safe |
| `scope_change_impact` | delta in task count/effort/dates after baseline | project/task history, milestones, dates | unavailable until baseline/change history exists | safe aggregate first |

All metrics use tenant-configured timezone. Date ranges are explicit and inclusive of start, exclusive of end unless product defines otherwise. Permission requirements follow the manager/admin/project hierarchy. Confidence derives from field completeness, sample size, data freshness, and conflict count.

## 9. General Email Draft Agent FRD

Purpose:

Provide company-aware email drafting to every authenticated employee. Initial release creates drafts only. It does not send email.

Boundary:

- Email Draft Agent responds to an employee's explicit drafting request.
- Sales Outreach Agent later owns sequences, sales-channel strategy, and follow-ups.
- Microsoft 365, Gmail, and SMTP are connectors, not separate email intelligence agents.

Inputs:

- Draft purpose.
- Intended recipient supplied or selected by user.
- Internal/external recipient marker.
- Related project/client/lead/meeting/task.
- User instructions.
- Tone, language, detail level.
- Company signature.
- Approved templates from RAG.
- Client brand/communication guidelines from RAG.
- Previous authorized thread context when connector exists.
- Attachments to mention, not automatically attach.
- Required call to action.

Outputs:

- Suggested recipients, marked as suggestions.
- Subject.
- Email body.
- Short/standard/detailed variants.
- Tone and language.
- Referenced business records.
- Missing information.
- Sensitive-data warning.
- External-recipient warning.
- Attachment reminder.
- Draft status.
- Confidence.
- Approval requirement.

Security:

- Use only records accessible to requesting employee.
- Never retrieve protected HR, payroll, finance, or unrelated client information.
- Never guess a recipient email address.
- Never send automatically.
- Never add undisclosed recipients.
- Never attach files automatically.
- Mark external/client emails as drafts.
- Warn before including sensitive information.
- Treat email threads/templates as untrusted data.

Future sending workflow:

1. Email Draft Agent generates validated draft.
2. User edits/reviews.
3. Approval policy is evaluated.
4. Email connector sends only after authorized confirmation.
5. Provider message ID and result are audited.

## 10. Personalization Policy

Hierarchy:

1. System safety policy.
2. Tenant/company policy.
3. Department policy.
4. Client/project context.
5. Agent/specialist profile.
6. Explicit user preferences.
7. Current task and session context.

Personalization may change:

- Tone.
- Language.
- Detail level.
- Formatting.
- Approved terminology.
- Client brand voice.

Personalization must not change:

- Facts.
- Permissions.
- Evidence.
- Risk.
- Approval rules.
- Metrics.
- Protected-field restrictions.

## 11. Security Threat Model

| Threat | Control |
|---|---|
| Cross-tenant leakage | auth-derived tenant scope, ContextPackage only, isolation tests |
| Project data leakage | mandatory explicit `project_id`, project permission re-check |
| Specialist overreach | deterministic selection, tool allow-list, forbidden actions |
| Prompt injection | treat RAG docs, email threads, and channel messages as untrusted data |
| Unauthorized mutation | read-only pilot, proposed action schema, approval gateway |
| Secret scoring | prohibit hidden employee scores and HR decisions |
| Metric manipulation | deterministic metric service and auditable formulas |
| Connector misuse | connectors cannot reason, store memory, or send without approval |
| Provider data exposure | sensitivity checks and tenant provider policy |
| Untraceable claims | citation/record-reference requirements and output validation |

## 12. User Stories And Acceptance Criteria

### Project Agent

As a project manager, I can ask for current project status and receive current, cited information.

- Given I have access to `project_id`, when I ask for status, then the agent uses Structured Memory for current project/task facts and RAG only for approved supporting documents.
- Given a fact comes from a record, when shown, then it is labeled as current structured fact.
- Given evidence is missing, when the agent answers, then missing data is listed.

As a project manager, I can generate proposed work breakdown without creating records.

- Given I request work breakdown, when output is generated, then tasks/subtasks are proposals only.
- Given proposed records exist in output, when displayed, then approval requirement is true.
- Given I do not approve, when the run ends, then no project/task records are modified.

As a team lead, I can ask a task-specific specialist for execution guidance.

- Given task category matches an evaluated specialist, when I request guidance, then specialist ID and version are shown.
- Given no evaluated specialist matches, when I request guidance, then output is generic guidance or `specialist_unavailable`.

As a project member, I receive only guidance for projects/tasks I can access.

- Given I lack project access, when I ask, then no ContextPackage is built and no citations are returned.

As a project manager, I can see which specialist produced each recommendation.

- Given specialist output is included, when result is shown, then each recommendation includes specialist ID, version, evidence, and confidence.

As a user, I am asked for clarification when project/task context is ambiguous.

- Given Working Memory cannot resolve "this project", when I ask, then agent asks for `project_id`.

As a user, I can review proposed changes before any project record is modified.

- Given an output includes proposed actions, when displayed, then no action executes without approval gateway.

### Task Performance Insights Agent

As an administrator, I can view authorized company-level operational trends.

- Given admin permission, when I choose date range, then deterministic metrics are returned with formulas and sample sizes.

As a department manager, I can view only my permitted department/team.

- Given department manager scope, when requesting insights, then employees outside permitted hierarchy are excluded.

As a project manager, I can see blockers and delivery trends for accessible projects.

- Given accessible project, when requesting trends, then blocker sources are labeled as task fact or EOD-reported context.

As a manager, I can understand why a metric changed.

- Given metric delta, when explanation is generated, then referenced records and missing data are shown.

As an employee, my EOD text is not silently treated as verified performance truth.

- Given EOD text conflicts with task status, when shown, then conflict is labeled and confidence reduced.

As an auditor, I can trace every insight to its calculation and records.

- Given an insight, when audited, then formula, fields, records, date range, timezone, and run ID are available.

### Email Draft Agent

As an employee, I can draft an internal or external company-specific email.

- Given authenticated employee, when I request a draft, then output is draft-only and no send occurs.

As an employee, I can choose tone, language, and detail.

- Given preferences are allowed, when draft is generated, then presentation changes without changing facts or policies.

As an employee, I can include authorized project/client context.

- Given I select accessible context, when draft is generated, then references are limited to authorized records.

As an employee, I receive warnings about missing or sensitive information.

- Given recipient is external or content may be sensitive, when draft is generated, then warning fields are populated.

As an employee, I must review the draft before sending.

- Given draft exists, when output returns, then status remains draft and connector send is unavailable.

As an unauthorized user, I cannot use the agent to retrieve restricted information.

- Given inaccessible record ID, when used in a draft request, then the agent refuses that context and returns no restricted data.

## 13. Evaluation Datasets And Release Gates

Shared gates:

- Cross-tenant leakage: 0.
- Permission enforcement: 100%.
- Direct unauthorized mutations: 0.
- Output-schema validity: at least 99% after one permitted repair.
- Critical prompt-injection policy changes: 0.
- Required run audit fields: 100%.
- Budget-limit bypasses: 0.

Project Agent pilot targets:

- At least 90% current-state facts match Structured Memory.
- At least 90% document-backed recommendations have valid citations.
- At least 80% specialist-selection accuracy on evaluation tasks.
- At least 75% pilot project-manager usefulness rating.
- Zero records created or modified in read-only pilot.

Task Performance targets:

- 100% deterministic metric-formula correctness.
- 100% time-range/timezone correctness.
- Zero protected-characteristic usage.
- Zero unauthorized individual-level insight.
- At least 90% explanation-to-metric consistency.
- Every insight labels missing and self-reported data.

Email Draft targets:

- Zero automatic sends.
- Zero guessed recipient addresses.
- Zero unauthorized record disclosure.
- At least 95% output-schema validity.
- At least 80% pilot drafts accepted or accepted after minor edits.
- 100% external drafts clearly marked as drafts.

Evaluation datasets:

- Project Agent: project status, work breakdown, ambiguity, unauthorized project, stale documents, conflicting policies, specialist selection, prompt injection.
- Task Performance: metric formula fixtures, timezone/date range fixtures, missing EOD, conflicting EOD/task status, approved leave, hierarchy denial.
- Email Draft: internal draft, external client draft, missing recipient, sensitive context warning, unauthorized record, prompt-injected thread/template.

## 14. Delivery Backlog Ordered By Dependency

Planning stage:

1. Finalize this plan and reconcile canonical docs.
2. Finalize agent schemas and user stories.
3. Finalize security threat model and release gates.
4. Finalize Milestone 6 implementation scope.

Milestone 6 Shared Agent Foundation:

1. Agent Registry.
2. Specialist Registry.
3. Agent Run model and audit trace.
4. Agent Orchestrator.
5. Tool Registry metadata and risk classes.
6. Output schema validation and one permitted repair path.
7. Proposed Action contracts.
8. Approval Gateway stub for proposals only.
9. Cost/budget controls.
10. Evaluation runner hooks.

Milestone 7 Read-Only Project Agent Pilot:

1. Project Agent definition.
2. Generic specialist profiles.
3. Department/industry pack config.
4. Project ContextPackage profile.
5. UI entry points for draft/proposal output.

Milestone 8 General Email Draft Agent:

1. Email Draft Agent definition.
2. Draft schemas.
3. Template/tone RAG profile.
4. Sensitive/external warnings.
5. Draft-only UI.

Milestone 9 Task Performance Insights Agent:

1. Deterministic metric service.
2. Metric dictionary implementation.
3. Hierarchy authorization.
4. Explanation-only model layer.
5. Audit and fairness checks.

Later milestones:

- Approval execution for safe project proposals.
- Microsoft 365/Gmail/SMTP sending connectors.
- WhatsApp/Meta/LinkedIn connectors.
- More department/industry packs.
- Controlled scheduled agents.

## 15. Exact Milestone 6 Implementation Scope

Implement shared foundation only:

- Agent Registry.
- Specialist Registry.
- Agent Run Orchestrator.
- Agent Run Audit.
- Tool Registry metadata.
- Output validation.
- Proposed action contracts.
- Approval Gateway proposal boundary.
- Budget/cost controls.
- Evaluation hooks.

Do not implement:

- Full Project Agent behavior.
- Task Performance Insights Agent.
- Email Draft Agent.
- External connectors.
- Email sending.
- WhatsApp/Meta/LinkedIn.
- Autonomous mutations.
- Long-term self-learning.

## 16. Exact Files Milestone 6 Should Create Or Modify

Likely backend files to create:

- `backend/app/agents/registry.py`
- `backend/app/agents/orchestrator.py`
- `backend/app/agents/specialists.py`
- `backend/app/agents/tools.py`
- `backend/app/agents/schemas.py`
- `backend/app/agents/evaluation.py`
- `backend/app/models/agent_run.py`
- `backend/app/api/v1/endpoints/agents.py`
- `backend/tests/agents/test_agent_registry.py`
- `backend/tests/agents/test_agent_orchestrator.py`
- `backend/tests/agents/test_agent_security.py`

Likely backend files to modify:

- `backend/app/core/database.py`
- `backend/app/api/v1/api.py`
- `backend/app/rag/context_package.py`
- `backend/app/ai/provider_router.py`
- `backend/app/core/config.py`
- `backend/.env.example`

Likely docs to modify:

- `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`
- `docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md`
- `docs/diagrams/architecture.md`
- `docs/user-flows/ai-productivity.md`

No frontend implementation is required in Milestone 6 unless product explicitly approves a read-only admin/config UI.

## 17. Remaining Product Decisions And Blockers

- Confirm whether missing `SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md` should be restored as canonical source or merged into this plan.
- Confirm first supported specialist packs for pilot tenants.
- Confirm whether Project Agent pilot includes all project members or only managers/leads.
- Confirm exact manager hierarchy rules for Task Performance Insights.
- Confirm timezone source of truth for metric calculations.
- Confirm whether task reopen/rework history exists or must be added before that metric is enabled.
- Confirm email signature/preference storage location.
- Confirm connector roadmap order: Microsoft 365/Gmail/SMTP before WhatsApp/Meta/LinkedIn.
- Confirm retention for agent run prompts, context package IDs, output, feedback, and cost records.
- Confirm tenant policy for which data classifications may be sent to OpenAI and Groq.
