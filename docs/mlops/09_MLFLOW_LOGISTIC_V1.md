# MLflow Logistic Regression V1

## Scope

Tracked Logistic Regression V1 baseline in MLflow.

- No model logic change.
- No XGBoost.
- Threshold fixed at 0.30 from Step 10.

## MLflow

- Experiment: `syntask-task-risk`
- Run ID: `5f5b3c589af645888a82dd02f3bbe35a`
- Registered model: `syntask-task-risk-logistic`
- Model version: `1`

## Test Metrics

- ROC-AUC: 0.837510
- PR-AUC: 0.563103
- Precision: 0.443340
- Recall: 0.866019
- F1: 0.586456
- Brier score: 0.131052
- Confusion matrix [[TN, FP], [FN, TP]]: [[5413, 2240], [276, 1784]]

## Artifacts

- MLflow sklearn model artifact: `model`
- Confusion matrices: `confusion_matrices.json`
- Top coefficients: `top_coefficients.json`
- Local joblib model: `SynTask/mlops/artifacts/logistic_v1.joblib`

## Blockers

- None for local MLflow tracking run.
- Production use still blocked by SynTask serving-parity validation.
