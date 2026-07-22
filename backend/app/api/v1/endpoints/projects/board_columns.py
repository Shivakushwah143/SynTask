from fastapi import APIRouter

from .shared import *
from app.core.clock import utc_now

router = APIRouter()


@router.get("/{project_id}/board-columns")
async def get_board_columns(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get board columns for a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure default columns exist if none are set
    if not project.board_columns:
        project.board_columns = [
            {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
            {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
            {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
            {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
        ]
        await project.save()
    
    # Sort by order
    sorted_columns = sorted(project.board_columns, key=lambda x: x.get("order", 0))
    
    return {"columns": sorted_columns}


@router.post("/{project_id}/board-columns")
async def create_board_column(
    project_id: str,
    label: str = Form(...),
    color: str = Form("bg-gray-100"),
    order: Optional[int] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a new board column"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure board_columns exists
    if not project.board_columns:
        project.board_columns = [
            {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
            {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
            {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
            {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
        ]
    
    # Generate unique ID for the column
    import uuid
    column_id = f"col_{uuid.uuid4().hex[:8]}"
    
    # Determine order
    if order is None:
        max_order = max([col.get("order", 0) for col in project.board_columns], default=-1)
        order = max_order + 1
    
    # Create new column
    new_column = {
        "id": column_id,
        "label": label,
        "color": color,
        "order": order,
    }
    
    project.board_columns.append(new_column)
    project.updated_at = utc_now()
    await project.save()
    
    return {"message": "Column created successfully", "column": new_column}


@router.put("/{project_id}/board-columns/{column_id}")
async def update_board_column(
    project_id: str,
    column_id: str,
    label: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    order: Optional[int] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update a board column"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure board_columns exists
    if not project.board_columns:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="No columns found"
        )
    
    # Find the column
    column_index = None
    for idx, col in enumerate(project.board_columns):
        if col.get("id") == column_id:
            column_index = idx
            break
    
    if column_index is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
    
    # Update column
    if label is not None:
        project.board_columns[column_index]["label"] = label
    if color is not None:
        project.board_columns[column_index]["color"] = color
    if order is not None:
        project.board_columns[column_index]["order"] = order
    
    project.updated_at = utc_now()
    await project.save()
    
    return {
        "message": "Column updated successfully",
        "column": project.board_columns[column_index]
    }


@router.delete("/{project_id}/board-columns/{column_id}")
async def delete_board_column(
    project_id: str,
    column_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a board column"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure board_columns exists
    if not project.board_columns:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="No columns found"
        )
    
    # Check if column exists
    column_exists = any(col.get("id") == column_id for col in project.board_columns)
    
    if not column_exists:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
    
    # Prevent deleting default columns (can be customized later)
    default_column_ids = ["todo", "in_progress", "in_review", "completed"]
    if column_id in default_column_ids and len(project.board_columns) <= 4:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete default columns"
        )
    
    # Check if there are tasks in this column - use user-provided project_id, fallback to MongoDB _id
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    tasks_in_column = await Task.find({
        "$or": [
            {"project_id": project_id_for_query},
            {"project_id": str(project.id)}
        ],
        "company_id": project.company_id,
        "status": column_id
    }).count()
    
    if tasks_in_column > 0:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete column with {tasks_in_column} task(s). Please move tasks first."
        )

