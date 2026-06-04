"""
Task Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional
from datetime import datetime
from bson import ObjectId

from app.models.task import Task, TaskStatus, TaskPriority, TaskComment
from app.models.user import User, UserRole
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    check_company_access,
)

router = APIRouter()


@router.get("/")
async def list_tasks(
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    created_by: Optional[str] = None,
    project_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """List tasks with filters"""
    # Super Admin can see all tasks, others need company_id
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        query = {"company_id": current_user.company_id}

    # Role-based task visibility
    if current_user.role == UserRole.EMPLOYEE:
        # Employee: Only see tasks assigned to them
        query["assigned_to"] = str(current_user.id)
    elif current_user.role == UserRole.LEAD:
        # Lead: See tasks assigned to them and their employees
        employees = await User.find(
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
        employee_ids = [str(emp.id) for emp in employees]
        employee_ids.append(str(current_user.id))
        # Use MongoDB $in operator
        query["assigned_to"] = {"$in": employee_ids}
    elif current_user.role == UserRole.MANAGER:
        # Manager: See tasks assigned to them and all subordinates
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        subordinate_ids.append(str(current_user.id))
        # Use MongoDB $in operator
        query["assigned_to"] = {"$in": subordinate_ids}
    # Admin and Super Admin see all tasks (no additional filter)
    
    if status_filter:
        query["status"] = status_filter
    if priority:
        query["priority"] = priority
    if assigned_to and current_user.role != UserRole.EMPLOYEE:
        query["assigned_to"] = assigned_to
    if created_by:
        query["created_by"] = created_by
    if project_id:
        # Filter by project_id - only return tasks that have this specific project_id
        # Simple equality check - MongoDB will only match documents where project_id equals this value
        # Tasks with project_id=None or missing project_id field won't match
        query["project_id"] = project_id
    
    tasks = await Task.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Task.find(query).count()
    
    return {
        "tasks": [
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status.value,
                "priority": task.priority.value,
                "assigned_to": task.assigned_to,
                "created_by": task.created_by,
                "project_id": str(task.project_id) if task.project_id else None,
                "due_date": task.due_date,
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
    story_points: Optional[int] = Form(None),
    estimated_hours: Optional[float] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """
    Create a new task.
    project_id: Frontend may send either the custom project ID (e.g. PROJ-001) or MongoDB _id.
    We resolve to the project and store the custom project_id in task.project_id so tasks are
    linked by logical ID, not by ObjectId.
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    # Validate priority
    try:
        task_priority = TaskPriority(priority.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority. Must be one of: {[p.value for p in TaskPriority]}"
        )
    
    # Parse due date
    parsed_due_date = None
    if due_date:
        try:
            parsed_due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid due date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
            )
    
    # Parse tags
    parsed_tags = []
    if tags:
        try:
            parsed_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        except:
            parsed_tags = []
    
    # Convert empty strings to None for optional fields (do this before validation)
    project_id = project_id.strip() if project_id and project_id.strip() else None
    # Keep original value from form so we can use same id in task (fetch by project_id)
    original_project_id_from_request = project_id
    epic_id = epic_id.strip() if epic_id and epic_id.strip() else None
    sprint_id = sprint_id.strip() if sprint_id and sprint_id.strip() else None
    parent_task_id = parent_task_id.strip() if parent_task_id and parent_task_id.strip() else None
    assigned_to = assigned_to.strip() if assigned_to and assigned_to.strip() else None
    
    # Validate assigned user if provided
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
    
    # Validate project if provided - use helper function to find by user-provided project_id or MongoDB _id
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
        
        # Verify company access
        if project.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project"
            )
        
        # Task must store same project_id so we can fetch tasks by project. Prefer:
        # 1) request value if it looks like custom id (e.g. ak-001), else
        # 2) project.project_id, else 3) MongoDB _id
        def looks_like_objectid(s):
            return s and len(s) == 24 and all(c in "0123456789abcdef" for c in s.lower())
        if original_project_id_from_request and not looks_like_objectid(original_project_id_from_request):
            project_id = original_project_id_from_request
            logger.info(f"Task creation: Using request project_id={project_id} (custom id) for project {project.id}")
        elif user_project_id:
            project_id = user_project_id
            logger.info(f"Task creation: Using user-defined project_id={project_id} for project MongoDB _id={project.id}")
        else:
            project_id = str(project.id)
            logger.warning(f"Task creation: Using MongoDB _id={project_id} as fallback")
    
    # Validate epic if provided
    if epic_id:
        from app.models.project import Epic
        epic = await Epic.get(epic_id)
        if not epic or epic.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Epic not found"
            )
    
    # Validate sprint if provided
    if sprint_id:
        from app.models.project import Sprint
        sprint = await Sprint.get(sprint_id)
        if not sprint or sprint.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sprint not found"
            )

    task = Task(
        title=title,
        description=description,
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        assigned_to=assigned_to,
        assigned_by=str(current_user.id) if assignee else None,
        priority=task_priority,
        due_date=parsed_due_date,
        tags=parsed_tags,
        parent_task_id=parent_task_id,
        project_id=project_id,  # Now properly None if empty string was sent
        epic_id=epic_id,
        sprint_id=sprint_id,
        story_points=story_points,
        estimated_hours=estimated_hours,
    )
    
    await task.insert()

    # Send email notification if task is assigned
    if assigned_to and assignee:
        try:
            from app.core.email import send_task_assignment_email
            # Safely determine project name if a valid project was loaded above
            project_name = None
            if "project" in locals() and project is not None:
                project_name = getattr(project, "name", None) or getattr(project, "project_name", None)

            await send_task_assignment_email(
                assignee_email=assignee.email,
                assignee_name=assignee.full_name(),
                task_title=title,
                task_description=description or "",
                task_priority=task_priority.value,
                task_due_date=parsed_due_date,
                assigned_by_name=current_user.full_name(),
                task_id=str(task.id),
                project_name=project_name,
            )
        except Exception as e:
            # Log error but don't fail the request
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send task assignment email: {str(e)}")
    
    # Create notification for assigned user
    if assigned_to:
        try:
            from app.models.notification import Notification, NotificationType
            notification = Notification(
                company_id=current_user.company_id,
                user_id=assigned_to,
                type=NotificationType.TASK_ASSIGNED,
                title="New Task Assigned",
                message=f"You have been assigned a new task: {title}",
                related_id=str(task.id),
                related_type="task",
            )
            await notification.insert()
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create notification: {str(e)}")

    return {
        "id": str(task.id),
        "title": task.title,
        "status": task.status.value,
        "priority": task.priority.value,
        "assigned_to": task.assigned_to,
        "created_by": task.created_by,
        "project_id": str(task.project_id) if task.project_id else None,
        "due_date": task.due_date,
        "created_at": task.created_at,
        "message": "Task created successfully",
        "task_id": str(task.id)
    }


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
    
    # Check access permissions
    check_company_access(current_user, task.company_id)
    
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
        "due_date": task.due_date,
        "tags": task.tags,
        "attachments": task.attachments if hasattr(task, 'attachments') and task.attachments else [],
        "created_at": task.created_at,
        "updated_at": task.updated_at,
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
    
    check_company_access(current_user, task.company_id)
    
    # Validate new status
    try:
        task_status = TaskStatus(new_status.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {[s.value for s in TaskStatus]}"
        )
    
    # Update status
    task.status = task_status
    task.updated_at = datetime.utcnow()
    await task.save()
    
    return {
        "id": str(task.id),
        "status": task.status.value,
        "message": "Task status updated successfully"
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
    
    check_company_access(current_user, task.company_id)
    
    # Find all comments for this task
    task_comments = await TaskComment.find(
        TaskComment.task_id == task_id
    ).sort("-created_at").to_list()
    
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
    
    check_company_access(current_user, task.company_id)
    
    # Create new comment document
    comment = TaskComment(
        task_id=task_id,
        company_id=current_user.company_id,
        user_id=str(current_user.id),
        user_name=f"{current_user.first_name} {current_user.last_name}",
        content=content,
        created_at=datetime.utcnow()
    )
    
    await comment.insert()
    
    # Update task's updated_at
    task.updated_at = datetime.utcnow()
    await task.save()
    
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
    
    check_company_access(current_user, task.company_id)
    
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
    
    task.updated_at = datetime.utcnow()
    await task.save()
    
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
    
    check_company_access(current_user, task.company_id)
    
    # Initialize attachments list if it doesn't exist
    if not hasattr(task, 'attachments') or task.attachments is None:
        task.attachments = []
    
    # Add file URL to attachments (avoid duplicates)
    if file_url not in task.attachments:
        task.attachments.append(file_url)
        task.updated_at = datetime.utcnow()
        await task.save()
    
    return {
        "id": str(task.id),
        "attachments": task.attachments,
        "message": "Attachment added successfully"
    }
