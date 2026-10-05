from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


TARGET_COLUMN = "is_delayed"
CATEGORICAL_FEATURES = ["issue_type_norm", "priority_norm"]
NUMERIC_FEATURES = [
    "progress_days",
    "remaining_days",
    "comment_count",
    "priority_change_count",
    "fix_version_count",
    "fix_version_change_count",
    "issue_link_count",
    "blocking_count",
    "blocked_by_count",
    "affect_version_count",
    "description_change_count",
]
FEATURE_COLUMNS = [*CATEGORICAL_FEATURES, *NUMERIC_FEATURES]
THRESHOLD = 0.5


def load_split(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = sorted(set(FEATURE_COLUMNS + [TARGET_COLUMN]) - set(df.columns))
    if missing:
        raise ValueError(f"{path} missing required columns: {missing}")
    return df


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
        ]
    )
    return Pipeline(
        steps=[
            ("preprocess", preprocessor),
            ("model", LogisticRegression(max_iter=1000, random_state=42)),
        ]
    )


def evaluate(model: Pipeline, df: pd.DataFrame) -> dict[str, Any]:
    x = df[FEATURE_COLUMNS]
    y_true = df[TARGET_COLUMN].astype(int)
    y_prob = model.predict_proba(x)[:, 1]
    y_pred = (y_prob >= THRESHOLD).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "rows": int(len(df)),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 6),
        "pr_auc": round(float(average_precision_score(y_true, y_prob)), 6),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 6),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 6),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 6),
        "brier_score": round(float(brier_score_loss(y_true, y_prob)), 6),
        "confusion_matrix": {
            "labels": ["on_time", "delayed"],
            "matrix": cm.astype(int).tolist(),
            "tn": int(cm[0, 0]),
            "fp": int(cm[0, 1]),
            "fn": int(cm[1, 0]),
            "tp": int(cm[1, 1]),
        },
    }


def top_coefficients(model: Pipeline, top_n: int = 20) -> list[dict[str, Any]]:
    preprocessor = model.named_steps["preprocess"]
    classifier = model.named_steps["model"]
    feature_names = preprocessor.get_feature_names_out()
    coefficients = classifier.coef_[0]
    order = np.argsort(np.abs(coefficients))[::-1][:top_n]
    return [
        {
            "feature": str(feature_names[index]),
            "coefficient": round(float(coefficients[index]), 6),
            "abs_coefficient": round(float(abs(coefficients[index])), 6),
        }
        for index in order
    ]


def write_report(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Logistic Regression V1 Baseline Report",
        "",
        "## Scope",
        "",
        "Baseline Logistic Regression for V1 Jira due-known task-risk dataset.",
        "",
        "No hyperparameter tuning. No MLflow. No XGBoost. No SynTask application code changes.",
        "",
        "## Inputs",
        "",
        f"- Train: `{report['inputs']['train']}`",
        f"- Validation: `{report['inputs']['val']}`",
        f"- Test: `{report['inputs']['test']}`",
        "",
        "## Features",
        "",
        "- Categorical: `issue_type_norm`, `priority_norm`",
        "- Numeric: 11 required numeric V1 features scaled with `StandardScaler`",
        "- One-hot encoding via `OneHotEncoder(handle_unknown=\"ignore\")`",
        "- Fit only on train split",
        f"- Decision threshold: {THRESHOLD}",
        "",
        "## Metrics",
        "",
    ]
    for split in ("train", "val", "test"):
        metrics = report["metrics"][split]
        cm = metrics["confusion_matrix"]
        lines.extend(
            [
                f"### {split}",
                "",
                f"- Rows: {metrics['rows']}",
                f"- ROC-AUC: {metrics['roc_auc']}",
                f"- PR-AUC: {metrics['pr_auc']}",
                f"- Precision: {metrics['precision']}",
                f"- Recall: {metrics['recall']}",
                f"- F1: {metrics['f1']}",
                f"- Brier score: {metrics['brier_score']}",
                f"- Confusion matrix [[TN, FP], [FN, TP]]: {cm['matrix']}",
                "",
            ]
        )

    lines.extend(["## Top Coefficients", ""])
    for item in report["top_coefficients"]:
        lines.append(f"- `{item['feature']}`: {item['coefficient']}")

    lines.extend(
        [
            "",
            "## Artifact",
            "",
            f"- `{report['artifact']}`",
            "",
            "## Blockers / Notes",
            "",
            "- Baseline uses default 0.5 threshold; no threshold tuning done.",
            "- Logistic model is baseline only; no production-readiness claim.",
            "- Dataset is Jira-only; SynTask serving parity risks from feature contract still apply.",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Logistic Regression V1 baseline.")
    parser.add_argument("--train", type=Path, default=Path("SynTask/mlops/data/splits/train_v1.csv"))
    parser.add_argument("--val", type=Path, default=Path("SynTask/mlops/data/splits/val_v1.csv"))
    parser.add_argument("--test", type=Path, default=Path("SynTask/mlops/data/splits/test_v1.csv"))
    parser.add_argument("--artifact", type=Path, default=Path("SynTask/mlops/artifacts/logistic_v1.joblib"))
    parser.add_argument("--report", type=Path, default=Path("SynTask/docs/mlops/07_LOGISTIC_BASELINE_REPORT.md"))
    args = parser.parse_args()

    train = load_split(args.train)
    val = load_split(args.val)
    test = load_split(args.test)

    model = build_pipeline()
    model.fit(train[FEATURE_COLUMNS], train[TARGET_COLUMN].astype(int))

    args.artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_columns": FEATURE_COLUMNS,
            "categorical_features": CATEGORICAL_FEATURES,
            "numeric_features": NUMERIC_FEATURES,
            "target_column": TARGET_COLUMN,
            "threshold": THRESHOLD,
        },
        args.artifact,
    )

    report = {
        "inputs": {"train": str(args.train), "val": str(args.val), "test": str(args.test)},
        "artifact": str(args.artifact),
        "threshold": THRESHOLD,
        "metrics": {
            "train": evaluate(model, train),
            "val": evaluate(model, val),
            "test": evaluate(model, test),
        },
        "top_coefficients": top_coefficients(model),
    }
    write_report(report, args.report)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
