from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd


KEY_COLUMNS = ["source_project", "issuekey"]
TARGET_COLUMN = "is_delayed"


def class_balance(df: pd.DataFrame) -> dict[str, Any]:
    delayed = int((df[TARGET_COLUMN] == 1).sum())
    on_time = int((df[TARGET_COLUMN] == 0).sum())
    total = int(len(df))
    return {
        "rows": total,
        "delayed": delayed,
        "on_time": on_time,
        "delayed_ratio": round(delayed / total, 6) if total else 0.0,
    }


def date_range(df: pd.DataFrame) -> dict[str, str | None]:
    if df.empty:
        return {"start": None, "end": None}
    return {
        "start": df["openeddate"].min().strftime("%Y-%m-%d"),
        "end": df["openeddate"].max().strftime("%Y-%m-%d"),
    }


def overlap_count(left: pd.DataFrame, right: pd.DataFrame) -> int:
    left_keys = set(map(tuple, left[KEY_COLUMNS].astype(str).to_numpy()))
    right_keys = set(map(tuple, right[KEY_COLUMNS].astype(str).to_numpy()))
    return len(left_keys & right_keys)


def split_dataset(input_path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    df = pd.read_csv(input_path)
    if "openeddate" not in df.columns:
        raise ValueError("Input dataset must contain openeddate")
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Input dataset must contain {TARGET_COLUMN}")

    parsed_dates = pd.to_datetime(df["openeddate"], errors="coerce")
    invalid_dates = int(parsed_dates.isna().sum())
    if invalid_dates:
        raise ValueError(f"openeddate contains {invalid_dates} invalid values")

    sorted_df = df.assign(openeddate=parsed_dates).sort_values(
        ["openeddate", "source_project", "issuekey"],
        kind="mergesort",
    ).reset_index(drop=True)

    total = len(sorted_df)
    train_end = int(total * 0.70)
    val_end = train_end + int(total * 0.15)

    train = sorted_df.iloc[:train_end].copy()
    val = sorted_df.iloc[train_end:val_end].copy()
    test = sorted_df.iloc[val_end:].copy()

    overlaps = {
        "train_val": overlap_count(train, val),
        "train_test": overlap_count(train, test),
        "val_test": overlap_count(val, test),
    }

    report = {
        "input_path": str(input_path),
        "total_rows": total,
        "split_policy": "chronological_by_openeddate_70_15_15",
        "sort_columns": ["openeddate", "source_project", "issuekey"],
        "splits": {
            "train": {**class_balance(train), **date_range(train)},
            "val": {**class_balance(val), **date_range(val)},
            "test": {**class_balance(test), **date_range(test)},
        },
        "overlap_check": overlaps,
        "overlap_ok": all(count == 0 for count in overlaps.values()),
        "schema": [{"name": col, "dtype": str(sorted_df[col].dtype)} for col in sorted_df.columns],
    }
    return train, val, test, report


def write_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    output = df.copy()
    output["openeddate"] = output["openeddate"].dt.strftime("%Y-%m-%d %H:%M:%S")
    output.to_csv(path, index=False)


def write_report(report: dict[str, Any], path: Path, train_path: Path, val_path: Path, test_path: Path) -> None:
    lines = [
        "# V1 Temporal Split Report",
        "",
        "## Scope",
        "",
        "Chronological train/validation/test split for `task_risk_v1.csv`.",
        "",
        "No model training. No random split. No SynTask application code changes.",
        "",
        "## Inputs And Outputs",
        "",
        f"- Input: `{report['input_path']}`",
        f"- Train: `{train_path.as_posix()}`",
        f"- Validation: `{val_path.as_posix()}`",
        f"- Test: `{test_path.as_posix()}`",
        "",
        "## Split Policy",
        "",
        "- Sort by `openeddate`, then `source_project`, then `issuekey` for deterministic tie-breaking.",
        "- 70% train, 15% validation, 15% test.",
        "- Chronological split, no randomization.",
        "",
        "## Split Summary",
        "",
    ]
    for name in ("train", "val", "test"):
        split = report["splits"][name]
        lines.extend(
            [
                f"### {name}",
                "",
                f"- Rows: {split['rows']}",
                f"- Date range: {split['start']} to {split['end']}",
                f"- Delayed: {split['delayed']}",
                f"- On-time: {split['on_time']}",
                f"- Delayed ratio: {split['delayed_ratio']}",
                "",
            ]
        )

    lines.extend(
        [
            "## Overlap Check",
            "",
            f"- Train/validation overlap: {report['overlap_check']['train_val']}",
            f"- Train/test overlap: {report['overlap_check']['train_test']}",
            f"- Validation/test overlap: {report['overlap_check']['val_test']}",
            f"- Overlap OK: {report['overlap_ok']}",
            "",
            "## Schema Preserved",
            "",
        ]
    )
    for item in report["schema"]:
        lines.append(f"- {item['name']}: {item['dtype']}")

    lines.extend(
        [
            "",
            "## Blockers",
            "",
            "- None for temporal split.",
            "- Model training still blocked by later modeling/evaluation steps by design.",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chronologically split V1 task-risk dataset.")
    parser.add_argument("--input", type=Path, default=Path("SynTask/mlops/data/processed/task_risk_v1.csv"))
    parser.add_argument("--train-output", type=Path, default=Path("SynTask/mlops/data/splits/train_v1.csv"))
    parser.add_argument("--val-output", type=Path, default=Path("SynTask/mlops/data/splits/val_v1.csv"))
    parser.add_argument("--test-output", type=Path, default=Path("SynTask/mlops/data/splits/test_v1.csv"))
    parser.add_argument("--report", type=Path, default=Path("SynTask/docs/mlops/06_TEMPORAL_SPLIT_REPORT.md"))
    args = parser.parse_args()

    train, val, test, report = split_dataset(args.input)
    write_csv(train, args.train_output)
    write_csv(val, args.val_output)
    write_csv(test, args.test_output)
    write_report(report, args.report, args.train_output, args.val_output, args.test_output)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
