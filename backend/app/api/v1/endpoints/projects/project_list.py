import re
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status as http_status

from .shared import *
from app.models.scheduled_job import ScheduledJob, ScheduledJobActionType, ScheduledJobStatus
from app.api.deps import Pagination50, PaginationParams
from app.api.v1.endpoints.tasks import build_employee_project_visibility_query
from app.api.v1.endpoints.tasks import serialize_utc_datetime
from app.core.clock import utc_now
from app.models.client import Client
from app.services.project_health_service import (
    calculate_project_health,
    project_task_identity_filter,
    serialize_project_health,
)
from app.services.project_lifecycle import (
    is_valid_health_level,
    is_valid_lifecycle_tab,
    lifecycle_tab_for_status,
    project_needs_setup,
    stored_statuses_for_tab,
)

router = APIRouter()


def serialize_scheduled_project_placeholder(job: ScheduledJob) -> dict:
    payload = job.payload or {}
    return {
        "id": f"scheduled-{job.id}",
        "project_id": payload.get("project_id") or f"scheduled-{job.id}",
        "name": payload.get("name") or "Scheduled project",
        "key": payload.get("key") or payload.get("project_id") or "SCHEDULED",
        "description": payload.get("description"),
        "type": payload.get("type") or ProjectType.SOFTWARE.value,
        "status": "scheduled",
        "client_id": payload.get("client_id"),
        "lead_id": payload.get("lead_id"),
        "assigned_to": payload.get("assigned_to") or payload.get("lead_id"),
        "assigned_user_ids": [],
        "assigned_users": [],
        "assigned_to_name": None,
        "start_date": payload.get("start_date"),
        "delivery_date": payload.get("delivery_date"),
        "days_until_delivery": None,
        "priority": payload.get("priority") or "medium",
        "deadline_urgency": "scheduled",
        "project_health": {"level": "healthy", "reasons": [], "overdue_task_count": 0, "total_open_tasks": 0, "completion_percentage": 0, "days_until_deadline": None, "last_activity_at": None},
        "progress_percentage": 0,
        "task_count": 0,
        "completed_task_count": 0,
        "created_at": serialize_utc_datetime(job.created_at),
        "is_scheduled_placeholder": True,
        "scheduled_job_id": str(job.id),
        "scheduled_run_at": job.run_at,
        "scheduled_status": job.status.value if hasattr(job.status, "value") else job.status,
        "created_by": job.created_by,
    }


async def build_project_list_query(current_user: User) -> dict:
    """Build the project list query for the current user.

    Visibility matches ``shared.check_project_access``:
    - SUPER_ADMIN: all projects (no company scope)
    - ADMIN / SUB_ADMIN / MANAGER: all projects in their company
    - LEAD: projects they are assigned to / lead / team member of
    - EMPLOYEE: projects they are assigned to, team member of, or that
      contain a task assigned to them
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        return {}

    if not current_user.company_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )

    # Admins and managers see every project in the company.
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER}:
        return {"company_id": current_user.company_id}

    query = {"company_id": current_user.company_id}
    if current_user.role == UserRole.LEAD:
        query["$or"] = [
            {"lead_id": str(current_user.id)},
            {"assigned_to": str(current_user.id)},
            {"assigned_user_ids": str(current_user.id)},
            {"team_member_ids": str(current_user.id)},
        ]
    elif current_user.role == UserRole.EMPLOYEE:
        assigned_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id),
        }).to_list()
        query.update(build_employee_project_visibility_query(
            current_user,
            [task.project_id for task in assigned_tasks if getattr(task, "project_id", None)],
        ))
    return query


def _merge_query_parts(parts) -> dict:
    """AND-combine independent filter groups so lifecycle/advanced filter
    conditions never overwrite RBAC scope or one another."""
    clean = [part for part in parts if part]
    if not clean:
        return {}
    if len(clean) == 1:
        return clean[0]
    return {"$and": clean}


def _search_condition(search: str) -> dict:
    escaped = re.escape(search.strip())
    pattern = re.compile(escaped, re.IGNORECASE)
    return {
        "$or": [
            {"name": pattern},
            {"key": pattern},
            {"project_id": pattern},
            {"description": pattern},
        ]
    }


def _delivery_window_condition(delivery: str, now: datetime) -> dict:
    """Delivery date windows used by the Delivery Date quick filter."""
    key = delivery.lower().strip()
    if key == "overdue":
        return {"delivery_date": {"$lt": now}}
    if key == "next_7_days":
        return {"delivery_date": {"$gte": now, "$lte": now + timedelta(days=7)}}
    if key == "next_30_days":
        return {"delivery_date": {"$gte": now, "$lte": now + timedelta(days=30)}}
    raise HTTPException(
        status_code=http_status.HTTP_400_BAD_REQUEST,
        detail="Invalid delivery filter; use overdue, next_7_days, or next_30_days",
    )


def _normalize_owner_filter(owner_id: Optional[str]) -> Optional[dict]:
    if not owner_id:
        return None
    return {"$or": [{"lead_id": owner_id}, {"assigned_to": owner_id}]}


def _build_db_filters(
    query: dict,
    *,
    lifecycle_status: Optional[str],
    search: Optional[str],
    client_id: Optional[str],
    owner_id: Optional[str],
    priority: Optional[str],
    project_type: Optional[str],
    delivery: Optional[str],
) -> dict:
    parts = [query]
    if lifecycle_status:
        statuses = stored_statuses_for_tab(lifecycle_status)
        if statuses:
            parts.append({"status": {"$in": sorted(statuses)}})
    if client_id:
        parts.append({"client_id": client_id})
    if owner_id:
        parts.append(_normalize_owner_filter(owner_id))
    if priority:
        parts.append({"priority": priority.strip().lower()})
    if project_type:
        normalized_type = (project_type or "").strip().lower().replace(" ", "_")
        parts.append({"type": normalized_type})
    if search and search.strip():
        parts.append(_search_condition(search))
    if delivery:
        parts.append(_delivery_window_condition(delivery, utc_now()))
    return _merge_query_parts(parts)


def _resolve_lifecycle_status(status: Optional[str], status_filter: Optional[str]) -> Optional[str]:
    """Resolve the lifecycle filter from either the legacy ``status_filter``
    param or the new ``status`` param (tab values). Legacy stored status
    values (e.g. ``active``) resolve to their tab via the lifecycle mapping.
    """
    raw = (status if status is not None else status_filter) or ""
    value = raw.strip().lower() or None
    if value is None or value == "all":
        return None
    if value == "scheduled":
        return "scheduled"
    tab = lifecycle_tab_for_status(value)
    if tab is None or not is_valid_lifecycle_tab(tab):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid project lifecycle status '{raw}'",
        )
    return tab


def _deadline_urgency_rank_value(urgency: str) -> int:
    return {
        "overdue": 0,
        "urgent": 1,
        "soon": 2,
        "upcoming": 3,
        "scheduled": 4,
    }.get(urgency, 5)


async def load_project_tasks(project: Project) -> list:
    return await Task.find(project_task_identity_filter(project)).to_list()


async def _serialize_project_row(project: Project, project_tasks=None) -> dict:
    if project_tasks is None:
        project_tasks = await load_project_tasks(project)
    task_count = len(project_tasks)
    health = calculate_project_health(project, project_tasks)

    assigned_ids = project_assignee_ids(project)
    assigned_users = []
    for user_id in assigned_ids:
        assigned_user = await User.get(user_id)
        if assigned_user:
            assigned_users.append({"id": str(assigned_user.id), "name": assigned_user.full_name(), "role": assigned_user.role.value})
    owner = await User.get(project.lead_id) if getattr(project, "lead_id", None) and ObjectId.is_valid(str(project.lead_id)) else None
    client = await Client.get(project.client_id) if getattr(project, "client_id", None) and ObjectId.is_valid(str(project.client_id)) else None

    # Calculate days until delivery
    days_until_delivery = None
    deadline_urgency = "none"
    if project.delivery_date:
        delta = project.delivery_date - utc_now()
        days_until_delivery = delta.days
        if days_until_delivery < 0:
            deadline_urgency = "overdue"
        elif days_until_delivery <= 2:
            deadline_urgency = "urgent"
        elif days_until_delivery <= 7:
            deadline_urgency = "soon"
        elif days_until_delivery <= 14:
            deadline_urgency = "upcoming"
        else:
            deadline_urgency = "normal"

    return {
        "id": str(project.id),
        "project_id": project.project_id if project.project_id else str(project.id),
        "name": project.name,
        "key": project.key,
        "description": project.description,
        "type": enum_or_string_value(project.type, ProjectType.SOFTWARE.value),
        "status": enum_or_string_value(project.status),
        "client_id": project.client_id,
        "client": {"id": str(client.id), "name": client.name} if client and str(client.company_id) == str(project.company_id) else None,
        "lead_id": project.lead_id,
        "owner": {"id": str(owner.id), "name": owner.full_name(), "role": owner.role.value} if owner else None,
        "owner_name": owner.full_name() if owner else "Owner not assigned",
        "assigned_to": project.assigned_to,
        "assigned_user_ids": getattr(project, "assigned_user_ids", []) or ([project.assigned_to] if project.assigned_to else []),
        "assigned_users": assigned_users,
        "assigned_to_name": assigned_users[0]["name"] if assigned_users else None,
        "start_date": project.start_date,
        "delivery_date": project.delivery_date,
        "days_until_delivery": days_until_delivery,
        "priority": enum_or_string_value(getattr(project, "priority", None), "medium"),
        "deadline_urgency": deadline_urgency,
        "project_health": serialize_project_health(health),
        "health": health.level,
        "needs_setup": project_needs_setup(
            status_value=enum_or_string_value(getattr(project, "status", None)),
            task_count=task_count,
        ),
        "progress_percentage": health.completion_percentage,
        "completed_task_count": health.completed_task_count,
        "overdue_task_count": health.overdue_task_count,
        "task_count": task_count,
        "created_at": project.created_at,
    }


async def _group_project_tasks(projects) -> dict:
    """Load every Task belonging to the given Projects in one bulk query.

    Mirrors ``project_task_identity_filter`` semantics (logical
    ``project_id``, Mongo ``_id`` string, or ``project_object_id`` link)
    combined across the whole set.
    """
    if not projects:
        return {}
    mongo_ids = {str(project.id) for project in projects}
    key_to_project = {}
    for project in projects:
        key_to_project[str(project.id)] = project
        logical = getattr(project, "project_id", None)
        if logical and str(logical) not in key_to_project:
            key_to_project[str(logical)] = project
    company_ids = {str(project.company_id) for project in projects if getattr(project, "company_id", None)}
    task_query: dict = {
        "$or": [
            {"project_id": {"$in": sorted(key_to_project.keys())}},
            {"project_object_id": {"$in": sorted(mongo_ids)}},
        ]
    }
    if len(company_ids) == 1:
        task_query["company_id"] = company_ids.pop()
    elif company_ids:
        task_query["company_id"] = {"$in": sorted(company_ids)}
    tasks = await Task.find(task_query).to_list()
    grouped: dict = {}
    for task in tasks:
        owner = None
        project_object_id = getattr(task, "project_object_id", None)
        if project_object_id and str(project_object_id) in key_to_project:
            owner = key_to_project[str(project_object_id)]
        if owner is None and getattr(task, "project_id", None):
            owner = key_to_project.get(str(task.project_id))
        if owner is not None:
            grouped.setdefault(str(owner.id), []).append(task)
    return grouped


@router.get("/")
async def list_projects(
    status: Optional[str] = None,
    status_filter: Optional[str] = None,
    health: Optional[str] = None,
    attention: Optional[str] = None,
    search: Optional[str] = None,
    client_id: Optional[str] = None,
    owner_id: Optional[str] = None,
    priority: Optional[str] = None,
    type: Optional[str] = None,
    delivery: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """List projects with server-side filtering.

    Filter stack (all applied in the backend, never in React):
    RBAC/company scope -> lifecycle status (legacy ``active``/``kickoff`` fold
    into Execution) -> health level / ``needs_setup`` attention -> client,
    owner, priority, type, delivery window -> search -> sort -> pagination.

    ``health`` (healthy/needs_attention/at_risk) and ``attention``
    (needs_setup) are derived per Project from the same ProjectHealthService
    and Needs-Setup logic used by the summary endpoint, so list totals stay
    consistent with the lifecycle tab counts and never leak cross-company rows.
    """
    skip, limit = pagination.skip, pagination.limit
    lifecycle_status = _resolve_lifecycle_status(status, status_filter)

    if not is_valid_health_level(health):
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid health filter; use healthy, needs_attention, or at_risk")
    if attention and attention.strip().lower() != "needs_setup":
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid attention filter; use needs_setup")
    needs_setup_filter = bool(attention and attention.strip().lower() == "needs_setup")
    health_filter = (health or "").strip().lower() or None

    # Scheduled placeholders are only returned when explicitly requested by
    # legacy callers; Scheduled Work is not a lifecycle tab.
    if lifecycle_status == "scheduled":
        scheduled_query = {
            "action_type": ScheduledJobActionType.CREATE_PROJECT.value,
            "status": ScheduledJobStatus.PENDING.value,
            "created_by": str(current_user.id),
        }
        if current_user.company_id:
            scheduled_query["company_id"] = current_user.company_id
        scheduled_jobs = await ScheduledJob.find(scheduled_query).sort("run_at").to_list()
        placeholders = [serialize_scheduled_project_placeholder(job) for job in scheduled_jobs]
        return {"projects": placeholders, "total": len(placeholders), "skip": skip, "limit": limit}

    base_query = await build_project_list_query(current_user)
    query = _build_db_filters(
        base_query,
        lifecycle_status=lifecycle_status,
        search=search,
        client_id=client_id,
        owner_id=owner_id,
        priority=priority,
        project_type=type,
        delivery=delivery,
    )

    cache_key = None
    if current_user.company_id:
        filter_signature = "|".join([
            lifecycle_status or "all",
            health_filter or "",
            "needs_setup" if needs_setup_filter else "",
            (search or "").strip().lower(),
            client_id or "",
            owner_id or "",
            (priority or "").strip().lower(),
            (type or "").strip().lower().replace(" ", "_"),
            (delivery or "").strip().lower(),
            str(skip),
            str(limit),
        ])
        cache_key = f"{project_list_key(current_user.company_id)}:{current_user.role.value}:{current_user.id}:{filter_signature}"
        cached = await cache_get(cache_key)
        if cached:
            return cached

    # Health / Needs-Setup filtering is derived per Project, so it runs before
    # pagination to keep totals accurate.
    if health_filter or needs_setup_filter:
        all_projects = await Project.find(query).to_list()
        grouped = await _group_project_tasks(all_projects)
        enriched = []
        for project in all_projects:
            project_tasks = grouped.get(str(project.id), [])
            project_health = calculate_project_health(project, project_tasks)
            level = project_health.level
            needs_setup = project_needs_setup(
                status_value=enum_or_string_value(getattr(project, "status", None)),
                task_count=len(project_tasks),
            )
            if health_filter and level != health_filter:
                continue
            if needs_setup_filter and not needs_setup:
                continue
            enriched.append((project, project_health, project_tasks))
        total = len(enriched)
        enriched.sort(key=lambda item: (
            _deadline_urgency_rank_value(item[1].deadline_urgency),
            item[0].delivery_date if item[0].delivery_date else datetime.max,
        ))
        page_items = enriched[skip:skip + limit]
        projects_with_stats = [
            await _serialize_project_row(project, project_tasks=project_tasks)
            for project, _health, project_tasks in page_items
        ]
    else:
        projects = await Project.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
        projects_with_stats = [await _serialize_project_row(project) for project in projects]
        total = await Project.find(query).count()

    projects_with_stats.sort(key=lambda x: (
        x["deadline_urgency"] == "overdue" and 0 or
        x["deadline_urgency"] == "urgent" and 1 or
        x["deadline_urgency"] == "soon" and 2 or
        x["deadline_urgency"] == "upcoming" and 3 or 4,
        x["delivery_date"] if x["delivery_date"] else datetime.max,
    ))

    data = {
        "projects": projects_with_stats,
        "total": total,
        "skip": skip,
        "limit": limit,
        "health": health_filter,
        "attention": "needs_setup" if needs_setup_filter else None,
        "needs_setup": needs_setup_filter,
    }
    if cache_key:
        await cache_set(cache_key, data, ttl=180)
    return data
