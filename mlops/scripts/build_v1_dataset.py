from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd


FEATURE_VERSION = "task_risk_v1_required_due_known_2026-10-01"
PREDICTION_STAGE = "due_known"

METADATA_COLUMNS = ["source_project", "issuekey", "openeddate", "prediction_stage"]
TARGET_COLUMN = "is_delayed"
FEATURE_COLUMNS = [
    "issue_type_norm",
    "priority_norm",
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
OUTPUT_COLUMNS = [*METADATA_COLUMNS, TARGET_COLUMN, *FEATURE_COLUMNS]
LEAKAGE_DENYLIST = {
    "delaydays",
    "completed_at",
    "resolved_at",
    "completed_by",
    "resolved_by",
    "topic_10",
    "topic_100",
    "topic_200",
    "topic_300",
    "topic_400",
}
COUNT_COLUMNS = [
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

PRIORITY_MAP = {
    "blocker": "critical",
    "critical": "critical",
    "major": "high",
    "minor": "medium",
    "trivial": "low",
    "optional": "unknown",
    "to be reviewed": "unknown",
}

TYPE_MAP = {
    "bug": "bug",
    "fug": "bug",
    "customer problem": "bug",
    "quality risk": "bug",
    "task": "task",
    "code task": "task",
    "technical task": "task",
    "technical requirement": "task",
    "business requirement": "task",
    "request": "task",
    "subtask": "subtask",
    "sub-task": "subtask",
    "documentation sub-task": "subtask",
    "component upgrade subtask": "subtask",
    "story": "story",
    "newfeature": "feature",
    "new feature": "feature",
    "feature request": "feature",
    "enhancement request": "feature",
    "improvement": "improvement",
    "enhancement": "improvement",
    "wish": "improvement",
    "suggestion": "improvement",
    "documentation": "documentation",
    "test": "test",
    "functionaltest": "test",
    "release test": "test",
    "epic": "epic",
    "umbrella": "epic",
    "support request": "support",
    "support patch": "support",
    "patch": "support",
    "patch submission": "support",
    "release": "release",
    "technical debt": "technical_debt",
}


def normalize_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().lower()


def normalize_priority(value: Any) -> str:
    key = normalize_text(value)
    if not key:
        return "unknown"
    return PRIORITY_MAP.get(key, "unknown")


def normalize_type(value: Any) -> str:
    key = normalize_text(value)
    if not key:
        return "unknown"
    return TYPE_MAP.get(key, "other")


def class_counts(df: pd.DataFrame) -> dict[str, Any]:
    delayed = int((df[TARGET_COLUMN] == 1).sum())
    on_time = int((df[TARGET_COLUMN] == 0).sum())
    total = int(len(df))
    return {
        "delayed": delayed,
        "on_time": on_time,
        "delayed_ratio": round(delayed / total, 6) if total else 0.0,
    }


def missing_counts(df: pd.DataFrame, columns: list[str] | None = None) -> dict[str, int]:
    target = df[columns] if columns else df
    return {col: int(count) for col, count in target.isna().sum().items() if int(count)}


def read_due_files(dataset_dir: Path) -> pd.DataFrame:
    paths = sorted(dataset_dir.glob("*_due.csv"))
    if not paths:
        raise FileNotFoundError(f"No *_due.csv files found in {dataset_dir}")

    frames = []
    for path in paths:
        project = path.stem.rsplit("_", 1)[0]
        df = pd.read_csv(path)
        df.insert(0, "source_project", project)
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def build_dataset(raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    required_source_columns = {
        "source_project",
        "issuekey",
        "openeddate",
        "delaydays",
        "type",
        "priority",
        "ProgressTime",
        "RemainingDay",
        "no_comment",
        "no_priority_change",
        "no_fixversion",
        "no_fixversion_change",
        "no_issuelink",
        "no_blocking",
        "no_blockedby",
        "no_affectversion",
        "no_des_change",
    }
    missing_required = sorted(required_source_columns - set(raw.columns))
    if missing_required:
        raise ValueError(f"Missing required source columns: {missing_required}")

    duplicates_mask = raw.duplicated(subset=["source_project", "issuekey"], keep=False)
    duplicate_rows = raw.loc[duplicates_mask].copy()

    canonical = pd.DataFrame(
        {
            "source_project": raw["source_project"].astype(str),
            "issuekey": raw["issuekey"].astype(str),
            "openeddate": raw["openeddate"],
            "prediction_stage": PREDICTION_STAGE,
            "is_delayed": (raw["delaydays"] > 0).astype(int),
            "issue_type_norm": raw["type"].map(normalize_type),
            "priority_norm": raw["priority"].map(normalize_priority),
            "progress_days": raw["ProgressTime"],
            "remaining_days": raw["RemainingDay"],
            "comment_count": raw["no_comment"],
            "priority_change_count": raw["no_priority_change"],
            "fix_version_count": raw["no_fixversion"],
            "fix_version_change_count": raw["no_fixversion_change"],
            "issue_link_count": raw["no_issuelink"],
            "blocking_count": raw["no_blocking"],
            "blocked_by_count": raw["no_blockedby"],
            "affect_version_count": raw["no_affectversion"],
            "description_change_count": raw["no_des_change"],
        }
    )

    invalid_reasons: list[list[str]] = [[] for _ in range(len(canonical))]
    for col in COUNT_COLUMNS:
        invalid = canonical[col].isna() | (canonical[col] < 0)
        for idx in canonical.index[invalid]:
            invalid_reasons[idx].append(f"invalid_{col}")

    invalid_progress = canonical["progress_days"].isna() | (canonical["progress_days"] < 0)
    for idx in canonical.index[invalid_progress]:
        invalid_reasons[idx].append("invalid_progress_days")

    invalid_remaining = canonical["remaining_days"].isna() | (canonical["remaining_days"] < 0)
    for idx in canonical.index[invalid_remaining]:
        invalid_reasons[idx].append("invalid_remaining_days")

    for idx in canonical.index[duplicates_mask]:
        invalid_reasons[idx].append("duplicate_project_issuekey")

    quarantine_mask = pd.Series([bool(reasons) for reasons in invalid_reasons], index=canonical.index)
    quarantine = canonical.loc[quarantine_mask].copy()
    quarantine.insert(
        0,
        "quarantine_reason",
        [";".join(invalid_reasons[idx]) for idx in canonical.index[quarantine_mask]],
    )

    accepted = canonical.loc[~quarantine_mask, OUTPUT_COLUMNS].copy()
    quarantine = quarantine[["quarantine_reason", *OUTPUT_COLUMNS]]

    leakage_present = sorted((set(accepted.columns) | set(FEATURE_COLUMNS)) & LEAKAGE_DENYLIST)
    feature_matrix_leakage_present = sorted(set(FEATURE_COLUMNS) & LEAKAGE_DENYLIST)

    report = {
        "feature_version": FEATURE_VERSION,
        "prediction_stage": PREDICTION_STAGE,
        "raw_rows": int(len(raw)),
        "accepted_rows": int(len(accepted)),
        "quarantined_rows": int(len(quarantine)),
        "duplicates": int(duplicates_mask.sum()),
        "duplicate_keys": int(raw.loc[duplicates_mask, ["source_project", "issuekey"]].drop_duplicates().shape[0]),
        "target_distribution": class_counts(accepted),
        "raw_missing_values": missing_counts(raw),
        "final_missing_values": missing_counts(accepted),
        "raw_required_missing_values": missing_counts(raw, sorted(required_source_columns)),
        "normalized_missing_values": missing_counts(accepted, OUTPUT_COLUMNS),
        "rows_per_source_project": {k: int(v) for k, v in accepted["source_project"].value_counts().sort_index().items()},
        "quarantine_reasons": {k: int(v) for k, v in quarantine["quarantine_reason"].value_counts().sort_index().items()} if len(quarantine) else {},
        "final_schema": [{"name": col, "dtype": str(accepted[col].dtype)} for col in accepted.columns],
        "metadata_columns": METADATA_COLUMNS,
        "target_column": TARGET_COLUMN,
        "feature_columns": FEATURE_COLUMNS,
        "feature_count": len(FEATURE_COLUMNS),
        "leakage_fields_present_anywhere": leakage_present,
        "leakage_fields_present_in_feature_matrix": feature_matrix_leakage_present,
        "priority_normalization": PRIORITY_MAP,
        "type_normalization": TYPE_MAP,
    }
    return accepted, quarantine, report


def write_report(report: dict[str, Any], path: Path, output_csv: Path, quarantine_csv: Path, script_path: Path) -> None:
    target = report["target_distribution"]
    lines = [
        "# V1 Jira Due-Known Dataset Build Report",
        "",
        "## Scope",
        "",
        "Built canonical V1 training dataset from all `*_due.csv` files only.",
        "",
        "No model training, no train/validation/test split, no MLflow, no SynTask application code changes.",
        "",
        "## Inputs",
        "",
        "- Source: `JIRA-Estimation-Prediction/delayed issues/EMSE2017/datasets/*_due.csv`",
        f"- Script: `{script_path.as_posix()}`",
        f"- Feature version: `{report['feature_version']}`",
        f"- Prediction stage: `{report['prediction_stage']}`",
        "",
        "## Outputs",
        "",
        f"- Accepted dataset: `{output_csv.as_posix()}`",
        f"- Quarantine dataset: `{quarantine_csv.as_posix()}`",
        "",
        "## Build Counts",
        "",
        f"- Raw rows: {report['raw_rows']}",
        f"- Accepted rows: {report['accepted_rows']}",
        f"- Quarantined rows: {report['quarantined_rows']}",
        f"- Duplicate rows by `(source_project, issuekey)`: {report['duplicates']}",
        f"- Duplicate keys by `(source_project, issuekey)`: {report['duplicate_keys']}",
        "",
        "## Target Distribution",
        "",
        f"- Delayed: {target['delayed']}",
        f"- On-time: {target['on_time']}",
        f"- Delayed ratio: {target['delayed_ratio']}",
        "",
        "## Rows Per Source Project",
        "",
    ]
    for project, count in report["rows_per_source_project"].items():
        lines.append(f"- {project}: {count}")

    lines.extend(
        [
            "",
            "## Missing Values",
            "",
            "Raw required-column missing values:",
            "",
        ]
    )
    if report["raw_required_missing_values"]:
        for col, count in report["raw_required_missing_values"].items():
            lines.append(f"- {col}: {count}")
    else:
        lines.append("- none")

    lines.extend(["", "Final accepted dataset missing values:", ""])
    if report["final_missing_values"]:
        for col, count in report["final_missing_values"].items():
            lines.append(f"- {col}: {count}")
    else:
        lines.append("- none")

    lines.extend(["", "## Quarantine", ""])
    if report["quarantine_reasons"]:
        for reason, count in report["quarantine_reasons"].items():
            lines.append(f"- {reason}: {count}")
    else:
        lines.append("- none")

    lines.extend(
        [
            "",
            "## Leakage Validation",
            "",
            f"- Leakage fields in feature matrix: {report['leakage_fields_present_in_feature_matrix']}",
            f"- Leakage/denied fields present anywhere in accepted output: {report['leakage_fields_present_anywhere']}",
            "- `delaydays` is used only to create `is_delayed` and is not written to the final dataset.",
            "- `issuekey` is metadata only, not a model feature.",
            "- `openeddate` is metadata only for future temporal splitting.",
            "- Optional V1 features are not included.",
            "- `topic_*` features are not included.",
            "",
            "## Final Schema",
            "",
        ]
    )
    for item in report["final_schema"]:
        lines.append(f"- {item['name']}: {item['dtype']}")

    lines.extend(
        [
            "",
            "## Feature Columns",
            "",
        ]
    )
    for col in report["feature_columns"]:
        lines.append(f"- {col}")

    lines.extend(
        [
            "",
            "## Blockers / Notes",
            "",
            "- Dataset is built from Jira only; SynTask serving parity still depends on changelog/dependency policy verification.",
            "- No train/validation/test split has been created.",
            "- No model has been trained.",
        ]
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build canonical Jira due-known V1 task-risk dataset.")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("JIRA-Estimation-Prediction/delayed issues/EMSE2017/datasets"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("SynTask/mlops/data/processed/task_risk_v1.csv"),
    )
    parser.add_argument(
        "--quarantine-output",
        type=Path,
        default=Path("SynTask/mlops/data/processed/task_risk_v1_quarantine.csv"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("SynTask/docs/mlops/05_DATASET_BUILD_REPORT.md"),
    )
    args = parser.parse_args()

    raw = read_due_files(args.dataset_dir)
    accepted, quarantine, report = build_dataset(raw)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    accepted.to_csv(args.output, index=False)
    quarantine.to_csv(args.quarantine_output, index=False)
    write_report(
        report,
        args.report,
        args.output,
        args.quarantine_output,
        Path("SynTask/mlops/scripts/build_v1_dataset.py"),
    )

    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
