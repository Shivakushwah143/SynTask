from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd


STAGES = ("creation", "discussion", "due")
LEAKAGE_FIELDS = {
    "delaydays": "target/outcome; includes days late after resolution",
    "issuekey": "identifier; project/subproject encoded and not behavioral",
    "openeddate": "chronological split field, not a task-risk feature by itself",
}


def pct(part: int, whole: int) -> float:
    return round((part / whole) * 100, 4) if whole else 0.0


def class_counts(df: pd.DataFrame) -> dict[str, Any]:
    delayed = int((df["delaydays"] > 0).sum())
    on_time = int((df["delaydays"] <= 0).sum())
    total = int(len(df))
    return {
        "rows": total,
        "delayed": delayed,
        "on_time": on_time,
        "delayed_ratio": round(delayed / total, 6) if total else 0.0,
        "delayed_percent": pct(delayed, total),
        "on_time_percent": pct(on_time, total),
    }


def dtype_name(series: pd.Series) -> str:
    return str(series.dtype)


def inspect_file(path: Path, project: str, stage: str) -> dict[str, Any]:
    df = pd.read_csv(path)
    missing = {col: int(count) for col, count in df.isna().sum().items() if int(count)}
    categorical_values = {}
    for col in ("type", "priority"):
        values = sorted(str(v) for v in df[col].dropna().unique().tolist())
        categorical_values[col] = values

    duplicate_rows = int(df.duplicated().sum())
    duplicate_issuekeys = int(df["issuekey"].duplicated().sum())
    negative_delaydays = int((df["delaydays"] < 0).sum())

    return {
        "file": str(path),
        "project": project,
        "stage": stage,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "column_names": df.columns.tolist(),
        "unique_issues": int(df["issuekey"].nunique()),
        "class_counts": class_counts(df),
        "missing_values": missing,
        "duplicate_rows": duplicate_rows,
        "duplicate_issuekeys": duplicate_issuekeys,
        "negative_delaydays": negative_delaydays,
        "datatypes": {col: dtype_name(df[col]) for col in df.columns},
        "categorical_values": categorical_values,
        "delaydays": {
            "min": float(df["delaydays"].min()),
            "max": float(df["delaydays"].max()),
            "mean": round(float(df["delaydays"].mean()), 6),
            "median": float(df["delaydays"].median()),
            "positive_min": float(df.loc[df["delaydays"] > 0, "delaydays"].min()),
            "positive_max": float(df.loc[df["delaydays"] > 0, "delaydays"].max()),
        },
    }


def audit(dataset_dir: Path) -> dict[str, Any]:
    files = sorted(dataset_dir.glob("*.csv"))
    inspected = []
    projects = sorted({path.stem.rsplit("_", 1)[0] for path in files})

    for path in files:
        project, stage = path.stem.rsplit("_", 1)
        if stage not in STAGES:
            continue
        inspected.append(inspect_file(path, project, stage))

    by_stage: dict[str, list[dict[str, Any]]] = {stage: [] for stage in STAGES}
    by_project: dict[str, list[dict[str, Any]]] = {project: [] for project in projects}
    for item in inspected:
        by_stage[item["stage"]].append(item)
        by_project[item["project"]].append(item)

    combined_issuekeys = set()
    combined_rows = 0
    for item in inspected:
        df = pd.read_csv(item["file"], usecols=["issuekey"])
        combined_issuekeys.update(df["issuekey"].astype(str).tolist())
        combined_rows += item["rows"]

    stage_summary = {}
    for stage, items in by_stage.items():
        frames = [pd.read_csv(item["file"]) for item in items]
        df = pd.concat(frames, ignore_index=True)
        stage_summary[stage] = {
            "rows": int(len(df)),
            "columns": sorted({item["columns"] for item in items}),
            "unique_issues": int(df["issuekey"].nunique()),
            "projects": len(items),
            "class_counts": class_counts(df),
            "duplicate_issuekeys": int(df["issuekey"].duplicated().sum()),
        }

    project_stage_summary = {}
    for project, items in by_project.items():
        project_stage_summary[project] = {
            item["stage"]: {
                "rows": item["rows"],
                "unique_issues": item["unique_issues"],
                **item["class_counts"],
            }
            for item in sorted(items, key=lambda x: STAGES.index(x["stage"]))
        }

    reference = pd.concat([pd.read_csv(item["file"]) for item in by_stage["creation"]], ignore_index=True)
    overall_class_counts = class_counts(reference)

    schema_sets = {
        stage: sorted({tuple(item["column_names"]) for item in items})
        for stage, items in by_stage.items()
    }

    return {
        "dataset_dir": str(dataset_dir),
        "csv_files": len(inspected),
        "projects": projects,
        "stages": list(STAGES),
        "total_rows_all_stage_files": combined_rows,
        "total_unique_issues_across_all_stage_files": len(combined_issuekeys),
        "overall_unique_issues": int(reference["issuekey"].nunique()),
        "overall_class_counts_from_creation_stage": overall_class_counts,
        "stage_summary": stage_summary,
        "project_stage_summary": project_stage_summary,
        "files": inspected,
        "schema_sets_per_stage": {stage: len(schemas) for stage, schemas in schema_sets.items()},
        "leakage_fields": LEAKAGE_FIELDS,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit EMSE2017 delayed issue CSV dataset.")
    parser.add_argument(
        "--dataset-dir",
        default="JIRA-Estimation-Prediction/delayed issues/EMSE2017/datasets",
        type=Path,
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = audit(args.dataset_dir)
    text = json.dumps(result, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
