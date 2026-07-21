# Milestone 07: Read-Only Project Agent

Status: In Progress

## Implementation Progress

- [x] Repository preflight completed.
- [x] Canonical document verification completed.
- [x] Permission-path inspection completed.
- [x] Blocker classification completed.
- [x] Canonical Phase 2 workflows/user-stories document added exactly once.
- [x] Project Agent definition drafted.
- [x] Project Agent request/output schemas implemented.
- [x] Deterministic specialist profiles implemented.
- [x] Project Agent API implemented.
- [x] Project Agent permission/context wiring implemented.
- [x] Project Agent UI implemented.
- [ ] Evaluation dataset implemented.
- [ ] Milestone 7 verification completed.

## Completion Evidence

### Stage 1: Repository Preflight And Blocker Classification

Completed on 2026-07-20.

Commands:

- `Get-Content -Raw AGENTS.md`
- `Get-Content -Raw docs/milestones/README.md`
- `Get-Content -Raw docs/milestones/MILESTONE_07_READ_ONLY_PROJECT_AGENT.md`
- `rg --files docs | rg "SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories|SynTask_Phase_2_Agent_Platform_Implementation_Plan|SynTask_Phase_2_AI_Memory_and_RAG_Foundation_FRD|architecture/decisions/2026-07-20-phase-2-rag-foundation|diagrams/architecture|user-flows/projects-tasks|user-flows/ai-productivity"`
- `rg -n "ensure_project_visibility|resolve_rag_scope|get_project_by_id|assert_task_view|assert_task_manage|can_update_task_field|project_id|team_member_ids|assigned_user_ids|lead_id" backend/app/api backend/app/services backend/app/rag backend/app/models -g "*.py"`
- `rg -n "class AgentOrchestrator|class ToolRegistry|class ContextPackageBuilder|class ProviderRouter|class AgentRunStateMachine|class AgentDefinition|class SpecialistDefinition|class ActionProposal" backend/app/agents backend/app/models/agent.py backend/app/rag/context_package.py backend/app/ai/provider_router.py`
- `rg -n "project|Project|agent|Agent|tasks|Tasks" frontend/src -g "*.tsx" -g "*.jsx" -g "*.ts" -g "*.js"`
- `rg --files frontend/src | rg -i "project|task|agent|ai"`

Findings:

- Required Milestone 7 docs were read.
- Canonical Agent Platform plan exists at `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`.
- Canonical RAG/Memory FRD exists at `docs/SynTask_Phase_2_AI_Memory_and_RAG_Foundation_FRD.md`.
- Required canonical Phase 2 workflows/user-stories document is absent: `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`.
- No source content for that missing canonical document is present in the repository or current request context, so creating it now would require inventing canonical product content.
- Milestone 7 implementation is blocked until that document is supplied or explicitly approved as a placeholder/restoration task.
- Permission-path inspection found existing project authorization anchors in `backend/app/rag/permissions.py`, `backend/app/api/dependencies.py`, `backend/app/api/v1/endpoints/tasks.py`, `backend/app/services/task_health_service.py`, `backend/app/rag/structured_memory.py`, and project/task models.
- Agent runtime inspection found Milestone 6 anchors in `backend/app/agents/orchestrator.py`, `backend/app/agents/tools.py`, `backend/app/agents/state_machine.py`, `backend/app/models/agent.py`, `backend/app/rag/context_package.py`, and `backend/app/ai/provider_router.py`.
- Frontend inspection found existing project/task workspace anchors in `frontend/src/pages/ProjectBoard.jsx`, `frontend/src/pages/Projects.jsx`, `frontend/src/pages/TaskDetail.jsx`, `frontend/src/api/projects.js`, and `frontend/src/api/tasks.js`.

Blockers:

- BLOCKER: Missing canonical workflows/user-stories document. Acceptance criteria require exactly one canonical copy before Milestone 7 can pass.
- RISK: Prior full backend result remains partially unclean: 269 passed, 13 failed, 8 skipped. Failures touching health/auth/task/project paths must be treated as relevant release risks until individually verified.

### Current Verification

No Milestone 7 code tests run in this stage because implementation is blocked before coding.

### Stage 2: Project Agent Definition, Schemas, Specialists, And Selection Contract

Completed on 2026-07-20.

Canonical-document verification:

- Exactly one repository copy found: `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`.
- Existing missing-document blocker is resolved for this stage.

Implemented:

- Added read-only, manual, project-scoped `project_agent` contract at `backend/app/agents/project_agent.py`.
- Added strict Project Agent request schema with required `project_id`, allowed operations, and client-trust-field rejection through `extra="forbid"`.
- Added strict Project Agent output schema with evidence references, specialist attribution, risks, dependencies, missing data, proposal-only work items, and read-only approval invariants.
- Added five generic specialist definitions: Task Decomposition, Risk and Dependency, Execution Guidance, Quality Review, Estimate and Capacity.
- Added deterministic, code-controlled specialist selection map for supported operations. Unknown operations remain schema-rejected; unevaluated or disabled specialists are not selected by default.
- No API, UI, connector, scheduling, Task Performance, Email Draft, approval execution, or business mutation behavior was added.

Commands:

- `Get-ChildItem -Path docs -Recurse -Filter "SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories*.md" | ForEach-Object { $_.FullName }`
- `Select-String -Path docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md -Pattern "Project Agent|Task Decomposition|Risk|Execution Guidance|Quality Review|Estimate|Capacity|Specialist|project_summary|decompose_scope|identify_risks|execution_guidance|review_plan|estimate_work|comprehensive_project_review" -Context 2,4`
- `Select-String -Path docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md -Pattern "Milestone 7|Project Agent|Task Decomposition|Risk and Dependency|Execution Guidance|Quality Review|Estimate and Capacity|specialist|read-only" -Context 2,5`
- `python -m pytest backend/tests/agents/test_project_agent_contract.py -q`
- `python -m compileall backend/app/agents backend/tests/agents/test_project_agent_contract.py`
- `python -m pytest backend/tests/agents -q`

Results:

- Project Agent contract tests: 7 passed.
- Compile check: passed.
- Agent test set: 15 passed, 5 skipped, 34 warnings.

Remaining risks:

- Full backend remains partially unclean from prior verification: 269 passed, 13 failed, 8 skipped. Relevant failures remain release risks until individually verified or fixed.
- UI entry point, evaluation dataset, full read-only mutation-count verification, and full backend failure classification remain incomplete.

### Stage 3: Project Agent API And Permission/Context Wiring

Completed on 2026-07-20.

Implemented:

- Added feature-gated `POST /api/v1/agents/project/runs`.
- Added `PROJECT_AGENT_ENABLED` flag. Endpoint requires both `AGENT_PLATFORM_ENABLED` and `PROJECT_AGENT_ENABLED`.
- Endpoint accepts only strict `ProjectAgentRequest`; client-supplied tenant/role fields remain rejected.
- Endpoint resolves tenant/project scope through authenticated user and existing `resolve_rag_scope`.
- Endpoint validates selected milestone IDs against project milestones.
- Endpoint validates selected task IDs belong to same authenticated tenant and canonical project ID.
- Endpoint passes canonical project ID, session/conversation IDs, user request, and schema payload into existing Agent Orchestrator.
- No UI, connector, scheduling, Task Performance, Email Draft, approval execution, or business mutation behavior was added.

Commands:

- `python -m pytest backend/tests/agents/test_agent_api_boundaries.py backend/tests/agents/test_project_agent_contract.py -q`
- `python -m compileall backend/app/agents backend/app/api/v1/endpoints/agents.py backend/tests/agents`
- `python -m pytest backend/tests/agents -q`

Results:

- Project Agent API and contract tests: 12 passed, 4 warnings.
- Compile check: passed.
- Agent test set: 18 passed, 5 skipped, 34 warnings.

Remaining risks:

- Full backend remains partially unclean from prior verification: 269 passed, 13 failed, 8 skipped. Relevant failures remain release risks until individually verified or fixed.
- Project Agent definition must exist as an enabled registry definition before live runs can start.
- Project Agent output still uses existing orchestrator execution path; full Project Agent output validation, evaluation dataset, and read-only mutation-count verification remain incomplete.

### Stage 4: Project Agent UI Entry Point

Completed on 2026-07-20.

Implemented:

- Added frontend API helper for `POST /api/v1/agents/project/runs`.
- Added Project Agent entry button on project board header.
- Added read-only Project Agent modal with operation selector, request field, and run status/result panel.
- UI submits authenticated project-scoped requests only; it does not send tenant IDs, roles, permissions, connector requests, scheduling fields, approval execution, or mutation payloads.
- UI does not create, update, assign, delete, or schedule project/task records.

Commands:

- `python -m pytest backend/tests/agents -q`
- `npm.cmd -C frontend run build`
- `npm.cmd -C frontend run lint`
- `cd frontend; npx.cmd eslint src/pages/ProjectBoard.jsx src/api/projects.js --max-warnings 0`

Results:

- Agent backend tests: 18 passed, 5 skipped, 34 warnings.
- Targeted frontend lint for changed files: passed.
- Frontend build: failed on existing CSS minifier issue: `Unexpected token Ident("tbody")`.
- Repo-wide frontend lint: failed on existing unrelated errors in `App.jsx`, `AIBriefingCenter.jsx`, `Sidebar.jsx`, `ContentCalendar.jsx`, `Notifications.jsx`, `ScheduledJobs.jsx`, CRM files, and `roles.js`.

Remaining risks:

- Full frontend build/lint remain blocked by pre-existing unrelated failures.
- Evaluation dataset, full Milestone 7 verification, and read-only mutation-count proof remain incomplete.

---

### Milestone 7 Goal

Implement the **Read-Only Project Agent Pilot** using the existing Milestone 6 Shared Agent Platform Foundation.

Do not redesign the agent platform, memory architecture, RAG pipeline, provider routing, audit system, or state machine.

The Project Agent must provide project planning guidance, risks, task decomposition, estimates, dependencies, quality review, and proposed work items without mutating business records.

---

### Required Preflight

Before coding:

1. Inspect existing Project, Task, Milestone, Dependency, User, Department, Project Membership, permission, service, API, and frontend code.

2. Inspect the existing Agent Orchestrator, ToolRegistry, ContextPackageBuilder, MemoryRouter, ProviderRouter, schemas, state machine, audit events, idempotency, budget controls, and tests.

3. Add exactly one repository copy of:

   `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`

   only if it is still absent.

4. Do not create duplicate documentation.

5. Verify whether any existing backend failure affects authentication, tenant isolation, project access, task access, or agent safety.

6. Treat relevant failures as blockers rather than automatically classifying them as unrelated.

---

### Project Agent Definition

Create one versioned agent definition:

`project_agent`

It must be:

* Tenant-aware.
* Scoped to one authorized `project_id`.
* User-invoked only.
* Feature-flagged.
* Read-only.
* Executed through the existing Agent Orchestrator.
* Integrated with ContextPackageBuilder.
* Integrated with ProviderRouter.
* Subject to existing budget, audit, idempotency, retention, state-machine, and schema-validation controls.

The agent must never directly access MongoDB, Redis, Qdrant, or external connectors.

---

### Generic Specialist Profiles

Implement five governed specialist profiles:

1. Task Decomposition Specialist
2. Risk and Dependency Specialist
3. Execution Guidance Specialist
4. Quality Review Specialist
5. Estimate and Capacity Specialist

Specialists are configuration-driven profiles inside the Project Agent.

They must not:

* Run as separate autonomous agents.
* Call one another.
* Have separate public APIs.
* Directly call databases or vector stores.
* Execute tools independently.
* Mutate business records.

Specialist selection must be deterministic and code-controlled.

Supported operations:

* `project_summary`
* `decompose_scope`
* `identify_risks`
* `execution_guidance`
* `review_plan`
* `estimate_work`
* `comprehensive_project_review`

Reject unknown operations.

Do not let the LLM select arbitrary specialists.

---

### Specialist Responsibilities

#### Task Decomposition

* Break approved scope into proposed milestones, tasks, or subtasks.
* Suggest deliverables and acceptance criteria.
* Identify missing prerequisites.
* Avoid duplicating existing work.
* Avoid excessive task fragmentation.

#### Risk and Dependency

* Identify blockers, sequencing risks, missing approvals, dependencies, deadline conflicts, and capacity risks.
* Distinguish facts from hypotheses.
* Identify possible dependency cycles.
* Link findings to evidence.

#### Execution Guidance

* Suggest practical next steps.
* Suggest sequencing and handoff expectations.
* Identify required inputs and approvals.
* Clarify completion requirements.

#### Quality Review

* Identify vague tasks, duplicate work, missing acceptance criteria, missing dependencies, incomplete plans, and untestable deliverables.
* Produce recommendations only.

#### Estimate and Capacity

* Suggest effort ranges and planning considerations.
* Consider complexity, comparable historical information, workload, leave, dependencies, blockers, and uncertainty when authorized.
* Never use attendance as the only capacity or productivity measure.
* Never rank employees.
* Never assign users.

---

### Permission Rules

The Project Agent must never have broader access than the requesting user.

Before context retrieval:

* Authenticate the user.
* Resolve tenant from backend authentication.
* Validate active tenant membership.
* Validate project access.
* Validate project membership, hierarchy, department, ownership, and role rules where applicable.
* Validate selected milestone and task IDs belong to the authorized project.
* Apply source-level permissions to related records.

Do not trust client-provided tenant IDs, roles, memberships, or permission lists.

Do not reveal the existence or metadata of unauthorized projects, tasks, users, clients, agent runs, or documents.

When a user lacks access to a related data source, omit that data and mark it as `permission_restricted`.

---

### Memory and Context Rules

Follow the existing memory authority:

1. Working Memory resolves current conversational references.
2. Structured Memory is authoritative for current business facts.
3. RAG supplies approved document knowledge.
4. Derived AI memory is non-authoritative.
5. LLM prior knowledge is a labeled final fallback.
6. Structured Memory overrides stale Working Memory and conflicting RAG transactional facts.

Use Structured Memory for current authorized facts such as:

* Project metadata.
* Status and dates.
* Members.
* Milestones.
* Tasks and subtasks.
* Existing estimates.
* Owners.
* Dependencies.
* Blockers.
* Approved extensions.
* Authorized workload or availability information.

Use RAG for approved project knowledge such as:

* Requirements.
* Project documentation.
* Statements of work.
* Briefs.
* Delivery procedures.
* Quality standards.
* Definition of done.
* Approved planning templates.

RAG retrieval must apply:

* Tenant filtering.
* Project/client/source permissions.
* Source approval status.
* Prompt-injection quarantine.
* Citations.
* Evidence thresholds.
* Freshness indicators.

Use Working Memory only for conversational reference resolution.

Build all context through the existing ContextPackageBuilder.

Do not allow specialists to retrieve context independently.

---

### Request Schema

Create a strict versioned Project Agent request schema containing:

```json
{
  "schema_version": "1.0",
  "project_id": "string",
  "operation": "supported enum",
  "user_request": "string",
  "selected_record_ids": {
    "milestone_ids": [],
    "task_ids": []
  },
  "planning_input": {
    "scope": "optional string",
    "deliverables": [],
    "constraints": [],
    "target_date": "optional ISO date",
    "assumptions": []
  },
  "preferences": {
    "language": "optional",
    "tone": "optional",
    "detail_level": "concise | standard | detailed"
  },
  "idempotency_key": "string"
}
```

Requirements:

* Validate length and enum values.
* Validate selected records belong to the authorized project.
* Reject unsupported fields when consistent with repository conventions.
* Do not accept raw system prompts, arbitrary tools, provider secrets, tenant overrides, permission overrides, retrieval filters, or specialist prompts.
* Personalization may affect presentation only.
* Personalization must not affect facts, permissions, evidence, risk, confidence, or policy.

---

### Output Schema

Create a versioned Project Agent-specific output schema containing:

* Agent key and version.
* Project ID.
* Context timestamp.
* Operation.
* Summary.
* Current-state observations.
* Recommendations.
* Proposed work items.
* Risks.
* Dependencies.
* Missing data.
* Evidence.
* Overall confidence.
* Risk level.
* Warnings.
* Expiration when applicable.
* `read_only = true`.
* `approval_required = true` for proposed business changes.

Each recommendation must include:

* ID.
* Title.
* Description.
* Priority.
* Rationale.
* Expected outcome.
* Specialist key.
* Evidence references.
* Assumptions.
* Confidence.

Each proposed work item must include:

* Proposal ID.
* Type.
* Title.
* Description.
* Deliverable.
* Acceptance criteria.
* Estimate or range.
* Suggested owner when authorized.
* Suggested date.
* Dependency references.
* Assumptions.
* Evidence.
* Confidence.
* `mutation_status = proposal_only`.

Each risk must distinguish:

* Fact or hypothesis.
* Severity.
* Likelihood.
* Mitigation.
* Evidence.
* Confidence.

Required invariants:

* `read_only` is always true.
* Every work item is proposal-only.
* Facts, assumptions, and hypotheses are distinguishable.
* Missing information is never invented.
* Evidence references contain only authorized sources.
* The output must never claim a record was created or changed.

Use the existing one-repair-maximum behavior.

---

### Read-Only Boundary

The agent may propose:

* Milestones.
* Tasks.
* Subtasks.
* Dependencies.
* Acceptance criteria.
* Estimates.
* Owner suggestions.
* Deadline suggestions.
* Risk mitigations.
* Clarification requests.

Persist proposals only through the existing ActionProposal mechanism.

The Project Agent must not:

* Create or update projects.
* Create or update tasks.
* Create or update milestones.
* Assign users.
* Change due dates.
* Change estimates.
* Change priorities.
* Change statuses.
* Create dependencies.
* Send notifications.
* Publish events that could trigger mutations.
* Call existing mutation services.
* Expose execution or approve-and-execute endpoints.

Mutation tools available to the Project Agent must equal zero.

---

### API Scope

Extend the existing feature-flagged agent API.

Implement repository-convention equivalents of:

* `POST /api/v1/agents/project/runs`
* `GET /api/v1/agents/project/runs/{run_id}`
* `GET /api/v1/projects/{project_id}/agent-runs`

Requirements:

* Backend authentication and project authorization.
* Tenant and project filtering.
* Pagination for run history.
* Safe serialization.
* No raw prompts, secrets, provider payloads, or unrestricted context.
* No execution endpoint.
* No approval mutation endpoint.
* No public specialist endpoint.

Use the existing Agent Orchestrator and ProviderRouter.

---

### UI Scope

Add a minimal Project Agent workspace inside the existing project UI.

Include:

* Operation selector.
* User request.
* Optional scope and deliverables.
* Optional selected tasks or milestones.
* Optional constraints and target date.
* Presentation preferences.
* Structured result sections.
* Evidence references.
* Missing-data warnings.
* Confidence.
* Risks.
* Proposed work items.
* Run history when practical.

Display prominently:

> Recommendations only. No project, milestone, task, owner, deadline, estimate, or dependency has been changed.

Do not add:

* Apply button.
* Execute button.
* Create-task button.
* Assignment control.
* Approval-and-execute control.

Handle:

* Feature disabled.
* Unauthorized.
* Missing project.
* Loading.
* Processing.
* Missing data.
* Insufficient evidence.
* Budget rejection.
* Provider failure.
* Validation failure.
* Completed.
* Stale result.

---

### Security Requirements

Test and enforce:

* Tenant isolation.
* Project isolation.
* Record-level authorization.
* Project ID tampering protection.
* Cross-project selected-record rejection.
* Unauthorized run access prevention.
* Tool deny-by-default.
* No direct database/vector-store access.
* Prompt-injection resistance.
* Secret masking.
* PII and context minimization.
* Sanitized append-only audits.
* Output validation.
* One repair maximum.
* Budget enforcement.
* Idempotency.
* Terminal-state immutability.
* Proposal-only persistence.
* No mutation events.
* Safe provider failure.
* Feature flag behavior.
* User preferences cannot change policy or facts.

Treat retrieved document instructions as untrusted content.

---

### Evaluation Dataset

Create a version-controlled synthetic or anonymized evaluation dataset.

Include at least:

* Clear project scope.
* Existing tasks.
* Partial task coverage.
* Duplicate task risk.
* Missing acceptance criteria.
* Blocking dependency.
* Possible dependency cycle.
* Missing client approval.
* Deadline conflict.
* Capacity uncertainty.
* Missing project brief.
* Conflicting structured and RAG facts.
* Stale RAG document.
* Missing workload data.
* Permission-restricted data.
* Insufficient evidence.
* Authorized user.
* Unauthorized user.
* Cross-project user.
* Cross-tenant user.
* Unauthorized selected task.
* Prompt injection in a document.
* Request to create tasks directly.
* Request to assign a user.
* Request to change a deadline.
* Request to reveal secrets.
* Request to rank employee productivity.
* Oversized request.
* Invalid operation.
* Provider timeout.
* Invalid provider output.
* Repair success.
* Repair failure.
* Budget rejection.
* Duplicate idempotency key.
* Proposal execution attempt.
* Feature disabled.
* Tone/language/detail personalization.
* Preference attempting to suppress warnings or change facts.

Record expected:

* Specialist selection.
* Facts.
* Evidence.
* Missing-data behavior.
* Authorization result.
* Safety behavior.
* Proposal-only behavior.

---

### Test Plan

Implement:

#### Unit tests

* Request validation.
* Output validation.
* Read-only invariants.
* Proposal-only invariants.
* Deterministic specialist selection.
* Invalid operation.
* Prompt construction.
* Evidence authorization.
* Confidence bounds.
* Missing data.
* Preferences cannot change policy.
* Tool deny-by-default.
* Mutation-tool rejection.
* One repair maximum.
* Budget checks.
* Idempotency.
* Terminal-state immutability.

#### Permission tests

* Authorized member.
* Authorized manager.
* Unauthorized user.
* Cross-project access.
* Cross-tenant access.
* Unauthorized task/milestone selection.
* Restricted source data.
* Unauthorized run read/list.
* Feature disabled.

#### Context tests

* ContextPackageBuilder used.
* Structured Memory authority.
* RAG approved knowledge and citations.
* Working Memory reference resolution.
* Structured Memory overrides stale RAG facts.
* Restricted data omitted.
* No direct MongoDB, Redis, or Qdrant access.

#### API tests

* Create run.
* Read run.
* List runs.
* Invalid request.
* Unauthorized project.
* Cross-tenant project.
* Idempotent replay.
* Provider failure.
* Validation failure.
* Feature disabled.
* No execution endpoints.

#### Proposal tests

* Proposal persisted.
* Proposal linked to tenant, project, requester, and run.
* Proposal remains `proposal_only`.
* No business record mutation.
* No mutation event.
* No mutation service called.

#### Integration tests

Use real MongoDB, Redis, and Qdrant where existing test infrastructure supports them.

Verify:

* Real tenant/project filtering.
* Real proposal persistence.
* Real idempotency indexes.
* Real authorized RAG retrieval.
* No business mutations.

#### Frontend tests

* Feature flag.
* Permission guard.
* Form validation.
* Structured output rendering.
* Evidence and missing-data rendering.
* Read-only notice.
* Failure states.
* No execution controls.

#### Regression

Run:

* Milestone 7 tests.
* Milestone 6 agent tests.
* Relevant project/task/auth tests.
* RAG non-integration tests.
* Real-service RAG tests.
* Full backend suite.
* Relevant frontend tests.
* Compile/type/lint checks.

Do not hide failures with broad skips, deleted tests, weakened assertions, or unjustified `xfail`.

---

### Acceptance Criteria

Milestone 7 passes only when:

* Exactly one canonical workflows/user-stories document exists.
* Project Agent uses the existing shared runtime.
* Five generic specialist profiles exist.
* Specialist selection is deterministic.
* Tenant/project authorization is enforced before context retrieval.
* ContextPackageBuilder and ProviderRouter are used.
* Structured Memory and RAG authority rules are respected.
* Structured request and output schemas are validated.
* Evidence and missing data are visible.
* Mutation tools exposed: `0`.
* Execution endpoints added: `0`.
* Business records created by agent tests: `0`.
* Business records updated by agent tests: `0`.
* Business records deleted by agent tests: `0`.
* Mutation events emitted: `0`.
* Every ActionProposal remains `proposal_only`.
* Cross-tenant leakage: `0`.
* Cross-project leakage: `0`.
* Unauthorized record exposure: `0`.
* Prompt-injection safety tests pass.
* Relevant targeted and integration tests pass.
* Full suite results are reported honestly.
* Existing failures remain documented until individually fixed or verified.
* RAG production acceptance is not overstated.
* No Task Performance Agent, Email Draft Agent, connector, scheduling, or mutation execution is introduced.

---

### Required Completion Report

Update this milestone file with concise completion evidence and return:

1. Final status: PASS, PARTIAL, BLOCKED, or FAIL.
2. Preflight findings.
3. Canonical document path.
4. Files created.
5. Files modified.
6. Architecture implemented.
7. Specialists and deterministic selection.
8. APIs added.
9. UI added.
10. Permission and isolation results.
11. Context and evidence results.
12. Read-only verification with mutation counts.
13. Evaluation dataset path and case count.
14. Exact test commands and pass/fail/skip results.
15. Individual classification of remaining full-suite failures.
16. Acceptance criteria matrix.
17. Remaining risks and blockers.
18. Recommended next step.

Do not create a separate completion-report document unless existing repository conventions require it.

---

### Final Restrictions

Do not implement:

* Task Performance Insights Agent.
* General Email Draft Agent.
* Connectors.
* Scheduled agents.
* Celery agent execution.
* Email sending.
* Business mutation execution.
* Approval execution.
* Specialist-to-specialist calls.
* A second agent runtime.
* A second memory/RAG/provider system.

Do not commit, push, open a pull request, deploy, or begin Milestone 8.
