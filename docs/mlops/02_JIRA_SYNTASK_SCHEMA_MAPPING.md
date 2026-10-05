# Jira to SynTask Schema and Prediction-Stage Mapping

## Scope

Step 04 only: schema and prediction-stage mapping between the EMSE2017 delayed-issue dataset and SynTask task-risk concepts.

Read first:

- `SynTask/docs/mlops/01_DATASET_AUDIT.md`

SynTask code inspected:

- `backend/app/models/task.py`
- `backend/app/models/project.py`
- `backend/app/models/changelog.py`
- `backend/app/models/time_tracking.py`
- `backend/app/models/issue_linking.py`
- `backend/app/models/issue_types.py`
- `backend/app/models/versions.py`
- `backend/app/models/components.py`
- `backend/app/services/task_service.py`
- `backend/app/services/task_workflow.py`
- `backend/app/services/task_health_service.py`

No model training. No SynTask application behavior changed.

## Identity And Label Rules

External Jira dataset identity must be `(project, issuekey)`, not raw `issuekey`, because raw `issuekey` repeats across projects.

`delaydays` is only label source:

- Binary label: `delaydays > 0`
- On-time label: `delaydays == 0`
- Regression-style days-late label could use positive magnitude, but that is outside this step.

`delaydays` must never be used as a prediction feature.

## SynTask Evidence Summary

SynTask task facts already stored:

- Core task fields: `title`, `description`, `company_id`, `project_id`, `created_by`, `assigned_to`, `assigned_by`, `assigned_at`, `status`, `priority`, `progress_percentage`, `due_date`, `start_date`, `completed_at`, `health_status`, `created_at`, `updated_at`.
- Work planning fields: `estimated_hours`, `actual_hours`, `story_points`, `checklist`, `dependencies`, `parent_task_id`, `epic_id`, `sprint_id`.
- Jira-like fields: `issue_type_id`, `component_id`, `fix_version_id`, `affects_version_ids`, `resolution`, `resolved_at`, `resolved_by`.
- Review workflow fields: `review_required`, `reviewer_id`, `review_round`, `submitted_for_review_at`, `revision_requested_at`, `approved_at`.
- Comments: `TaskComment` has `task_id`, `company_id`, `user_id`, `content`, timestamps.
- Changelog: `ChangeLog` stores `task_id`, `field`, `field_type`, old/new values, timestamps.
- Time tracking: `TimeLog`, `ActiveTimeSession`, `TimeTrackingSummary`.
- Issue links: `IssueLink` supports `blocks`, `is_blocked_by`, `depends_on`, and related link types.
- Assignment/workload: task queries and `TaskService.workload_snapshot` can count assigned work by status/priority/assignee.

## Feature Classification

Classification meanings:

- DIRECT: SynTask stores equivalent field.
- DERIVED: Can be calculated from existing SynTask data.
- APPROXIMATE: Similar SynTask signal exists but semantics differ.
- UNAVAILABLE: SynTask cannot currently reproduce it.
- LEAKAGE / TARGET: Must never be used as prediction feature.

| Jira feature | Class | SynTask source | Notes |
|---|---|---|---|
| `issuekey` | LEAKAGE / TARGET | External import identity only | Use `(project, issuekey)` for audit joins; do not train on raw identifier. |
| `delaydays` | LEAKAGE / TARGET | Label derived from `completed_at/resolved_at - due_date` | Target only. |
| `openeddate` | DIRECT | `Task.created_at` | Use for time splits/cohorting; raw date as feature can encode time leakage/drift. |
| `type` | DIRECT | `Task.issue_type_id`, `IssueType.name/category`; partial fallback `Task.task_type` | Direct if issue type is populated; Jira categories need normalization to SynTask types. |
| `discussion` | APPROXIMATE | `created_at` to first start/review/comment window, `TaskComment`, `ChangeLog`, workflow timestamps | SynTask has no explicit "discussion ended" event. |
| `repetition` | DERIVED | workflow `reopen` changelog/timeline, `review_round`, `revision_requested_at`, `TaskStatus.REVISION_REQUIRED` | Jira means reopened issue count; SynTask can derive reopen/revision cycles but semantics differ by workflow path. |
| `perofdelay` | DERIVED | historical completed tasks per assignee with `completed_at > due_date` | Can derive tenant-safe assignee late-history at assignment/prediction time; must exclude current/future tasks. |
| `workload` | DERIVED | open tasks assigned to same user before prediction time; `TaskService.workload_snapshot` concept | Can compute count of open assigned tasks, optionally weighted by priority/status/estimate. |
| `priority` | DIRECT | `Task.priority` | Values differ: Jira has `Blocker/Trivial`; SynTask has `low/medium/high/critical`. Needs mapping and missing handling. |
| `no_comment` | DERIVED | count `TaskComment` rows before prediction time | Direct collection exists; numeric feature is derived. |
| `no_priority_change` | DERIVED | count `ChangeLog` rows where `field=priority` or `field_type=priority` before prediction time | Depends on consistent changelog writes. |
| `no_fixversion` | DIRECT | `Task.fix_version_id` | SynTask stores one fix version, not list. Count is 0/1 unless model changes. |
| `no_fixversion_change` | DERIVED | `ChangeLog` on `fix_version_id` before prediction time | Depends on version-change logging. |
| `no_issuelink` | DERIVED | count `IssueLink` rows for source/destination task before prediction time | SynTask has link model. |
| `no_blocking` | DERIVED | count `IssueLink.link_type=blocks` or inverse `is_blocked_by`; plus tasks depending on this task | Direction must be defined. |
| `no_blockedby` | DERIVED | count `Task.dependencies` and/or `IssueLink.link_type=is_blocked_by/depends_on` | SynTask has both `dependencies` and issue links; pick canonical source later. |
| `no_affectversion` | DIRECT | `Task.affects_version_ids` | Stored list; feature is list length. |
| `reporterrep` | APPROXIMATE | `created_by` history: created tasks completed by same user, or creator completion quality | Jira reporter reputation formula uses opened-and-fixed overlap; SynTask creator/assignee roles differ. |
| `no_des_change` | DERIVED | `ChangeLog` on `description` before prediction time | Requires description updates to be logged. |
| `ProgressTime` | DERIVED | `prediction_time - Task.created_at` | Legitimate if prediction_time is defined. Dataset has 2 negative discussion rows in Jira project; investigate before use. |
| `RemainingDay` | DERIVED | `Task.due_date - prediction_time` | Legitimate only when due date exists at prediction time. |
| `topic_10` | DERIVED | NLP over `Task.description`/title at prediction time | SynTask stores text; Jira LDA topic id itself is dataset-specific and not reusable. |
| `topic_100` | DERIVED | NLP over `Task.description`/title at prediction time | Same as above. |
| `topic_200` | DERIVED | NLP over `Task.description`/title at prediction time | Same as above. |
| `topic_300` | DERIVED | NLP over `Task.description`/title at prediction time | Same as above. |
| `topic_400` | DERIVED | NLP over `Task.description`/title at prediction time | Same as above. |

## Point-In-Time Availability Matrix

Legend:

- Yes: legitimately knowable at stage.
- Conditional: knowable only if underlying event/data already exists by that stage.
- No: not knowable at stage.
- Target: label only.
- ID: identity only, not feature.

SynTask stages:

- Creation stage: immediately after `Task` insert.
- Active-work/discussion stage: after assignment/work has begun and comments/workflow activity may exist.
- Near-due stage: scheduled scoring window before `due_date`, using facts up to scoring time.

| Feature | Creation | Active-work/discussion | Near-due | Notes |
|---|---|---|---|---|
| `issuekey` | ID | ID | ID | External identity only. |
| `delaydays` | Target | Target | Target | Available only after completion; label only. |
| `openeddate` | Yes | Yes | Yes | `created_at`. Use for splitting, not raw feature unless justified. |
| `type` | Conditional | Conditional | Conditional | Yes if `issue_type_id` set at creation or before score. |
| `discussion` | No | Conditional | Conditional | Need SynTask event definition; comments/workflow elapsed time can approximate. |
| `repetition` | No | Conditional | Conditional | Reopen/revision events only after they happen. |
| `perofdelay` | Conditional | Conditional | Conditional | Assignee history knowable if assignee exists; computed only from prior completed tasks. |
| `workload` | Conditional | Conditional | Conditional | Knowable once assignee exists; at creation if task is created assigned. |
| `priority` | Yes | Yes | Yes | Default `medium` means always populated in SynTask. |
| `no_comment` | 0/Conditional | Conditional | Conditional | Usually 0 at creation; valid count before score. |
| `no_priority_change` | 0 | Conditional | Conditional | Valid count before score. |
| `no_fixversion` | Conditional | Conditional | Conditional | Valid if `fix_version_id` set by stage. |
| `no_fixversion_change` | 0 | Conditional | Conditional | Valid count before score. |
| `no_issuelink` | Conditional | Conditional | Conditional | Valid if links/dependencies exist by stage. |
| `no_blocking` | Conditional | Conditional | Conditional | Valid if issue links/dependencies exist by stage. |
| `no_blockedby` | Conditional | Conditional | Conditional | Valid if dependencies exist by stage. |
| `no_affectversion` | Conditional | Conditional | Conditional | Valid if `affects_version_ids` set by stage. |
| `reporterrep` | Conditional | Conditional | Conditional | Historical aggregate knowable at all stages, if policy allows. |
| `no_des_change` | 0 | Conditional | Conditional | Valid count before score. |
| `ProgressTime` | Yes, usually 0 | Yes | Yes | Must be non-negative in SynTask; Jira negative rows are data anomaly. |
| `RemainingDay` | Conditional | Conditional | Yes | Requires `due_date`; strongest at near-due scoring. |
| `topic_10` | Conditional | Conditional | Conditional | Knowable if description/title exists by stage. |
| `topic_100` | Conditional | Conditional | Conditional | Same. |
| `topic_200` | Conditional | Conditional | Conditional | Same. |
| `topic_300` | Conditional | Conditional | Conditional | Same. |
| `topic_400` | Conditional | Conditional | Conditional | Same. |

## Jira Stage To SynTask Event Mapping

| Jira dataset stage | Natural SynTask event | Fit |
|---|---|---|
| `creation` | Immediately after `Task` creation (`Task.created_at`, status `todo` or `assigned`) | Strong for basic metadata; weak for activity/workload if unassigned. |
| `due` | When `Task.due_date` is first set or changed; fallback: first scheduled scoring after due date exists | Strongest fit for SynTask task-risk because `due_date`, `RemainingDay`, assignment, and workload are meaningful. |
| `discussion` | No exact event. Approximate as first transition to `in_progress`, first comment window close, or pre-review checkpoint | Approximate only; SynTask needs explicit product definition before using. |

Near-due SynTask stage is not identical to any Jira file. It should be a SynTask-native scoring stage, e.g. daily/background score for open tasks with `due_date` within N days. It can use the same point-in-time rule as Jira: only facts known before scoring time.

## Negative `ProgressTime` Investigation

Dataset check found 2 negative `ProgressTime` rows, both in `jira_discussion.csv`:

| Project | Issue | openeddate | ProgressTime | RemainingDay | delaydays |
|---|---|---|---:|---:|---:|
| jira | `TRANS-814` | 2013-08-23 | -1 | 4 | 59 |
| jira | `JRA-36555` | 2014-01-13 | -46 | 47 | 91 |

Interpretation:

- `ProgressTime` should mean elapsed days from creation to prediction time.
- Negative elapsed time is not semantically valid.
- Do not silently clamp or drop in this mapping step.
- Any future dataset processing must quarantine, correct with source evidence, or exclude these rows by documented rule.

## Priority And Category Normalization

Priority:

- Jira values include `Blocker`, `Critical`, `Major`, `Minor`, `Optional`, `To be reviewed`, `Trivial`, and missing.
- SynTask values are `low`, `medium`, `high`, `critical`.
- Conceptual mapping likely needed:
  - `Blocker`/`Critical` -> `critical`
  - `Major` -> `high`
  - `Minor` -> `medium` or `low`, depending SynTask policy
  - `Trivial` -> `low`
  - `Optional`/`To be reviewed`/missing -> explicit `unknown` or policy-driven default, not silent `medium`

Issue type:

- Jira has 44 raw categories, including duplicate concepts like `SubTask` vs `Sub-task`, `NewFeature` vs `New Feature`.
- SynTask has `IssueType` records and `Task.task_type` (`standard`, `quantitative`).
- Normalize via a controlled mapping table per source project, preserving unmapped values as `unknown_other`.

## Recommended Prediction Stages

1. Due-date-assignment / due-known stage.
   Best natural fit to Jira `due`; SynTask has `Task.due_date`, assignment, workload, dependencies, and remaining-days signals.

2. Near-due recurring stage.
   Best operational SynTask stage; not a direct Jira file stage, but uses same point-in-time discipline and current active-task data.

3. Creation stage.
   Useful baseline; many dynamic features are absent or zero, so expected signal is limited.

4. Active-work/discussion stage.
   Use only after defining a SynTask event such as first work started, first comment window, or review checkpoint.

## Blockers

- Need explicit SynTask label policy: original `due_date` vs approved extension date, `resolved_at` vs `completed_at`, cancellation handling, carry-forward exclusion.
- Need canonical dependency source: `Task.dependencies`, `IssueLink`, or both.
- Need confidence that `ChangeLog` consistently records priority, description, version, assignment, and status changes.
- Need product definition for "discussion" stage in SynTask.
- Need tenant-safe historical aggregates for assignee delay rate and creator/reporter reputation.
- Need category normalization tables for Jira priority/type before cross-system comparison.
- Need documented handling for 2 negative `ProgressTime` rows.
