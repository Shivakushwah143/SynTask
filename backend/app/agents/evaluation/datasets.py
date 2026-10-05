"""
AI Evaluation — versioned dataset registry & loader.

Dataset files are immutable once used as a baseline. A materially different set
of expectations must ship as a NEW dataset id/version, never by editing a file
that already produced a baseline run.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from app.agents.evaluation.schemas import EvalCase, EvalDataset

DATASETS_DIR = Path(__file__).resolve().parent / "datasets"

# Dataset id → file name. Keep in sync with the AgentDefinition
# ``evaluation_set_version`` of the matching agent.
_DATASET_FILES = {
    "executive-operations-eval-v1": "executive-operations-eval-v1.json",
    "hr-operations-eval-v1": "hr-operations-eval-v1.json",
}

_cache: dict[str, EvalDataset] = {}


def available_dataset_ids() -> list[str]:
    return sorted(_DATASET_FILES)


def list_datasets() -> list[dict]:
    """Lightweight metadata for every registered dataset (no cases)."""
    return [_dataset_meta(load_dataset(dataset_id)) for dataset_id in available_dataset_ids()]


def _dataset_meta(dataset: EvalDataset) -> dict:
    return {
        "dataset_id": dataset.dataset_id,
        "dataset_version": dataset.dataset_version,
        "agent_id": dataset.agent_id,
        "agent_version": dataset.agent_version,
        "actor_role": dataset.actor_role,
        "description": dataset.description,
        "case_count": len(dataset.cases),
        "critical_case_count": sum(1 for case in dataset.cases if case.critical),
        "categories": sorted({case.category for case in dataset.cases}),
    }


def load_dataset(dataset_id: str) -> Optional[EvalDataset]:
    """Load (and cache) a versioned eval dataset."""
    if dataset_id in _cache:
        return _cache[dataset_id]
    file_name = _DATASET_FILES.get(dataset_id)
    if not file_name:
        return None
    path = DATASETS_DIR / file_name
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    dataset = EvalDataset.model_validate(raw)
    _cache[dataset_id] = dataset
    return dataset


def case_by_id(dataset: EvalDataset, case_id: str) -> Optional[EvalCase]:
    for case in dataset.cases:
        if case.id == case_id:
            return case
    return None
