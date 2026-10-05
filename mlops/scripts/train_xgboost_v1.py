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
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier


EXPERIMENT_NAME = "syntask-task-risk"
REGISTERED_MODEL_NAME = "syntask-task-risk-xgboost"
DATASET_VERSION = "task_risk_v1"
DEFAULT_THRESHOLD = 0.50
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
THRESHOLDS = [round(float(x), 2) for x in np.arange(0.05, 0.501, 0.01)]


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
            ("numeric", "passthrough", NUMERIC_FEATURES),
        ]
    )
    classifier = XGBClassifier(
        objective="binary:logistic",
        eval_metric="logloss",
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=1,
    )
    return Pipeline(steps=[("preprocess", preprocessor), ("model", classifier)])


def predict_probabilities(model: Pipeline, df: pd.DataFrame) -> tuple[pd.Series, np.ndarray]:
    x = df[FEATURE_COLUMNS]
    y_true = df[TARGET_COLUMN].astype(int)
    y_prob = model.predict_proba(x)[:, 1]
    return y_true, y_prob


def evaluate_probabilities(y_true: pd.Series, y_prob: np.ndarray, threshold: float) -> dict[str, Any]:
    y_pred = (y_prob >= threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "rows": int(len(y_true)),
        "threshold": float(threshold),
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


def evaluate(model: Pipeline, df: pd.DataFrame, threshold: float) -> dict[str, Any]:
    y_true, y_prob = predict_probabilities(model, df)
    return evaluate_probabilities(y_true, y_prob, threshold)


def threshold_table(model: Pipeline, df: pd.DataFrame) -> list[dict[str, Any]]:
    y_true, y_prob = predict_probabilities(model, df)
    return [evaluate_probabilities(y_true, y_prob, threshold) for threshold in THRESHOLDS]


def select_threshold(rows: list[dict[str, Any]]) -> float:
    best = max(rows, key=lambda item: (item["f1"], item["recall"], item["precision"], -item["threshold"]))
    return float(best["threshold"])


def log_metrics(prefix: str, metrics: dict[str, Any]) -> None:
    for key in ("roc_auc", "pr_auc", "precision", "recall", "f1", "brier_score"):
        mlflow.log_metric(f"{prefix}_{key}", metrics[key])
    mlflow.log_metric(f"{prefix}_rows", metrics["rows"])


def write_json_artifact(name: str, payload: Any) -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / name
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        mlflow.log_artifact(str(path))


def feature_importances(model: Pipeline, limit: int = 20) -> list[dict[str, Any]]:
    feature_names = model.named_steps["preprocess"].get_feature_names_out()
    importances = model.named_steps["model"].feature_importances_
    order = np.argsort(importances)[::-1][:limit]
    return [
        {
            "feature": str(feature_names[index]),
            "importance": float(importances[index]),
        }
        for index in order
    ]


def write_report(report: dict[str, Any], path: Path) -> None:
    selected = report["selected_threshold"]
    default_test = report["metrics_threshold_0_5"]["test"]
    test = report["metrics_selected_threshold"]["test"]
    val = report["metrics_selected_threshold"]["val"]
    lines = [
        "# XGBoost V1",
        "",
        "## Scope",
        "",
        "XGBoost binary classifier for the V1 due-known task-risk dataset.",
        "",
        "- Same 13 V1 features as Logistic Regression V1.",
        "- Same chronological train/validation/test splits.",
        "- Fit only on train split.",
        "- Validation split used only for metric reporting and threshold selection.",
        "- No large tuning search.",
        "- No SynTask application code changes.",
        "",
        "## MLflow",
        "",
        f"- Experiment: `{report['experiment_name']}`",
        f"- Run ID: `{report['run_id']}`",
        f"- Registered model: `{report['registered_model_name']}`",
        f"- Model version: `{report['model_version']}`",
        "",
        "## Threshold 0.5 Test Metrics",
        "",
        f"- ROC-AUC: {default_test['roc_auc']:.6f}",
        f"- PR-AUC: {default_test['pr_auc']:.6f}",
        f"- Precision: {default_test['precision']:.6f}",
        f"- Recall: {default_test['recall']:.6f}",
        f"- F1: {default_test['f1']:.6f}",
        f"- Brier score: {default_test['brier_score']:.6f}",
        f"- Confusion matrix [[TN, FP], [FN, TP]]: {default_test['confusion_matrix']['matrix']}",
        "",
        "## Selected Threshold",
        "",
        f"- Selected threshold: {selected}",
        "- Selection rule: best validation F1 over thresholds 0.05 through 0.50.",
        "",
        "## Validation Metrics At Selected Threshold",
        "",
        f"- Precision: {val['precision']:.6f}",
        f"- Recall: {val['recall']:.6f}",
        f"- F1: {val['f1']:.6f}",
        f"- Confusion matrix [[TN, FP], [FN, TP]]: {val['confusion_matrix']['matrix']}",
        "",
        "## Test Metrics At Frozen Threshold",
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
        "- Local joblib model: `SynTask/mlops/artifacts/xgboost_v1.joblib`",
        "- MLflow artifact path: `joblib/xgboost_v1.joblib`",
        "- Confusion matrices: `xgboost_confusion_matrices.json`",
        "- Validation threshold table: `xgboost_validation_thresholds.json`",
        "- Feature importances: `xgboost_feature_importances.json`",
        "",
        "## Blockers",
        "",
        "- None for local training/tracking run.",
        "- Production use still blocked by SynTask serving-parity validation.",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and track XGBoost V1.")
    parser.add_argument("--train", type=Path, default=Path("SynTask/mlops/data/splits/train_v1.csv"))
    parser.add_argument("--val", type=Path, default=Path("SynTask/mlops/data/splits/val_v1.csv"))
    parser.add_argument("--test", type=Path, default=Path("SynTask/mlops/data/splits/test_v1.csv"))
    parser.add_argument("--tracking-uri", default="sqlite:///SynTask/mlops/mlflow.db")
    parser.add_argument("--local-artifact", type=Path, default=Path("SynTask/mlops/artifacts/xgboost_v1.joblib"))
    parser.add_argument("--report", type=Path, default=Path("SynTask/docs/mlops/10_XGBOOST_V1.md"))
    args = parser.parse_args()

    train = load_split(args.train)
    val = load_split(args.val)
    test = load_split(args.test)

    model = build_pipeline()
    model.fit(train[FEATURE_COLUMNS], train[TARGET_COLUMN].astype(int))

    validation_thresholds = threshold_table(model, val)
    selected_threshold = select_threshold(validation_thresholds)

    metrics_default = {
        "train": evaluate(model, train, DEFAULT_THRESHOLD),
        "val": evaluate(model, val, DEFAULT_THRESHOLD),
        "test": evaluate(model, test, DEFAULT_THRESHOLD),
    }
    metrics_selected = {
        "train": evaluate(model, train, selected_threshold),
        "val": evaluate(model, val, selected_threshold),
        "test": evaluate(model, test, selected_threshold),
    }

    args.local_artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_columns": FEATURE_COLUMNS,
            "categorical_features": CATEGORICAL_FEATURES,
            "numeric_features": NUMERIC_FEATURES,
            "target_column": TARGET_COLUMN,
            "threshold": selected_threshold,
            "default_threshold": DEFAULT_THRESHOLD,
            "dataset_version": DATASET_VERSION,
        },
        args.local_artifact,
    )

    Path("SynTask/mlops").mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(args.tracking_uri)
    mlflow.set_registry_uri(args.tracking_uri)
    mlflow.set_experiment(EXPERIMENT_NAME)
    with mlflow.start_run(run_name="xgboost_v1") as run:
        run_id = run.info.run_id
        classifier = model.named_steps["model"]
        mlflow.log_param("model_type", "XGBClassifier")
        mlflow.log_param("dataset_version", DATASET_VERSION)
        mlflow.log_param("feature_count", len(FEATURE_COLUMNS))
        mlflow.log_param("default_threshold", DEFAULT_THRESHOLD)
        mlflow.log_param("selected_threshold", selected_threshold)
        mlflow.log_param("threshold_selection", "best_validation_f1_thresholds_0_05_to_0_50")
        mlflow.log_param("temporal_split", "train_70_val_15_test_15_chronological_openeddate")
        mlflow.log_param("categorical_features", ",".join(CATEGORICAL_FEATURES))
        mlflow.log_param("numeric_features", ",".join(NUMERIC_FEATURES))
        for key, value in classifier.get_params().items():
            if key in {
                "objective",
                "eval_metric",
                "n_estimators",
                "max_depth",
                "learning_rate",
                "subsample",
                "colsample_bytree",
                "reg_lambda",
                "random_state",
                "n_jobs",
            }:
                mlflow.log_param(f"xgboost_{key}", value)
        mlflow.log_param("train_rows", len(train))
        mlflow.log_param("val_rows", len(val))
        mlflow.log_param("test_rows", len(test))

        for split_name, split_metrics in metrics_selected.items():
            log_metrics(split_name, split_metrics)
        for split_name, split_metrics in metrics_default.items():
            log_metrics(f"{split_name}_threshold_0_5", split_metrics)

        write_json_artifact(
            "xgboost_confusion_matrices.json",
            {
                "threshold_0_5": {
                    split_name: split_metrics["confusion_matrix"]
                    for split_name, split_metrics in metrics_default.items()
                },
                "selected_threshold": {
                    split_name: split_metrics["confusion_matrix"]
                    for split_name, split_metrics in metrics_selected.items()
                },
            },
        )
        write_json_artifact("xgboost_validation_thresholds.json", validation_thresholds)
        write_json_artifact("xgboost_feature_importances.json", feature_importances(model))
        mlflow.log_artifact(str(args.local_artifact), artifact_path="joblib")
        model_source_uri = mlflow.get_artifact_uri("joblib/xgboost_v1.joblib")

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
        "selected_threshold": selected_threshold,
        "metrics_threshold_0_5": metrics_default,
        "metrics_selected_threshold": metrics_selected,
        "tracking_uri": args.tracking_uri,
    }
    write_report(report, args.report)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
