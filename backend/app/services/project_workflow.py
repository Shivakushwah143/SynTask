from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional

from fastapi import HTTPException, status as http_status

from app.models.project import Project, ProjectStatus
from app.models.user import User

PROJECT_ALLOWED_TRANSITIONS: Dict[ProjectStatus, set[ProjectStatus]] = {
    ProjectStatus.CREATED: {ProjectStatus.KICKOFF, ProjectStatus.ON_HOLD},
    ProjectStatus.KICKOFF: {ProjectStatus.EXECUTION, ProjectStatus.ON_HOLD},
    ProjectStatus.EXECUTION: {ProjectStatus.REVIEW, ProjectStatus.ON_HOLD},
    ProjectStatus.REVIEW: {ProjectStatus.COMPLETED, ProjectStatus.ON_HOLD},
    ProjectStatus.COMPLETED: {ProjectStatus.REPORTING},
    ProjectStatus.REPORTING: {ProjectStatus.ARCHIVED},
    ProjectStatus.ARCHIVED: set(),
    ProjectStatus.ON_HOLD: {ProjectStatus.CREATED, ProjectStatus.KICKOFF, ProjectStatus.EXECUTION, ProjectStatus.REVIEW},
    ProjectStatus.ACTIVE: {ProjectStatus.CREATED, ProjectStatus.KICKOFF, ProjectStatus.EXECUTION, ProjectStatus.REVIEW, ProjectStatus.ON_HOLD},
}


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

    allowed = PROJECT_ALLOWED_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Illegal project transition {current_status.value} -> {next_status.value}",
        )

    if next_status == ProjectStatus.COMPLETED:
        project.completed_at = datetime.utcnow()
    elif next_status != ProjectStatus.COMPLETED:
        project.completed_at = None

    project.status = next_status
    project.updated_at = datetime.utcnow()
    await project.save()
    return project
