from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional

from fastapi import HTTPException, status as http_status

from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.core.clock import utc_now

PROJECT_ALLOWED_TRANSITIONS: Dict[ProjectStatus, set[ProjectStatus]] = {
    ProjectStatus.CREATED: {ProjectStatus.KICKOFF, ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED},
    ProjectStatus.KICKOFF: {ProjectStatus.EXECUTION, ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED},
    ProjectStatus.EXECUTION: {ProjectStatus.REVIEW, ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED},
    ProjectStatus.REVIEW: {ProjectStatus.COMPLETED, ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED},
    ProjectStatus.COMPLETED: {ProjectStatus.REPORTING},
    ProjectStatus.REPORTING: {ProjectStatus.ARCHIVED},
    ProjectStatus.ARCHIVED: set(),
    ProjectStatus.CANCELLED: set(),
    ProjectStatus.ON_HOLD: {ProjectStatus.CREATED, ProjectStatus.KICKOFF, ProjectStatus.EXECUTION, ProjectStatus.REVIEW},
    ProjectStatus.ACTIVE: {ProjectStatus.CREATED, ProjectStatus.KICKOFF, ProjectStatus.EXECUTION, ProjectStatus.REVIEW, ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED},
}


PROJECT_TERMINAL_STATUSES = {ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED, ProjectStatus.CANCELLED}
PROJECT_ACTIVE_EXECUTION_STATUSES = {ProjectStatus.ACTIVE, ProjectStatus.KICKOFF, ProjectStatus.EXECUTION, ProjectStatus.REVIEW}


def _normalize_status(value: Optional[str]) -> ProjectStatus:
    if not value:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Project status is required")
    try:
        return ProjectStatus(value.lower())
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid project status") from exc


async def advance_project(
    *,
    project: Project,
    current_user: User,
    target_status: str,
    reason: Optional[str] = None,
) -> Project:
    current_status = _normalize_status(project.status.value if getattr(project.status, "value", None) else str(project.status))
    next_status = _normalize_status(target_status)

    # Skip validation if status hasn't changed
    if current_status == next_status:
        return project

    allowed = PROJECT_ALLOWED_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Illegal project transition {current_status.value} -> {next_status.value}",
        )

    if next_status == ProjectStatus.COMPLETED:
        project.completed_at = utc_now()
    elif next_status != ProjectStatus.COMPLETED:
        project.completed_at = None

    project.status = next_status
    project.updated_at = utc_now()
    await project.save()
    return project

