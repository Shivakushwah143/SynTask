from fastapi import APIRouter

from .shared import *
from app.events import publish_event
from app.events.factories import build_domain_event
from app.creative.service import CreativeReviewService
from app.core.clock import utc_now
from app.services.file_service import FileService
from app.services.cloudinary_storage import CloudinaryStorage

creative_review_service = CreativeReviewService()

router = APIRouter()


@router.get("/{project_id}/files")
async def list_project_files(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List files attached to a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    await ensure_project_access_for_user(project, current_user)
    
    return {"files": project.files or []}


@router.post("/{project_id}/files")
async def upload_project_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    await ensure_project_access_for_user(project, current_user)
    
    stored = await FileService.store_uploaded_file(
        file,
        upload_dir=PROJECT_UPLOAD_DIR,
        url_prefix="/api/v1/files/projects",
        scope="projects",
        sensitive=True,
    )
    file_size = stored["size"]
    file_ext = stored["extension"]
    file_url = stored["file_url"]
    
    file_record = {
        "id": uuid.uuid4().hex,
        "name": file.filename,
        "original_name": file.filename,
        "url": file_url,
        "public_id": stored.get("cloudinary_public_id"),
        "resource_type": stored.get("cloudinary_resource_type"),
        "delivery_type": stored.get("cloudinary_delivery_type"),
        "type": file_ext[1:] if file_ext else "unknown",
        "size": file_size,
        "uploaded_at": utc_now().isoformat(),
        "uploaded_by": str(current_user.id),
        "uploaded_by_name": current_user.full_name(),
    }
    
    if not project.files:
        project.files = []
    project.files.append(file_record)
    project.updated_at = utc_now()
    
    await project.save()

    if removed_file.get("public_id"):
        CloudinaryStorage.delete(
            removed_file.get("public_id"),
            removed_file.get("resource_type") or "auto",
            removed_file.get("delivery_type") or "authenticated",
        )

    try:
        asset = await creative_review_service.orchestrator.create_asset_metadata(
            company_id=str(current_user.company_id),
            project_id=str(project.project_id or project.id),
            asset_id=file_record["id"],
            file_name=file.filename,
            file_url=file_url,
            source_type="project_file",
            mime_type=file.content_type,
            file_size=file_size,
            uploaded_by=str(current_user.id),
            metadata={"original_name": file.filename, "source": "project_upload"},
        )
        review = await creative_review_service.create_review_for_asset(
            current_user=current_user,
            project=project,
            asset_metadata=asset,
        )
        from app.worker.tasks.creative_review_tasks import enqueue_creative_review_task

        enqueue_creative_review_task.delay(str(review.id), str(current_user.id))
        await publish_event(
            build_domain_event(
                event_name="DocumentUploaded",
                aggregate_type="creative_review",
                aggregate_id=str(review.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "project_id": str(project.project_id or project.id),
                    "file_id": file_record["id"],
                    "file_name": file_record["name"],
                    "file_url": file_record["url"],
                    "source_type": "project_file",
                    "review_id": str(review.id),
                },
                project_id=str(project.project_id or project.id),
                metadata={"source": "project_file_upload"},
            )
        )
    except Exception:
        logger.exception("Creative review enqueue failed for uploaded file %s", file.filename)
    
    return {
        "message": "File uploaded successfully",
        "file": file_record,
    }


@router.delete("/{project_id}/files/{file_id}")
async def delete_project_file(
    project_id: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a file from a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    if not has_project_permission(current_user, project, ProjectPermission.MANAGE_PAGE):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You do not have permission to manage project files")
    
    file_index = None
    for idx, file_data in enumerate(project.files or []):
        if file_data.get("id") == file_id:
            file_index = idx
            break
    
    if file_index is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    removed_file = project.files.pop(file_index)
    
    try:
        filename = Path(removed_file.get("url", "")).name
        file_path = PROJECT_UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass
    
    project.updated_at = utc_now()
    await project.save()
    
    return {
        "message": "File deleted successfully",
        "file": removed_file,
    }
