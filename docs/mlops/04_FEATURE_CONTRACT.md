# SynTask Task-Risk ML V1 Feature Contract

## Scope

Step 06 only: V1 candidate feature contract for `due_known` prediction stage.

Inputs read:

- `SynTask/docs/mlops/01_DATASET_AUDIT.md`
- `SynTask/docs/mlops/02_JIRA_SYNTASK_SCHEMA_MAPPING.md`
- `SynTask/docs/mlops/03_PREDICTION_CONTRACT.md`

Non-actions:

- No model training.
- No dataset building.
- No preprocessing implementation.
- No SynTask application changes.
- No correlation/performance-based feature selection.

## V1 Stage

V1 stage is `due_known`.

Prediction timestamp:

- Jira: row from `*_due.csv`; source paper defines prediction at due-date assignment time.
- SynTask: first time task has known committed due date, or first scheduled score after non-null `Task.due_date`.

Point-in-time invariant:

```text
feature_time <= prediction_time
```

## Excluded From V1

Excluded always:

- `delaydays`: label source only.
- `issuekey`: external identity only.
- raw identifiers: `task_id`, `company_id`, `project_id`, `assigned_to`, `created_by`, `reporter_id`.
- `completed_at`, `resolved_at`, `completed_by`, `resolved_by`.
- future terminal status/outcome fields.
- any event after `prediction_time`.
- `topic_10`, `topic_100`, `topic_200`, `topic_300`, `topic_400`.

Topic features are excluded because generation semantics, text cutoff, vocabulary fitting, tenant privacy, and train-serving reproducibility are not yet verified.

Raw date fields:

- `openeddate` / `Task.created_at` excluded as direct model input for V1.
- Allowed only to compute `progress_days` and temporal splits/cohorts.

## Feature Set Summary

V1 REQUIRED features:

1. `issue_type_norm`
2. `priority_norm`
3. `progress_days`
4. `remaining_days`
5. `comment_count`
6. `priority_change_count`
7. `fix_version_count`
8. `fix_version_change_count`
9. `issue_link_count`
10. `blocking_count`
11. `blocked_by_count`
12. `affect_version_count`
13. `description_change_count`

V1 OPTIONAL features:

1. `discussion_days`
2. `reopen_or_revision_count`
3. `assignee_open_workload`
4. `assignee_prior_delay_rate`
5. `reporter_reputation_proxy`

FUTURE features:

1. `topic_10`
2. `topic_100`
3. `topic_200`
4. `topic_300`
5. `topic_400`
6. SynTask-only features: review-required flag, review round, checklist completion, estimated hours, story points, time logged, extension count, carry-forward fields, project/client/team hierarchy.

## Required V1 Feature Documents

### `issue_type_norm`

- Jira source: `type`
- SynTask source: `Task.issue_type_id` joined to `IssueType.name/category`; fallback `Task.task_type` only if issue type unavailable.
- Datatype: categorical string.
- Class: DIRECT.
- Calculation: normalize source issue/task type to controlled V1 category.
- Point-in-time cutoff: value effective at `prediction_time`.
- Missing-value policy: `unknown`.
- Categorical normalization policy: see Type Normalization.
- Leakage risk: low if using value known at due-known time.
- Reproducible in Jira and SynTask: yes, with mapping table.
- Training-serving skew risk: medium; Jira and SynTask type vocabularies differ.

### `priority_norm`

- Jira source: `priority`
- SynTask source: `Task.priority`.
- Datatype: categorical string.
- Class: DIRECT.
- Calculation: normalize priority to `low`, `medium`, `high`, `critical`, `unknown`.
- Point-in-time cutoff: value effective at `prediction_time`.
- Missing-value policy: `unknown`, not silent `medium`.
- Categorical normalization policy: see Priority Normalization.
- Leakage risk: low if current-at-prediction priority only.
- Reproducible in Jira and SynTask: yes, with mapping table.
- Training-serving skew risk: medium; Jira has `Blocker`, `Trivial`, `Optional`, `To be reviewed`; SynTask has four fixed values.

### `progress_days`

- Jira source: `ProgressTime`.
- SynTask source: `prediction_time - Task.created_at`.
- Datatype: numeric integer or float days.
- Class: DERIVED.
- Calculation: elapsed days from task creation to prediction time.
- Point-in-time cutoff: `prediction_time`.
- Missing-value policy: invalid if missing; row/task cannot produce V1 feature vector without creation time.
- Categorical normalization policy: none.
- Leakage risk: low if computed from prediction time, not completion time.
- Reproducible in Jira and SynTask: yes.
- Training-serving skew risk: low, except Jira invalid negative values.

### `remaining_days`

- Jira source: `RemainingDay`.
- SynTask source: `Task.due_date - prediction_time`.
- Datatype: numeric integer or float days.
- Class: DERIVED.
- Calculation: remaining time from prediction to committed due date.
- Point-in-time cutoff: due date known at `prediction_time`.
- Missing-value policy: task/row excluded from V1 if due date missing.
- Categorical normalization policy: none.
- Leakage risk: low if due date value is known at prediction time.
- Reproducible in Jira and SynTask: yes.
- Training-serving skew risk: low; day-boundary/timezone conventions must match.

### `comment_count`

- Jira source: `no_comment`.
- SynTask source: count `TaskComment` for task with `created_at <= prediction_time`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count comments visible before or at prediction time.
- Point-in-time cutoff: comment `created_at <= prediction_time`.
- Missing-value policy: default `0` if no comments.
- Categorical normalization policy: none.
- Leakage risk: medium if comments after prediction are included.
- Reproducible in Jira and SynTask: yes conceptually.
- Training-serving skew risk: medium; Jira comments and SynTask comments may differ in usage patterns.

### `priority_change_count`

- Jira source: `no_priority_change`.
- SynTask source: count `ChangeLog` entries for priority changes before or at `prediction_time`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count priority field changes.
- Point-in-time cutoff: changelog `created_at <= prediction_time`.
- Missing-value policy: default `0` if no changelog entries.
- Categorical normalization policy: none.
- Leakage risk: medium if future changelog rows included.
- Reproducible in Jira and SynTask: yes if SynTask changelog is complete.
- Training-serving skew risk: high until changelog completeness is verified.

### `fix_version_count`

- Jira source: `no_fixversion`.
- SynTask source: `Task.fix_version_id`.
- Datatype: integer count.
- Class: DIRECT in schema, numeric count derived from field.
- Calculation: Jira count as provided; SynTask count is `1` if `fix_version_id` present else `0`.
- Point-in-time cutoff: fix version assigned by `prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: low if value known by prediction time.
- Reproducible in Jira and SynTask: approximate shape only.
- Training-serving skew risk: high; Jira supports multiple fix versions, SynTask task model stores one.

### `fix_version_change_count`

- Jira source: `no_fixversion_change`.
- SynTask source: count `ChangeLog` entries for `fix_version_id` before or at `prediction_time`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count fix-version changes.
- Point-in-time cutoff: changelog `created_at <= prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: medium if future changes included.
- Reproducible in Jira and SynTask: yes if changelog complete.
- Training-serving skew risk: high until version-change logging verified.

### `issue_link_count`

- Jira source: `no_issuelink`.
- SynTask source: count `IssueLink` rows where task is source or destination and `created_at <= prediction_time`; optionally include `Task.dependencies` if canonical dependency source chosen.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count linked task relationships.
- Point-in-time cutoff: link `created_at <= prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: medium if links created after prediction included.
- Reproducible in Jira and SynTask: yes conceptually.
- Training-serving skew risk: high; SynTask has both `IssueLink` and `Task.dependencies`, canonical source unresolved.

### `blocking_count`

- Jira source: `no_blocking`.
- SynTask source: count links/tasks that this task blocks before or at `prediction_time`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count `IssueLink.link_type=blocks` from task to others, plus inverse dependency representation if canonical policy says so.
- Point-in-time cutoff: link/dependency known at `prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: medium if future links/dependencies included.
- Reproducible in Jira and SynTask: yes conceptually.
- Training-serving skew risk: high; direction semantics must be standardized.

### `blocked_by_count`

- Jira source: `no_blockedby`.
- SynTask source: count `Task.dependencies` and/or `IssueLink.link_type=is_blocked_by` / `depends_on`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count incomplete or declared blockers known by prediction time. For strict Jira parity, count declared blockers, not completion state.
- Point-in-time cutoff: dependency/link known at `prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: medium if future dependencies included; high if blocker completion state after prediction is used.
- Reproducible in Jira and SynTask: yes conceptually.
- Training-serving skew risk: high; canonical dependency source and direction unresolved.

### `affect_version_count`

- Jira source: `no_affectversion`.
- SynTask source: length of `Task.affects_version_ids`.
- Datatype: integer count.
- Class: DIRECT in schema, count derived from list.
- Calculation: count affected versions known by prediction time.
- Point-in-time cutoff: affected versions assigned by `prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: low if value known by prediction time.
- Reproducible in Jira and SynTask: yes.
- Training-serving skew risk: medium; SynTask usage may be sparse.

### `description_change_count`

- Jira source: `no_des_change`.
- SynTask source: count `ChangeLog` entries for `description` before or at `prediction_time`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count description edits.
- Point-in-time cutoff: changelog `created_at <= prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: medium if future description edits included.
- Reproducible in Jira and SynTask: yes if changelog complete.
- Training-serving skew risk: high until description-change logging verified.

## Optional V1 Feature Documents

### `discussion_days`

- Jira source: `discussion`.
- SynTask source: approximate elapsed time from task creation to active-work/discussion checkpoint, if defined.
- Datatype: numeric days.
- Class: APPROXIMATE.
- Calculation: unresolved for SynTask V1; possible proxy is first comment/first `in_progress` minus creation.
- Point-in-time cutoff: event must happen before or at `prediction_time`.
- Missing-value policy: default `0` only if defined as no discussion yet; otherwise unknown.
- Categorical normalization policy: none.
- Leakage risk: medium; high if endpoint event occurs after due-known prediction.
- Reproducible in Jira and SynTask: no exact reproduction.
- Training-serving skew risk: high.

### `reopen_or_revision_count`

- Jira source: `repetition`.
- SynTask source: count workflow reopen/revision cycles before or at `prediction_time`, e.g. `reopen`, `revision_required`, `review_round`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count qualifying workflow transitions before prediction.
- Point-in-time cutoff: workflow/changelog timestamp `<= prediction_time`.
- Missing-value policy: default `0`.
- Categorical normalization policy: none.
- Leakage risk: medium if future workflow transitions included.
- Reproducible in Jira and SynTask: approximate, not identical.
- Training-serving skew risk: high; Jira reopened issue semantics differ from SynTask review/revision.

### `assignee_open_workload`

- Jira source: `workload`.
- SynTask source: count open tasks assigned to same assignee at `prediction_time`.
- Datatype: integer count.
- Class: DERIVED.
- Calculation: count non-terminal tasks assigned to current assignee with created/assigned time before or at prediction.
- Point-in-time cutoff: workload snapshot at `prediction_time`.
- Missing-value policy: `0` if no assignee; otherwise count.
- Categorical normalization policy: none.
- Leakage risk: high if workload is computed from current database instead of historical snapshot for training.
- Reproducible in Jira and SynTask: conceptually yes.
- Training-serving skew risk: high; Jira developer assignment/workload semantics may differ from SynTask assignee.

### `assignee_prior_delay_rate`

- Jira source: `perofdelay`.
- SynTask source: historical completed tasks assigned to same assignee before prediction time.
- Datatype: float ratio `0.0` to `1.0`.
- Class: DERIVED.
- Calculation: prior delayed assigned tasks / prior completed assigned tasks, using only tasks completed before `prediction_time`.
- Point-in-time cutoff: completed task `completed_at < prediction_time`.
- Missing-value policy: `unknown` or neutral fallback only with explicit flag; do not compute from future tasks.
- Categorical normalization policy: none.
- Leakage risk: high if current task or future completions included.
- Reproducible in Jira and SynTask: conceptually yes.
- Training-serving skew risk: high; Jira per-developer history and SynTask tenant/team history differ.

### `reporter_reputation_proxy`

- Jira source: `reporterrep`.
- SynTask source: creator/reporter historical proxy from `created_by`, possibly tasks both created and completed by same user.
- Datatype: float ratio `0.0` to `1.0`.
- Class: APPROXIMATE.
- Calculation: unresolved; Jira formula is opened-and-fixed overlap divided by opened count plus one.
- Point-in-time cutoff: only history before `prediction_time`.
- Missing-value policy: `unknown` if no history.
- Categorical normalization policy: none.
- Leakage risk: high if future task completions included.
- Reproducible in Jira and SynTask: no exact reproduction unless SynTask product defines reporter/fixer relation.
- Training-serving skew risk: high.

## Future Feature Documents

### `topic_*`

- Jira source: `topic_10`, `topic_100`, `topic_200`, `topic_300`, `topic_400`.
- SynTask source: future NLP over `Task.title` / `Task.description`.
- Datatype: unresolved. Jira values appear numeric topic ids/features.
- Class: DERIVED.
- Calculation: unresolved.
- Point-in-time cutoff: text snapshot must be at or before prediction time.
- Missing-value policy: unresolved.
- Categorical normalization policy: unresolved.
- Leakage risk: high until text snapshot and fitting window are defined.
- Reproducible in Jira and SynTask: not for V1.
- Training-serving skew risk: high.

### SynTask-only future features

Not part of V1 Jira-compatible contract:

- `review_required`
- `review_round`
- checklist required-completion ratio
- `estimated_hours`
- `story_points`
- time logged before prediction
- `extension_count`
- carry-forward fields
- project/client/team hierarchy

Reason:

Useful SynTask risk signals, but not reproducible from Jira dataset fields. Add only in SynTask-native model stage.

## Priority Normalization

Canonical V1 values:

- `low`
- `medium`
- `high`
- `critical`
- `unknown`

Jira mapping:

- `Blocker` -> `critical`
- `Critical` -> `critical`
- `Major` -> `high`
- `Minor` -> `medium`
- `Trivial` -> `low`
- `Optional` -> `unknown`
- `To be reviewed` -> `unknown`
- missing/null/blank -> `unknown`
- any unmapped value -> `unknown`

SynTask mapping:

- `critical` -> `critical`
- `high` -> `high`
- `medium` -> `medium`
- `low` -> `low`
- missing/null/blank/unmapped -> `unknown`

Rule:

Do not silently impute missing Jira priority to SynTask default `medium`.

## Type Normalization

Canonical V1 values:

- `bug`
- `task`
- `subtask`
- `story`
- `feature`
- `improvement`
- `documentation`
- `test`
- `epic`
- `support`
- `release`
- `technical_debt`
- `other`
- `unknown`

Jira mapping examples:

- `Bug`, `Fug`, `Customer Problem`, `Quality Risk` -> `bug`
- `Task`, `Code Task`, `Technical task`, `Technical Requirement`, `Business Requirement`, `Request` -> `task`
- `SubTask`, `Sub-task`, `Documentation Sub-Task`, `Component Upgrade Subtask` -> `subtask`
- `Story` -> `story`
- `NewFeature`, `New Feature`, `Feature Request`, `Enhancement Request` -> `feature`
- `Improvement`, `Enhancement`, `Wish`, `Suggestion` -> `improvement`
- `Documentation` -> `documentation`
- `Test`, `FunctionalTest`, `Release Test` -> `test`
- `Epic`, `Umbrella` -> `epic`
- `Support Request`, `Support Patch`, `Patch`, `Patch submission` -> `support`
- `Release` -> `release`
- `Technical Debt` -> `technical_debt`
- null/blank -> `unknown`
- all other mapped-but-rare project values -> `other`

SynTask mapping:

- Prefer `IssueType.category/name` mapped to same canonical values.
- If only `Task.task_type` exists:
  - `standard` -> `task`
  - `quantitative` -> `task`
- Missing/unmapped -> `unknown`.

Rule:

Keep mapping table versioned. Never use free-text type as unbounded category in V1.

## Invalid-Value Rules

Counts:

- Must be integer and `>= 0`.
- Missing count -> `0` only when missing means no observed event.
- Negative count -> invalid row/task; quarantine for dataset build.

Ratios:

- Must be numeric in `[0.0, 1.0]` if represented as fraction.
- Jira `perofdelay` appears percentage-like in some stages; V1 contract requires conversion to fraction if used.
- Missing or denominator zero -> `unknown` plus missing flag if optional feature used later.

`progress_days`:

- Must be `>= 0`.
- Jira negative `ProgressTime` rows are invalid.
- Do not clamp to zero.
- V1 dataset build must quarantine/exclude invalid rows and report count.

`remaining_days`:

- Can be `>= 0` for due-known scoring before deadline.
- If negative at `due_known`, invalid because due-known stage should be at or before committed due date unless product defines late scoring separately.
- Do not use post-due near-due scoring in V1.

Dates:

- Timezone must be normalized before duration calculation.
- Raw dates are not V1 features.

Categoricals:

- Normalize before encoding.
- Missing/unmapped -> `unknown`, except excluded fields.

## Identically Reproducible Features

Features reproducible in Jira training and SynTask inference with same semantics:

- `issue_type_norm` only after versioned mapping.
- `priority_norm` only after versioned mapping.
- `progress_days`.
- `remaining_days`.
- `comment_count`.
- `priority_change_count` if SynTask changelog complete.
- `fix_version_change_count` if SynTask changelog complete.
- `issue_link_count` if canonical link source selected.
- `blocking_count` if direction policy selected.
- `blocked_by_count` if direction policy selected.
- `affect_version_count`.
- `description_change_count` if SynTask changelog complete.

Partially reproducible / skew-prone:

- `fix_version_count`: Jira multi-value, SynTask single `fix_version_id`.
- `discussion_days`: no exact SynTask event.
- `reopen_or_revision_count`: Jira reopen differs from SynTask review/revision.
- `assignee_open_workload`: assignee/workload semantics differ.
- `assignee_prior_delay_rate`: historical population differs.
- `reporter_reputation_proxy`: reporter/fixer semantics differ.

## Training-Serving Skew Risks

High risks:

- Changelog-derived counts if SynTask does not log priority, description, fix-version changes consistently.
- Dependency/link counts because SynTask has both `Task.dependencies` and `IssueLink`.
- Fix version count because Jira supports multiple fix versions and SynTask stores one.
- Workload and assignee delay rate because historical snapshots must be reconstructed point-in-time.
- Reporter reputation because SynTask creator/assignee/completer semantics differ from Jira reporter/fixer.
- `discussion_days` because SynTask lacks exact discussion-end event.
- Topic features, excluded V1, because NLP generation semantics unresolved.

Medium risks:

- Priority/type category mapping across Jira projects and SynTask tenants.
- Comment-count behavior differences.
- Timezone/day-boundary handling for `progress_days` and `remaining_days`.

Low risks:

- Label-excluded target and identifiers if pipeline enforces denylist.
- Basic duration features after timestamp normalization.

## Blockers Before Dataset Build

- Choose canonical dependency source and direction rules.
- Verify SynTask changelog completeness for priority, description, and version fields.
- Finalize type normalization mapping table.
- Finalize priority normalization mapping table.
- Decide whether optional high-skew features enter V1 dataset or stay parked.
- Define historical workload snapshot reconstruction.
- Define invalid-row quarantine reporting for negative `ProgressTime`.
- Confirm due-known prediction timestamp derivation for Jira `*_due.csv` and SynTask historical tasks.
