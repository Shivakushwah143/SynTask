"""
Add GET endpoint for individual task to tasks.py

Insert this after the create_task endpoint (around line 267)
"""

ENDPOINT_CODE = '''

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
    
    # Role-based access check
    if current_user.role == UserRole.EMPLOYEE:
        # Employee can only view tasks assigned to them
        if task.assigned_to != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this task"
            )
    elif current_user.role == UserRole.LEAD:
        # Lead can view tasks assigned to them or their employees
        employees = await User.find(
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
        employee_ids = [str(emp.id) for emp in employees]
        employee_ids.append(str(current_user.id))
        
        if task.assigned_to not in employee_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this task"
            )
    elif current_user.role == UserRole.MANAGER:
        # Manager can view tasks assigned to them and all subordinates
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        subordinate_ids.append(str(current_user.id))
        
        if task.assigned_to not in subordinate_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this task"
            )
    # Admin and Super Admin can view all tasks in their company
    
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
        "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
        "epic_id": str(task.epic_id) if task.epic_id else None,
        "sprint_id": str(task.sprint_id) if task.sprint_id else None,
        "story_points": task.story_points,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }
'''

print(ENDPOINT_CODE)

