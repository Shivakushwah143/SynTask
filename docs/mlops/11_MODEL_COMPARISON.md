# Model Comparison: Logistic V1 vs XGBoost V1

## Scope

Comparison of the existing Logistic Regression V1 and XGBoost V1 test results for the `task_risk_v1` due-known dataset.

- No retraining.
- No tuning.
- No deployment.
- Metrics are from existing frozen-threshold evaluation reports and MLflow-tracked runs.

## Inputs

- Logistic report: `SynTask/docs/mlops/09_MLFLOW_LOGISTIC_V1.md`
- Logistic threshold report: `SynTask/docs/mlops/08_LOGISTIC_THRESHOLD_REPORT.md`
- XGBoost report: `SynTask/docs/mlops/10_XGBOOST_V1.md`
- MLflow experiment: `syntask-task-risk`

## Test Metrics

| Metric | Logistic V1 | XGBoost V1 | Absolute XGBoost - Logistic |
|---|---:|---:|---:|
| Threshold | 0.30 | 0.48 | +0.18 |
| ROC-AUC | 0.837510 | 0.921303 | +0.083793 |
| PR-AUC | 0.563103 | 0.808414 | +0.245311 |
| Precision | 0.443340 | 0.708434 | +0.265094 |
| Recall | 0.866019 | 0.713592 | -0.152427 |
| F1 | 0.586456 | 0.711004 | +0.124548 |
| Brier score | 0.131052 | 0.086641 | -0.044411 |

Lower Brier score is better, so the XGBoost Brier delta is an improvement of `0.044411`.

## Confusion Matrices

Format: `[[TN, FP], [FN, TP]]`.

| Model | Threshold | Confusion Matrix |
|---|---:|---|
| Logistic V1 | 0.30 | `[[5413, 2240], [276, 1784]]` |
| XGBoost V1 | 0.48 | `[[7048, 605], [590, 1470]]` |

Absolute confusion-matrix movement for XGBoost versus Logistic:

- True negatives: `+1635`
- False positives: `-1635`
- False negatives: `+314`
- True positives: `-314`

## Candidate Selection

Selected candidate: **XGBoost V1**.

Reason: XGBoost has stronger overall predictive quality on the held-out chronological test set, with materially higher ROC-AUC, PR-AUC, precision, F1, and lower Brier score. It also reduces false positives substantially at the selected validation-F1 threshold.

Tradeoff: Logistic V1 has higher recall and misses fewer delayed tasks. XGBoost is the better candidate when balancing ranking quality, precision, F1, and probability error, but threshold policy remains a product decision if missed-delay cost is judged much higher than false-alarm cost.

## Blockers

- No deployment decision has been made.
- No production threshold policy has been chosen.
- SynTask serving-parity validation remains required before production use.
- Business cost of false negatives versus false positives is unresolved.
