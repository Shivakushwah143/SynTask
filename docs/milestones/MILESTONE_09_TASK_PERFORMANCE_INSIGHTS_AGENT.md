# Milestone 09: Task Performance Insights Agent

Status: Not Started

## Objective

Implement the Task Performance Insights Agent for authorized SynTask managers, administrators, project managers, and team leads.

The agent must calculate operational metrics deterministically from authorized task, EOD, time-tracking, workload, dependency, leave, and project records.

The language model may explain verified metrics, highlight patterns, identify missing data, and recommend operational improvements.

The language model must not calculate canonical metrics from prose, create secret employee scores, rank employees unfairly, or make hiring, firing, salary, promotion, disciplinary, or other employment decisions.

---

## Canonical References

Read and follow:

* `AGENTS.md`
* `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`
* `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`
* `docs/milestones/MILESTONE_07_READ_ONLY_PROJECT_AGENT.md`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`
* `docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md`
* Existing Milestone 6, 7, and 8 agent implementations and tests
* Existing task, project, EOD, time-tracking, attendance, leave, user hierarchy, department, and reporting implementation

Do not duplicate canonical documentation.

---

## Current Platform Status

* RAG and Memory foundation: Implemented; business-corpus production evaluation remains in progress.
* Shared Agent Platform: Completed in Milestone 6.
* Read-only Project Agent: Completed in Milestone 7.
* General Email Draft Agent: In Progress in Milestone 8.
* Task Performance Insights Agent: Planned for Milestone 9.

Search existing documentation for outdated status tables and update them consistently.

Before Milestone 9 completion:

```text
Agent product planning: Complete
Agent architecture planning: Complete
Shared Agent Platform: Completed — Milestone 6
Project Agent: Completed — Milestone 7 read-only pilot
General Email Draft Agent: In Progress — Milestone 8
Task Performance Insights Agent: Planned — Milestone 9
```

After Milestone 9 acceptance:

```text
Task Performance Insights Agent: Completed — Milestone 9
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

Reuse the completed Project Agent and Email Draft Agent architecture patterns where applicable.

Do not create:

* A second agent runtime.
* A second provider abstraction.
* A separate memory or RAG system.
* A second audit system.
* A second permission framework.
* LLM-calculated metric formulas.

---

## Scope

Implement:

* One versioned Task Performance Insights Agent.
* Deterministic canonical metric service.
* Versioned metric dictionary.
* Strict request and output schemas.
* Manager, administrator, project manager, and team-lead authorization.
* Tenant, department, hierarchy, project, and employee scope enforcement.
* Verified task and project metrics.
* EOD data labeled as employee-reported context.
* Missing, stale, conflicting, and insufficient data handling.
* Role-, workload-, task-complexity-, blocker-, dependency-, leave-, and scope-aware explanations.
* Structured performance trends and operational recommendations.
* Read-only recommendations and proposal-only corrective actions.
* Existing AI/Agents UI integration.
* Evaluation dataset.
* Backend, API, permission, fairness, integration, and frontend tests.
* Milestone documentation and completion evidence.

Suggested agent key:

```text
task_performance_insights_agent
```

Suggested initial version:

```text
v1
```

---

## Explicit Exclusions

Do not implement:

* Hiring decisions.
* Firing decisions.
* Promotion decisions.
* Salary recommendations.
* Bonus recommendations.
* Disciplinary decisions.
* Performance improvement plans that automatically change employee records.
* Secret employee scores.
* Public employee rankings.
* Cross-role ranking based on raw task counts.
* Attendance-based productivity scoring.
* Protected-characteristic analysis.
* Medical, disability, religion, race, gender, age, family, or other protected-field analysis.
* Automatic task reassignment.
* Automatic deadline changes.
* Automatic workload redistribution.
* Automatic manager alerts through connectors.
* Scheduled agent runs.
* Celery agent scheduling.
* Email, Microsoft 365, Gmail, SMTP, WhatsApp, Meta, or LinkedIn integration.
* Business mutation execution.
* Approval execution.
* New project-management mutations.
* Milestone 10 or later roadmap work.
* Commits, pushes, pull requests, or deployments.

---

## Access Roles

The agent may be available only to users whose existing permissions authorize performance or operational visibility.

Possible authorized scopes:

* Tenant administrators.
* Company administrators.
* Department managers.
* Project managers.
* Team leads.
* Operations managers.
* Other roles explicitly allowed by existing SynTask permissions.

Authorization must use the existing backend rules.

Do not assume role names alone grant access.

Every request must validate:

* Authenticated active user.
* Tenant membership.
* Role and permission.
* Hierarchy scope.
* Department scope.
* Project scope.
* Employee/user scope.
* Selected date range.
* Selected metric access.
* Record-level access.

A manager must not see employees outside their authorized hierarchy, department, project, or reporting scope.

A project manager must see only accessible project participants and records.

An administrator must still remain tenant-scoped.

Do not reveal unauthorized user names, IDs, metrics, task records, EOD records, leave details, or workload information.

---

## Core Safety Principles

1. Canonical numbers are calculated in application code.
2. The LLM explains metrics; it does not calculate them from prose.
3. Task quantity is not equal to performance quality.
4. EOD content is self-reported context, not unquestionable truth.
5. Attendance is not productivity.
6. Missing data reduces confidence.
7. Approved leave must not be treated as poor performance.
8. Blockers and dependencies must be considered.
9. Task difficulty and role differences must be considered.
10. Scope changes and reassignment history must be considered where available.
11. Small samples must not produce strong conclusions.
12. Facts, employee-reported context, calculations, hypotheses, and recommendations must remain distinguishable.
13. The agent must not make employment decisions.
14. Outputs must be reviewable and auditable.
15. The agent must remain read-only.

---

## Supported Initial Insight Types

Support:

* Team performance summary.
* Department performance summary.
* Project performance summary.
* Individual operational summary only when the requester is explicitly authorized.
* Task completion trends.
* On-time and overdue trends.
* Workload distribution.
* Estimate variance.
* Blocker patterns.
* Dependency delays.
* EOD completeness.
* Task-to-EOD consistency.
* Rework or reopen trends when reliable history exists.
* Scope-change impact when reliable history exists.
* Data-quality assessment.
* Operational improvement recommendations.

Do not support:

* Best employee ranking.
* Worst employee ranking.
* Promotion candidate ranking.
* Termination recommendations.
* Salary or compensation recommendations.
* Disciplinary scoring.
* Hidden “productivity score.”
* Psychological, personality, loyalty, or motivation inference.

---

## Metric Authority

Structured Memory and deterministic services are authoritative for current metrics.

Use RAG only for:

* Approved metric definitions.
* Company performance policies.
* Reporting guidance.
* Role expectations.
* Approved management terminology.
* Coaching guidelines.
* Operational best practices.

Use Working Memory only for resolving conversational references such as:

* “my department”
* “this project”
* “last month”
* “that employee”

Working Memory must not override current Structured Memory facts.

LLM prior knowledge may provide general operational guidance only when clearly labeled and when it does not replace company policy or current business data.

---

## Canonical Metric Service

Implement canonical metrics in deterministic application code.

The metric service must:

* Use explicit formulas.
* Use authorized source records.
* Use tenant-configured timezone.
* Use explicit date ranges.
* Record excluded records.
* Record missing fields.
* Record sample size.
* Record freshness.
* Record formula version.
* Record source references.
* Record confidence inputs.
* Avoid double counting.
* Avoid calculating metrics from free-form LLM output.

Suggested service/module naming should follow repository conventions, for example:

```text
backend/app/services/task_performance_metrics.py
```

Inspect the repository before choosing the final path.

---

## Initial Metric Dictionary

### Completion Rate

```text
completed eligible assigned tasks / total eligible assigned tasks
```

Required fields:

* Task status.
* Assignment.
* Date range.
* Completion timestamp where available.

Rules:

* Exclude cancelled tasks.
* Report excluded records.
* Do not compare raw completion rates across fundamentally different roles without context.

### On-Time Completion Rate

```text
tasks completed on or before due date / completed tasks with due dates
```

Rules:

* Exclude completed tasks without due dates.
* Report exclusion count.
* Respect approved deadline extensions where authoritative.

### Overdue Rate

```text
open overdue tasks / open tasks with due dates
```

Rules:

* Use tenant timezone.
* Exclude tasks without due dates.
* Do not penalize blocked tasks without explaining blockers.

### Blocked Task Rate

```text
blocked eligible tasks / eligible tasks
```

Sources may include:

* Canonical task blocker fields.
* Dependency state.
* Approved blocker records.
* EOD blocker text only as employee-reported context.

Do not treat EOD blocker text as verified task truth.

### Cycle Time

```text
completion timestamp - canonical start timestamp
```

Use:

* First in-progress timestamp when reliable.
* Otherwise approved start date with reduced confidence.

Do not fabricate lifecycle timestamps.

### Estimate Variance

```text
actual effort - estimated effort
```

Also support percentage variance where valid.

Rules:

* Exclude tasks without comparable estimates or actuals.
* Report sample size.
* Separate hours and story points.
* Do not mix units.

### Workload Count

```text
active assigned task count per authorized user
```

Rules:

* Exclude completed and cancelled work.
* Do not treat higher counts as better performance.
* Include task complexity and effort information when available.

### Workload Effort

```text
sum of active estimated hours or active story points
```

Rules:

* Keep hours and story points separate.
* Mark unavailable when estimates are missing.
* Do not convert between units without an approved deterministic rule.

### EOD Completion Rate

```text
submitted expected EODs / expected working days
```

Rules:

* Exclude approved leave.
* Respect configured working days and holidays when available.
* Label missing calendar data.
* Do not treat EOD submission alone as productivity.

### Task-to-EOD Consistency

Compare:

* EOD task references.
* EOD stated status.
* Current canonical task records.

Output:

* Matching records.
* Conflicting records.
* Missing references.
* Employee-reported versus verified facts.

Do not silently replace task facts with EOD text.

### Dependency Delay

```text
tasks delayed by incomplete dependencies / tasks with dependencies
```

Rules:

* Require modeled dependencies.
* Report unavailable when dependency history is insufficient.
* Do not claim direct causation without evidence.

### Reopen or Rework Rate

```text
reopened or reworked tasks / completed tasks
```

Rules:

* Use canonical status history or approved rework markers.
* Do not infer rework solely from comments or prose.
* Mark unavailable when history does not exist.

### Scope Change Impact

Compare baseline with current:

* Task count.
* Estimated effort.
* Dates.
* Milestones.
* Deliverables.

Rules:

* Require reliable baseline/history.
* Mark unavailable when history is incomplete.
* Separate approved scope change from execution delay.

---

## Metric Result Contract

Every deterministic metric result must include:

```json
{
  "metric_key": "string",
  "metric_version": "string",
  "scope_type": "tenant | department | project | team | individual",
  "scope_id": "string",
  "period": {
    "start": "ISO datetime",
    "end": "ISO datetime",
    "timezone": "IANA timezone"
  },
  "value": "number or null",
  "unit": "percentage | count | hours | days | points | ratio | unavailable",
  "numerator": "number or null",
  "denominator": "number or null",
  "sample_size": 0,
  "excluded_record_count": 0,
  "missing_fields": [],
  "conflicts": [],
  "freshness": {
    "as_of": "ISO datetime",
    "stale": false
  },
  "confidence": 0.0,
  "formula": "string",
  "source_record_references": []
}
```

Requirements:

* Confidence must be deterministic or rule-based.
* Formula must be versioned.
* Source references must be authorized.
* Missing values must remain missing.
* Unavailable metrics must not be converted to zero.
* Excluded record count must be visible.
* Sample size must be visible.

---

## Request Schema

Implement a strict versioned request schema.

Logical contract:

```json
{
  "schema_version": "1.0",
  "insight_type": "team_summary | department_summary | project_summary | individual_summary | completion_trends | overdue_trends | workload_distribution | estimate_variance | blocker_patterns | dependency_delays | eod_completeness | task_eod_consistency | rework_trends | scope_change_impact | data_quality",
  "scope": {
    "department_id": "optional string",
    "project_id": "optional string",
    "team_id": "optional string",
    "user_id": "optional string"
  },
  "date_range": {
    "start": "ISO date or datetime",
    "end": "ISO date or datetime"
  },
  "comparison_period": {
    "start": "optional ISO date or datetime",
    "end": "optional ISO date or datetime"
  },
  "metric_keys": [],
  "user_request": "optional string",
  "preferences": {
    "language": "optional string",
    "detail_level": "concise | standard | detailed",
    "format": "summary | report | dashboard"
  },
  "idempotency_key": "string"
}
```

Requirements:

* Validate dates.
* End must be after start.
* Apply maximum date-range limits when appropriate.
* Validate requested scope.
* Reject unauthorized employee, project, department, or team IDs.
* Reject unsupported metrics.
* Reject raw formulas supplied by the client.
* Reject tenant/user overrides.
* Reject arbitrary metric definitions.
* Reject prompt or policy overrides.
* Personalization may change presentation only.
* Personalization must not change metric values, confidence, warnings, permissions, or policy.

---

## Output Schema

Implement a strict versioned output schema.

Logical contract:

```json
{
  "schema_version": "1.0",
  "agent": {
    "key": "task_performance_insights_agent",
    "version": "string"
  },
  "agent_run_id": "string",
  "scope": {
    "type": "tenant | department | project | team | individual",
    "id": "string",
    "label": "permission-safe string"
  },
  "period": {
    "start": "ISO datetime",
    "end": "ISO datetime",
    "timezone": "string"
  },
  "summary": "string",
  "metrics": [],
  "verified_findings": [],
  "employee_reported_context": [],
  "data_quality": {
    "missing_data": [],
    "conflicts": [],
    "stale_sources": [],
    "excluded_records": [],
    "sample_size_warnings": []
  },
  "insights": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "fact_or_hypothesis": "fact | hypothesis",
      "severity": "informational | low | medium | high",
      "metric_references": [],
      "record_references": [],
      "assumptions": [],
      "confidence": 0.0
    }
  ],
  "recommendations": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "owner_role_suggestion": "optional string",
      "expected_operational_outcome": "optional string",
      "metric_references": [],
      "evidence_references": [],
      "confidence": 0.0,
      "mutation_status": "proposal_only"
    }
  ],
  "fairness_warnings": [],
  "limitations": [],
  "approval_required": true,
  "read_only": true,
  "generated_at": "ISO datetime"
}
```

Required invariants:

* `read_only` must always equal `true`.
* Recommendations must remain `proposal_only`.
* Metrics must come from deterministic application code.
* The LLM must not alter metric values.
* EOD content must be labeled employee-reported.
* Hypotheses must not be presented as facts.
* Missing data must not be interpreted as poor performance.
* Approved leave must not be treated as negative performance.
* Sensitive or protected fields must not appear.
* Confidence must be bounded.
* Individual-level results require explicit authorization.
* No hidden score may be generated.

---

## Explanation Layer

The LLM may:

* Explain metric changes.
* Summarize trends.
* Identify likely contributing factors.
* Highlight missing data.
* Explain conflicts.
* Suggest operational improvements.
* Suggest questions managers should investigate.
* Suggest proposal-only corrective actions.

The LLM must not:

* Recalculate canonical metrics.
* Modify metric values.
* Invent missing records.
* Infer motivation, loyalty, attitude, personality, or intent.
* Recommend firing, promotion, salary, discipline, or punishment.
* Declare an employee “good,” “bad,” “lazy,” or “underperforming” based on incomplete data.
* Rank employees by raw task count.
* Treat correlation as proven causation.
* Use protected characteristics.
* Generate undisclosed composite employee scores.

---

## EOD Handling

EOD reports are employee-reported operational context.

They may provide:

* Reported completed tasks.
* Reported in-progress tasks.
* Reported blockers.
* Reported plans.
* Reported comments.

They must not automatically override:

* Canonical task status.
* Assignment.
* Due date.
* Completion time.
* Time logs.
* Approved leave.
* Dependency state.
* Project history.

When EOD and task records conflict:

* Preserve both.
* Label task record as verified structured fact.
* Label EOD as employee-reported.
* Record conflict.
* Reduce confidence.
* Avoid punitive conclusions.

Missing EOD submissions must be interpreted according to:

* Expected working days.
* Approved leave.
* Holidays.
* Role policy.
* Data availability.

Do not treat a missing EOD as proof of poor performance.

---

## Leave and Availability Handling

Use approved leave and availability only when authorized.

Rules:

* Approved leave must not reduce performance ratings.
* Leave must be excluded from expected EOD days.
* Leave may explain reduced availability.
* Medical or leave reasons must not be exposed unless explicitly authorized and required.
* Do not reveal protected health information.
* Do not infer health or personal circumstances.
* Use only minimum necessary availability data.

---

## Role and Work Complexity

Comparisons must consider:

* Role.
* Department.
* Task category.
* Task complexity.
* Estimate.
* Dependencies.
* Blockers.
* Scope changes.
* Rework causes.
* Project conditions.
* Availability.
* Data completeness.

Do not compare:

* Developers and designers using raw task count.
* Managers and individual contributors using the same output expectations.
* Simple and complex tasks as equivalent.
* Blocked and unblocked work without context.
* Full-period and partial-period employees without normalization.

Cross-role ranking is prohibited in the initial release.

---

## Read-Only Boundary

The agent may propose:

* Clarification requests.
* Data-quality corrections.
* Workload review.
* Dependency review.
* Estimate review.
* Task-planning review.
* Manager follow-up.
* Coaching discussion.
* Process improvements.
* Additional tracking requirements.

It must not:

* Reassign tasks.
* Change deadlines.
* Change estimates.
* Change priorities.
* Change employee records.
* Change leave records.
* Change EOD records.
* Create disciplinary records.
* Create salary or promotion recommendations.
* Send notifications.
* Execute corrective actions.
* Publish mutation events.
* Expose mutation tools or endpoints.

Required counts:

```text
Business records created: 0
Business records updated: 0
Business records deleted: 0
Mutation tools exposed: 0
Execution endpoints added: 0
Employment decisions generated: 0
Secret employee scores generated: 0
```

---

## Tool Registry

Use deny-by-default.

Allowed capabilities must be limited to governed read-only context and deterministic metric services.

Do not register:

* Task mutation tools.
* User mutation tools.
* Assignment tools.
* Deadline tools.
* HR action tools.
* Payroll tools.
* Notification sending tools.
* Connector tools.
* Arbitrary HTTP tools.
* Scheduling tools.

Add tests proving forbidden tools are unavailable.

---

## API Scope

Extend the existing feature-flagged agent API using repository conventions.

Logical operations:

* Create Task Performance Insights run.
* Read one authorized run.
* List authorized runs for a selected scope when consistent with existing agent history.
* Retrieve deterministic metric evidence where current API architecture permits.

Suggested logical endpoint:

```text
POST /api/v1/agents/task-performance/runs
```

Use actual repository routing conventions after inspection.

Requirements:

1. Authenticate.
2. Resolve tenant from authentication.
3. Validate role, hierarchy, department, project, team, and employee scope.
4. Validate date range and requested metrics.
5. Calculate deterministic metrics.
6. Build a bounded ContextPackage.
7. Use RAG only for approved definitions and guidance.
8. Call the LLM only through ProviderRouter.
9. Validate output.
10. Persist sanitized run and audit events.
11. Persist proposal-only recommendations where appropriate.
12. Apply idempotency and budgets.
13. Return safe output.

Do not add:

* Employee-score endpoint.
* Employee-ranking endpoint.
* Discipline endpoint.
* Reassignment endpoint.
* Deadline-change endpoint.
* Approval execution endpoint.
* Scheduled agent endpoint.
* Connector endpoint.

---

## UI Scope

Inspect the existing AI/Agents experience and design system.

Add Task Performance Insights to the existing AI/Agents experience.

Do not create:

* A duplicate AI Hub.
* A surveillance dashboard.
* A secret manager-only scoring page.
* A public employee leaderboard.
* An HR decision system.

Provide:

* Insight type selector.
* Scope selector.
* Department/project/team selector where authorized.
* Individual selector only where explicitly permitted.
* Date range.
* Comparison period.
* Metric selector.
* Generate Insights action.
* Metric cards.
* Trend summaries.
* Data-quality warnings.
* Verified-fact labels.
* Employee-reported labels.
* Missing-data indicators.
* Conflict indicators.
* Confidence.
* Recommendations.
* Evidence/source references.
* Read-only notice.
* Run history where consistent with existing UI.

Display prominently:

```text
Operational insights only. SynTask does not make hiring, firing, salary, promotion or disciplinary decisions.
```

For individual views, display:

```text
Results depend on role, task complexity, blockers, dependencies, scope changes, availability and data completeness. Raw task counts are not a performance rating.
```

Do not add:

* Rank employees.
* Best/worst employee.
* Terminate.
* Promote.
* Reduce salary.
* Disciplinary action.
* Automatically reassign.
* Apply recommendation.
* Execute action.

---

## UI States

Handle:

* Feature disabled.
* Unauthenticated.
* Unauthorized scope.
* Empty scope.
* Invalid date range.
* No data.
* Missing data.
* Stale data.
* Conflicting EOD/task data.
* Insufficient sample size.
* Loading.
* Metric calculation.
* Explanation generation.
* Provider failure.
* Budget rejection.
* Validation failure.
* Completed.
* Partial result.
* Stale result.

Do not expose stack traces, protected data, raw prompts, hidden policy text, or provider secrets.

---

## Evaluation Dataset

Create a version-controlled synthetic or anonymized evaluation dataset.

Include at least:

### Metric correctness

* Completion rate.
* On-time completion.
* Overdue rate.
* Blocked rate.
* Cycle time.
* Estimate variance.
* Workload count.
* Workload effort.
* EOD completion.
* Task-to-EOD consistency.
* Dependency delay.
* Rework rate with valid history.
* Rework rate without valid history.
* Scope-change impact with baseline.
* Scope-change impact without baseline.

### Authorization

* Authorized tenant admin.
* Authorized department manager.
* Authorized project manager.
* Authorized team lead.
* Unauthorized employee.
* Cross-department request.
* Cross-project request.
* Cross-tenant request.
* Unauthorized individual view.
* Unauthorized run retrieval.

### Data quality

* Missing due dates.
* Missing estimates.
* Missing actual effort.
* Missing status history.
* Stale task data.
* Missing EODs.
* Conflicting EOD/task status.
* Missing dependency data.
* Small sample size.
* Partial date range.
* Duplicate records.
* Approved deadline extension.
* Approved leave.
* Missing leave calendar.
* Scope change.

### Fairness and safety

* High task count but low complexity.
* Low task count but high complexity.
* Employee with many blockers.
* Employee on approved leave.
* Different roles with different task types.
* Request to rank employees.
* Request to identify worst employee.
* Request to recommend termination.
* Request to recommend promotion.
* Request to recommend salary change.
* Request to create secret score.
* Request to infer motivation.
* Request to use attendance as productivity.
* Request to expose medical leave details.
* Request to use protected characteristics.

### Prompt injection

* EOD text instructing policy override.
* Task description instructing metric manipulation.
* RAG policy document containing malicious instructions.
* User asking the agent to alter canonical numbers.
* User asking to hide warnings.
* User asking to ignore missing data.

### Runtime

* Provider timeout.
* Invalid provider output.
* One repair succeeds.
* Repair fails.
* Budget rejection.
* Duplicate idempotency key.
* Feature flag disabled.
* Oversized request.

For every case include:

* Case ID.
* Scope.
* Input records.
* Authorized user.
* Expected metric values.
* Expected excluded records.
* Expected warnings.
* Expected authorization result.
* Expected fairness behavior.
* Expected refusal behavior.
* Expected explanation constraints.
* Expected proposal-only behavior.

---

## Tests

Follow existing repository test conventions.

### Metric unit tests

Test exact formulas for:

* Completion rate.
* On-time completion.
* Overdue rate.
* Blocked rate.
* Cycle time.
* Estimate variance.
* Workload count.
* Workload effort.
* EOD completion.
* Task-to-EOD consistency.
* Dependency delay.
* Rework rate.
* Scope-change impact.

Test:

* Missing fields.
* Excluded records.
* Date boundaries.
* Timezone correctness.
* Sample sizes.
* Division by zero.
* Mixed units.
* Stale data.
* Duplicate records.
* Approved extensions.
* Approved leave.

### Contract tests

Test:

* Agent registration and version.
* Request schema.
* Output schema.
* `read_only = true`.
* `mutation_status = proposal_only`.
* Metric references.
* Confidence bounds.
* EOD labeling.
* Fact/hypothesis distinction.
* Missing-data representation.
* Fairness warnings.
* Prohibited decision output.

### Permission tests

Test:

* Tenant admin.
* Department manager.
* Project manager.
* Team lead.
* Unauthorized employee.
* Cross-department access.
* Cross-project access.
* Cross-tenant access.
* Unauthorized individual access.
* Unauthorized run access.
* Unauthorized record existence not leaked.

### Fairness and safety tests

Test:

* No secret employee scores.
* No cross-role raw-count ranking.
* No attendance productivity scoring.
* Approved leave exclusion.
* Blocker context.
* Task complexity context.
* Dependency context.
* Scope-change context.
* No protected characteristics.
* No hiring/firing/promotion/salary/discipline recommendations.
* No personality or motivation inference.

### EOD tests

Test:

* EOD labeled employee-reported.
* Task records remain authoritative.
* Conflicts preserved.
* Missing EOD not automatically negative.
* Approved leave excluded.
* Prompt injection in EOD ignored.
* EOD prose does not directly calculate metrics.

### Context tests

Test:

* ContextPackageBuilder used.
* Structured Memory supplies metrics and current facts.
* RAG supplies approved metric definitions and guidance.
* Working Memory resolves references only.
* Structured Memory overrides stale RAG facts.
* No direct MongoDB, Redis, or Qdrant access from agent logic.
* Restricted records omitted.

### API tests

Test:

* Create insight run.
* Read authorized run.
* List authorized runs where implemented.
* Invalid date range.
* Invalid metric.
* Unauthorized scope.
* Cross-tenant scope.
* Provider failure.
* Validation failure.
* Idempotent replay.
* Budget rejection.
* Feature disabled.
* Safe serialization.
* No ranking or mutation endpoints.

### Proposal tests

Test:

* Recommendations persist only as proposal-only records where applicable.
* No tasks or users are modified.
* No mutation event emitted.
* No assignment, deadline, or HR action services called.
* Execution unavailable.

### Audit tests

Test:

* Agent version.
* Requesting identity.
* Tenant and scope.
* Date range.
* Metric formula versions.
* Source references.
* Missing-data metadata.
* Provider/model metadata.
* Token/cost usage.
* Idempotency.
* Sanitization.
* No protected or raw context persistence.

### Integration tests

Use real services where existing infrastructure supports them:

* MongoDB for task/EOD/run/audit fixtures.
* Redis for Working Memory.
* Qdrant for approved metric-policy retrieval.
* Existing tenant and permission filtering.

Verify:

* Real metric calculations.
* Real hierarchy filtering.
* Real tenant isolation.
* Real idempotency.
* Real run persistence.
* Real RAG permission filtering.
* No business mutations.

### Frontend tests

Test:

* Existing AI/Agents integration.
* Feature flag.
* Permission behavior.
* Scope selector.
* Date validation.
* Metric cards.
* Data-quality warnings.
* Verified versus employee-reported labels.
* Fairness notice.
* Individual-view warning.
* No ranking controls.
* No HR decision controls.
* No mutation controls.
* Failure states.

### Regression tests

Run:

* Milestone 9 tests.
* Milestone 8 Email Draft tests.
* Milestone 7 Project Agent tests.
* Milestone 6 foundation tests.
* Relevant auth, task, project, EOD, leave, hierarchy, and reporting tests.
* RAG non-integration tests.
* Real MongoDB/Redis/Qdrant tests.
* Relevant frontend tests.
* Full backend suite.
* Relevant frontend suite.
* Compile/type/lint checks.

Do not hide failures using broad skips, deleted tests, weakened assertions, or unjustified `xfail`.

---

## Acceptance Criteria

Milestone 9 passes only when:

### Architecture

* Task Performance Insights Agent uses the existing shared runtime.
* Canonical metrics are calculated deterministically.
* ProviderRouter is used only for explanation.
* ContextPackageBuilder is used.
* No second runtime or metric architecture exists.
* Agent logic does not directly access MongoDB, Redis, or Qdrant.

### Metric correctness

* Formula correctness equals 100% for deterministic fixtures.
* Time range correctness equals 100%.
* Timezone correctness equals 100%.
* Missing values are not treated as zero.
* Exclusions and sample size are visible.
* EOD prose does not calculate canonical metrics.
* LLM output cannot modify metric values.

### Authorization

* Permission enforcement equals 100%.
* Cross-tenant leakage equals zero.
* Cross-project leakage equals zero.
* Cross-department leakage equals zero.
* Unauthorized individual insight equals zero.
* Unauthorized record disclosure equals zero.

### Fairness and safety

* Protected-characteristic usage equals zero.
* Secret employee scores equal zero.
* Hiring decisions equal zero.
* Firing decisions equal zero.
* Promotion decisions equal zero.
* Salary decisions equal zero.
* Disciplinary decisions equal zero.
* Attendance-only productivity scoring equals zero.
* Cross-role raw-task-count ranking equals zero.
* Approved leave penalty equals zero.



### Data interpretation

* EOD content is labeled employee-reported.
* Structured task facts remain authoritative.
* Conflicting data is visible.
* Missing data reduces confidence.
* Blockers and dependencies are considered.
* Task complexity and role are considered.
* Scope changes are considered when data exists.
* Small samples produce warnings.

### Read-only boundary

* Business records created equal zero.
* Business records updated equal zero.
* Business records deleted equal zero.
* Mutation tools exposed equal zero.
* Execution endpoints added equal zero.
* Mutation events emitted equal zero.
* Recommendations remain proposal-only.

### UI

* Agent is integrated into the existing AI/Agents experience.
* Authorization controls are enforced.
* Metric formulas and data quality are understandable.
* Verified and employee-reported data are distinguishable.
* Fairness warnings are visible.
* No employee leaderboard exists.
* No HR decision or mutation controls exist.

### Verification

* Targeted Milestone 9 tests pass.
* Milestone 6, 7, and 8 regressions pass.
* Relevant task/EOD/leave/hierarchy tests pass.
* Real-service tests pass where applicable.
* Full-suite results are reported honestly.
* Remaining failures are individually classified when relevant.
* RAG business-corpus production evaluation is not overstated.
* No later milestone functionality is introduced.

---

## Implementation Progress

* [x] Repository and documentation preflight completed.
* [ ] Outdated milestone/status displays updated.
* [ ] Metric source models and permission paths inspected.
* [ ] Metric dictionary finalized and versioned.
* [ ] Deterministic metric service implemented.
* [ ] Completion-rate metric implemented.
* [ ] On-time completion metric implemented.
* [ ] Overdue-rate metric implemented.
* [ ] Blocked-task metric implemented.
* [ ] Cycle-time metric implemented.
* [ ] Estimate-variance metric implemented.
* [ ] Workload-count metric implemented.
* [ ] Workload-effort metric implemented.
* [ ] EOD-completion metric implemented.
* [ ] Task-to-EOD consistency metric implemented.
* [ ] Dependency-delay metric implemented.
* [ ] Reopen/rework metric implemented or safely unavailable.
* [ ] Scope-change metric implemented or safely unavailable.
* [ ] Agent definition implemented.
* [ ] Request schema implemented.
* [ ] Output schema implemented.
* [ ] Permission and hierarchy validation implemented.
* [ ] ContextPackage profile implemented.
* [ ] RAG policy/definition retrieval implemented.
* [ ] Explanation-only ProviderRouter flow implemented.
* [ ] Read-only API implemented.
* [ ] Run retrieval/history implemented where applicable.
* [ ] Proposal-only recommendation handling implemented.
* [ ] Fairness and prohibited-decision controls implemented.
* [ ] Metric unit tests passing.
* [ ] Permission tests passing.
* [ ] EOD conflict tests passing.
* [ ] Fairness and safety tests passing.
* [ ] Existing AI/Agents UI entry implemented.
* [ ] Scope/date/metric selectors implemented.
* [ ] Metric result view implemented.
* [ ] Data-quality and fairness warnings implemented.
* [ ] Frontend tests passing.
* [ ] Evaluation dataset implemented.
* [ ] Evaluation validation tests passing.
* [ ] Real-service integration tests passing.
* [ ] Milestone 6, 7, and 8 regression tests passing.
* [ ] Full backend/frontend verification completed.
* [ ] Mutation-count proof completed.
* [ ] Employment-decision zero-count proof completed.
* [ ] Existing relevant backend failures individually classified.
* [ ] Documentation synchronized.
* [ ] Final completion report recorded.
* [ ] Milestone status changed to Completed.

---

## Completion Evidence

### Repository and Documentation Preflight

Completed on 2026-07-21.

Files reviewed:

* `AGENTS.md`
* `docs/milestones/MILESTONE_09_TASK_PERFORMANCE_INSIGHTS_AGENT.md`
* `docs/milestones/MILESTONE_08_GENERAL_EMAIL_DRAFT_AGENT.md`
* `docs/milestones/MILESTONE_07_READ_ONLY_PROJECT_AGENT.md`
* `docs/SynTask_Phase_2_Agent_Platform_Implementation_Plan.md`
* `docs/SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories.md`
* `docs/architecture/decisions/2026-07-20-phase-2-rag-foundation.md`

Preflight findings:

* Milestone 9 is still at initial implementation state; no Task Performance Insights Agent code was added in this stage.
* Milestone 8 is currently recorded as blocked pending real-service and full-suite verification.
* `docs/milestones/MILESTONE_09_TASK_PERFORMANCE_INSIGHTS_AGENT.md` still contains outdated Milestone 8 status text that says General Email Draft Agent is in progress.
* Current repository contains uncommitted Milestone 7 and Milestone 8 implementation/documentation changes that must not be reverted or repeated.
* First next open item remains status-display synchronization.

Tests:

* `python -m pytest backend\tests\agents\test_project_agent_contract.py backend\tests\agents\test_email_draft_contract.py -q` — 17 passed in 6.43s.

For every completed checklist item record:

* Files.
* Formula or behavior.
* Permission evidence.
* Tests.
* Pass/fail/skip counts.
* Data-quality behavior.
* Fairness and safety evidence.
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

List only implemented capabilities and metrics.

### 3. Explicitly Excluded Scope

Confirm no employment decisions, secret scoring, connectors, scheduling, mutation execution, later milestones, commits, pushes, pull requests, or deployments were implemented.

### 4. Files Created

List exact paths.

### 5. Files Modified

List exact paths.

### 6. Metric Dictionary

For every metric report:

* Key.
* Version.
* Formula.
* Required fields.
* Exclusions.
* Missing-data behavior.
* Timezone behavior.
* Test evidence.
* Availability status.

### 7. Agent Definition and Schemas

Report:

* Agent key.
* Version.
* Request schema.
* Output schema.
* Read-only invariants.
* Fairness invariants.
* EOD labeling.

### 8. API Behavior

Report:

* Method.
* Path.
* Permission.
* Feature flag.
* Request/response schema.
* Read-only behavior.

### 9. UI Behavior

Report:

* Entry point.
* Scope selectors.
* Metric selectors.
* Warnings.
* Evidence.
* Fairness notices.
* Confirmation that no ranking, employment-decision, or mutation controls exist.

### 10. Permission Verification

Report:

* Tenant admin.
* Department manager.
* Project manager.
* Team lead.
* Unauthorized employee.
* Cross-department.
* Cross-project.
* Cross-tenant.
* Unauthorized individual.
* Unauthorized run access.

### 11. Metric Correctness

Report exact fixture results for:

* Formula correctness.
* Date-range correctness.
* Timezone correctness.
* Missing-data behavior.
* Exclusion handling.
* Sample-size handling.
* Conflict handling.

### 12. EOD Verification

Report:

* EOD employee-reported labeling.
* Structured task authority.
* Conflict preservation.
* Missing EOD behavior.
* Approved leave behavior.
* Prompt-injection behavior.

### 13. Fairness and Safety Proof

Report counts for:

* Secret scores.
* Employee rankings.
* Hiring recommendations.
* Firing recommendations.
* Promotion recommendations.
* Salary recommendations.
* Disciplinary recommendations.
* Protected-characteristic usage.
* Attendance-only scoring.
* Approved-leave penalties.
* Unauthorized individual disclosures.

All counts must equal zero.

### 14. Read-Only Proof

Report counts for:

* Business records created.
* Business records updated.
* Business records deleted.
* Mutation tools exposed.
* Execution endpoints added.
* Mutation events emitted.
* Non-proposal recommendations executed.

All counts must equal zero.

### 15. Evaluation Dataset

Report:

* Path.
* Case count.
* Categories.
* Synthetic/anonymized status.

### 16. Test Results

Provide exact commands and:

* Passed.
* Failed.
* Skipped.
* Duration when available.

Include:

* Metric tests.
* Agent tests.
* Permission tests.
* EOD tests.
* Fairness tests.
* API tests.
* Integration tests.
* Frontend tests.
* Milestone 6, 7, and 8 regressions.
* Full backend suite.
* Relevant frontend suite.
* Compile/type/lint checks.

### 17. Existing Failure Classification

For every relevant remaining failure report:

* Test name.
* Failure reason.
* Whether pre-existing.
* Whether related to Milestone 9.
* Security or release impact.
* Evidence.
* Recommended follow-up.

### 18. Acceptance Matrix

Mark each acceptance criterion:

* PASS
* PARTIAL
* FAIL
* BLOCKED

Include evidence.

### 19. Status Table Updates

List all status displays/documents updated.

### 20. Remaining Risks and Blockers

Include:

* Existing full-suite failures.
* Incomplete RAG business-corpus production evaluation.
* Missing task history or metric prerequisites.
* Any later milestone prerequisites.

### 21. Recommended Next Step

Recommend only:

* Continue Milestone 9 remediation.
* Begin next milestone planning.
* Begin next milestone implementation only after explicit authorization.
* Stop because a security, fairness, or architecture blocker remains.

Do not begin the next milestone.

### 22. Git and Deployment Confirmation

State:

* No commit was created.
* No push was performed.
* No pull request was opened.
* No deployment was performed.

---

## Final Restrictions

Do not:

* Generate secret employee scores.
* Rank employees.
* Make hiring, firing, salary, promotion, bonus, or disciplinary decisions.
* Use protected characteristics.
* Treat attendance as productivity.
* Penalize approved leave.
* Treat EOD prose as verified truth.
* Let the LLM calculate canonical metrics.
* Modify tasks, users, projects, EODs, leave, or HR records.
* Add mutation or execution endpoints.
* Add connectors or scheduling.
* Implement a later milestone.
* Commit.
* Push.
* Open a pull request.
* Deploy.

Stop after Milestone 9 completion and verification.
