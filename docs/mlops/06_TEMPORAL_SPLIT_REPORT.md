# V1 Temporal Split Report

## Scope

Chronological train/validation/test split for `task_risk_v1.csv`.

No model training. No random split. No SynTask application code changes.

## Inputs And Outputs

- Input: `SynTask\mlops\data\processed\task_risk_v1.csv`
- Train: `SynTask/mlops/data/splits/train_v1.csv`
- Validation: `SynTask/mlops/data/splits/val_v1.csv`
- Test: `SynTask/mlops/data/splits/test_v1.csv`

## Split Policy

- Sort by `openeddate`, then `source_project`, then `issuekey` for deterministic tie-breaking.
- 70% train, 15% validation, 15% test.
- Chronological split, no randomization.

## Split Summary

### train

- Rows: 45322
- Date range: 2004-01-26 to 2013-06-17
- Delayed: 10406
- On-time: 34916
- Delayed ratio: 0.229602

### val

- Rows: 9712
- Date range: 2013-06-17 to 2014-10-22
- Delayed: 1359
- On-time: 8353
- Delayed ratio: 0.13993

### test

- Rows: 9713
- Date range: 2014-10-22 to 2016-03-18
- Delayed: 2060
- On-time: 7653
- Delayed ratio: 0.212087

## Overlap Check

- Train/validation overlap: 0
- Train/test overlap: 0
- Validation/test overlap: 0
- Overlap OK: True

## Schema Preserved

- source_project: str
- issuekey: str
- openeddate: datetime64[us]
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

## Blockers

- None for temporal split.
- Model training still blocked by later modeling/evaluation steps by design.
