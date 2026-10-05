# XGBoost V1

## Scope

XGBoost binary classifier for the V1 due-known task-risk dataset.

- Same 13 V1 features as Logistic Regression V1.
- Same chronological train/validation/test splits.
- Fit only on train split.
- Validation split used only for metric reporting and threshold selection.
- No large tuning search.
- No SynTask application code changes.

## MLflow

- Experiment: `syntask-task-risk`
- Run ID: `01293f107d014c978f2ec7d632336894`
- Registered model: `syntask-task-risk-xgboost`
- Model version: `1`

## Threshold 0.5 Test Metrics

- ROC-AUC: 0.921303
- PR-AUC: 0.808414
- Precision: 0.725422
- Recall: 0.709223
- F1: 0.717231
- Brier score: 0.086641
- Confusion matrix [[TN, FP], [FN, TP]]: [[7100, 553], [599, 1461]]

## Selected Threshold

- Selected threshold: 0.48
- Selection rule: best validation F1 over thresholds 0.05 through 0.50.

## Validation Metrics At Selected Threshold

- Precision: 0.692583
- Recall: 0.570272
- F1: 0.625504
- Confusion matrix [[TN, FP], [FN, TP]]: [[8009, 344], [584, 775]]

## Test Metrics At Frozen Threshold

- ROC-AUC: 0.921303
- PR-AUC: 0.808414
- Precision: 0.708434
- Recall: 0.713592
- F1: 0.711004
- Brier score: 0.086641
- Confusion matrix [[TN, FP], [FN, TP]]: [[7048, 605], [590, 1470]]

## Artifacts

- Local joblib model: `SynTask/mlops/artifacts/xgboost_v1.joblib`
- MLflow artifact path: `joblib/xgboost_v1.joblib`
- Confusion matrices: `xgboost_confusion_matrices.json`
- Validation threshold table: `xgboost_validation_thresholds.json`
- Feature importances: `xgboost_feature_importances.json`

## Blockers

- None for local training/tracking run.
- Production use still blocked by SynTask serving-parity validation.
