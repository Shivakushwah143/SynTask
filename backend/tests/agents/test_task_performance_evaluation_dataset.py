from __future__ import annotations

import json
from pathlib import Path

from app.services.task_performance_metrics import METRIC_DEFINITIONS


DATASET = Path(__file__).parent / "evaluation" / "task_performance_eval_cases.json"


def test_task_performance_evaluation_dataset_is_synthetic_and_policy_scoped():
    cases = json.loads(DATASET.read_text())

    assert len(cases) == 5
    for case in cases:
        assert case["synthetic"] is True
        assert case["id"].startswith("tp-")
        assert case["required_metric_keys"]
        assert set(case["required_metric_keys"]).issubset(set(METRIC_DEFINITIONS))
        forbidden = " ".join(case["must_not_include"]).lower()
        assert any(
            term in forbidden
            for term in ["fire", "salary", "rank", "disciplinary", "terminate", "best employee", "worst employee", "promotion"]
        )
