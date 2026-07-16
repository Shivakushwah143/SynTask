from fastapi import APIRouter

from .shared import *
from app.models.client import Client
from app.events import publish_event
from app.events.factories import build_domain_event

router = APIRouter()


@router.post("/")
async def create_project(
    name: str = Form(...),
    key: str = Form(...),
    description: Optional[str] = Form(None),
    type: str = Form("software"),
    client_id: Optional[str] = Form(None),
    lead_id: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    assigned_user_ids: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    project_id: str = Form(...),  # MANDATORY - User-provided unique project ID
    current_user: User = Depends(get_current_user),
):
    """Create a new project. Admins and Managers may create within scope."""
    if not await can_create_project(current_user):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only Admins and Managers can create projects",
        )
    if not current_user.company_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company",
        )
    # Validate project_id is provided and not empty
    project_id = project_id.strip() if project_id else ""
    if not project_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Project ID is required. Please enter a unique Project ID."
        )
    
    # Uniqueness per company: no other project in this company may use this project_id
    existing_by_id = await Project.find_one(
        Project.project_id == project_id,
        Project.company_id == current_user.company_id
    )
    if existing_by_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Project ID '{project_id}' already exists in your company. Please use a different ID."
        )
    
    # Validate project key (must be unique per company)
    existing = await Project.find_one(
        Project.key == key.upper(),
        Project.company_id == current_user.company_id
    )
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Project key already exists"
        )
    
    # CRITICAL: Store user-provided project_id - DO NOT CHANGE THIS VALUE
    final_project_id = project_id
    logger.info(f"User provided project_id: {final_project_id} - This will be used throughout")
    
    # Validate project type
    try:
        project_type = ProjectType(type.lower())
    except:
        project_type = ProjectType.SOFTWARE
    
    # Validate lead if provided
    if lead_id:
        lead = await User.get(lead_id)
        if not lead or lead.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid lead"
            )

    client = None
    if client_id:
        client = await Client.get(client_id)
        if not client or client.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid client"
            )
    
    requested_assignees = []
    for raw in [assigned_to, assigned_user_ids]:
        if isinstance(raw, str) and raw:
            requested_assignees.extend([item.strip() for item in raw.split(",") if item.strip()])
    if getattr(current_user, "role", None) == UserRole.MANAGER and str(current_user.id) not in requested_assignees:
        requested_assignees.insert(0, str(current_user.id))
    assigned_users = await validate_project_assignees(current_user, current_user.company_id, requested_assignees) if requested_assignees else []
    assigned_ids = [str(user.id) for user in assigned_users]
    primary_assigned_to = assigned_ids[0] if assigned_ids else None
    
    # Parse dates
    start_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid start date format"
            )
    
    delivery_date_obj = None
    if delivery_date:
        try:
            delivery_date_obj = datetime.fromisoformat(delivery_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid delivery date format"
            )
    
    # Validate dates
    if start_date_obj and delivery_date_obj and start_date_obj > delivery_date_obj:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after delivery date"
        )
    
    # Create project with user-provided project_id
    project_data = {
        "name": name,
        "key": key.upper(),
        "project_id": final_project_id,  # User द्वारा enter किया गया unique project_id store करें
        "description": description,
        "company_id": current_user.company_id,
        "client_id": client_id,
        "type": project_type,
        "lead_id": lead_id,
        "assigned_to": primary_assigned_to,
        "assigned_user_ids": assigned_ids,
        "assigned_by": str(current_user.id) if assigned_ids else None,
        "assigned_at": datetime.now() if assigned_ids else None,
        "assignment_history": [{
            "assigned_by": str(current_user.id),
            "assigned_user_ids": assigned_ids,
            "assigned_at": datetime.now().isoformat(),
            "action": "created",
        }] if assigned_ids else [],
        "start_date": start_date_obj,
        "delivery_date": delivery_date_obj,
        "created_by": str(current_user.id),
    }
    
    # Create project with user-provided project_id (MANDATORY - NO AUTO-GENERATION)
    # IMPORTANT: Ensure project_id is set before insert
    project = Project(**project_data)
    
    # Explicitly set project_id to ensure it's not None
    project.project_id = final_project_id
    
    # Double-check project_id is set correctly before insert
    if not project.project_id or project.project_id != final_project_id:
        project.project_id = final_project_id
        logger.warning(f"Project_id mismatch before insert: expected={final_project_id}, got={project.project_id}")
    
    # Insert project
    await project.insert()
    await cache_delete(project_list_key(current_user.company_id))
    await cache_delete_pattern(f"dashboard:stats:{current_user.company_id}:*")
    
    # Force-write project_id to MongoDB so the field always exists in the document.
    # Use direct database access to ensure project_id is saved
    try:
        from app.core.database import get_database
        from bson import ObjectId
        db = get_database()
        # Use ObjectId conversion for _id
        project_oid = project.id if isinstance(project.id, ObjectId) else ObjectId(project.id)
        result = await db["projects"].update_one(
            {"_id": project_oid},
            {"$set": {"project_id": final_project_id}}
        )
        logger.info(
            f"project_id $set: matched={result.matched_count} modified={result.modified_count} id={project.id} value={final_project_id}"
        )
        if result.matched_count == 0:
            logger.error(f"project_id NOT saved: no document matched for _id={project.id}")
        # Verify: read back from DB
        doc = await db["projects"].find_one({"_id": project_oid}, {"project_id": 1})
        if doc and doc.get("project_id") == final_project_id:
            logger.info(f"Verified project_id in DB: {final_project_id}")
        else:
            logger.error(f"After $set, project_id in DB: {doc.get('project_id') if doc else 'doc not found'}")
    except Exception as e:
        logger.exception(f"project_id raw $set failed: {e}")
        # Fallback: set on model and save
        project.project_id = final_project_id
        await project.save()
    else:
        # Also set on model so Beanie state is correct
        project.project_id = final_project_id
        await project.save()

    if client:
        client_project_ids = [str(item) for item in (client.project_ids or [])]
        if str(project.id) not in client_project_ids:
            client.project_ids = client_project_ids + [str(project.id)]
        client.updated_at = datetime.now()
        await client.save()
    
    # Immediately refresh and verify user-provided project_id was saved correctly
    project_refreshed = await Project.get(project.id)
    
    # If project_id wasn't saved, force update it
    if not project_refreshed.project_id or project_refreshed.project_id != final_project_id:
        logger.error(f"CRITICAL: Project_id was not saved correctly after insert! Expected={final_project_id}, Got={project_refreshed.project_id}")
        # Force update if project_id wasn't saved correctly
        project_refreshed.project_id = final_project_id
        await project_refreshed.save()
        # Verify again after save
        project_refreshed = await Project.get(project.id)
        if project_refreshed.project_id != final_project_id:
            logger.error(f"FATAL: Failed to save project_id even after force update! Expected={final_project_id}, Got={project_refreshed.project_id}")
        else:
            logger.info(f"Successfully saved project_id after force update: {final_project_id}")
        project = project_refreshed
    else:
        logger.info(f"Project created successfully: MongoDB _id={project.id}, user project_id={final_project_id}, saved={project_refreshed.project_id}")
        project = project_refreshed
    
    # CRITICAL: final_project_id MUST be the user-provided one (NO FALLBACK TO MongoDB _id)
    # Do NOT overwrite final_project_id - it contains the user-provided value
    # Verify final_project_id is still the user-provided value
    if final_project_id != project_id:
        logger.error(f"CRITICAL ERROR: final_project_id was overwritten! Original={project_id}, Current={final_project_id}")
        final_project_id = project_id  # Restore user-provided value
    
    if project.project_id and project.project_id != final_project_id:
        logger.error(f"CRITICAL: Project.project_id mismatch! User provided={final_project_id}, Saved={project.project_id}")
        # Force update to user-provided value
        project.project_id = final_project_id
        await project.save()
    
    # Ensure we return the user-provided project_id (NOT MongoDB _id)
    # final_project_id contains the user-provided value - DO NOT CHANGE IT
    logger.info(f"Before return: final_project_id={final_project_id}, project.project_id={project.project_id}, project.id={project.id}")
    
    # Send notification to assigned user
    for assigned_user in assigned_users:
        from app.models.notification import Notification, NotificationType
        notification = Notification(
            company_id=current_user.company_id,
            user_id=str(assigned_user.id),
            type=NotificationType.PROJECT_ASSIGNED,
            title="New Project Assigned",
            message=f"You have been assigned to project: {name}",
            related_id=final_project_id,  # Use the project_id we're using
            related_type="project",
        )
        await notification.insert()

    background_warnings = []
    try:
        await publish_event(
            build_domain_event(
                event_name="ProjectCreated",
                aggregate_type="project",
                aggregate_id=str(project.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "project_id": project.project_id,
                    "name": project.name,
                    "description": project.description,
                    "status": project.status.value if getattr(project, "status", None) else None,
                    "client_id": project.client_id,
                    "updated_at": project.updated_at.isoformat() if getattr(project, "updated_at", None) else None,
                },
                project_id=str(project.project_id or project.id),
                metadata={"source": "project_create"},
            )
        )
    except Exception as exc:
        logger.warning(
            "project_created_event_publish_degraded",
            extra={
                "project_id": str(project.project_id or project.id),
                "mongo_id": str(project.id),
                "company_id": str(current_user.company_id),
                "event_name": "ProjectCreated",
                "error": str(exc),
            },
        )
        background_warnings.append("Project created, but background processing is degraded.")
    
    # Return ONLY user-provided project_id. Never return MongoDB _id as project_id.
    # Build response from final_project_id only (set from form at start of handler).
    out_project_id = (project_id.strip() if project_id else "") or final_project_id
    # Reject if we somehow ended up with an ObjectId-shaped value (24 hex chars)
    if len(out_project_id) == 24 and all(c in "0123456789abcdef" for c in out_project_id.lower()):
        logger.error(f"Would have returned ObjectId as project_id; using user value instead: {final_project_id}")
        out_project_id = final_project_id
    if not out_project_id:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User project_id was lost. Please try again."
        )
    logger.info(f"Returning project_id: {out_project_id} (user-provided), MongoDB _id: {project.id}")
    
    response = {
        "message": "Project created successfully",
        "project_id": out_project_id,
        "id": str(project.id),
        "key": project.key
    }
    if background_warnings:
        response["warnings"] = background_warnings
    return response

