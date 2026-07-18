"""
Task Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, BackgroundTasks
from typing import Optional
from datetime import datetime
from bson import ObjectId

from app.models.task import Task, TaskExtensionRequest, TaskStatus, TaskPriority
from app.models.department import Department
from app.models.user import User, UserRole
from app.events import publish_event
from app.events.factories import build_domain_event
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    check_company_access,
)
from app.services.task_service import TaskService
from app.services.task_health_service import (
    assert_task_manage_access,
    assert_task_view_access,
    build_employee_task_summary,
    build_extension_request_summary,
    build_overdue_task_summary,
    build_task_health_summary,
    build_team_completion_summary,
    create_extension_request,
    review_extension_request,
    serialize_extension_request,
    serialize_task_health,
    sync_task_health,
    sync_task_health_for_company,
)
from app.models.timeline import TimelineEventType, TimelineModule
from app.services.timeline_service import create_timeline_event
from app.core.cache import cache_delete_pattern
from app.api.deps import Pagination20, PaginationParams

router = APIRouter()


async def _get_user_scope_ids(current_user: User) -> list[str]:
    ids = {str(current_user.id)}
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        subordinates = await current_user.get_all_subordinates()
        ids.update(str(user.id) for user in subordinates)
    return list(ids)


async def _can_access_project_for_task(current_user: User, project) -> bool:
    if current_user.role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER}:
        return True
    assignee_ids = set(getattr(project, "assigned_user_ids", None) or [])
    if getattr(project, "assigned_to", None):
        assignee_ids.add(str(project.assigned_to))
    if getattr(project, "lead_id", None):
        assignee_ids.add(str(project.lead_id))
    if getattr(project, "created_by", None):
        assignee_ids.add(str(project.created_by))
    team_member_ids = set(getattr(project, "team_member_ids", None) or [])
    if current_user.role == UserRole.MANAGER:
        return True
    if current_user.role == UserRole.LEAD:
        return str(current_user.id) in assignee_ids or str(current_user.id) in team_member_ids
    if current_user.role == UserRole.EMPLOYEE:
        return str(current_user.id) in team_member_ids
    return False


async def _assert_task_view(current_user: User, task: Task) -> None:
    check_company_access(current_user, task.company_id)
    if current_user.role in {UserRole.SUPER_ADMIN, UserRole.ADMIN}:
        return
    current_user_id = str(current_user.id)
    if task.created_by == current_user_id or task.assigned_to == current_user_id:
        return
    try:
        from app.models.watchers import Watcher
        watcher = await Watcher.find_one(
            Watcher.task_id == str(task.id),
            Watcher.user_id == current_user_id,
            Watcher.company_id == task.company_id,
        )
        if watcher:
            return
    except Exception:
        pass
    if current_user.role == UserRole.EMPLOYEE:
        if task.project_id:
            from app.api.dependencies import get_project_by_id
            project, _ = await get_project_by_id(task.project_id, current_user.company_id)
            if project and await _can_access_project_for_task(current_user, project):
                return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        scope_ids = set(await _get_user_scope_ids(current_user))
        if task.created_by in scope_ids or (task.assigned_to and task.assigned_to in scope_ids):
            return
        if task.project_id:
            from app.api.dependencies import get_project_by_id
            project, _ = await get_project_by_id(task.project_id, current_user.company_id)
            if project and await _can_access_project_for_task(current_user, project):
                return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _assert_task_manage(current_user: User, task: Task) -> None:
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    await _assert_task_view(current_user, task)
    if current_user.role == UserRole.MANAGER and not can_update_task_field(current_user, task, "details"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager can edit only assigned department tasks")


def build_task_list_query(
    current_user: User,
    *,
    scope_ids: Optional[list[str]] = None,
) -> dict:
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company",
            )
        query = {"company_id": current_user.company_id}

    if current_user.role == UserRole.EMPLOYEE:
        query["assigned_to"] = str(current_user.id)
    elif current_user.role == UserRole.LEAD:
        ids = scope_ids or [str(current_user.id)]
        query["$or"] = [
            {"assigned_to": {"$in": ids}},
            {"created_by": str(current_user.id)},
        ]
    return query


def can_update_task_field(current_user: User, task: Task, field_name: str) -> bool:
    if current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        return True
    if current_user.role == UserRole.EMPLOYEE:
        return field_name == "status" and task.assigned_to == str(current_user.id)
    if current_user.role == UserRole.MANAGER:
        manager_department = getattr(current_user, "department_id", None)
        task_department = getattr(task, "department_id", None)
        return bool(manager_department and task_department and str(manager_department) == str(task_department))
    if current_user.role == UserRole.LEAD:
        return True
    return False


def build_employee_project_visibility_query(current_user: User, project_ids: list[str]) -> dict:
    clean_project_ids = []
    for project_id in project_ids:
        project_id = str(project_id)
        if project_id and project_id not in clean_project_ids:
            clean_project_ids.append(project_id)
    return {
        "$or": [
            {"team_member_ids": str(current_user.id)},
            {"project_id": {"$in": clean_project_ids}},
            {"_id": {"$in": clean_project_ids}},
        ]
    }


async def _assert_can_assign_task(current_user: User, assignee: Optional[User]) -> None:
    if not assignee:
        return
    if current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        if assignee.role not in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assignee role")
        return
    if current_user.role == UserRole.MANAGER:
        if assignee.role not in {UserRole.LEAD, UserRole.EMPLOYEE}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager can assign tasks only to Leads or Employees")
        return
    if current_user.role == UserRole.LEAD:
        scope_ids = set(await _get_user_scope_ids(current_user))
        if assignee.role != UserRole.EMPLOYEE or str(assignee.id) not in scope_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lead can assign tasks only to Employees")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign tasks")


async def _task_comment_recipient_ids(task: Task, current_user: User) -> list[str]:
    recipients = {str(task.created_by)}
    if task.assigned_to:
        recipients.add(str(task.assigned_to))

    if task.project_id:
        try:
            from app.api.dependencies import get_project_by_id
            project, _ = await get_project_by_id(task.project_id, current_user.company_id)
            if project:
                for user_id in getattr(project, "assigned_user_ids", None) or []:
                    recipients.add(str(user_id))
                for user_id in getattr(project, "team_member_ids", None) or []:
                    recipients.add(str(user_id))
                if getattr(project, "assigned_to", None):
                    recipients.add(str(project.assigned_to))
                if getattr(project, "lead_id", None):
                    recipients.add(str(project.lead_id))
                if getattr(project, "created_by", None):
                    recipients.add(str(project.created_by))
        except Exception:
            pass

    try:
        from app.models.watchers import Watcher
        watchers = await Watcher.find({
            "task_id": str(task.id),
            "company_id": task.company_id,
        }).to_list()
        recipients.update(str(watcher.user_id) for watcher in watchers)
    except Exception:
        pass

    try:
        admins = await User.find({
            "company_id": task.company_id,
            "role": {"$in": [UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]},
        }).to_list()
        recipients.update(str(admin.id) for admin in admins)
    except Exception:
        pass

    recipients.discard(str(current_user.id))
    return [user_id for user_id in recipients if user_id]


async def _notify_task_comment(task: Task, comment, current_user: User) -> None:
    try:
        from app.models.notification import Notification, NotificationType

        actor_name = current_user.full_name() if hasattr(current_user, "full_name") else f"{current_user.first_name} {current_user.last_name}".strip()
        message_preview = (comment.content or "").strip()
        if len(message_preview) > 120:
            message_preview = f"{message_preview[:117]}..."

        notifications = []
        for user_id in await _task_comment_recipient_ids(task, current_user):
            notifications.append(
                Notification(
                    company_id=task.company_id,
                    user_id=user_id,
                    type=NotificationType.TASK_COMMENT,
                    title=f"New comment on {task.title}",
                    message=f"{actor_name}: {message_preview}" if message_preview else f"{actor_name} commented on a task.",
                    related_id=str(task.id),
                    related_type="task",
                    action_url=f"/projects/{task.project_id}/tasks/{task.id}" if task.project_id else f"/tasks/{task.id}",
                    metadata={
                        "task_id": str(task.id),
                        "comment_id": str(comment.id),
                        "event": "task_comment_added",
                    },
                )
            )

        if notifications:
            await Notification.insert_many(notifications)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to create task comment notifications")


def _parse_task_datetime(value: str, field_name: str = "date") -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid {field_name} format. Use ISO format or YYYY-MM-DD",
            )


async def _resolve_department(company_id: str, department_id: Optional[str]):
    if not department_id:
        return None

    department = await Department.get(department_id)
    if (
        not department
        or department.deleted_at is not None
        or department.company_id != company_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid department",
        )
    return department


async def _send_task_side_effects(task: Task, current_user: User, assignee, project):
    """
    Runs AFTER the HTTP response has already been sent to the client
    (scheduled via BackgroundTasks). Any failure here (Redis down, email
    service down, etc.) must never block or fail the original request.
    """
    import logging
    logger = logging.getLogger(__name__)

    # --- Email notification ---
    if task.assigned_to and assignee:
        try:
            from app.worker.tasks.email_tasks import send_task_assignment_email_task
            project_name = None
            if project is not None:
                project_name = getattr(project, "name", None) or getattr(project, "project_name", None)

            send_task_assignment_email_task.apply_async(
                args=[{
                    "assignee_email": assignee.email,
                    "assignee_name": assignee.full_name(),
                    "task_title": task.title,
                    "task_description": task.description or "",
                    "task_priority": task.priority.value,
                    "task_due_date": task.due_date.isoformat() if task.due_date else None,
                    "assigned_by_name": current_user.full_name(),
                    "task_id": str(task.id),
                    "project_name": project_name,
                }],
                retry=False,   # don't retry publishing to broker if Redis is down
                expires=30,    # drop the job if it can't be picked up within 30s
            )
        except Exception as e:
            logger.error(f"Failed to queue task assignment email: {str(e)}")

    # --- In-app notification ---
    if task.assigned_to:
        try:
            from app.models.notification import Notification, NotificationType
            notification = Notification(
                company_id=current_user.company_id,
                user_id=task.assigned_to,
                type=NotificationType.TASK_ASSIGNED,
                title="New Task Assigned",
                message=f"You have been assigned a new task: {task.title}",
                priority="info",
                related_id=str(task.id),
                related_type="task",
                action_url=f"/tasks/{task.id}",
            )
            await notification.insert()
        except Exception as e:
            logger.error(f"Failed to create notification: {str(e)}")

    # --- Cache invalidation ---
    try:
        await cache_delete_pattern(f"dashboard:stats:{current_user.company_id}:*")
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {str(e)}")

    # --- Domain event publish ---
    try:
        await publish_event(
            build_domain_event(
                event_name="TaskCreated",
                aggregate_type="task",
                aggregate_id=str(task.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "title": task.title,
                    "description": task.description,
                    "status": task.status.value,
                    "priority": task.priority.value,
                    "project_id": task.project_id,
                    "department_id": task.department_id,
                    "tags": task.tags,
                    "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
                },
                project_id=str(task.project_id) if task.project_id else None,
                metadata={"source": "task_create"},
            )
        )
    except Exception as e:
        logger.error(f"Failed to publish TaskCreated event: {str(e)}")


async def _notify_task_assignee(task: Task, current_user: User, assignee: User) -> None:
    try:
        from app.models.notification import Notification, NotificationType
        notification = Notification(
            company_id=current_user.company_id,
            user_id=str(assignee.id),
            type=NotificationType.TASK_ASSIGNED,
            title="Task Assigned",
            message=f"You have been assigned a new task: {task.title}",
            priority="info",
            related_id=str(task.id),
            related_type="task",
            action_url=f"/tasks/{task.id}",
        )
        await notification.insert()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to create task reassignment notification: {str(e)}")


@router.get("/")
async def list_tasks(
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    created_by: Optional[str] = None,
    project_id: Optional[str] = None,
    department_id: Optional[str] = None,
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user)
):
    """List tasks with filters"""
    skip, limit = pagination.skip, pagination.limit
    scope_ids = await _get_user_scope_ids(current_user) if current_user.role == UserRole.LEAD else None
    query = build_task_list_query(current_user, scope_ids=scope_ids)

    if status_filter:
        query["status"] = status_filter
    if priority:
        query["priority"] = priority
    if assigned_to and current_user.role != UserRole.EMPLOYEE:
        if "$or" in query:
            scoped_or = query.pop("$or")
            query["$and"] = [{"$or": scoped_or}, {"assigned_to": assigned_to}]
        else:
            query["assigned_to"] = assigned_to
    if created_by:
        query["created_by"] = created_by
    if project_id:
        # Filter by project_id - only return tasks that have this specific project_id
        # Simple equality check - MongoDB will only match documents where project_id equals this value
        # Tasks with project_id=None or missing project_id field won't match
        query["project_id"] = project_id
    if department_id:
        query["department_id"] = department_id

    tasks = await Task.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    for task in tasks:
        await sync_task_health(task)
    total = await Task.find(query).count()
    assignee_names = {}
    for assignee_id in {task.assigned_to for task in tasks if task.assigned_to}:
        assignee = await User.get(assignee_id)
        if assignee:
            assignee_names[str(assignee.id)] = f"{assignee.first_name} {assignee.last_name}".strip() or assignee.email

    return {
        "tasks": [
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status.value,
                "priority": task.priority.value,
                "assigned_to": task.assigned_to,
                "assigned_to_name": assignee_names.get(str(task.assigned_to or "")),
                "created_by": task.created_by,
                "project_id": str(task.project_id) if task.project_id else None,
                "department_id": getattr(task, "department_id", None),
                "department": getattr(task, "department", None),
                "due_date": task.due_date,
                "health_status": getattr(task.health_status, "value", task.health_status),
                "extension_count": getattr(task, "extension_count", 0),
                "created_at": task.created_at,
            }
            for task in tasks
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.post("/")
async def create_task(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    priority: str = Form("medium"),
    due_date: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    parent_task_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    epic_id: Optional[str] = Form(None),
    sprint_id: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    story_points: Optional[int] = Form(None),
    estimated_hours: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new task.
    project_id: Frontend may send either the custom project ID (e.g. PROJ-001) or MongoDB _id.
    We resolve to the project and store the custom project_id in task.project_id so tasks are
    linked by logical ID, not by ObjectId.
    """
    from app.services.task_service import TaskService
    return await TaskService.create_task_core(
        title=title,
        description=description,
        assigned_to=assigned_to,
        priority=priority,
        due_date=due_date,
        tags=tags,
        parent_task_id=parent_task_id,
        project_id=project_id,
        epic_id=epic_id,
        sprint_id=sprint_id,
        department_id=department_id,
        story_points=story_points,
        estimated_hours=estimated_hours,
        current_user=current_user,
        background_tasks=background_tasks
    )


@router.post("/health/sync")
async def sync_task_health_endpoint(current_user: User = Depends(get_current_user)):
    if current_user.role not in {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin access required")
    count = await sync_task_health_for_company(None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id)
    return {"message": "Task health synced", "processed": count}


@router.get("/health/me")
async def my_task_health(current_user: User = Depends(get_current_user)):
    return await build_employee_task_summary(current_user)


@router.get("/health/summary")
async def task_health_summary(current_user: User = Depends(get_current_user)):
    return await build_task_health_summary(current_user)


@router.get("/health/team-completion")
async def team_completion_summary(current_user: User = Depends(get_current_user)):
    if current_user.role not in {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin access required")
    return await build_team_completion_summary(current_user)


@router.get("/health/overdue")
async def overdue_task_summary(current_user: User = Depends(get_current_user)):
    return await build_overdue_task_summary(current_user)


@router.get("/health/extensions")
async def extension_request_summary(current_user: User = Depends(get_current_user)):
    return await build_extension_request_summary(current_user)


@router.get("/{task_id}/health")
async def get_task_health(task_id: str, current_user: User = Depends(get_current_user)):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await assert_task_view_access(current_user, task)
    await sync_task_health(task)
    return {"task": serialize_task_health(task)}


@router.post("/{task_id}/extension-requests")
async def request_task_extension(
    task_id: str,
    requested_due_date: str = Form(...),
    reason: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    request = await create_extension_request(
        task,
        current_user,
        _parse_task_datetime(requested_due_date, "requested_due_date"),
        reason,
    )
    return {"message": "Extension request submitted", "request": serialize_extension_request(request)}


@router.get("/{task_id}/extension-requests")
async def list_task_extension_requests(task_id: str, current_user: User = Depends(get_current_user)):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await assert_task_view_access(current_user, task)
    requests = await TaskExtensionRequest.find(TaskExtensionRequest.task_id == task_id).sort("-created_at").to_list()
    return {"requests": [serialize_extension_request(item) for item in requests]}


@router.post("/extension-requests/{request_id}/approve")
async def approve_task_extension(
    request_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    request = await TaskExtensionRequest.get(request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension request not found")
    reviewed = await review_extension_request(request, current_user, True, comment)
    return {"message": "Extension approved", "request": serialize_extension_request(reviewed)}


@router.post("/extension-requests/{request_id}/reject")
async def reject_task_extension(
    request_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    request = await TaskExtensionRequest.get(request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension request not found")
    reviewed = await review_extension_request(request, current_user, False, comment)
    return {"message": "Extension rejected", "request": serialize_extension_request(reviewed)}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific task by ID"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)
    await sync_task_health(task)

    # Get assigned user details
    assigned_user = None
    if task.assigned_to:
        assigned_user = await User.get(task.assigned_to)

    # Get created by user details
    created_by_user = None
    if task.created_by:
        created_by_user = await User.get(task.created_by)

    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "status": task.status.value,
        "priority": task.priority.value,
        "assigned_to": task.assigned_to,
        "assigned_to_name": f"{assigned_user.first_name} {assigned_user.last_name}" if assigned_user else None,
        "created_by": task.created_by,
        "created_by_name": f"{created_by_user.first_name} {created_by_user.last_name}" if created_by_user else None,
        "project_id": str(task.project_id) if task.project_id else None,
        "department_id": getattr(task, "department_id", None),
        "department": getattr(task, "department", None),
        "due_date": task.due_date,
        "health_status": getattr(task.health_status, "value", task.health_status),
        "extension_count": getattr(task, "extension_count", 0),
        "tags": task.tags,
        "attachments": task.attachments if hasattr(task, 'attachments') and task.attachments else [],
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a task in the current company."""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_manage(current_user, task)

    await task.delete()
    await cache_delete_pattern(f"dashboard:stats:{task.company_id}:*")

    await publish_event(
        build_domain_event(
            event_name="TaskDeleted",
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(task.company_id),
            actor_id=str(current_user.id),
            payload={
                "task_id": str(task.id),
                "title": task.title,
                "project_id": str(task.project_id) if task.project_id else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_delete"},
        )
    )

    return {"message": "Task deleted successfully", "task_id": task_id}


@router.get("/{task_id}/execution")
async def get_task_execution(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get task execution metadata"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    return {
        "id": str(task.id),
        "title": task.title,
        "status": task.status.value,
        "priority": task.priority.value,
        "progress_percentage": task.progress_percentage,
        "expected_completion_time": task.expected_completion_time,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "checklist": task.checklist or [],
        "dependencies": task.dependencies or [],
        "time_logs": task.time_logs or [],
        "workload": TaskService.workload_snapshot([task]),
    }


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    new_status: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update task status"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Validate new status
    try:
        task_status = TaskStatus(new_status.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {[s.value for s in TaskStatus]}"
        )

    previous_status = task.status

    # Update status and trigger automation asynchronously when changed.
    task = await TaskService.update_status(task, task_status, str(current_user.id))

    if previous_status != task.status:
        if task.status == TaskStatus.IN_PROGRESS:
            timeline_type = TimelineEventType.TASK_STARTED
            title = "Task Started"
        elif task.status == TaskStatus.COMPLETED:
            timeline_type = TimelineEventType.TASK_COMPLETED
            title = "Task Completed"
        elif previous_status == TaskStatus.COMPLETED:
            timeline_type = TimelineEventType.TASK_REOPENED
            title = "Task Reopened"
        else:
            timeline_type = TimelineEventType.TASK_UPDATED
            title = "Task Updated"

        await create_timeline_event(
            user_id=task.assigned_to or str(current_user.id),
            company_id=task.company_id,
            event_type=timeline_type,
            title=title,
            description=task.title,
            related_module=TimelineModule.TASK,
            related_record_id=str(task.id),
            actor_id=str(current_user.id),
            metadata={
                "task_title": task.title,
                "from_status": previous_status.value,
                "to_status": task.status.value,
                "project_id": task.project_id,
            },
            idempotency_key=f"task:{task.id}:status:{previous_status.value}:{task.status.value}:{int(task.updated_at.timestamp())}",
        )

    await publish_event(
        build_domain_event(
            event_name="TaskCompleted" if task.status == TaskStatus.COMPLETED else "TaskUpdated",
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(task.company_id),
            actor_id=str(current_user.id),
            payload={
                "title": task.title,
                "description": task.description,
                "status": task.status.value,
                "priority": task.priority.value,
                "project_id": task.project_id,
                "department_id": task.department_id,
                "tags": task.tags,
                "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_status_update"},
        )
    )

    return {
        "id": str(task.id),
        "status": task.status.value,
        "completed_at": task.completed_at,
        "message": "Task status updated successfully"
    }


@router.patch("/{task_id}/execution")
async def update_task_execution(
    task_id: str,
    progress_percentage: Optional[float] = Form(None),
    expected_completion_time: Optional[str] = Form(None),
    checklist: Optional[str] = Form(None),
    dependencies: Optional[str] = Form(None),
    time_log_hours: Optional[float] = Form(None),
    time_log_note: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update task execution metadata"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    payload: dict[str, object] = {}
    if progress_percentage is not None:
        payload["progress_percentage"] = progress_percentage
    if expected_completion_time is not None:
        payload["expected_completion_time"] = datetime.fromisoformat(expected_completion_time.replace("Z", "+00:00"))
    if checklist is not None:
        payload["checklist"] = [item.strip() for item in checklist.split("|") if item.strip()]
    if dependencies is not None:
        payload["dependencies"] = [item.strip() for item in dependencies.split("|") if item.strip()]
    if time_log_hours is not None:
        payload["time_log_hours"] = time_log_hours
        payload["time_log_note"] = time_log_note

    task = await TaskService.update_execution(task, payload)
    return {
        "message": "Task execution updated successfully",
        "task": {
            "id": str(task.id),
            "title": task.title,
            "progress_percentage": task.progress_percentage,
            "expected_completion_time": task.expected_completion_time,
            "checklist": task.checklist or [],
            "dependencies": task.dependencies or [],
            "actual_hours": task.actual_hours,
        },
    }


@router.get("/{task_id}/comments")
async def get_task_comments(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all comments for a task"""
    from app.models.task import TaskComment

    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Find all comments for this task. Keep route-id fallback for comments saved
    # before task comments were normalized to the canonical Mongo task id.
    task_comment_ids = list(dict.fromkeys([str(task.id), str(task_id)]))
    task_comments = await TaskComment.find({
        "task_id": {"$in": task_comment_ids},
        "company_id": task.company_id,
    }).sort("-created_at").to_list()

    return {
        "comments": [
            {
                "id": str(comment.id),
                "content": comment.content,
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "created_at": comment.created_at,
                "attachments": comment.attachments,
            }
            for comment in task_comments
        ]
    }


@router.post("/{task_id}/comments")
async def add_task_comment(
    task_id: str,
    content: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Add a comment to a task"""
    from app.models.task import TaskComment

    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Create new comment document
    comment = TaskComment(
        task_id=str(task.id),
        company_id=current_user.company_id,
        user_id=str(current_user.id),
        user_name=f"{current_user.first_name} {current_user.last_name}",
        content=content,
        created_at=datetime.now()
    )

    await comment.insert()

    # Update task's updated_at
    task.updated_at = datetime.now()
    await task.save()
    await cache_delete_pattern(f"dashboard:stats:{task.company_id}:*")
    await _notify_task_comment(task, comment, current_user)

    await publish_event(
        build_domain_event(
            event_name="TaskCommentAdded",
            aggregate_type="task_comment",
            aggregate_id=str(comment.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "task_id": str(task.id),
                "content": comment.content,
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "created_at": comment.created_at.isoformat() if getattr(comment, "created_at", None) else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_comment_create"},
        )
    )

    return {
        "id": str(comment.id),
        "message": "Comment added successfully",
        "comment": {
            "id": str(comment.id),
            "content": comment.content,
            "user_id": comment.user_id,
            "user_name": comment.user_name,
            "created_at": comment.created_at,
        }
    }


@router.get("/{task_id}/subtasks")
async def get_task_subtasks(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all subtasks for a task"""
    # Find all tasks where parent_task_id matches this task_id
    subtasks = await Task.find(
        Task.parent_task_id == task_id,
        Task.company_id == current_user.company_id
    ).to_list()

    return {
        "subtasks": [
            {
                "id": str(subtask.id),
                "title": subtask.title,
                "status": subtask.status.value,
                "priority": subtask.priority.value,
                "assigned_to": subtask.assigned_to,
                "created_at": subtask.created_at,
            }
            for subtask in subtasks
        ]
    }


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    issue_type_id: Optional[str] = Form(None),
    component_id: Optional[str] = Form(None),
    fix_version_id: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    story_points: Optional[int] = Form(None),
    estimated_hours: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update task details"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_manage(current_user, task)

    previous_assigned_to = task.assigned_to

    # Update fields if provided
    if title is not None:
        task.title = title
    if description is not None:
        task.description = description
    if priority is not None:
        try:
            task.priority = TaskPriority(priority.lower())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {[p.value for p in TaskPriority]}"
            )
    if assigned_to is not None:
        # Allow empty string to unassign
        if assigned_to == '':
            task.assigned_to = None
            task.assigned_by = None
        else:
            # Validate assigned user exists and is in same company
            assigned_user = await User.get(assigned_to)
            if not assigned_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assigned user not found"
                )
            if assigned_user.company_id != task.company_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Assigned user must be from the same company"
                )
            if assigned_to != previous_assigned_to:
                await _assert_can_assign_task(current_user, assigned_user)
            task.assigned_to = assigned_to
            task.assigned_by = str(current_user.id)
    if due_date is not None:
        if due_date == '':
            task.due_date = None
        else:
            try:
                # Parse ISO format datetime string
                task.due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            except ValueError:
                try:
                    # Try parsing as date only
                    task.due_date = datetime.strptime(due_date, '%Y-%m-%d')
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid due_date format. Use ISO format or YYYY-MM-DD"
                    )
    if tags is not None:
        if tags == '':
            task.tags = []
        else:
            # Parse comma-separated tags
            task.tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
    if issue_type_id is not None:
        task.issue_type_id = issue_type_id if issue_type_id != '' else None
    if component_id is not None:
        task.component_id = component_id if component_id != '' else None
    if fix_version_id is not None:
        task.fix_version_id = fix_version_id if fix_version_id != '' else None
    if department_id is not None:
        if department_id == '':
            task.department_id = None
            task.department = None
        else:
            department_doc = await _resolve_department(task.company_id, department_id)
            task.department_id = department_id if department_doc else None
            task.department = department_doc.name if department_doc else None
    if start_date is not None:
        if start_date == '':
            task.start_date = None
        else:
            try:
                task.start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except ValueError:
                try:
                    task.start_date = datetime.strptime(start_date, '%Y-%m-%d')
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid start_date format. Use ISO format or YYYY-MM-DD"
                    )
    if story_points is not None:
        task.story_points = story_points if story_points != '' else None
    if estimated_hours is not None:
        task.estimated_hours = float(estimated_hours) if estimated_hours != '' else None

    task.updated_at = datetime.now()
    await task.save()
    await sync_task_health(task)

    if task.assigned_to and task.assigned_to != previous_assigned_to:
        assigned_user = await User.get(task.assigned_to)
        if assigned_user:
            await _notify_task_assignee(task, current_user, assigned_user)
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

    await create_timeline_event(
        user_id=task.assigned_to or str(current_user.id),
        company_id=task.company_id,
        event_type=TimelineEventType.TASK_UPDATED,
        title="Task Updated",
        description=task.title,
        related_module=TimelineModule.TASK,
        related_record_id=str(task.id),
        actor_id=str(current_user.id),
        metadata={"task_title": task.title, "project_id": task.project_id},
        idempotency_key=f"task:{task.id}:updated:{int(task.updated_at.timestamp())}",
    )

    await publish_event(
        build_domain_event(
            event_name="TaskUpdated",
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "title": task.title,
                "description": task.description,
                "status": task.status.value,
                "priority": task.priority.value,
                "project_id": task.project_id,
                "department_id": task.department_id,
                "tags": task.tags,
                "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_update"},
        )
    )

    # Get assigned user details for response
    assigned_user = None
    if task.assigned_to:
        assigned_user = await User.get(task.assigned_to)

    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "status": task.status.value,
        "priority": task.priority.value,
        "assigned_to": task.assigned_to,
        "assigned_to_name": f"{assigned_user.first_name} {assigned_user.last_name}" if assigned_user else None,
        "due_date": task.due_date,
        "health_status": getattr(task.health_status, "value", task.health_status),
        "extension_count": getattr(task, "extension_count", 0),
        "tags": task.tags,
        "updated_at": task.updated_at,
        "message": "Task updated successfully"
    }


@router.post("/{task_id}/attachments")
async def add_task_attachment(
    task_id: str,
    file_url: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Add an attachment to a task"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Initialize attachments list if it doesn't exist
    if not hasattr(task, 'attachments') or task.attachments is None:
        task.attachments = []

    # Add file URL to attachments (avoid duplicates)
    if file_url not in task.attachments:
        task.attachments.append(file_url)
        task.updated_at = datetime.now()
        await task.save()

        await publish_event(
            build_domain_event(
                event_name="TaskAttachmentAdded",
                aggregate_type="task",
                aggregate_id=str(task.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "file_url": file_url,
                    "attachments": task.attachments,
                    "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
                },
                project_id=str(task.project_id) if task.project_id else None,
                correlation_id=str(task.id),
                metadata={"source": "task_attachment_add"},
            )
        )

    return {
        "id": str(task.id),
        "attachments": task.attachments,
        "message": "Attachment added successfully"
    }
