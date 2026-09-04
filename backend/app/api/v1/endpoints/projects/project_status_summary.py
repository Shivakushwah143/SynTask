"""Project lifecycle + health summary counts for the Work -> Projects workspace.

``GET /projects/status-summary`` returns lifecycle tab counts (All Projects,
Created, Execution, Review, Completed, Reporting, On Hold, Archived,
Cancelled), health-level counts (Healthy / Needs Attention / At Risk) and the
derived ``needs_setup`` attention count. Counts apply the SAME company
isolation, RBAC, owner/manager scope, and Project visibility as the Project
list (``build_project_list_query``), so Company A never sees Company B counts
and employees only count the Projects they can access.

The endpoint MUST be registered before any ``/{project_id}`` route so the
literal ``status-summary`` segment is not swallowed as a project id.
"""
from collections import Counter

from fastapi import APIRouter, Depends

from .shared import enum_or_string_value
from app.api.dependencies import get_current_user  # noqa: F401  (re-exported pattern)
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services.project_health_service import calculate_project_health
from app.services.project_lifecycle import (
    PROJECT_HEALTH_LEVELS,
    PROJECT_LIFECYCLE_TABS,
    project_needs_setup,
    stored_statuses_for_tab,
)

router = APIRouter()


def derive_lifecycle_counts(projects) -> dict:
    """Count stored statuses and fold legacy values onto lifecycle tabs."""
    by_status: Counter = Counter()
    for project in projects:
        value = enum_or_string_value(getattr(project, "status", None))
        by_status[str(value).lower() if value is not None else ""] += 1
    counts = {}
    for tab in PROJECT_LIFECYCLE_TABS:
        counts[tab] = sum(by_status[status] for status in stored_statuses_for_tab(tab))
    counts["all"] = len(projects)
    return counts


def derive_health_and_setup_counts(projects, grouped_tasks) -> dict:
    """Classify every scoped Project's health level and needs_setup.

    ``grouped_tasks`` maps a Project Mongo id (str) to its Task list and is
    produced once by ``group_project_tasks`` so health classification reuses
    the exact ``ProjectHealthService`` calculation (never a competing health
    implementation) without an N+1 query per Project.
    """
    health_counts = {level: 0 for level in PROJECT_HEALTH_LEVELS}
    needs_setup = 0
    for project in projects:
        tasks = grouped_tasks.get(str(project.id), [])
        health = calculate_project_health(project, tasks)
        health_counts[health.level] = health_counts.get(health.level, 0) + 1
        if project_needs_setup(
            status_value=enum_or_string_value(getattr(project, "status", None)),
            task_count=len(tasks),
        ):
            needs_setup += 1
    return {**health_counts, "needs_setup": needs_setup}


async def group_project_tasks(projects) -> dict:
    """Load every Task belonging to the given Projects in one query.

    Mirrors ``project_task_identity_filter`` semantics (logical ``project_id``,
    Mongo ``_id`` string, or ``project_object_id`` link) combined across the
    whole set, so a Task is grouped under exactly one Project.
    """
    if not projects:
        return {}
    mongo_ids = {str(project.id) for project in projects}
    key_to_project = {}
    for project in projects:
        key_to_project[str(project.id)] = project
        logical = getattr(project, "project_id", None)
        if logical and str(logical) not in key_to_project:
            key_to_project[str(logical)] = project
    company_ids = {str(project.company_id) for project in projects if getattr(project, "company_id", None)}
    task_query: dict = {
        "$or": [
            {"project_id": {"$in": sorted(key_to_project.keys())}},
            {"project_object_id": {"$in": sorted(mongo_ids)}},
        ]
    }
    if len(company_ids) == 1:
        task_query["company_id"] = company_ids.pop()
    elif company_ids:
        task_query["company_id"] = {"$in": sorted(company_ids)}
    tasks = await Task.find(task_query).to_list()
    grouped: dict = {}
    for task in tasks:
        owner = None
        project_object_id = getattr(task, "project_object_id", None)
        if project_object_id and str(project_object_id) in key_to_project:
            owner = key_to_project[str(project_object_id)]
        if owner is None and getattr(task, "project_id", None):
            owner = key_to_project.get(str(task.project_id))
        if owner is not None:
            grouped.setdefault(str(owner.id), []).append(task)
    return grouped


@router.get("/status-summary")
async def project_status_summary(
    current_user: User = Depends(get_current_user),
):
    """Lifecycle + health + needs_setup counts for the Projects workspace.

    Lifecycle (status) and health stay separate dimensions: ``at_risk`` is a
    health level, never a lifecycle value. ``needs_setup`` counts Projects
    whose execution plan has not been initialized (no Tasks yet) and is an
    attention condition, not a status.
    """
    from .project_list import build_project_list_query

    query = await build_project_list_query(current_user)
    projects = await Project.find(query).to_list()
    counts = derive_lifecycle_counts(projects)
    grouped = await group_project_tasks(projects)
    counts.update(derive_health_and_setup_counts(projects, grouped))
    return counts
