from __future__ import annotations

import json
from pathlib import Path

from app.agents.project_agent import DEPARTMENT_SPECIALIST_EVALUATION_SET_VERSION, department_specialist_definitions


def test_department_specialist_evaluation_dataset_has_required_release_shape():
    path = Path(__file__).parent / "evaluation" / "department_specialist_eval_cases.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    cases_by_specialist = payload["cases_by_specialist"]

    assert payload["version"] == DEPARTMENT_SPECIALIST_EVALUATION_SET_VERSION
    assert payload["synthetic"] is True
    assert set(cases_by_specialist) == {item.specialist_id for item in department_specialist_definitions()}
    assert all(len(cases) == 8 for cases in cases_by_specialist.values())
    assert sum(len(cases) for cases in cases_by_specialist.values()) == 112
    assert len(payload["cross_pack_cases"]) == 8
    assert all(value == 0 for value in payload["release_gates"].values())
