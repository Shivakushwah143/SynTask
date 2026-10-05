# Logistic Regression V1 Baseline Report

## Scope

Baseline Logistic Regression for V1 Jira due-known task-risk dataset.

No hyperparameter tuning. No MLflow. No XGBoost. No SynTask application code changes.

## Inputs

- Train: `SynTask\mlops\data\splits\train_v1.csv`
- Validation: `SynTask\mlops\data\splits\val_v1.csv`
- Test: `SynTask\mlops\data\splits\test_v1.csv`

## Features

- Categorical: `issue_type_norm`, `priority_norm`
- Numeric: 11 required numeric V1 features scaled with `StandardScaler`
- One-hot encoding via `OneHotEncoder(handle_unknown="ignore")`
- Fit only on train split
- Decision threshold: 0.5

## Metrics

### train

- Rows: 45322
- ROC-AUC: 0.780884
- PR-AUC: 0.490256
- Precision: 0.65914
- Recall: 0.058908
- F1: 0.108151
- Brier score: 0.146142
- Confusion matrix [[TN, FP], [FN, TP]]: [[34599, 317], [9793, 613]]

### val

- Rows: 9712
- ROC-AUC: 0.789746
- PR-AUC: 0.325732
- Precision: 0.42953
- Recall: 0.047093
- F1: 0.084881
- Brier score: 0.109792
- Confusion matrix [[TN, FP], [FN, TP]]: [[8268, 85], [1295, 64]]

### test

- Rows: 9713
- ROC-AUC: 0.83751
- PR-AUC: 0.563103
- Precision: 0.77459
- Recall: 0.091748
- F1: 0.164062
- Brier score: 0.131052
- Confusion matrix [[TN, FP], [FN, TP]]: [[7598, 55], [1871, 189]]

## Top Coefficients

- `categorical__issue_type_norm_support`: 1.219893
- `numeric__fix_version_change_count`: -1.178186
- `categorical__issue_type_norm_story`: -1.005195
- `numeric__comment_count`: -0.874899
- `categorical__issue_type_norm_bug`: -0.694387
- `categorical__issue_type_norm_documentation`: 0.56874
- `categorical__issue_type_norm_other`: -0.559418
- `categorical__issue_type_norm_release`: 0.548322
- `categorical__issue_type_norm_improvement`: -0.448019
- `categorical__issue_type_norm_task`: -0.402527
- `categorical__issue_type_norm_subtask`: -0.396777
- `categorical__issue_type_norm_epic`: 0.357931
- `categorical__priority_norm_critical`: -0.354968
- `categorical__priority_norm_unknown`: -0.322884
- `categorical__priority_norm_low`: -0.220375
- `numeric__issue_link_count`: 0.19929
- `categorical__issue_type_norm_feature`: -0.170074
- `numeric__progress_days`: -0.11416
- `categorical__priority_norm_high`: -0.072591
- `categorical__issue_type_norm_test`: 0.058163

## Artifact

- `SynTask\mlops\artifacts\logistic_v1.joblib`

## Blockers / Notes

- Baseline uses default 0.5 threshold; no threshold tuning done.
- Logistic model is baseline only; no production-readiness claim.
- Dataset is Jira-only; SynTask serving parity risks from feature contract still apply.
