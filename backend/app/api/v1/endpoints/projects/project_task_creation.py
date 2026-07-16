from fastapi import APIRouter

from .shared import *

router = APIRouter()


@router.get("/for-task-creation")
async def get_projects_for_task_creation(
    current_user: User = Depends(get_current_user),
):
    """Projects current user may create tasks in."""
    if not current_user.company_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company",
        )
    if current_user.role == UserRole.EMPLOYEE:
        return {"projects": []}

    query = {"company_id": current_user.company_id, "status": {"$ne": ProjectStatus.ARCHIVED.value}}
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        if current_user.role == UserRole.MANAGER:
            scoped_ids = await scoped_user_ids(current_user)
            query["$or"] = [
                {"created_by": str(current_user.id)},
                {"assigned_to": {"$in": scoped_ids}},
                {"assigned_user_ids": {"$in": scoped_ids}},
            ]
        elif current_user.role == UserRole.LEAD:
            query["$or"] = [
                {"assigned_to": str(current_user.id)},
                {"assigned_user_ids": str(current_user.id)},
            ]

    projects = await Project.find(query).sort("-created_at").to_list()
    return {
        "projects": [
            {
                "id": str(project.id),
                "project_id": project.project_id or str(project.id),
                "name": project.name,
                "key": project.key,
                "status": project.status.value if hasattr(project.status, "value") else project.status,
                "assigned_to": project.assigned_to,
                "assigned_user_ids": getattr(project, "assigned_user_ids", []) or ([project.assigned_to] if project.assigned_to else []),
            }
            for project in projects
        ]
    }
