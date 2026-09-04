"""
Project Template Service — create, manage, and generate projects from templates.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from fastapi import HTTPException, status as http_status

from app.core.clock import utc_now
from app.models.project import Project, ProjectPriority, ProjectStatus
from app.models.project_template import ProjectTemplate, TemplateTask, TemplateTaskPriority
from app.models.task import Task
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Template CRUD
# ---------------------------------------------------------------------------

async def create_template(
    *,
    company_id: str,
    name: str,
    description: Optional[str] = None,
    project_type: Optional[str] = None,
    default_priority: str = "medium",
    estimated_duration_days: Optional[int] = None,
    estimated_hours: Optional[float] = None,
    task_templates: List[Dict[str, Any]],
    current_user: User,
) -> ProjectTemplate:
    """Create a new project template with task blueprints."""
    _validate_management_role(current_user)

    existing = await ProjectTemplate.find_one(
        ProjectTemplate.company_id == company_id,
        ProjectTemplate.name == name,
    )
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Template '{name}' already exists in your company.",
        )

    template = ProjectTemplate(
        company_id=company_id,
        name=name,
        description=description,
        project_type=project_type,
        default_priority=_validate_priority_value(default_priority),
        estimated_duration_days=estimated_duration_days,
        estimated_hours=estimated_hours,
        task_count=len(task_templates),
        created_by=str(current_user.id),
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    await template.insert()

    # Create template tasks
    ref_ids = set()
    for idx, task_data in enumerate(task_templates):
        ref_id = task_data.get("ref_id", f"task_{idx}")
        if ref_id in ref_ids:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate ref_id '{ref_id}' in task templates.",
            )
        ref_ids.add(ref_id)

        template_task = TemplateTask(
            template_id=str(template.id),
            company_id=company_id,
            ref_id=ref_id,
            title=task_data.get("title", f"Task {idx + 1}"),
            description=task_data.get("description"),
            priority=TemplateTaskPriority(task_data.get("priority", "medium")),
            relative_start_day=task_data.get("relative_start_day", 0),
            relative_due_day=task_data.get("relative_due_day", 3),
            estimated_hours=task_data.get("estimated_hours"),
            review_required=task_data.get("review_required", True),
            assignee_placeholder=task_data.get("assignee_placeholder"),
            reviewer_placeholder=task_data.get("reviewer_placeholder"),
            depends_on_refs=[r for r in task_data.get("depends_on_refs", []) if r in ref_ids or r in {td.get("ref_id", f"task_{i}") for i, td in enumerate(task_templates)}],
            tags=task_data.get("tags", []),
            required_for_project_completion=task_data.get("required_for_project_completion", True),
            order=idx,
            checklist=task_data.get("checklist", []),
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        await template_task.insert()

    return template


async def update_template(
    *,
    template: ProjectTemplate,
    name: Optional[str] = None,
    description: Optional[str] = None,
    project_type: Optional[str] = None,
    default_priority: Optional[str] = None,
    estimated_duration_days: Optional[int] = None,
    estimated_hours: Optional[float] = None,
    enabled: Optional[bool] = None,
    task_templates: Optional[List[Dict[str, Any]]] = None,
    current_user: User,
) -> ProjectTemplate:
    """Update template.  Does NOT affect existing projects generated from it."""
    _validate_management_role(current_user)

    if name is not None:
        existing = await ProjectTemplate.find_one(
            ProjectTemplate.company_id == template.company_id,
            ProjectTemplate.name == name,
            ProjectTemplate.id != template.id,
        )
        if existing:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Template '{name}' already exists.",
            )
        template.name = name
    if description is not None:
        template.description = description
    if project_type is not None:
        template.project_type = project_type
    if default_priority is not None:
        template.default_priority = _validate_priority_value(default_priority)
    if estimated_duration_days is not None:
        template.estimated_duration_days = estimated_duration_days
    if estimated_hours is not None:
        template.estimated_hours = estimated_hours
    if enabled is not None:
        template.enabled = enabled

    # Replace task templates ONLY if explicitly provided AND non-empty.
    # Metadata-only edits (name, description, priority, etc.) must NOT
    # delete existing template tasks.
    if task_templates is not None and len(task_templates) > 0:
        # Delete old template tasks
        old_tasks = await TemplateTask.find(
            TemplateTask.template_id == str(template.id)
        ).to_list()
        for ot in old_tasks:
            await ot.delete()

        ref_ids = set()
        for idx, task_data in enumerate(task_templates):
            ref_id = task_data.get("ref_id", f"task_{idx}")
            if ref_id in ref_ids:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate ref_id '{ref_id}' in task templates.",
                )
            ref_ids.add(ref_id)

            template_task = TemplateTask(
                template_id=str(template.id),
                company_id=template.company_id,
                ref_id=ref_id,
                title=task_data.get("title", f"Task {idx + 1}"),
                description=task_data.get("description"),
                priority=TemplateTaskPriority(task_data.get("priority", "medium")),
                relative_start_day=task_data.get("relative_start_day", 0),
                relative_due_day=task_data.get("relative_due_day", 3),
                estimated_hours=task_data.get("estimated_hours"),
                review_required=task_data.get("review_required", True),
                assignee_placeholder=task_data.get("assignee_placeholder"),
                reviewer_placeholder=task_data.get("reviewer_placeholder"),
                depends_on_refs=task_data.get("depends_on_refs", []),
                tags=task_data.get("tags", []),
                required_for_project_completion=task_data.get("required_for_project_completion", True),
                order=idx,
                checklist=task_data.get("checklist", []),
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            await template_task.insert()
        template.task_count = len(task_templates)

    template.version += 1
    template.updated_at = utc_now()
    await template.save()
    return template


async def list_templates(
    company_id: str,
    enabled_only: bool = False,
    project_type: Optional[str] = None,
) -> List[ProjectTemplate]:
    """List company templates."""
    query: Dict[str, Any] = {"company_id": company_id}
    if enabled_only:
        query["enabled"] = True
    if project_type:
        query["project_type"] = project_type
    return await ProjectTemplate.find(query).sort("name").to_list()


async def get_template(template_id: str, company_id: str) -> ProjectTemplate:
    """Get a template by ID, scoped to company."""
    template = await ProjectTemplate.get(template_id)
    if not template or template.company_id != company_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return template


async def get_template_tasks(template_id: str) -> List[TemplateTask]:
    """Get all task blueprints for a template."""
    return await TemplateTask.find(
        TemplateTask.template_id == template_id        ).sort("order").to_list()


# ---------------------------------------------------------------------------
# Project generation from template
# ---------------------------------------------------------------------------

async def generate_project_from_template(
    *,
    template_id: str,
    company_id: str,
    name: str,
    key: str,
    project_id: str,
    client_id: Optional[str] = None,
    lead_id: str,
    start_date: str,
    delivery_date: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_map: Optional[Dict[str, str]] = None,
    reviewer_map: Optional[Dict[str, str]] = None,
    current_user: User,
) -> Dict[str, Any]:
    """Generate a real project and tasks from a template.

    assignee_map: maps placeholder -> actual user_id
    reviewer_map: maps placeholder -> actual user_id
    """
    from app.services.project_service import ProjectService

    template = await get_template(template_id, company_id)
    if not template.enabled:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Template is disabled.",
        )

    template_tasks = await get_template_tasks(template_id)
    if not template_tasks:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Template has no task definitions.",
        )

    # Validate references
    ref_ids = {tt.ref_id for tt in template_tasks}
    for tt in template_tasks:
        for dep_ref in tt.depends_on_refs:
            if dep_ref not in ref_ids:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Task '{tt.ref_id}' depends on unknown ref '{dep_ref}'.",
                )

    # Parse start date
    try:
        start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Invalid start date format.",
        )

    existing_project = await Project.find_one({"company_id": company_id, "project_id": project_id})
    if existing_project:
        existing_tasks = await Task.find({"company_id": company_id, "project_id": project_id}).to_list()
        existing_by_ref = {
            str(task.related_entity_id).rsplit(":", 1)[-1]: task
            for task in existing_tasks
            if getattr(task, "source_type", None) == "project_template"
            and str(getattr(task, "related_entity_type", "")) == str(template.id)
        }
        if len(existing_by_ref) == len(template_tasks):
            return {
                "project_id": project_id,
                "template_id": str(template.id),
                "template_name": template.name,
                "template_version": template.version,
                "tasks_created": len(existing_by_ref),
                "tasks": [{"ref_id": tt.ref_id, "task_id": str(existing_by_ref[tt.ref_id].id), "title": tt.title} for tt in template_tasks],
                "message": f"Project '{name}' was already generated from template '{template.name}'.",
            }
    else:
        try:
            result = await ProjectService.create_project_core(
                name=name,
                key=key,
                description=template.description,
                type=template.project_type or "software",
                client_id=client_id,
                lead_id=lead_id,
                start_date=start_date,
                delivery_date=delivery_date,
                priority=priority or template.default_priority,
                project_id=project_id,
                current_user=current_user,
            )
            existing_project = await Project.get(result.get("id"))
        except DuplicateKeyError:
            existing_project = await Project.find_one({"company_id": company_id, "project_id": project_id})
            if not existing_project:
                raise

    created_project_id = project_id

    # Create tasks from template
    created_tasks: List[Dict[str, Any]] = []
    ref_to_task_id: Dict[str, str] = {}

    from app.services.task_service import TaskService

    pending_tasks = list(template_tasks)
    while pending_tasks:
        ready = [tt for tt in pending_tasks if all(dep in ref_to_task_id for dep in tt.depends_on_refs)]
        if not ready:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Template dependencies contain a cycle")
        for tt in ready:
            existing_task = await Task.find_one({
            "company_id": company_id,
            "project_id": created_project_id,
            "source_type": "project_template",
            "related_entity_type": str(template.id),
            "related_entity_id": f"{template.id}:{created_project_id}:{tt.ref_id}",
        })
            if existing_task:
                ref_to_task_id[tt.ref_id] = str(existing_task.id)
                created_tasks.append({"ref_id": tt.ref_id, "task_id": str(existing_task.id), "title": tt.title})
                continue
            task_start = start_dt + timedelta(days=tt.relative_start_day)
            task_due = start_dt + timedelta(days=tt.relative_due_day)

        # Resolve assignee
            assignee_id = None
            if tt.assignee_placeholder and assignee_map:
                assignee_id = assignee_map.get(tt.assignee_placeholder)

        # Resolve reviewer
            reviewer_id = None
            if tt.reviewer_placeholder and reviewer_map:
                reviewer_id = reviewer_map.get(tt.reviewer_placeholder)

        # Resolve dependencies (ref_ids -> actual task IDs)
            dependencies = [ref_to_task_id[dep_ref] for dep_ref in tt.depends_on_refs]

        # Normalize checklist
            checklist = []
            for idx, item in enumerate(tt.checklist or []):
                if isinstance(item, str):
                    checklist.append({
                        "id": str(uuid.uuid4()),
                        "text": item,
                        "completed": False,
                        "required": False,
                        "order": idx,
                    })
                elif isinstance(item, dict):
                    checklist.append({
                        "id": item.get("id", str(uuid.uuid4())),
                        "text": item.get("text", item.get("title", "")),
                        "completed": False,
                        "required": item.get("required", False),
                        "order": idx,
                    })

            try:
                result = await TaskService.create_task_core(
                    title=tt.title,
                    description=tt.description,
                    assigned_to=assignee_id,
                    priority=tt.priority.value,
                    start_date=task_start.isoformat(),
                    due_date=task_due.isoformat(),
                    tags=",".join(tt.tags),
                    project_id=created_project_id,
                    estimated_hours=tt.estimated_hours,
                    reviewer_id=reviewer_id,
                    review_required=tt.review_required,
                    checklist=checklist,
                    dependencies=dependencies,
                    required_for_project_completion=tt.required_for_project_completion,
                    source_type="project_template",
                    related_entity_type=str(template.id),
                    related_entity_id=f"{template.id}:{created_project_id}:{tt.ref_id}",
                    current_user=current_user,
                    background_tasks=None,
                )
            except DuplicateKeyError:
                existing_task = await Task.find_one({
                    "company_id": company_id,
                    "project_id": created_project_id,
                    "source_type": "project_template",
                    "related_entity_type": str(template.id),
                    "related_entity_id": f"{template.id}:{created_project_id}:{tt.ref_id}",
                })
                if not existing_task:
                    raise
                result = {"id": str(existing_task.id)}
            task_id = str(result.get("task_id") or result.get("id"))
            ref_to_task_id[tt.ref_id] = task_id
            created_tasks.append({
                "ref_id": tt.ref_id,
                "task_id": task_id,
                "title": tt.title,
            })
        pending_tasks = [tt for tt in pending_tasks if tt not in ready]

    return {
        "project_id": created_project_id,
        "template_id": str(template.id),
        "template_name": template.name,
        "template_version": template.version,
        "tasks_created": len(created_tasks),
        "tasks": created_tasks,
        "message": f"Project '{name}' created from template '{template.name}' with {len(created_tasks)} tasks.",
    }


# ---------------------------------------------------------------------------
# Apply template to existing project
# ---------------------------------------------------------------------------

async def apply_template_to_project(
    *,
    project_id: str,
    template_id: str,
    company_id: str,
    customized_tasks: Optional[List[Dict[str, Any]]] = None,
    assignee_map: Optional[Dict[str, str]] = None,
    reviewer_map: Optional[Dict[str, str]] = None,
    start_date: Optional[str] = None,
    current_user: User,
    application_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply a (customized) template plan to an existing project.

    This is the single canonical function for both Flow A (new project)
    and Flow B (existing project).  Flow A simply calls create_project_core()
    first, then calls this function.

    Idempotency: if *application_id* is provided and a previous application
    with that ID already exists on the project, return the cached result
    without creating duplicate tasks.
    """
    import json
    import hashlib

    # -- 1. Validate project ------------------------------------------------
    project = await Project.find_one(
        Project.project_id == project_id, Project.company_id == company_id
    )
    if not project:
        # Fallback: try Mongo ObjectId
        try:
            project = await Project.get(project_id)
            if project and project.company_id != company_id:
                project = None
        except Exception:
            project = None
    if not project:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_status = getattr(project.status, 'value', str(project.status))
    if project_status in ('cancelled', 'archived'):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot apply template to a cancelled or archived project.",
        )

    # -- 2. Validate template ------------------------------------------------
    template = await get_template(template_id, company_id)
    if not template.enabled:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Template is disabled.",
        )

    # -- 3. Build the task plan (customized or master) -----------------------
    task_plan: List[Dict[str, Any]]
    if customized_tasks is not None and len(customized_tasks) > 0:
        task_plan = customized_tasks
    else:
        master_tasks = await get_template_tasks(template_id)
        task_plan = [_template_task_to_plan(t) for t in master_tasks]

    if not task_plan:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Template has no task definitions.",
        )

    # -- 4. Validate dependency references in the plan -----------------------
    plan_ref_ids = {t.get("ref_id", f"task_{i}") for i, t in enumerate(task_plan)}
    for i, t in enumerate(task_plan):
        for dep_ref in t.get("depends_on_refs", []):
            if dep_ref not in plan_ref_ids:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Task '{t.get('ref_id')}' depends on unknown ref '{dep_ref}' in the customized plan.",
                )

    # -- 5. Parse start date -------------------------------------------------
    start_dt: Optional[datetime] = None
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid start date format.",
            )
    elif project.start_date:
        start_dt = project.start_date

    # -- 6. Idempotency check -----------------------------------------------
    if application_id:
        existing_app_id = getattr(project, "template_application_id", None)
        if existing_app_id == application_id:
            existing_tasks = await Task.find({
                "company_id": company_id,
                "project_id": project.project_id or str(project.id),
                "source_type": "project_template",
                "related_entity_type": template_id,
            }).to_list()
            return {
                "project_id": project.project_id or str(project.id),
                "template_id": template_id,
                "template_name": template.name,
                "template_version": template.version,
                "tasks_created": len(existing_tasks),
                "tasks": [{"task_id": str(t.id), "title": t.title} for t in existing_tasks],
                "message": f"Template '{template.name}' was already applied to this project.",
                "idempotent": True,
            }

    # -- 7. Detect duplicate tasks -------------------------------------------
    project_identifier = project.project_id or str(project.id)
    existing_tasks = await Task.find({
        "company_id": company_id,
        "project_id": project_identifier,
    }).to_list()

    existing_template_tasks = [t for t in existing_tasks if t.source_type == "project_template"]
    existing_by_ref: Dict[str, Task] = {}
    for t in existing_template_tasks:
        ref = (t.related_entity_id or "").rsplit(":", 1)[-1]
        if ref:
            existing_by_ref[ref] = t

    # Title-based duplicate detection for manually created tasks
    existing_title_map: Dict[str, Task] = {}
    for t in existing_tasks:
        if t.source_type != "project_template" and t.title:
            existing_title_map[t.title.strip().lower()] = t

    # -- 8. Create tasks -----------------------------------------------------
    created_tasks: List[Dict[str, Any]] = []
    skipped_tasks: List[Dict[str, Any]] = []
    ref_to_task_id: Dict[str, str] = {}
    customizations_applied = 0

    from app.services.task_service import TaskService

    # First pass: map existing template tasks
    for tt_data in task_plan:
        ref = tt_data.get("ref_id", f"task_{task_plan.index(tt_data)}")
        if ref in existing_by_ref:
            ref_to_task_id[ref] = str(existing_by_ref[ref].id)
            skipped_tasks.append({"ref_id": ref, "title": tt_data.get("title", ""), "reason": "already_exists"})

    # Second pass: create tasks in dependency order
    pending_tasks = list(enumerate(task_plan))
    safety_counter = 0
    while pending_tasks and safety_counter < 1000:
        safety_counter += 1
        ready = [
            (i, tt) for i, tt in pending_tasks
            if all(dep in ref_to_task_id for dep in tt.get("depends_on_refs", []))
        ]
        if not ready:
            remaining_refs = [tt.get("ref_id", f"task_{i}") for i, tt in pending_tasks]
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Template dependencies contain a cycle or unresolved refs: {remaining_refs}",
            )

        for idx, tt_data in ready:
            ref = tt_data.get("ref_id", f"task_{idx}")

            # Skip if already created from first pass
            if ref in ref_to_task_id:
                pending_tasks = [(i, tt) for i, tt in pending_tasks if i != idx]
                continue

            # Duplicate check against existing non-template tasks
            title_lower = (tt_data.get("title", "") or "").strip().lower()
            if title_lower in existing_title_map:
                skipped_tasks.append({"ref_id": ref, "title": tt_data.get("title", ""), "reason": "duplicate_of_existing"})
                ref_to_task_id[ref] = str(existing_title_map[title_lower].id)
                pending_tasks = [(i, tt) for i, tt in pending_tasks if i != idx]
                continue

            # Calculate dates
            task_start_iso = None
            task_due_iso = None
            if start_dt:
                task_start = start_dt + timedelta(days=tt_data.get("relative_start_day", 0))
                task_due = start_dt + timedelta(days=tt_data.get("relative_due_day", 3))
                task_start_iso = task_start.isoformat()
                task_due_iso = task_due.isoformat()

            # Resolve placeholders
            assignee_id = None
            if tt_data.get("assignee_placeholder") and assignee_map:
                assignee_id = assignee_map.get(tt_data["assignee_placeholder"])

            reviewer_id = None
            if tt_data.get("reviewer_placeholder") and reviewer_map:
                reviewer_id = reviewer_map.get(tt_data["reviewer_placeholder"])

            # Resolve dependencies
            dependencies = [ref_to_task_id[dep] for dep in tt_data.get("depends_on_refs", []) if dep in ref_to_task_id]

            # Normalize checklist
            checklist = _normalize_checklist(tt_data.get("checklist", []))

            # Track customizations
            master_task = None
            for mt in await get_template_tasks(template_id):
                if mt.ref_id == ref:
                    master_task = mt
                    break
            if master_task and _is_customized(tt_data, master_task):
                customizations_applied += 1

            try:
                result = await TaskService.create_task_core(
                    title=tt_data.get("title", f"Task {idx + 1}"),
                    description=tt_data.get("description"),
                    assigned_to=assignee_id,
                    priority=tt_data.get("priority", "medium"),
                    start_date=task_start_iso,
                    due_date=task_due_iso,
                    tags=",".join(tt_data.get("tags", [])),
                    project_id=project_identifier,
                    estimated_hours=tt_data.get("estimated_hours"),
                    reviewer_id=reviewer_id,
                    review_required=tt_data.get("review_required", True),
                    checklist=checklist,
                    dependencies=dependencies,
                    required_for_project_completion=tt_data.get("required_for_project_completion", True),
                    source_type="project_template",
                    related_entity_type=template_id,
                    related_entity_id=f"{template_id}:{project_identifier}:{ref}",
                    current_user=current_user,
                    background_tasks=None,
                )
            except DuplicateKeyError:
                existing_task = await Task.find_one({
                    "company_id": company_id,
                    "project_id": project_identifier,
                    "source_type": "project_template",
                    "related_entity_type": template_id,
                    "related_entity_id": f"{template_id}:{project_identifier}:{ref}",
                })
                if not existing_task:
                    raise
                result = {"task_id": str(existing_task.id)}
                skipped_tasks.append({"ref_id": ref, "title": tt_data.get("title", ""), "reason": "idempotent"})

            task_id = result.get("task_id") or result.get("id")
            ref_to_task_id[ref] = task_id
            created_tasks.append({"ref_id": ref, "task_id": task_id, "title": tt_data.get("title", "")})
            pending_tasks = [(i, tt) for i, tt in pending_tasks if i != idx]

    # -- 9. Record template metadata on project ------------------------------
    project.source_template_id = template_id
    project.source_template_name = template.name
    project.source_template_version = template.version
    project.template_applied_at = utc_now()
    project.template_applied_by = str(current_user.id)
    project.template_application_id = application_id or str(uuid.uuid4())
    project.updated_at = utc_now()
    await project.save()

    # -- 10. Record activity/audit -------------------------------------------
    try:
        from app.models.changelog import ChangeLog
        await ChangeLog(
            task_id=str(project.id),
            company_id=company_id,
            user_id=str(current_user.id),
            user_name=current_user.full_name(),
            field="template_applied",
            field_type="template",
            old_value=None,
            new_value=template.name,
            old_string=None,
            new_string=f"Template '{template.name}' v{template.version} applied. {len(created_tasks)} tasks created, {len(skipped_tasks)} skipped.",
            metadata={
                "template_id": template_id,
                "template_name": template.name,
                "template_version": template.version,
                "tasks_created": len(created_tasks),
                "tasks_skipped": len(skipped_tasks),
                "customizations_applied": customizations_applied,
            },
        ).insert()
    except Exception as exc:
        logger.warning("Failed to record template application activity: %s", exc)

    return {
        "project_id": project_identifier,
        "template_id": template_id,
        "template_name": template.name,
        "template_version": template.version,
        "tasks_created": len(created_tasks),
        "tasks_skipped": len(skipped_tasks),
        "customizations_applied": customizations_applied,
        "tasks": created_tasks,
        "skipped": skipped_tasks,
        "message": f"Template '{template.name}' applied to project '{project.name}'. {len(created_tasks)} tasks created, {len(skipped_tasks)} skipped.",
    }


def _template_task_to_plan(t) -> Dict[str, Any]:
    """Convert a TemplateTask document to a plan dict."""
    return {
        "ref_id": t.ref_id,
        "title": t.title,
        "description": t.description,
        "priority": t.priority.value if hasattr(t.priority, 'value') else str(t.priority),
        "relative_start_day": t.relative_start_day,
        "relative_due_day": t.relative_due_day,
        "estimated_hours": t.estimated_hours,
        "review_required": t.review_required,
        "assignee_placeholder": t.assignee_placeholder,
        "reviewer_placeholder": t.reviewer_placeholder,
        "depends_on_refs": t.depends_on_refs,
        "tags": t.tags,
        "required_for_project_completion": t.required_for_project_completion,
        "checklist": t.checklist or [],
    }


def _normalize_checklist(items: list) -> list:
    """Normalize checklist items to standard format."""
    result = []
    for idx, item in enumerate(items):
        if isinstance(item, str):
            result.append({"id": str(uuid.uuid4()), "text": item, "completed": False, "required": False, "order": idx})
        elif isinstance(item, dict):
            result.append({
                "id": item.get("id", str(uuid.uuid4())),
                "text": item.get("text", item.get("title", "")),
                "completed": False,
                "required": item.get("required", False),
                "order": idx,
            })
    return result


def _is_customized(plan_task: Dict[str, Any], master_task) -> bool:
    """Check if a plan task differs from the master template task."""
    if plan_task.get("title") != master_task.title:
        return True
    if plan_task.get("description") != master_task.description:
        return True
    plan_priority = plan_task.get("priority", "medium")
    master_priority = master_task.priority.value if hasattr(master_task.priority, 'value') else str(master_task.priority)
    if plan_priority != master_priority:
        return True
    if plan_task.get("relative_start_day") != master_task.relative_start_day:
        return True
    if plan_task.get("relative_due_day") != master_task.relative_due_day:
        return True
    if plan_task.get("estimated_hours") != master_task.estimated_hours:
        return True
    if plan_task.get("review_required") != master_task.review_required:
        return True
    return False


def _validate_management_role(user: User) -> None:
    """Only admin/manager/lead can manage templates."""
    role = user.role
    if isinstance(role, str):
        allowed = {UserRole.ADMIN.value, UserRole.SUB_ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value}
        if role.lower() not in allowed:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only Admin, Manager, or Lead can manage project templates.",
            )
    else:
        if role not in (UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD):
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only Admin, Manager, or Lead can manage project templates.",
            )


def _validate_priority_value(value: str) -> str:
    try:
        return ProjectPriority(value.lower()).value
    except ValueError:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority. Must be one of: {[p.value for p in ProjectPriority]}",
        )
