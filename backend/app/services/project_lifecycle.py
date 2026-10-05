"""Project lifecycle tab architecture helpers.

Single source of truth for how stored ``Project.status`` values map onto the
Work -> Projects lifecycle tabs, how health levels and the derived
``needs_setup`` attention condition are computed, and which stored statuses
each lifecycle filter resolves to.

Rules (kept in one place so list filters, summary counts, and frontend
presentation cannot drift):

- Tabs: ``created -> execution -> review -> completed -> reporting`` with
  ``on_hold``, ``archived`` and ``cancelled`` as side/terminal states.
  ``kickoff`` is intentionally NOT a tab (it is a pre-execution planning
  state in the ProjectWorkflow graph).
- Legacy compatibility: documents stored with the historical default
  ``active`` and documents sitting in ``kickoff`` are browsed under the
  Execution tab (the operational bucket); their stored values are never
  rewritten.
- Health is a separate dimension from lifecycle (a project can be
  ``execution`` AND ``at_risk``), and ``needs_setup`` is a separate derived
  condition that means "project exists but its execution plan has not been
  initialized" (no Tasks generated yet) - most relevant for Client/CRM
  auto-created Projects that precede execution Tasks.
"""
from __future__ import annotations

from typing import Dict, Optional

from app.models.project import ProjectStatus

# Canonical lifecycle tab ids, in pipeline order. "All Projects" is the empty
# tab (no lifecycle filter).
PROJECT_LIFECYCLE_TABS: list[str] = [
    "created",
    "execution",
    "review",
    "completed",
    "reporting",
    "on_hold",
    "archived",
    "cancelled",
]

PROJECT_HEALTH_LEVELS: list[str] = ["healthy", "needs_attention", "at_risk"]

# Stored statuses that historically existed but have no tab of their own:
# - ``active`` was the model default before the lifecycle statuses; it means
#   "operational" and is the Execution-equivalent of legacy documents.
# - ``kickoff`` is the planning state directly before ``execution`` in the
#   ProjectWorkflow transition graph. Both are browsed under Execution.
_LEGACY_EXECUTION_STATUSES: frozenset[str] = frozenset({"active", "kickoff"})

# Stored statuses that resolve to each lifecycle tab.
_TAB_TO_STORED_STATUSES: Dict[str, frozenset[str]] = {
    "created": frozenset({ProjectStatus.CREATED.value}),
    "execution": frozenset(
        {
            ProjectStatus.EXECUTION.value,
            ProjectStatus.ACTIVE.value,
            ProjectStatus.KICKOFF.value,
        }
    ),
    "review": frozenset({ProjectStatus.REVIEW.value}),
    "completed": frozenset({ProjectStatus.COMPLETED.value}),
    "reporting": frozenset({ProjectStatus.REPORTING.value}),
    "on_hold": frozenset({ProjectStatus.ON_HOLD.value}),
    "archived": frozenset({ProjectStatus.ARCHIVED.value}),
    "cancelled": frozenset({ProjectStatus.CANCELLED.value}),
}

_ALL_STORED_STATUSES = frozenset(
    status for tab in _TAB_TO_STORED_STATUSES.values() for status in tab
)

# Statuses a project can be in while an "execution plan has not been
# initialized" still makes sense (i.e. before the work formally finishes).
_NEEDS_SETUP_STATUSES: frozenset[str] = frozenset(
    {
        ProjectStatus.CREATED.value,
        ProjectStatus.KICKOFF.value,
        ProjectStatus.ACTIVE.value,
        ProjectStatus.EXECUTION.value,
    }
)

_VALID_TABS = set(PROJECT_LIFECYCLE_TABS)
_VALID_HEALTH = set(PROJECT_HEALTH_LEVELS)


def _as_status_value(status) -> Optional[str]:
    """Normalize a stored status (enum, str, or None) to its lower string."""
    value = status
    if hasattr(value, "value"):
        value = value.value
    if value is None:
        return None
    return str(value).strip().lower()


def lifecycle_tab_for_status(status) -> Optional[str]:
    """Map a stored status value to its lifecycle tab id (legacy folding)."""
    value = _as_status_value(status)
    if not value:
        return None
    if value in _LEGACY_EXECUTION_STATUSES:
        return "execution"
    if value in _VALID_TABS:
        return value
    return None


def stored_statuses_for_tab(tab: Optional[str]) -> frozenset[str]:
    """Stored Project.status values a lifecycle tab resolves to.

    ``None`` / ``""`` / ``"all"`` returns the full set of known stored
    lifecycle statuses (used for "All Projects" filtering and counting).
    """
    if not tab or tab == "all":
        return _ALL_STORED_STATUSES
    return _TAB_TO_STORED_STATUSES.get(tab, frozenset())


def is_valid_lifecycle_tab(tab: Optional[str]) -> bool:
    return (not tab) or tab in _VALID_TABS


def is_valid_health_level(health: Optional[str]) -> bool:
    return (not health) or health in _VALID_HEALTH


def project_needs_setup(*, status_value, task_count: int) -> bool:
    """Derived ``needs_setup`` condition.

    True only while the project is in a pre-terminal lifecycle state and has
    zero Tasks - i.e. no execution plan / template tasks have been generated.
    Uses only existing Project/Task data (no fragile duplicated state) and
    never flags terminal projects (completed/reporting/archived/cancelled) or
    on-hold projects that were intentionally paused.
    """
    value = _as_status_value(status_value)
    if not value or value not in _NEEDS_SETUP_STATUSES:
        return False
    return task_count <= 0


def status_is_terminal(status) -> bool:
    value = _as_status_value(status)
    return value in {
        ProjectStatus.COMPLETED.value,
        ProjectStatus.ARCHIVED.value,
        ProjectStatus.CANCELLED.value,
    }
