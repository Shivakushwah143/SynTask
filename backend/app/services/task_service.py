import asyncio
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.services.automation_service import trigger_automation


class TaskService:
    @staticmethod
    async def resolve_project(project_identifier: Optional[str], company_id: str) -> tuple[Optional[str], Optional[str]]:
        if not project_identifier:
            return None, None

        project = await Project.find_one(Project.project_id == project_identifier, Project.company_id == company_id)
        if not project:
            try:
                ObjectId(project_identifier)
                candidate = await Project.get(project_identifier)
                if candidate and candidate.company_id == company_id:
                    project = candidate
            except Exception:
                project = None
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project.project_id or str(project.id), str(project.id)

    @staticmethod
    async def update_status(task: Task, new_status: TaskStatus, user_id: Optional[str] = None) -> Task:
        old_status = task.status.value if hasattr(task.status, "value") else str(task.status)
        task.status = new_status
        status_value = new_status.value if hasattr(new_status, "value") else str(new_status)
        if status_value.lower() in {"completed", "complete", "done"}:
            task.completed_at = datetime.utcnow()
        else:
            task.completed_at = None
        task.updated_at = datetime.utcnow()
        await task.save()

        if old_status != status_value:
            asyncio.create_task(
                trigger_automation(
                    trigger_type="status_changed",
                    entity_type="task",
                    entity_id=str(task.id),
                    company_id=task.company_id,
                    changed_fields={"status": {"from": old_status, "to": status_value}},
                    user_id=user_id,
                )
            )
        return task
