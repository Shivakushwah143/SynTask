# SynTask ML Dataset Audit: EMSE2017 Delayed Issues

## Scope

Audited only:

`JIRA-Estimation-Prediction/delayed issues/EMSE2017/datasets/`

Files inspected:

- `README.md`
- 24 CSV files: 8 projects x 3 lifecycle stages (`*_creation.csv`, `*_discussion.csv`, `*_due.csv`)
- Parent EMSE2017 README and local preprint PDF for feature definitions, because dataset README says the feature list is in the paper.

No model was trained. No SynTask application code was modified.

## Executive Finding

Dataset is conceptually relevant to SynTask task-delay prediction because it predicts whether issue resolution misses a due date, using due-date-aware issue/task metadata available at defined lifecycle times.

Dataset is not directly production-ready for SynTask without mapping and validation. It comes from public JIRA software projects, has JIRA-specific fields, lacks SynTask tenant/workflow/user concepts, has project-specific category vocabularies, and contains several fields that would leak outcome or post-prediction information if stage boundaries are not enforced.

Recommended usable stages for SynTask evidence work:

- `creation`: usable for early-risk research only; weak signal because many process/activity features are zero at creation.
- `due`: most aligned with SynTask operational risk at deadline assignment or commitment planning.
- `discussion`: usable only if SynTask has an equivalent "post-discussion / after task has accumulated activity" prediction moment.

## Source Semantics

Parent README describes 8 open source JIRA projects: Apache, Duraspace, Java.net, JBoss, JIRA, Moodle, Mulesoft, WSO2.

Paper definition:

- An issue may have a planned due date explicitly, or inherit it from a release deadline.
- Delayed issue: completed after planned due date.
- Non-delayed issue: resolved on time.
- Dataset includes only issues with due dates, and filters long-delay outliers.
- Risk factors are extracted relative to prediction time to prevent information leakage.

Stage files:

- `*_creation.csv`: prediction at issue creation time.
- `*_due.csv`: prediction at time a deadline/due date was assigned to the issue.
- `*_discussion.csv`: prediction at end of discussion time.

All three stages share same 26 columns, but values differ by stage because features are cut at different prediction times.

## Target

Correct prediction target:

- Binary target for SynTask delay risk: `delaydays > 0`
- On-time / non-delayed class: `delaydays == 0`

`delaydays` semantics:

- Number of days an issue was late after due date.
- `0` means non-delayed / resolved on time.
- Positive integer means delayed by that many days.
- No negative `delaydays` values found.

Do not use `delaydays` as an input feature. It is the outcome.

## Verified Shape

Audit script:

`SynTask/mlops/scripts/audit_jira_dataset.py`

Command run:

```bash
python SynTask/mlops/scripts/audit_jira_dataset.py
```

Verified totals:

| Metric | Value |
|---|---:|
| CSV files audited | 24 |
| Projects | 8 |
| Lifecycle stages | 3 |
| Rows per stage | 64,747 |
| Columns per file | 26 |
| Total rows across all stage files | 194,241 |
| Unique `issuekey` across all projects/stages | 64,724 |
| Per-project duplicate issue keys | 0 |
| Cross-project repeated `issuekey` values per stage | 23 |

Note: paper reports 64,747 issues. CSV rows match that. Raw `issuekey` uniqueness across projects is 64,724 because 23 `issuekey` values repeat across different project datasets. Use `(project, issuekey)` as unique issue identity.

Columns:

`issuekey`, `delaydays`, `openeddate`, `type`, `discussion`, `repetition`, `perofdelay`, `workload`, `priority`, `no_comment`, `no_priority_change`, `no_fixversion`, `no_fixversion_change`, `no_issuelink`, `no_blocking`, `no_blockedby`, `no_affectversion`, `reporterrep`, `no_des_change`, `ProgressTime`, `RemainingDay`, `topic_10`, `topic_100`, `topic_200`, `topic_300`, `topic_400`

## Class Distribution

Overall class distribution is identical for each stage because the same issues appear in creation, due, and discussion files.

| Stage | Rows | Delayed | On-time | Delayed ratio |
|---|---:|---:|---:|---:|
| creation | 64,747 | 13,825 | 50,922 | 21.3523% |
| due | 64,747 | 13,825 | 50,922 | 21.3523% |
| discussion | 64,747 | 13,825 | 50,922 | 21.3523% |

Per project / stage:

| Project | Stage | Rows | Delayed | On-time | Delayed ratio |
|---|---|---:|---:|---:|---:|
| apache | creation/due/discussion | 6,289 | 2,606 | 3,683 | 41.4374% |
| duraspace | creation/due/discussion | 3,676 | 970 | 2,706 | 26.3874% |
| javanet | creation/due/discussion | 16,326 | 2,614 | 13,712 | 16.0113% |
| jboss | creation/due/discussion | 3,526 | 1,900 | 1,626 | 53.8854% |
| jira | creation/due/discussion | 4,428 | 1,258 | 3,170 | 28.4101% |
| moodle | creation/due/discussion | 17,004 | 1,909 | 15,095 | 11.2268% |
| mulesoft | creation/due/discussion | 8,269 | 1,328 | 6,941 | 16.0600% |
| wso2 | creation/due/discussion | 5,229 | 1,240 | 3,989 | 23.7139% |

## Data Quality

Duplicates:

- Duplicate full rows: 0 in every file.
- Duplicate `issuekey` within each project-stage file: 0.
- Cross-project repeated raw `issuekey`: 23 per stage. Blocker only if project is not included in key.

Missing values:

- Only `priority` has missing values.
- Missing `priority` counts repeat across all three stages:

| Project | Missing priority rows |
|---|---:|
| duraspace | 5 |
| jboss | 140 |
| jira | 1,023 |
| moodle | 1,116 |
| mulesoft | 8 |

Datatypes:

- `issuekey`, `openeddate`, `type`, `priority`: string/object.
- `reporterrep`: float.
- All other non-string columns: integer.
- `openeddate` is parseable date text but script keeps raw dtype for audit evidence.

Categorical values:

- `priority`: `Blocker`, `Critical`, `Major`, `Minor`, `Optional`, `To be reviewed`, `Trivial`, plus missing values.
- `type`: 44 raw categories across projects. Examples include `Bug`, `Task`, `Improvement`, `Story`, `SubTask`, `Sub-task`, `NewFeature`, `New Feature`, `Documentation`, `Epic`, `Technical Debt`, `Wish`, and project-specific values.

Category normalization would be required before any SynTask use.

## Feature Meanings

From paper and CSV names:

- `discussion`: time spent discussing issue before prediction time.
- `type`: JIRA issue type.
- `repetition`: number of times issue was reopened.
- `priority`: issue priority.
- `no_priority_change`: number of priority changes before prediction time.
- `no_comment`: number of comments before prediction time.
- `no_fixversion`: number of fix versions.
- `no_fixversion_change`: number of fix-version changes.
- `no_affectversion`: number of affected versions.
- `no_issuelink`: number of linked issues.
- `no_blocking`: number of issues blocked by this issue.
- `no_blockedby`: number of issues blocking this issue.
- `topic_10`, `topic_100`, `topic_200`, `topic_300`, `topic_400`: LDA-derived topic features from issue description using different topic counts.
- `no_des_change`: number of description changes.
- `reporterrep`: reporter reputation, based on prior opened/fixed issue history.
- `workload`: developer workload at assignment time.
- `perofdelay`: percentage of delayed issues among issues assigned to developer at assignment time.
- `ProgressTime`: elapsed days from issue creation until prediction time.
- `RemainingDay`: days from prediction time until due date.
- `openeddate`: issue creation/open date.

## Stage Availability

Observed non-zero behavior confirms stage boundary differences:

Creation stage:

- Always zero: `discussion`, `repetition`, `perofdelay`, `workload`, `no_comment`, `no_priority_change`, `no_fixversion_change`, `no_des_change`, `ProgressTime`.
- Non-zero for many rows: `no_fixversion`, `no_issuelink`, `no_blocking`, `no_blockedby`, `no_affectversion`, `reporterrep`, `RemainingDay`, topic fields.

Due stage:

- Activity/resource fields become populated: `discussion`, `repetition`, `perofdelay`, `workload`, `no_comment`, `no_priority_change`, `no_fixversion_change`, `no_des_change`, `ProgressTime`, `RemainingDay`.

Discussion stage:

- Similar to due stage, but cut at end of discussion time.
- `ProgressTime` includes negative minimum value `-46` in the CSV audit. This needs investigation before relying on that feature.

## Leakage Audit

Do not use:

- `delaydays`: target/outcome.
- Any transformed version of `delaydays`: direct target leakage.
- Future `resolved date` or actual completion date: not present in CSVs, but would be leakage if joined later.
- Any post-prediction task state or activity not available at selected stage.

High-risk / stage-dependent leakage:

- `discussion`: leakage for creation-time prediction; valid only if prediction occurs after discussion duration is known.
- `repetition`: leakage for creation-time prediction; valid only if reopen events already occurred before prediction time.
- `no_comment`, `no_priority_change`, `no_fixversion_change`, `no_des_change`: valid only if counted before prediction time.
- `workload`, `perofdelay`: valid only when assignee/developer assignment exists and values are computed from prior history at assignment time.
- `ProgressTime`: valid only as elapsed time until prediction time; suspicious negative values in discussion stage require cleanup/audit.
- `RemainingDay`: valid only when due date exists at prediction time; not usable before a due date is known.
- `issuekey`: identifier; can encode project/subproject and memorization.
- `openeddate`: acceptable for chronological splitting/drift checks; risky as raw feature because it can encode time-period artifacts.

## Suitable Features By Lifecycle Stage

Creation-time candidate inputs:

- `type`
- `priority`
- `no_fixversion`
- `no_issuelink`
- `no_blocking`
- `no_blockedby`
- `no_affectversion`
- `reporterrep`
- `RemainingDay`, only if due date is already known at creation in the source issue.
- topic fields, if derived only from initial description text.

Due-date-assignment candidate inputs:

- Creation-time candidates.
- `discussion`
- `repetition`
- `perofdelay`
- `workload`
- `no_comment`
- `no_priority_change`
- `no_fixversion_change`
- `no_des_change`
- `ProgressTime`
- `RemainingDay`

Discussion-end candidate inputs:

- Due-stage candidates, only if SynTask has a defensible "discussion ended" event.
- Must verify `ProgressTime` negative values first.

## SynTask Conceptual Fit

SynTask concepts found in existing docs:

- Tasks have lifecycle statuses: `todo`, `assigned`, `in_progress`, `in_review`, `revision_required`, `approved`, `completed`, `cancelled`.
- Task workflow includes review, dependencies, blockers, allowed actions, health sync, timeline, changelog, notifications.
- `Task.due_date` is preserved as original commitment and drives overdue health, reminders, attention filters, monitoring windows, and at-risk project analysis.
- Carry-forward fields are separate from original `due_date`.

Dataset-to-SynTask conceptual mapping:

| Dataset field | SynTask concept fit |
|---|---|
| `delaydays` | Outcome analogous to completed-after-original-`due_date` days late |
| `type` | Task/issue type, if SynTask stores task type |
| `priority` | Task priority |
| `no_comment` | Comments/activity count before prediction time |
| `no_issuelink`, `no_blocking`, `no_blockedby` | Dependencies/blockers |
| `workload` | Assignee workload/capacity |
| `RemainingDay` | Days until original due date |
| `ProgressTime` | Task age at prediction time |
| `repetition` | Reopen/revision/rework events; needs SynTask-equivalent definition |
| `reporterrep`, `perofdelay` | User history/reputation; needs tenant-safe historical aggregates |
| `topic_*` | Text-derived task description features; needs SynTask text policy/privacy controls |

Gaps:

- Dataset has no SynTask tenant/company boundaries.
- Dataset has no SynTask review-required flag, checklist state, extension requests, carry-forward counters, project/client context, department/team hierarchy, time logs, approvals, or task health fields.
- Dataset target is based on resolved issues only; SynTask production prediction would score active tasks too.
- Dataset only includes issues with due dates; it cannot teach behavior for undated tasks.
- Dataset categories are JIRA/project-specific and require normalization.

## Suitability Decision

Suitable for:

- Offline dataset audit and feasibility research.
- Target semantics prototype: predict whether task completion misses original due date.
- Feature inspiration for SynTask task-risk model design.
- Benchmark-style experiment after strict stage separation and mapping.

Not suitable for:

- Direct SynTask production model training without SynTask historical labels.
- Claims about SynTask users, tenants, workflows, or operational accuracy.
- Using all columns blindly across lifecycle stages.
- Using `delaydays` or post-prediction activity fields as inputs.

## Blockers / Risks

- Need `(project, issuekey)` composite identity; raw `issuekey` is not globally unique.
- Missing `priority` values in 2,292 rows per stage.
- Project-specific category values need normalization.
- `ProgressTime` has negative values in discussion stage; must investigate before use.
- SynTask needs its own label definition tied to original `Task.due_date`, completion time, cancellation behavior, extension approvals, and carry-forward semantics.
- No evidence in this dataset for SynTask-specific workflow fields unless SynTask historical data is joined later.
