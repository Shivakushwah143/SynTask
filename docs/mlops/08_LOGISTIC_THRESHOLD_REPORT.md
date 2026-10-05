# Logistic Regression V1 Threshold Report

## Scope

Validation-only threshold sweep for Logistic Regression V1 baseline.

- Thresholds evaluated on validation only: 0.05 to 0.50, step 0.05.
- Selected threshold: best validation F1.
- Test set evaluated once after threshold selection.
- No model training. No test optimization.

## Selected Threshold

- Threshold: 0.3

## Validation Metrics At Selected Threshold

- Precision: 0.31394
- Recall: 0.782193
- F1: 0.448051
- Confusion matrix [[TN, FP], [FN, TP]]: [[6030, 2323], [296, 1063]]

## Test Metrics At Selected Threshold

- Precision: 0.44334
- Recall: 0.866019
- F1: 0.586456
- Confusion matrix [[TN, FP], [FN, TP]]: [[5413, 2240], [276, 1784]]

## Test Improvement Versus Threshold 0.5

- Precision delta: -0.33125
- Recall delta: 0.774271
- F1 delta: 0.422394

## Validation Threshold Sweep

- 0.05: precision=0.169923, recall=0.972774, F1=0.28931, cm=[[1895, 6458], [37, 1322]]
- 0.1: precision=0.186124, recall=0.945548, F1=0.311025, cm=[[2734, 5619], [74, 1285]]
- 0.15: precision=0.230379, recall=0.90287, F1=0.367091, cm=[[4254, 4099], [132, 1227]]
- 0.2: precision=0.282625, recall=0.84621, F1=0.423729, cm=[[5434, 2919], [209, 1150]]
- 0.25: precision=0.301146, recall=0.812362, F1=0.439403, cm=[[5791, 2562], [255, 1104]]
- 0.3: precision=0.31394, recall=0.782193, F1=0.448051, cm=[[6030, 2323], [296, 1063]]
- 0.35: precision=0.317598, recall=0.564386, F1=0.406465, cm=[[6705, 1648], [592, 767]]
- 0.4: precision=0.35448, recall=0.398823, F1=0.375346, cm=[[7366, 987], [817, 542]]
- 0.45: precision=0.339869, recall=0.11479, F1=0.171617, cm=[[8050, 303], [1203, 156]]
- 0.5: precision=0.42953, recall=0.047093, F1=0.084881, cm=[[8268, 85], [1295, 64]]

## Baseline Threshold 0.5

- Validation: precision=0.42953, recall=0.047093, F1=0.084881, cm=[[8268, 85], [1295, 64]]
- Test: precision=0.77459, recall=0.091748, F1=0.164062, cm=[[7598, 55], [1871, 189]]

## Blockers / Notes

- Threshold selected by validation F1 only; no business-cost threshold chosen.
- Test remains evaluation-only.
- Logistic baseline still Jira-only; SynTask serving parity risks remain.
