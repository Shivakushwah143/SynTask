"""Project Lifecycle Tabs — mapping, counts, Needs Setup, and filter builders.

Pure-logic tests (no Mongo). Verify:
- stored status -> lifecycle tab mapping incl. legacy ``active`` / ``kickoff``
  folding under Execution and no Kickoff tab
- ``needs_setup`` derivation boundaries (terminal/on-hold excluded)
- lifecycle + health summary count derivation over a project set
- server-side list filter building (lifecycle, search, owner, priority, type,
  client, delivery windows) without React-side filtering
"""
import re
from datetime import datetime

import pytest

from app.models.project import ProjectStatus
from app.services.project_lifecycle import (
    PROJECT_HEALTH_LEVELS,
    PROJECT_LIFECYCLE_TABS,
    lifecycle_tab_for_status,
    project_needs_setup,
    stored_statuses_for_tab,
    is_valid_health_level,
    is_valid_lifecycle_tab,
    status_is_terminal,
)
from app.api.v1.endpoints.projects.project_status_summary import (
    derive_health_and_setup_counts,
    derive_lifecycle_counts,
)
from app.api.v1.endpoints.projects.project_list import (
    _build_db_filters,
    _delivery_window_condition,
    _resolve_lifecycle_status,
    _search_condition,
)


def _project(**overrides):
    return type(
        "FakeProject",
        (),
        {
            "id": overrides.get("id", "p-1"),
            "project_id": overrides.get("project_id", "PROJ-1"),
            "company_id": overrides.get("company_id", "company-1"),
            "status": overrides.get("status", ProjectStatus.CREATED),
            "delivery_date": overrides.get("delivery_date"),
        },
    )()


def _task(**overrides):
    return type(
        "FakeTask",
        (),
        {
            "id": overrides.get("id", "t-1"),
            "status": overrides.get("status", "todo"),
            "priority": overrides.get("priority", "medium"),
            "due_date": overrides.get("due_date", None),
            "updated_at": overrides.get("updated_at", datetime.utcnow()),
        },
    )()


# --- stored status -> tab mapping -----------------------------------------


def test_no_kickoff_tab():
    assert "kickoff" not in PROJECT_LIFECYCLE_TABS
    assert "active" not in PROJECT_LIFECYCLE_TABS


def test_lifecycle_tab_order_and_required_statuses():
    assert PROJECT_LIFECYCLE_TABS == [
        "created",
        "execution",
        "review",
        "completed",
        "reporting",
        "on_hold",
        "archived",
        "cancelled",
    ]


@pytest.mark.parametrize(
    "status_value,expected",
    [
        ("created", "created"),
        ("execution", "execution"),
        ("review", "review"),
        ("completed", "completed"),
        ("reporting", "reporting"),
        ("on_hold", "on_hold"),
        ("archived", "archived"),
        ("cancelled", "cancelled"),
        # Legacy / pre-execution states fold under Execution for browsing.
        ("active", "execution"),
        ("kickoff", "execution"),
        (ProjectStatus.ACTIVE, "execution"),
        (None, None),
        ("mystery_state", None),
    ],
)
def test_lifecycle_tab_for_status(status_value, expected):
    assert lifecycle_tab_for_status(status_value) == expected


def test_stored_statuses_for_execution_folds_legacy_states():
    assert stored_statuses_for_tab("execution") == {
        "execution",
        "active",
        "kickoff",
    }


def test_stored_statuses_for_all_covers_every_known_status():
    known = stored_statuses_for_tab(None)
    for status in ProjectStatus:
        assert status.value in known
    # every tab's statuses are a subset of the all-set
    for tab in PROJECT_LIFECYCLE_TABS:
        assert stored_statuses_for_tab(tab).issubset(known)


def test_validators():
    assert is_valid_lifecycle_tab("execution")
    assert is_valid_lifecycle_tab(None)
    assert not is_valid_lifecycle_tab("kickoff")
    assert is_valid_health_level("at_risk")
    assert not is_valid_health_level("overdue")
    assert status_is_terminal("completed")
    assert status_is_terminal(ProjectStatus.CANCELLED)
    assert not status_is_terminal("execution")


# --- needs_setup derivation ------------------------------------------------


@pytest.mark.parametrize(
    "status_value,task_count,expected",
    [
        ("created", 0, True),
        ("kickoff", 0, True),
        ("active", 0, True),
        ("execution", 0, True),
        ("created", 2, False),
        ("execution", 1, False),
        ("review", 0, False),  # past the pre-execution window
        ("on_hold", 0, False),  # intentionally paused, not missing a plan
        ("completed", 0, False),
        ("reporting", 0, False),
        ("archived", 0, False),
        ("cancelled", 0, False),
        (None, 0, False),
    ],
)
def test_project_needs_setup_boundaries(status_value, task_count, expected):
    assert project_needs_setup(status_value=status_value, task_count=task_count) is expected


# --- summary count derivation ---------------------------------------------


def test_derive_lifecycle_counts_folds_legacy_active_and_kickoff_into_execution():
    projects = [
        _project(id="p-1", status="created"),
        _project(id="p-2", status="created"),
        _project(id="p-3", status="active"),       # legacy -> Execution
        _project(id="p-4", status="kickoff"),      # -> Execution
        _project(id="p-5", status="execution"),
        _project(id="p-6", status="review"),
        _project(id="p-7", status="completed"),
        _project(id="p-8", status="on_hold"),
        _project(id="p-9", status="archived"),
        _project(id="p-10", status="cancelled"),
    ]
    counts = derive_lifecycle_counts(projects)
    assert counts["all"] == 10
    assert counts["created"] == 2
    assert counts["execution"] == 3
    assert counts["review"] == 1
    assert counts["completed"] == 1
    assert counts["reporting"] == 0
    assert counts["on_hold"] == 1
    assert counts["archived"] == 1
    assert counts["cancelled"] == 1
    # tabs sum to All Projects (lifecycle and health never mix)
    assert sum(counts[tab] for tab in PROJECT_LIFECYCLE_TABS) == counts["all"]


def test_derive_health_and_setup_counts():
    projects = [
        _project(id="p-1", status="created"),      # no tasks -> needs_setup, healthy
        _project(id="p-2", status="execution"),    # task complete -> not setup, healthy
        _project(id="p-3", status="completed"),    # terminal, no tasks -> healthy, not setup
    ]
    grouped = {
        "p-1": [],
        "p-2": [_task(id="t-2", status="completed")],
        "p-3": [],
    }
    counts = derive_health_and_setup_counts(projects, grouped)
    for level in PROJECT_HEALTH_LEVELS:
        assert counts[level] == (3 if level == "healthy" else 0)
    assert counts["needs_setup"] == 1


# --- list filter builders --------------------------------------------------


def test_resolve_lifecycle_status_maps_tabs_and_legacy_values():
    assert _resolve_lifecycle_status(None, None) is None
    assert _resolve_lifecycle_status("all", None) is None
    assert _resolve_lifecycle_status("created", None) == "created"
    assert _resolve_lifecycle_status("execution", None) == "execution"
    assert _resolve_lifecycle_status("active", None) == "execution"
    assert _resolve_lifecycle_status(None, "kickoff") == "execution"
    assert _resolve_lifecycle_status(None, "scheduled") == "scheduled"
    with pytest.raises(Exception):
        _resolve_lifecycle_status("not_a_status", None)


def test_build_db_filters_status_execution_uses_folded_status_set():
    query = _build_db_filters(
        {"company_id": "c1"},
        lifecycle_status="execution",
        search=None,
        client_id=None,
        owner_id=None,
        priority=None,
        project_type=None,
        delivery=None,
    )
    branches = [query] if "$and" not in query else list(query["$and"])
    flat = {k: v for branch in branches for k, v in branch.items()}
    assert flat["company_id"] == "c1"
    assert flat["status"] == {"$in": ["active", "execution", "kickoff"]}


def test_build_db_filters_status_created_matches_created_only():
    query = _build_db_filters(
        {},
        lifecycle_status="created",
        search=None,
        client_id=None,
        owner_id=None,
        priority=None,
        project_type=None,
        delivery=None,
    )
    # {} scope is dropped, leaving only the status condition
    assert query == {"status": {"$in": ["created"]}}


def test_build_db_filters_combines_all_dimensions_without_overwrite():
    query = _build_db_filters(
        {"company_id": "c1"},
        lifecycle_status="review",
        search="website",
        client_id="client-9",
        owner_id="user-2",
        priority="critical",
        project_type="software",
        delivery=None,
    )
    assert isinstance(query, dict)
    assert query["$and"]
    combined = {k: v for part in query["$and"] for k, v in part.items()}
    assert combined["company_id"] == "c1"
    assert combined["status"] == {"$in": ["review"]}
    assert combined["client_id"] == "client-9"
    assert combined["priority"] == "critical"
    assert combined["type"] == "software"
    # owner filter must not clobber the existing $or from a Lead scope because
    # it lives in its own AND branch referencing only lead_id/assigned_to
    owner_branch = [part for part in query["$and"] if part.get("$or") and "lead_id" in part["$or"][0]][0]
    assert owner_branch["$or"] == [{"lead_id": "user-2"}, {"assigned_to": "user-2"}]


def test_search_condition_is_case_insensitive_regex():
    condition = _search_condition("Acme")
    assert condition["$or"][0]["name"].pattern == re.compile("Acme", re.IGNORECASE).pattern


def test_delivery_window_conditions_bounds():
    now = datetime(2026, 8, 15, 12, 0, 0)
    overdue = _delivery_window_condition("overdue", now)
    assert overdue == {"delivery_date": {"$lt": now}}
    week = _delivery_window_condition("next_7_days", now)
    assert week["delivery_date"]["$gte"] == now
    assert (week["delivery_date"]["$lte"] - now).days == 7
    with pytest.raises(Exception):
        _delivery_window_condition("bogus", now)
