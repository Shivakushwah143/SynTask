from fastapi import APIRouter

from .shared import *
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


@router.post("/{project_id}/pages")
async def create_page(
    project_id: str,
    title: str = Form(...),
    content: str = Form(""),
    template: Optional[str] = Form(None),
    parent_page_id: Optional[str] = Form(None),
    status: Optional[str] = Form("draft"),
    current_user: User = Depends(get_current_user),
):
    """Create a new page in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)
    
    # Validate status
    page_status = PageStatus.DRAFT
    if status:
        try:
            page_status = PageStatus(status.lower())
        except:
            pass
    
    # Validate parent page if provided
    if parent_page_id:
        parent_page = await Page.get(parent_page_id)
        if not parent_page or parent_page.project_id != project_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent page"
            )
    
    page = Page(
        title=title,
        content=content,
        company_id=current_user.company_id,
        project_id=project_id,
        created_by=str(current_user.id),
        created_by_name=current_user.full_name(),
        template=template or "blank",
        parent_page_id=parent_page_id,
        status=page_status,
    )
    
    if page_status == PageStatus.PUBLISHED:
        page.published_at = datetime.utcnow()
    
    await page.insert()
    
    return {
        "message": "Page created successfully",
        "page_id": str(page.id)
    }


@router.get("/{project_id}/pages")
async def list_pages(
    project_id: str,
    status_filter: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """List all pages in a project"""
    skip, limit = pagination.skip, pagination.limit
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)
    
    query = {
        "project_id": project_id,
        "company_id": project.company_id
    }
    
    if status_filter:
        try:
            query["status"] = PageStatus(status_filter.lower())
        except:
            pass
    
    pages = await Page.find(query).skip(skip).limit(limit).sort("-updated_at").to_list()
    total = await Page.find(query).count()
    
    return {
        "pages": [
            {
                "id": str(page.id),
                "title": page.title,
                "content": page.content[:200] + "..." if len(page.content) > 200 else page.content,  # Preview
                "status": page.status.value,
                "template": page.template,
                "created_by": page.created_by,
                "created_by_name": page.created_by_name,
                "updated_at": page.updated_at,
                "created_at": page.created_at,
            }
            for page in pages
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/{project_id}/pages/{page_id}")
async def get_page(
    project_id: str,
    page_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a specific page"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    page = await Page.get(page_id)
    
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Page not found"
        )
    
    return {
        "id": str(page.id),
        "title": page.title,
        "content": page.content,
        "status": page.status.value,
        "template": page.template,
        "created_by": page.created_by,
        "created_by_name": page.created_by_name,
        "updated_by": page.updated_by,
        "updated_by_name": page.updated_by_name,
        "labels": page.labels,
        "attachments": page.attachments,
        "created_at": page.created_at,
        "updated_at": page.updated_at,
        "published_at": page.published_at,
    }


@router.put("/{project_id}/pages/{page_id}")
async def update_page(
    project_id: str,
    page_id: str,
    title: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Update a page"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    page = await Page.get(page_id)
    
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Page not found"
        )
    
    if title is not None:
        page.title = title
    if content is not None:
        page.content = content
    if status:
        try:
            page.status = PageStatus(status.lower())
            if page.status == PageStatus.PUBLISHED and not page.published_at:
                page.published_at = datetime.utcnow()
        except:
            pass
    
    page.updated_by = str(current_user.id)
    page.updated_by_name = current_user.full_name()
    page.updated_at = datetime.utcnow()
    
    await page.save()
    
    return {"message": "Page updated successfully"}


@router.delete("/{project_id}/pages/{page_id}")
async def delete_page(
    project_id: str,
    page_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a page"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    page = await Page.get(page_id)
    
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Page not found"
        )
    
    await page.delete()
    
    return {"message": "Page deleted successfully"}


# Board Columns Management Endpoints
