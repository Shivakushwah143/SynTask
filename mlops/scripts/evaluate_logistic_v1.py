from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score


THRESHOLDS = [round(float(x), 2) for x in np.arange(0.05, 0.51, 0.05)]


def load_model_bundle(path: Path) -> dict[str, Any]:
    bundle = joblib.load(path)
    required = {"model", "feature_columns", "target_column"}
    missing = required - set(bundle)
    if missing:
        raise ValueError(f"Model artifact missing keys: {sorted(missing)}")
    return bundle


def load_split(path: Path, feature_columns: list[str], target_column: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = sorted(set(feature_columns + [target_column]) - set(df.columns))
    if missing:
        raise ValueError(f"{path} missing columns: {missing}")
    return df


def metrics_at_threshold(y_true: pd.Series, y_prob: np.ndarray, threshold: float) -> dict[str, Any]:
    y_pred = (y_prob >= threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "threshold": threshold,
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 6),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 6),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 6),
        "confusion_matrix": {
            "labels": ["on_time", "delayed"],
            "matrix": cm.astype(int).tolist(),
            "tn": int(cm[0, 0]),
            "fp": int(cm[0, 1]),
            "fn": int(cm[1, 0]),
            "tp": int(cm[1, 1]),
        },
    }


def choose_best_threshold(results: list[dict[str, Any]]) -> dict[str, Any]:
    # Deterministic tie-break: higher F1, then higher recall, then higher precision, then higher threshold.
    return sorted(
        results,
        key=lambda item: (item["f1"], item["recall"], item["precision"], item["threshold"]),
        reverse=True,
    )[0]


def delta(selected: dict[str, Any], baseline: dict[str, Any]) -> dict[str, float]:
    return {
        "precision_delta": round(selected["precision"] - baseline["precision"], 6),
        "recall_delta": round(selected["recall"] - baseline["recall"], 6),
        "f1_delta": round(selected["f1"] - baseline["f1"], 6),
    }


def write_report(report: dict[str, Any], path: Path) -> None:
    selected = report["selected_threshold"]
    val = report["validation_selected_metrics"]
    test = report["test_selected_metrics"]
    test_cm = test["confusion_matrix"]
    improvement = report["test_improvement_vs_0_5"]

    lines = [
        "# Logistic Regression V1 Threshold Report",
        "",
        "## Scope",
        "",
        "Validation-only threshold sweep for Logistic Regression V1 baseline.",
        "",
        "- Thresholds evaluated on validation only: 0.05 to 0.50, step 0.05.",
        "- Selected threshold: best validation F1.",
        "- Test set evaluated once after threshold selection.",
        "- No model training. No test optimization.",
        "",
        "## Selected Threshold",
        "",
        f"- Threshold: {selected}",
        "",
        "## Validation Metrics At Selected Threshold",
        "",
        f"- Precision: {val['precision']}",
        f"- Recall: {val['recall']}",
        f"- F1: {val['f1']}",
        f"- Confusion matrix [[TN, FP], [FN, TP]]: {val['confusion_matrix']['matrix']}",
        "",
        "## Test Metrics At Selected Threshold",
        "",
        f"- Precision: {test['precision']}",
        f"- Recall: {test['recall']}",
        f"- F1: {test['f1']}",
        f"- Confusion matrix [[TN, FP], [FN, TP]]: {test_cm['matrix']}",
        "",
        "## Test Improvement Versus Threshold 0.5",
        "",
        f"- Precision delta: {improvement['precision_delta']}",
        f"- Recall delta: {improvement['recall_delta']}",
        f"- F1 delta: {improvement['f1_delta']}",
        "",
        "## Validation Threshold Sweep",
        "",
    ]
    for row in report["validation_threshold_sweep"]:
        lines.append(
            f"- {row['threshold']}: precision={row['precision']}, recall={row['recall']}, "
            f"F1={row['f1']}, cm={row['confusion_matrix']['matrix']}"
        )

    lines.extend(
        [
            "",
            "## Baseline Threshold 0.5",
            "",
            f"- Validation: precision={report['validation_baseline_0_5']['precision']}, "
            f"recall={report['validation_baseline_0_5']['recall']}, "
            f"F1={report['validation_baseline_0_5']['f1']}, "
            f"cm={report['validation_baseline_0_5']['confusion_matrix']['matrix']}",
            f"- Test: precision={report['test_baseline_0_5']['precision']}, "
            f"recall={report['test_baseline_0_5']['recall']}, "
            f"F1={report['test_baseline_0_5']['f1']}, "
            f"cm={report['test_baseline_0_5']['confusion_matrix']['matrix']}",
            "",
            "## Blockers / Notes",
            "",
            "- Threshold selected by validation F1 only; no business-cost threshold chosen.",
            "- Test remains evaluation-only.",
            "- Logistic baseline still Jira-only; SynTask serving parity risks remain.",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Logistic Regression V1 thresholds.")
    parser.add_argument("--artifact", type=Path, default=Path("SynTask/mlops/artifacts/logistic_v1.joblib"))
    parser.add_argument("--val", type=Path, default=Path("SynTask/mlops/data/splits/val_v1.csv"))
    parser.add_argument("--test", type=Path, default=Path("SynTask/mlops/data/splits/test_v1.csv"))
    parser.add_argument("--report", type=Path, default=Path("SynTask/docs/mlops/08_LOGISTIC_THRESHOLD_REPORT.md"))
    args = parser.parse_args()

    bundle = load_model_bundle(args.artifact)
    model = bundle["model"]
    feature_columns = list(bundle["feature_columns"])
    target_column = str(bundle["target_column"])

    val = load_split(args.val, feature_columns, target_column)
    test = load_split(args.test, feature_columns, target_column)

    val_y = val[target_column].astype(int)
    test_y = test[target_column].astype(int)
    val_prob = model.predict_proba(val[feature_columns])[:, 1]
    test_prob = model.predict_proba(test[feature_columns])[:, 1]

    val_results = [metrics_at_threshold(val_y, val_prob, threshold) for threshold in THRESHOLDS]
    selected_val = choose_best_threshold(val_results)
    selected_threshold = selected_val["threshold"]
    test_selected = metrics_at_threshold(test_y, test_prob, selected_threshold)
    val_baseline = metrics_at_threshold(val_y, val_prob, 0.5)
    test_baseline = metrics_at_threshold(test_y, test_prob, 0.5)

    report = {
        "artifact": str(args.artifact),
        "validation_path": str(args.val),
        "test_path": str(args.test),
        "selection_rule": "best_validation_f1",
        "selected_threshold": selected_threshold,
        "validation_threshold_sweep": val_results,
        "validation_selected_metrics": selected_val,
        "test_selected_metrics": test_selected,
        "validation_baseline_0_5": val_baseline,
        "test_baseline_0_5": test_baseline,
        "test_improvement_vs_0_5": delta(test_selected, test_baseline),
    }
    write_report(report, args.report)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
