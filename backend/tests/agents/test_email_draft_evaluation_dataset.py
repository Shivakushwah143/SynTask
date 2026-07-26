from __future__ import annotations

import json
from pathlib import Path


DATASET_PATH = Path(__file__).parent / "evaluation" / "email_draft_eval_v1.json"


def test_email_draft_evaluation_dataset_has_required_safety_categories():
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    cases = dataset["cases"]
    categories = {case["category"] for case in cases}

    assert dataset["dataset_id"] == "email-draft-eval-v1"
    assert dataset["synthetic"] is True
    assert len(cases) >= 18
    assert {
        "normal_draft",
        "recipient",
        "recipient_security",
        "context_permission",
        "context_authority",
        "template_security",
        "personalization_security",
        "security",
        "runtime",
    }.issubset(categories)
    for case in cases:
        assert case["case_id"]
        assert case["input"]
        assert case["expected_schema_behavior"]
        assert case["expected_no_send_behavior"] == "no_send_no_queue_no_connector"
