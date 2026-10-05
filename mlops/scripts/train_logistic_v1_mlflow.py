from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any

import joblib
import mlflow
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


EXPERIMENT_NAME = "syntask-task-risk"
REGISTERED_MODEL_NAME = "syntask-task-risk-logistic"
DATASET_VERSION = "task_risk_v1"
THRESHOLD = 0.30
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


def load_split(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = sorted(set(FEATURE_COLUMNS + [TARGET_COLUMN]) - set(df.columns))
    if missing:
        raise ValueError(f"{path} missing columns: {missing}")
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


def evaluate(model: Pipeline, df: pd.DataFrame, threshold: float) -> dict[str, Any]:
    x = df[FEATURE_COLUMNS]
    y_true = df[TARGET_COLUMN].astype(int)
    y_prob = model.predict_proba(x)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "rows": int(len(df)),
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "pr_auc": float(average_precision_score(y_true, y_prob)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "brier_score": float(brier_score_loss(y_true, y_prob)),
        "confusion_matrix": {
            "labels": ["on_time", "delayed"],
            "matrix": cm.astype(int).tolist(),
            "tn": int(cm[0, 0]),
            "fp": int(cm[0, 1]),
            "fn": int(cm[1, 0]),
            "tp": int(cm[1, 1]),
        },
    }


def top_coefficients(model: Pipeline, limit: int = 20) -> list[dict[str, Any]]:
    feature_names = model.named_steps["preprocess"].get_feature_names_out()
    coefficients = model.named_steps["model"].coef_[0]
    order = np.argsort(np.abs(coefficients))[::-1][:limit]
    return [
        {
            "feature": str(feature_names[index]),
            "coefficient": float(coefficients[index]),
            "abs_coefficient": float(abs(coefficients[index])),
        }
        for index in order
    ]


def log_metrics(prefix: str, metrics: dict[str, Any]) -> None:
    for key in ("roc_auc", "pr_auc", "precision", "recall", "f1", "brier_score"):
        mlflow.log_metric(f"{prefix}_{key}", metrics[key])
    mlflow.log_metric(f"{prefix}_rows", metrics["rows"])


def write_json_artifact(name: str, payload: Any) -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / name
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        mlflow.log_artifact(str(path))


def write_report(report: dict[str, Any], path: Path) -> None:
    test = report["metrics"]["test"]
    lines = [
        "# MLflow Logistic Regression V1",
        "",
        "## Scope",
        "",
        "Tracked Logistic Regression V1 baseline in MLflow.",
        "",
        "- No model logic change.",
        "- No XGBoost.",
        "- Threshold fixed at 0.30 from Step 10.",
        "",
        "## MLflow",
        "",
        f"- Experiment: `{report['experiment_name']}`",
        f"- Run ID: `{report['run_id']}`",
        f"- Registered model: `{report['registered_model_name']}`",
        f"- Model version: `{report['model_version']}`",
        "",
        "## Test Metrics",
        "",
        f"- ROC-AUC: {test['roc_auc']:.6f}",
        f"- PR-AUC: {test['pr_auc']:.6f}",
        f"- Precision: {test['precision']:.6f}",
        f"- Recall: {test['recall']:.6f}",
        f"- F1: {test['f1']:.6f}",
        f"- Brier score: {test['brier_score']:.6f}",
        f"- Confusion matrix [[TN, FP], [FN, TP]]: {test['confusion_matrix']['matrix']}",
        "",
        "## Artifacts",
        "",
        "- MLflow sklearn model artifact: `model`",
        "- Confusion matrices: `confusion_matrices.json`",
        "- Top coefficients: `top_coefficients.json`",
        "- Local joblib model: `SynTask/mlops/artifacts/logistic_v1.joblib`",
        "",
        "## Blockers",
        "",
        "- None for local MLflow tracking run.",
        "- Production use still blocked by SynTask serving-parity validation.",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Track Logistic Regression V1 in MLflow.")
    parser.add_argument("--train", type=Path, default=Path("SynTask/mlops/data/splits/train_v1.csv"))
    parser.add_argument("--val", type=Path, default=Path("SynTask/mlops/data/splits/val_v1.csv"))
    parser.add_argument("--test", type=Path, default=Path("SynTask/mlops/data/splits/test_v1.csv"))
    parser.add_argument("--tracking-uri", default="sqlite:///SynTask/mlops/mlflow.db")
    parser.add_argument("--local-artifact", type=Path, default=Path("SynTask/mlops/artifacts/logistic_v1.joblib"))
    parser.add_argument("--report", type=Path, default=Path("SynTask/docs/mlops/09_MLFLOW_LOGISTIC_V1.md"))
    args = parser.parse_args()

    train = load_split(args.train)
    val = load_split(args.val)
    test = load_split(args.test)

    model = build_pipeline()
    model.fit(train[FEATURE_COLUMNS], train[TARGET_COLUMN].astype(int))

    args.local_artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_columns": FEATURE_COLUMNS,
            "categorical_features": CATEGORICAL_FEATURES,
            "numeric_features": NUMERIC_FEATURES,
            "target_column": TARGET_COLUMN,
            "threshold": THRESHOLD,
        },
        args.local_artifact,
    )

    metrics = {
        "train": evaluate(model, train, THRESHOLD),
        "val": evaluate(model, val, THRESHOLD),
        "test": evaluate(model, test, THRESHOLD),
    }

    Path("SynTask/mlops").mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(args.tracking_uri)
    mlflow.set_registry_uri(args.tracking_uri)
    mlflow.set_experiment(EXPERIMENT_NAME)
    with mlflow.start_run(run_name="logistic_v1_threshold_0_30") as run:
        run_id = run.info.run_id
        classifier = model.named_steps["model"]
        mlflow.log_param("model_type", "LogisticRegression")
        mlflow.log_param("dataset_version", DATASET_VERSION)
        mlflow.log_param("feature_count", len(FEATURE_COLUMNS))
        mlflow.log_param("threshold", THRESHOLD)
        mlflow.log_param("temporal_split", "train_70_val_15_test_15_chronological_openeddate")
        mlflow.log_param("categorical_features", ",".join(CATEGORICAL_FEATURES))
        mlflow.log_param("numeric_features", ",".join(NUMERIC_FEATURES))
        mlflow.log_param("logistic_max_iter", classifier.max_iter)
        mlflow.log_param("logistic_random_state", classifier.random_state)
        mlflow.log_param("logistic_solver", classifier.solver)
        mlflow.log_param("logistic_penalty", classifier.penalty)
        mlflow.log_param("train_rows", len(train))
        mlflow.log_param("val_rows", len(val))
        mlflow.log_param("test_rows", len(test))

        for split_name, split_metrics in metrics.items():
            log_metrics(split_name, split_metrics)

        write_json_artifact(
            "confusion_matrices.json",
            {split_name: split_metrics["confusion_matrix"] for split_name, split_metrics in metrics.items()},
        )
        write_json_artifact("top_coefficients.json", top_coefficients(model))
        mlflow.log_artifact(str(args.local_artifact), artifact_path="joblib")
        model_source_uri = mlflow.get_artifact_uri("joblib/logistic_v1.joblib")

    client = mlflow.tracking.MlflowClient()
    try:
        client.create_registered_model(REGISTERED_MODEL_NAME)
    except Exception:
        pass
    created_version = client.create_model_version(
        name=REGISTERED_MODEL_NAME,
        source=model_source_uri,
        run_id=run_id,
    )
    model_version = created_version.version

    report = {
        "experiment_name": EXPERIMENT_NAME,
        "run_id": run_id,
        "registered_model_name": REGISTERED_MODEL_NAME,
        "model_version": str(model_version),
        "threshold": THRESHOLD,
        "metrics": metrics,
        "tracking_uri": args.tracking_uri,
    }
    write_report(report, args.report)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
