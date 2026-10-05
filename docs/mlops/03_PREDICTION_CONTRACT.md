# SynTask Task-Risk ML Prediction Contract

## Scope

Step 05 only: define ML prediction contract for SynTask task-delay risk.

Inputs read:

- `SynTask/docs/mlops/01_DATASET_AUDIT.md`
- `SynTask/docs/mlops/02_JIRA_SYNTASK_SCHEMA_MAPPING.md`

Non-actions:

- No training code.
- No preprocessing code.
- No Logistic Regression/XGBoost implementation.
- No SynTask application behavior changes.
- No feature selection.
- No threshold optimization.

## 1. Prediction Unit

Prediction unit is:

`one task at one point in time`

Unique prediction identity must include:

- `task_id`
- `company_id`
- `prediction_timestamp`
- `prediction_stage`
- `model_version`
- `feature_version`

For external Jira research data, unit identity is:

- `(project, issuekey, prediction_stage)`

Raw `issuekey` alone is not globally unique and must not be used as model feature.

## 2. Prediction Target

Target is binary deadline risk:

- `1 = delayed`
- `0 = on_time`

Delayed means:

Task finished after committed due date used by label policy.

On-time means:

Task finished on or before committed due date used by label policy.

V1 target is not:

- severity of delay
- number of days late
- task duration prediction
- completion probability
- project-level delay
- assignee performance score

## 3. Prediction Timestamp

`prediction_timestamp` is exact timestamp when score is generated.

Scoring is allowed only when:

- task exists before or at `prediction_timestamp`
- task belongs to tenant/company scope being scored
- task has a due date for V1 due-known/near-due stages
- task is not already terminal at `prediction_timestamp`
- all features used have `feature_time <= prediction_timestamp`

Scoring is not allowed when:

- task is already completed before `prediction_timestamp`
- task is already cancelled before `prediction_timestamp`
- task has no due date for V1
- prediction would require facts after `prediction_timestamp`

## 4. Prediction Horizons And Stages

### Creation Stage

Definition:

Score immediately after task creation.

SynTask event:

- `Task.created_at`

Eligible if:

- task exists
- task is not terminal

Due date requirement:

- future stage only unless product decides to score undated task risk.

Status:

- future baseline stage, not V1 primary.

Reason:

Many dynamic signals are unavailable or zero at creation, and tasks may not yet have due date or assignee.

### Due-Known Stage

Definition:

Score once task has a committed due date.

SynTask event:

- first time `Task.due_date` becomes non-null, or
- first scheduled score after task is observed with non-null `due_date`

If due date is changed by approved extension, V1 label policy must define whether this creates a new commitment or preserves original commitment for ML label. See unresolved decisions.

Status:

- V1 primary stage.

Reason:

Best match to Jira `due` stage and SynTask operational semantics: due date, remaining time, assignment/workload, priority, project context can exist without requiring late-stage outcome evidence.

### Near-Due Stage

Definition:

Score open due-dated tasks at scheduled time before due date.

SynTask event:

- recurring scheduled scoring job, e.g. daily, for open tasks with due date within configured window

Window:

- configurable; no V1 numeric horizon chosen in this contract.

Status:

- future production stage after V1 due-known contract validates.

Reason:

Most operationally useful for interventions, but it is SynTask-native and not a direct Jira stage.

### Active-Work / Discussion Stage

Definition:

Potential future stage after task has meaningful activity.

SynTask event:

- unresolved. Candidate events: first `in_progress`, first comment threshold, review submission, or product-defined "discussion closed" milestone.

Status:

- future only.

Reason:

Jira `discussion` has no exact SynTask equivalent.

## 5. Ground Truth

Ground truth is assigned only after task reaches label-eligible terminal condition.

### Committed Due Date

V1 committed due date basis:

- original committed `Task.due_date` at V1 prediction time.

SynTask carry-forward fields are not label due date:

- `carry_forward_due_date`
- `carry_forward_days`
- `carry_forward_count`
- `carry_forward_last_at`

Reason:

Prior audit says `Task.due_date` preserves original commitment, while carry-forward tracks effective work date. Delay risk must predict missing original commitment unless product explicitly changes label policy.

### Actual Completion Date

Actual completion date source:

- `Task.completed_at`

If SynTask also uses `resolved_at`, V1 must choose one canonical date before training. Current contract chooses `completed_at` because task workflow sets it on completion.

### Label Formula

For label-eligible completed task:

```text
delayed = 1 if completed_at > committed_due_date
delayed = 0 if completed_at <= committed_due_date
```

Equivalent days-late audit value:

```text
delay_days = max(0, date_or_time_difference(completed_at, committed_due_date))
```

This derived `delay_days` is label evidence only, never feature input.

### Open Tasks

Open tasks at training-label extraction time:

- no final label yet.
- exclude from supervised training/evaluation label set.

Open tasks in production:

- eligible for scoring if due-known and non-terminal.

Open tasks past due:

- still scoreable only if prediction time is before terminal completion/cancellation.
- for training labels, wait until terminal completion or apply explicit censoring policy later.

V1 does not define censored-label learning.

### Cancelled Tasks

Cancelled tasks:

- excluded from V1 supervised labels.

Reason:

Cancellation is not on-time completion or delayed completion. Product policy might later define cancellation as separate outcome, but V1 binary contract does not.

### Tasks With No Due Date

Tasks without due date:

- excluded from V1 training labels.
- excluded from V1 due-known/near-due scoring.

Reason:

Target is deadline risk; no committed due date means no deadline miss label.

### Deadline Extensions

SynTask has approved extension workflow and `extension_count`.

V1 default label policy:

- use committed due date at prediction time.
- do not let extension decisions after prediction time rewrite past labels.

Unresolved product policy:

- whether approved extensions before prediction time should replace original commitment for that prediction.
- whether prediction should target original commitment risk or current approved commitment risk.

Until resolved, training labels must record both:

- `due_date_at_prediction`
- `original_due_date_if_available`
- `extension_state_at_prediction`

No silent substitution.

### Reopened Tasks

Reopened completed tasks:

- unresolved policy.

Candidate policies:

- label by first completion date
- label by final completion date after reopen cycles
- exclude reopened tasks from V1 labels until policy chosen

V1 default:

- exclude tasks with completion followed by reopen from training labels unless reliable workflow history can reconstruct final lifecycle.

Reason:

Avoid ambiguous ground truth.

## 6. Point-In-Time Correctness

Core invariant:

```text
feature_time <= prediction_time
```

No future information is allowed.

Examples forbidden for a prediction at time `T`:

- comments created after `T`
- changelog rows after `T`
- completion status after `T`
- `completed_at` / `resolved_at`
- future due date changes after `T`
- extension approvals after `T`
- future workload changes after `T`
- label-derived `delaydays`

Examples allowed if at or before `T`:

- task metadata existing at `T`
- priority as of `T`
- due date as of `T`
- assignment as of `T`
- comments before `T`
- changelog counts before `T`
- open workload snapshot at `T`
- historical assignee aggregates computed from tasks completed before `T`

Any feature table must store or derive:

- value
- `feature_time`
- source record window
- stage compatibility

## 7. External Dataset Label Mapping

Jira dataset label:

```text
y = 1 if delaydays > 0
y = 0 if delaydays == 0
```

Rules:

- `delaydays` is label source only.
- `delaydays` must never enter feature set.
- `(project, issuekey)` is external issue identity.
- Jira `creation`, `due`, `discussion` files define prediction stage, not separate labels.
- Same label applies across stages because outcome is same issue completion relative to due date.

Jira rows with invalid stage timing, such as negative `ProgressTime`, must be flagged before modeling. This contract does not choose repair/exclusion rule.

## 8. SynTask Production Label Mapping

For each historical SynTask task candidate:

1. Determine prediction stage and `prediction_timestamp`.
2. Capture committed due date valid at `prediction_timestamp`.
3. Wait until task reaches label-eligible completion.
4. Set label:

```text
y = 1 if completed_at > committed_due_date_at_prediction
y = 0 if completed_at <= committed_due_date_at_prediction
```

Required metadata for every label:

- `task_id`
- `company_id`
- `prediction_timestamp`
- `prediction_stage`
- `committed_due_date_at_prediction`
- `completed_at`
- `label_generated_at`
- `label_policy_version`
- `extension_state_at_prediction`
- terminal status used for label

Excluded from V1 label set:

- no due date at prediction time
- cancelled before completion
- still open/uncompleted at extraction time
- reopened-after-completion tasks unless policy resolved
- tasks with missing or inconsistent `completed_at`

## 9. Model Output Contract

V1 prediction response shape:

```json
{
  "task_id": "string",
  "company_id": "string",
  "prediction_unit": "task_at_time",
  "prediction_stage": "due_known",
  "prediction_timestamp": "ISO-8601 datetime",
  "risk_probability": 0.0,
  "predicted_class": "on_time",
  "threshold": 0.5,
  "threshold_policy": "configurable",
  "model_version": "string",
  "feature_version": "string",
  "label_policy_version": "string",
  "contract_version": "03_PREDICTION_CONTRACT.v1",
  "explanations": [],
  "warnings": []
}
```

Field definitions:

- `risk_probability`: numeric probability from `0.0` to `1.0` that task will be delayed.
- `predicted_class`: `delayed` or `on_time`, based on configured threshold.
- `threshold`: runtime/model registry configuration, not fixed by this contract.
- `model_version`: trained model artifact version.
- `feature_version`: feature schema/logic version.
- `prediction_timestamp`: timestamp score was generated.
- `prediction_stage`: one of supported stages; V1 primary is `due_known`.
- `explanations`: optional, only if future model/explainer supports it.
- `warnings`: point-in-time/data-quality warnings.

Threshold rule:

```text
predicted_class = "delayed" if risk_probability >= configured_threshold
predicted_class = "on_time" otherwise
```

No threshold value is chosen in this contract.

## 10. Non-Goals For V1

V1 does not:

- train any model
- choose algorithm
- choose features
- choose threshold
- optimize accuracy
- build preprocessing pipeline
- implement online scoring endpoint
- implement UI risk labels
- score undated tasks
- predict project-level delay
- predict delay magnitude
- predict assignee performance
- use topic features until generation semantics are verified
- handle censored/open-task labels
- resolve reopened-task policy
- resolve extension-label policy
- replace existing SynTask task health or overdue rules

## Topic Feature Status

`topic_10`, `topic_100`, `topic_200`, `topic_300`, `topic_400` remain unresolved.

They must not be treated as ready SynTask features until all are defined:

- exact text source
- text timestamp cutoff
- preprocessing pipeline
- privacy/tenant boundary policy
- vocabulary/model fitting window
- repeatability across training and production

## V1 Decision

V1 primary prediction stage:

`due_known`

Reason:

It maps naturally to Jira `due`, requires known committed due date, and avoids relying on undefined SynTask discussion-stage behavior.

V1 label:

Binary deadline miss against committed due date at prediction time.

V1 eligible production scoring states:

- `todo`
- `assigned`
- `in_progress`
- `in_review`
- `revision_required`
- `approved`

V1 excluded production scoring states:

- `completed`
- `cancelled`

V1 eligible supervised labels:

- completed tasks with due date at prediction time and unambiguous completion history.

V1 excluded supervised labels:

- open tasks
- cancelled tasks
- tasks without due date
- reopened-after-completion tasks until policy resolved
- tasks with missing/inconsistent completion timestamps

## Unresolved Policy Decisions

- Whether label should use original due date, due date at prediction time, or approved-extension due date.
- Whether approved extensions before prediction are separate feature, label reset, or exclusion reason.
- Whether reopened tasks use first completion, final completion, or exclusion.
- Whether cancelled tasks become separate outcome later.
- Whether near-due horizon is daily, N days before due, or event-triggered.
- Whether undated tasks get separate risk product later.
- Whether raw dates can be model features or only split/cohort metadata.
- How topic features are generated safely and reproducibly.
