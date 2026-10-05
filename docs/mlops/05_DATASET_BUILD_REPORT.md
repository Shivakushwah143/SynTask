# V1 Jira Due-Known Dataset Build Report

## Scope

Built canonical V1 training dataset from all `*_due.csv` files only.

No model training, no train/validation/test split, no MLflow, no SynTask application code changes.

## Inputs

- Source: `JIRA-Estimation-Prediction/delayed issues/EMSE2017/datasets/*_due.csv`
- Script: `SynTask/mlops/scripts/build_v1_dataset.py`
- Feature version: `task_risk_v1_required_due_known_2026-10-01`
- Prediction stage: `due_known`

## Outputs

- Accepted dataset: `SynTask/mlops/data/processed/task_risk_v1.csv`
- Quarantine dataset: `SynTask/mlops/data/processed/task_risk_v1_quarantine.csv`

## Build Counts

- Raw rows: 64747
- Accepted rows: 64747
- Quarantined rows: 0
- Duplicate rows by `(source_project, issuekey)`: 0
- Duplicate keys by `(source_project, issuekey)`: 0

## Target Distribution

- Delayed: 13825
- On-time: 50922
- Delayed ratio: 0.213523

## Rows Per Source Project

- apache: 6289
- duraspace: 3676
- javanet: 16326
- jboss: 3526
- jira: 4428
- moodle: 17004
- mulesoft: 8269
- wso2: 5229

## Missing Values

Raw required-column missing values:

- priority: 2292

Final accepted dataset missing values:

- none

## Quarantine

- none

## Leakage Validation

- Leakage fields in feature matrix: []
- Leakage/denied fields present anywhere in accepted output: []
- `delaydays` is used only to create `is_delayed` and is not written to the final dataset.
- `issuekey` is metadata only, not a model feature.
- `openeddate` is metadata only for future temporal splitting.
- Optional V1 features are not included.
- `topic_*` features are not included.

## Final Schema

- source_project: str
- issuekey: str
- openeddate: str
- prediction_stage: str
- is_delayed: int64
- issue_type_norm: str
- priority_norm: str
- progress_days: int64
- remaining_days: int64
- comment_count: int64
- priority_change_count: int64
- fix_version_count: int64
- fix_version_change_count: int64
- issue_link_count: int64
- blocking_count: int64
- blocked_by_count: int64
- affect_version_count: int64
- description_change_count: int64

## Feature Columns

- issue_type_norm
- priority_norm
- progress_days
- remaining_days
- comment_count
- priority_change_count
- fix_version_count
- fix_version_change_count
- issue_link_count
- blocking_count
- blocked_by_count
- affect_version_count
- description_change_count

## Blockers / Notes

- Dataset is built from Jira only; SynTask serving parity still depends on changelog/dependency policy verification.
- No train/validation/test split has been created.
- No model has been trained.
