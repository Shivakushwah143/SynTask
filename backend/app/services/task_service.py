import asyncio
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from app.core.clock import parse_to_utc, utc_now
from app.models.user import User

from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus
from app.services.automation_service import trigger_automation
from app.services.task_workflow import creation_status, effective_review_required, validate_reviewer, normalize_checklist


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
    async def update_status(task: Task, new_status: TaskStatus, user_id: Optional[str] = None, current_user: Optional[User] = None) -> Task:
        if not current_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current user is required for task workflow transitions")
        from app.services.task_workflow import action_for_status_transition, transition_task
        action = action_for_status_transition(task.status, new_status)
        return await transition_task(task=task, actor=current_user, action=action, target_status=new_status.value)

    @staticmethod
    async def update_execution(task: Task, payload: dict[str, Any]) -> Task:
        if "progress_percentage" in payload and payload["progress_percentage"] is not None:
            progress = float(payload["progress_percentage"])
            if progress < 0 or progress > 100:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Progress must be between 0 and 100")
            task.progress_percentage = progress
        if "expected_completion_time" in payload:
            task.expected_completion_time = payload["expected_completion_time"]
        if "checklist" in payload and payload["checklist"] is not None:
            checklist = payload["checklist"]
            if not isinstance(checklist, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checklist must be a list")
            task.checklist = normalize_checklist(checklist)
        if "dependencies" in payload and payload["dependencies"] is not None:
            dependencies = payload["dependencies"]
            if not isinstance(dependencies, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependencies must be a list")
            task.dependencies = [str(item) for item in dependencies if str(item).strip()]
        if "time_log_hours" in payload and payload["time_log_hours"] is not None:
            hours = float(payload["time_log_hours"])
            entry = {
                "hours": hours,
                "note": payload.get("time_log_note"),
                "logged_at": utc_now(),
            }
            task.time_logs = list(task.time_logs or []) + [entry]
            task.actual_hours = float(task.actual_hours or 0) + hours
        task.updated_at = utc_now()
        await task.save()
        return task

    @staticmethod
    def workload_snapshot(tasks: list[Task]) -> dict[str, Any]:
        total = len(tasks)
        by_status: dict[str, int] = {}
        by_priority: dict[str, int] = {}
        assigned: dict[str, int] = {}
        overdue = 0
        for task in tasks:
            status_key = task.status.value if getattr(task, "status", None) else "unknown"
            priority_key = task.priority.value if getattr(task, "priority", None) else "unknown"
            by_status[status_key] = by_status.get(status_key, 0) + 1
            by_priority[priority_key] = by_priority.get(priority_key, 0) + 1
            if task.assigned_to:
                assigned[str(task.assigned_to)] = assigned.get(str(task.assigned_to), 0) + 1
            if task.due_date and task.status != TaskStatus.COMPLETED and task.due_date < utc_now():
                overdue += 1
        return {
            "total": total,
            "by_status": by_status,
            "by_priority": by_priority,
            "by_assignee": assigned,
            "overdue": overdue,
        }

    @staticmethod
    async def create_task_core(
        *,
        title: str,
        description: Optional[str] = None,
        assigned_to: Optional[str] = None,
        priority: str = "medium",
        start_date: Optional[str] = None,
        due_date: Optional[str] = None,
        tags: Optional[str] = None,
        parent_task_id: Optional[str] = None,
        project_id: Optional[str] = None,
        epic_id: Optional[str] = None,
        sprint_id: Optional[str] = None,
        department_id: Optional[str] = None,
        story_points: Optional[int] = None,
        estimated_hours: Optional[float] = None,
        task_type: str = "standard",
        measurement_type: Optional[str] = None,
        custom_measurement_label: Optional[str] = None,
        target_quantity: Optional[int] = None,
        target_unit: Optional[str] = None,
        source_type: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        related_entity_stage: Optional[str] = None,
        related_entity_url: Optional[str] = None,
        current_user: User,
        reviewer_id: Optional[str] = None,
        review_required: Optional[bool] = None,
        checklist: Optional[list[dict[str, Any]]] = None,
        dependencies: Optional[list[str]] = None,
        required_for_project_completion: bool = True,
        background_tasks = None
    ) -> dict:
        from fastapi import HTTPException, status
        from app.models.task import Task, TaskPriority, TaskStatus, TaskType
        from app.models.user import User, UserRole
        from app.models.timeline import TimelineEventType, TimelineModule
        from app.services.timeline_service import create_timeline_event
        from app.services.task_health_service import sync_task_health
        from app.api.v1.endpoints.tasks import (
            _resolve_department,
            _assert_can_assign_task,
            _can_access_project_for_task,
            _send_task_side_effects,
        )
        from app.services.project_permissions import ProjectPermission, has_project_permission
        from app.services.authorization_service import authorize, has_permission, permission_result

        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        try:
            task_priority = TaskPriority(priority.lower())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {[p.value for p in TaskPriority]}"
            )

        parsed_due_date = None
        if due_date:
            try:
                parsed_due_date = parse_to_utc(due_date)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid due date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
                )

            parsed_start_date = None
            if start_date:
                try:
                    parsed_start_date = parse_to_utc(start_date)
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid start date format. Use ISO format",
                    ) from exc

        parsed_tags = []
        if tags:
            try:
                parsed_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
            except:
                parsed_tags = []

        project_id = project_id.strip() if project_id and project_id.strip() else None
        original_project_id_from_request = project_id
        epic_id = epic_id.strip() if epic_id and epic_id.strip() else None
        sprint_id = sprint_id.strip() if sprint_id and sprint_id.strip() else None
        parent_task_id = parent_task_id.strip() if parent_task_id and parent_task_id.strip() else None
        assigned_to = assigned_to.strip() if assigned_to and assigned_to.strip() else None

        # Generic relationship linkage. A Sales follow-up task is generated from
        # the scheduled job payload; the source fields must survive so the task
        # keeps its link back to the originating lead.
        source_type = (source_type or "").strip() or None
        related_entity_type = (related_entity_type or "").strip() or None
        related_entity_id = (related_entity_id or "").strip() or None
        related_entity_stage = (related_entity_stage or "").strip() or None
        related_entity_url = (related_entity_url or "").strip() or None
        # Employee self-assignment carve-out for Sales follow-up tasks. A
        # follow-up created by an employee is always self-assigned, so the
        # scheduled execution (which runs as the creator) must be allowed to
        # create it without broadly weakening task creation permissions.
        is_self_assigned_sales_followup = bool(
            source_type == "sales_follow_up"
            and current_user.role == UserRole.EMPLOYEE
            and assigned_to
            and str(assigned_to) == str(current_user.id)
        )

        project = None
        if project_id:
            from app.api.dependencies import get_project_by_id
            import logging
            logger = logging.getLogger(__name__)

            project, user_project_id = await get_project_by_id(project_id, current_user.company_id)

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Project not found with id: {project_id}"
                )

            if project.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this project"
                )
            if getattr(project.status, "value", project.status) in {ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value, ProjectStatus.COMPLETED.value}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project does not allow new tasks",
                )
            if not await _can_access_project_for_task(current_user, project):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You cannot create tasks in this project",
                )
            task_create = await permission_result(current_user, "tasks.create")
            scoped_task_create = await authorize(current_user, "tasks.create", resource=project)
            if task_create.reason == "explicit_deny" or (scoped_task_create.source == "user_override" and scoped_task_create.reason == "scope_violation") or (not scoped_task_create.allowed and not has_project_permission(current_user, project, ProjectPermission.CREATE_TASK)):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to create tasks in this project",
                )

            def looks_like_objectid(s):
                return s and len(s) == 24 and all(c in "0123456789abcdef" for c in s.lower())

            if original_project_id_from_request and not looks_like_objectid(original_project_id_from_request):
                project_id = original_project_id_from_request
            elif user_project_id:
                project_id = user_project_id
            else:
                project_id = str(project.id)
        elif (await permission_result(current_user, "tasks.create")).reason == "explicit_deny" or (not await has_permission(current_user, "tasks.create") and current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}):
            if not is_self_assigned_sales_followup:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to create tasks",
                )

        assignee = None
        if assigned_to:
            assignee = await User.get(assigned_to)
            if not assignee:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assigned user not found"
                )
            if assignee.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Assigned user must be from the same company"
                )
            # The employee self-assigned follow-up carve-out skips the normal
            # assignment hierarchy check; everything else follows the standard
            # task assignment rules unchanged.
            if not is_self_assigned_sales_followup:
                await _assert_can_assign_task(current_user, assignee, project)

        reviewer = None
        if reviewer_id:
            reviewer = await validate_reviewer(
                Task(
                    title=title,
                    company_id=current_user.company_id,
                    created_by=str(current_user.id),
                    assigned_to=assigned_to,
                    reviewer_id=reviewer_id,
                    review_required=True if review_required is None else review_required,
                ),
                reviewer_id,
                project,
            )

        if epic_id:
            from app.models.project import Epic
            epic = await Epic.get(epic_id)
            if not epic or epic.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Epic not found"
                )

        if sprint_id:
            from app.models.project import Sprint
            sprint = await Sprint.get(sprint_id)
            if not sprint or sprint.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            if project and sprint.project_id not in {str(project.id), str(project.project_id or "")}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Sprint does not belong to this project"
                )

        if parent_task_id:
            parent_task = await Task.get(parent_task_id)
            if not parent_task or parent_task.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent task not found"
                )
            if project and str(parent_task.project_id or "") not in {str(project.id), str(project.project_id or "")}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Parent task does not belong to this project"
                )

        department_doc = await _resolve_department(current_user.company_id, department_id)

        task = Task(
            title=title,
            description=description,
            company_id=current_user.company_id,
            created_by=str(current_user.id),
            assigned_to=assigned_to,
            assigned_by=str(current_user.id) if assignee else None,
            assigned_at=utc_now() if assignee else None,
            department_id=department_id if department_doc else None,
            department=department_doc.name if department_doc else None,
            priority=task_priority,
            status=creation_status(assigned_to),
            review_required=(False if source_type in {"sales_follow_up"} else (review_required if review_required is not None else bool(project))),
            reviewer_id=str(reviewer.id) if reviewer else None,
            due_date=parsed_due_date,
            start_date=parsed_start_date,
            tags=parsed_tags,
            parent_task_id=parent_task_id,
            project_id=project_id,
            epic_id=epic_id,
            sprint_id=sprint_id,
            story_points=story_points,
            estimated_hours=estimated_hours,
            task_type=TaskType(task_type) if task_type else TaskType.STANDARD,
            measurement_type=measurement_type,
            custom_measurement_label=custom_measurement_label,
            target_quantity=target_quantity,
            target_unit=target_unit,
            source_type=source_type,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            related_entity_stage=related_entity_stage,
            related_entity_url=related_entity_url,
            checklist=checklist or [],
            dependencies=[str(item) for item in (dependencies or [])],
            required_for_project_completion=required_for_project_completion,
        )

        await task.insert()
        await sync_task_health(task)

        if task.assigned_to:
            await create_timeline_event(
                user_id=task.assigned_to,
                company_id=task.company_id,
                event_type=TimelineEventType.TASK_ASSIGNED,
                title="Task Assigned",
                description=task.title,
                related_module=TimelineModule.TASK,
                related_record_id=str(task.id),
                actor_id=str(current_user.id),
                metadata={"task_title": task.title, "project_id": task.project_id, "priority": task.priority.value},
                idempotency_key=f"task:{task.id}:assigned:{task.assigned_to}",
            )

        if background_tasks:
            background_tasks.add_task(
                _send_task_side_effects, task, current_user, assignee, project
            )
        else:
            await _send_task_side_effects(task, current_user, assignee, project)

        return {
            "id": str(task.id),
            "title": task.title,
            "status": task.status.value,
            "priority": task.priority.value,
            "assigned_to": task.assigned_to,
            "reviewer_id": task.reviewer_id,
            "review_required": effective_review_required(task, project),
            "review_round": task.review_round,
            "created_by": task.created_by,
            "project_id": str(task.project_id) if task.project_id else None,
            "department_id": task.department_id,
            "department": task.department,
            "due_date": task.due_date,
            "start_date": task.start_date,
            "completed_at": task.completed_at,
            "health_status": getattr(task.health_status, "value", task.health_status),
            "extension_count": getattr(task, "extension_count", 0),
            "carry_forward_due_date": getattr(task, "carry_forward_due_date", None),
            "carry_forward_days": int(getattr(task, "carry_forward_days", 0) or 0),
            "carry_forward_count": int(getattr(task, "carry_forward_count", 0) or 0),
            "carry_forward_last_at": getattr(task, "carry_forward_last_at", None),
            "tags": task.tags,
            "task_type": getattr(task.task_type, "value", task.task_type) if hasattr(task, "task_type") else "standard",
            "measurement_type": getattr(task, "measurement_type", None),
            "custom_measurement_label": getattr(task, "custom_measurement_label", None),
            "target_quantity": getattr(task, "target_quantity", None),
            "target_unit": getattr(task, "target_unit", None),
            "completed_quantity": getattr(task, "completed_quantity", 0),
            "estimated_hours": getattr(task, "estimated_hours", None),
            "story_points": getattr(task, "story_points", None),
            "source_type": getattr(task, "source_type", None),
            "related_entity_type": getattr(task, "related_entity_type", None),
            "related_entity_id": getattr(task, "related_entity_id", None),
            "related_entity_stage": getattr(task, "related_entity_stage", None),
            "related_entity_url": getattr(task, "related_entity_url", None),
            "created_at": task.created_at,
            "message": "Task created successfully",
            "task_id": str(task.id)
        }

