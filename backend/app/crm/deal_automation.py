from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.timeline.publisher import publish_crm_timeline_event
from app.models.capability import get_capabilities_for_role
from app.models.department import Department
from app.crm.client_identity import ensure_crm_company_for_won_lead
from app.crm.client_services import ensure_sales_handoff_service
from app.crm.models import Client, ClientStatus, ClientType
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.crm_deal import CRMDeal
from app.models.meeting import Meeting, MeetingStatus
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.ownership_transfer import OwnershipTransfer
from app.crm.models import SalesProspect
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole, UserStatus
from app.core.clock import utc_now


_PROJECT_TEMPLATE_DEFS: Dict[str, Dict[str, Any]] = {
    "seo": {
        "name": "SEO",
        "phases": ["Discovery", "Audit", "Implementation", "Reporting"],
        "tasks": [
            "Kickoff audit",
            "Review keyword opportunities",
            "Resolve technical blockers",
            "Launch optimization sprint",
        ],
        "milestones": ["Audit complete", "Optimization live", "First report delivered"],
    },
    "social media": {
        "name": "Social Media",
        "phases": ["Strategy", "Content", "Publishing", "Review"],
        "tasks": [
            "Define campaign themes",
            "Create content calendar",
            "Prepare first week assets",
            "Review engagement targets",
        ],
        "milestones": ["Strategy approved", "Content calendar ready", "First campaign live"],
    },
    "performance marketing": {
        "name": "Performance Marketing",
        "phases": ["Discovery", "Setup", "Launch", "Optimization"],
        "tasks": [
            "Confirm tracking setup",
            "Build campaign structure",
            "Launch ads",
            "Optimize based on early results",
        ],
        "milestones": ["Tracking confirmed", "Campaigns launched", "Optimization cycle started"],
    },
    "branding": {
        "name": "Branding",
        "phases": ["Discovery", "Concept", "Design", "Delivery"],
        "tasks": [
            "Capture brand inputs",
            "Create concept routes",
            "Refine identity system",
            "Deliver brand assets",
        ],
        "milestones": ["Discovery complete", "Concept approved", "Brand kit delivered"],
    },
    "web development": {
        "name": "Web Development",
        "phases": ["Discovery", "Build", "Review", "Launch"],
        "tasks": [
            "Review scope and sitemap",
            "Prepare build backlog",
            "Complete staging review",
            "Plan launch checklist",
        ],
        "milestones": ["Scope confirmed", "Staging approved", "Launch ready"],
    },
    "custom": {
        "name": "Custom",
        "phases": ["Planning", "Execution", "Delivery"],
        "tasks": [
            "Confirm kickoff scope",
            "Define delivery backlog",
            "Review handoff checklist",
        ],
        "milestones": ["Plan approved", "Execution started", "Delivery completed"],
    },
}

_AUTOMATION_WORKFLOW = "deal_closure"


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _safe_text(value: Optional[str], fallback: str) -> str:
    text = (value or "").strip()
    return text or fallback


def _lead_client_budget(lead: SalesProspect, deal: Optional[CRMDeal] = None) -> Optional[float]:
    for value in (
        getattr(lead, "won_amount", None),
        getattr(lead, "budget", None),
        getattr(deal, "value", None) if deal else None,
    ):
        if value in (None, ""):
            continue
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount > 0:
            return amount
    return None


def _project_folders(template: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        {"name": f"{template['name']} {phase}", "order": index}
        for index, phase in enumerate(template["phases"])
    ]


def _project_milestones(template: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        {"name": milestone, "order": index}
        for index, milestone in enumerate(template["milestones"])
    ]


def _project_template_signature(template: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": template["name"],
        "phases": template["phases"],
        "tasks": template["tasks"],
        "milestones": template["milestones"],
    }


async def _publish_step_event(
    *,
    event_name: str,
    lead: SalesProspect,
    current_user: User,
    payload: Dict[str, Any],
    project: Optional[Project] = None,
) -> None:
    await publish_crm_timeline_event(
        event_name=event_name,
        aggregate_type="sales_prospect",
        aggregate_id=str(lead.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload=payload,
        project_id=project.project_id if project else None,
        metadata={"surface": "crm", "workflow": _AUTOMATION_WORKFLOW},
    )


def _template_for_lead(lead: SalesProspect) -> Dict[str, Any]:
    candidate_values: List[str] = []
    for raw_value in [getattr(lead, "category_id", None), getattr(lead, "source", None), getattr(lead, "relationship_type", None)]:
        normalized = str(raw_value or "").strip().lower()
        if normalized:
            candidate_values.append(normalized)
    for candidate in candidate_values:
        for key, template in _PROJECT_TEMPLATE_DEFS.items():
            if key in candidate:
                return template
    return _PROJECT_TEMPLATE_DEFS["custom"]


async def _eligible_account_manager_ids(company_id: str) -> list[str]:
    users = await User.find(
        {
            "company_id": company_id,
            "status": UserStatus.ACTIVE,
            "role": {"$in": [UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.EMPLOYEE.value]},
        }
    ).sort("-updated_at").to_list()
    eligible: list[str] = []
    for user in users:
        department_id = getattr(user, "department_id", None)
        if not department_id:
            continue
        department = await Department.get(department_id)
        if not department or department.company_id != company_id or department.deleted_at is not None:
            continue
        capabilities = await get_capabilities_for_role(department.department_type, user.role, company_id)
        if "own_client_account" in capabilities:
            eligible.append(str(user.id))
    return eligible


async def _resolve_account_manager(current_user: User, lead: SalesProspect, client: Client) -> Optional[User]:
    company_id = str(lead.company_id)
    eligible_ids = await _eligible_account_manager_ids(company_id)
    if not eligible_ids:
        return None

    current_assignee = getattr(client, "assigned_to", None) or getattr(lead, "assigned_to", None)
    if current_assignee and str(current_assignee) in eligible_ids:
        return await User.get(str(current_assignee))

    for candidate_id in eligible_ids:
        if candidate_id != str(getattr(current_user, "id", "")):
            return await User.get(candidate_id)
    return await User.get(eligible_ids[0])


async def _record_ownership_transfer(
    *,
    company_id: str,
    entity_type: str,
    entity_id: str,
    from_user_id: Optional[str],
    to_user_id: str,
    reason: str,
    transferred_by: str,
    notes: Optional[str] = None,
) -> OwnershipTransfer:
    existing = await OwnershipTransfer.find_one(
        {
            "company_id": company_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "to_user_id": to_user_id,
            "reason": reason,
        }
    )
    if existing:
        return existing
    transfer = OwnershipTransfer(
        company_id=company_id,
        entity_type=entity_type,
        entity_id=entity_id,
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        reason=reason,
        transferred_by=transferred_by,
        notes=notes,
    )
    await transfer.insert()
    return transfer


async def _resolve_client(current_user: User, lead: SalesProspect, deal: Optional[CRMDeal]) -> Client:
    crm_resolution = await ensure_crm_company_for_won_lead(lead, str(getattr(current_user, "id", "") or "") or None)
    crm_company = crm_resolution.crm_company
    crm_company_id = str(crm_company.id) if crm_company else None
    company_name = _safe_text(getattr(lead, "company_name", None), "Client")
    company_id = str(getattr(lead, "company_id", "") or "")
    matchers: list[dict[str, Any]] = []
    if crm_company_id:
        matchers.append({"crm_company_id": crm_company_id})
    if getattr(lead, "client_id", None):
        matchers.append({"_id": str(getattr(lead, "client_id"))})
    matchers.extend(
        [
            {"source_lead_id": str(lead.id)},
            {"company_name": company_name},
            {"name": company_name},
            {"name": getattr(lead, "prospect_name", None)},
        ]
    )
    matchers = [matcher for matcher in matchers if all(value not in (None, "") for value in matcher.values())]
    existing_client = await Client.find_one(
        {
            "company_id": company_id,
            "deleted": {"$ne": True},
            "$or": matchers,
        }
    )
    lead_budget = _lead_client_budget(lead, deal)
    if existing_client:
        if crm_company_id and getattr(existing_client, "crm_company_id", None) != crm_company_id:
            existing_client.crm_company_id = crm_company_id
        if crm_company_id and getattr(lead, "crm_company_id", None) != crm_company_id:
            lead.crm_company_id = crm_company_id
            lead.updated_at = utc_now()
            await lead.save()
        if not getattr(existing_client, "source_lead_id", None):
            existing_client.source_lead_id = str(lead.id)
        if getattr(lead, "assigned_to", None) and not getattr(existing_client, "sales_owner_id", None):
            existing_client.sales_owner_id = str(getattr(lead, "assigned_to", ""))
        if getattr(lead, "contact_id", None) and not getattr(existing_client, "contact", None):
            existing_client.contact = getattr(lead, "phone", None) or existing_client.contact
        if getattr(existing_client, "company_name", None) != company_name:
            existing_client.company_name = company_name
        if getattr(lead, "assigned_to", None) and not existing_client.assigned_to:
            existing_client.assigned_to = str(getattr(lead, "assigned_to", ""))
        if getattr(existing_client, "assigned_to", None) and not getattr(existing_client, "account_owner_id", None):
            existing_client.account_owner_id = existing_client.assigned_to
        if lead_budget is not None and not getattr(existing_client, "budget", None):
            existing_client.budget = lead_budget
        if not getattr(existing_client, "client_type", None):
            existing_client.client_type = ClientType.ONE_TIME
        existing_client.updated_at = utc_now()
        await existing_client.save()
        return existing_client

    now = utc_now()
    client = Client(
        name=company_name,
        company_id=company_id,
        company_name=company_name,
        email=getattr(lead, "email", None),
        contact=getattr(lead, "phone", None),
        status=ClientStatus.NEW,
        crm_company_id=crm_company_id,
        source_lead_id=str(lead.id),
        account_owner_id=str(getattr(lead, "assigned_to", "") or getattr(current_user, "id", "")) or None,
        sales_owner_id=str(getattr(lead, "assigned_to", "") or getattr(current_user, "id", "")) or None,
        assigned_to=str(getattr(lead, "assigned_to", "") or getattr(current_user, "id", "")) or None,
        client_type=ClientType.ONE_TIME,
        budget=lead_budget,
        start_date=now,
        notes=getattr(lead, "remark", None),
        tags=list(getattr(lead, "tag", []) or []),
        created_by=str(getattr(current_user, "id", "")),
        created_at=now,
        updated_at=now,
    )
    await client.insert()
    if crm_company_id and getattr(lead, "crm_company_id", None) != crm_company_id:
        lead.crm_company_id = crm_company_id
        lead.updated_at = utc_now()
        await lead.save()
    return client


async def _resolve_owner(current_user: User, lead: SalesProspect) -> Optional[str]:
    if lead.assigned_to:
        try:
            assignee = await User.get(lead.assigned_to)
        except Exception:
            assignee = None
        if assignee and assignee.company_id == lead.company_id and assignee.role in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE, UserRole.ADMIN]:
            return str(assignee.id)
    return str(getattr(current_user, "id", "")) or None


async def _resolve_project(current_user: User, lead: SalesProspect, client: Client, deal: Optional[CRMDeal]) -> Project:
    template = _template_for_lead(lead)
    owner_id = await _resolve_owner(current_user, lead)
    existing = await Project.find_one(
        {
            "company_id": str(lead.company_id),
            "deleted": {"$ne": True},
            "lead_id": str(lead.id),
        }
    )
    if existing:
        if not getattr(existing, "folders", None):
            existing.folders = _project_folders(template)
        if not getattr(existing, "milestones", None):
            existing.milestones = _project_milestones(template)
        if not getattr(existing, "board_columns", None):
            existing.board_columns = [
                {"id": f"phase-{index + 1}", "label": phase.upper(), "color": "bg-slate-100", "order": index}
                for index, phase in enumerate(template["phases"])
            ]
        if owner_id and owner_id not in [str(item) for item in (existing.team_member_ids or [])]:
            existing.team_member_ids = list(existing.team_member_ids or []) + [owner_id]
        if owner_id and not existing.assigned_to:
            existing.assigned_to = owner_id
        if not existing.lead_id:
            existing.lead_id = str(lead.id)
        existing.updated_at = utc_now()
        await existing.save()
        return existing

    now = utc_now()
    base_name = template["name"]
    project_name = f"{client.name} - {base_name}"
    project_key = f"{base_name[:3].upper()}-{str(lead.id)[-4:].upper()}"

    project = Project(
        name=project_name,
        key=project_key,
        project_id=f"ONB-{str(lead.id)[:8].upper()}",
        description=f"Onboarding project generated from won deal for {client.name}.",
        company_id=str(lead.company_id),
        type=ProjectType.OPERATIONS,
        status=ProjectStatus.ACTIVE,
        lead_id=str(lead.id),
        assigned_to=owner_id,
        assigned_by=str(getattr(current_user, "id", "")),
        assigned_at=now,
        start_date=now,
        delivery_date=now + timedelta(days=30),
        category=template["name"],
        created_by=str(getattr(current_user, "id", "")),
        created_at=now,
        updated_at=now,
    )
    project.team_member_ids = [item for item in [owner_id] if item]
    project.board_columns = [
        {"id": f"phase-{index + 1}", "label": phase.upper(), "color": "bg-slate-100", "order": index}
        for index, phase in enumerate(template["phases"])
    ]
    project.folders = _project_folders(template)
    project.milestones = _project_milestones(template)
    await project.insert()
    return project


async def _generate_project_structure(current_user: User, project: Project, client: Client, lead: SalesProspect, deal: Optional[CRMDeal]) -> Dict[str, Any]:
    template = _template_for_lead(lead)
    now = utc_now()

    created_tasks: List[str] = []
    for index, task_title in enumerate(template["tasks"]):
        existing_task = await Task.find_one(
            {
                "company_id": str(project.company_id),
                "project_object_id": str(project.id),
                "title": task_title,
                "created_by": str(getattr(current_user, "id", "")),
            }
        )
        if existing_task:
            created_tasks.append(str(existing_task.id))
            continue

        task = Task(
            title=task_title,
            description=f"{template['name']} onboarding task for {client.name}.",
            company_id=str(project.company_id),
            project_id=project.project_id or str(project.id),
            project_object_id=str(project.id),
            created_by=str(getattr(current_user, "id", "")),
            assigned_to=project.assigned_to,
            assigned_by=str(getattr(current_user, "id", "")),
            status=TaskStatus.TODO,
            priority=TaskPriority.HIGH if index == 0 else TaskPriority.MEDIUM,
            due_date=now + timedelta(days=7 + index * 3),
            start_date=now,
            created_at=now,
            updated_at=now,
        )
        await task.insert()
        created_tasks.append(str(task.id))

    milestone_names = template["milestones"]
    project.updated_at = now
    await project.save()

    return {
        "template_name": template["name"],
        "task_ids": created_tasks,
        "milestones": milestone_names,
        "phases": template["phases"],
    }


async def _create_kickoff_meeting(current_user: User, lead: SalesProspect, client: Client, project: Project) -> Meeting:
    now = utc_now()
    existing_meeting = await Meeting.find_one(
        {
            "company_id": str(lead.company_id),
            "title": f"Kickoff - {client.name}",
        }
    )
    if existing_meeting:
        return existing_meeting

    meeting = Meeting(
        title=f"Kickoff - {client.name}",
        description=f"Kickoff meeting for {project.name}",
        company_id=str(lead.company_id),
        created_by=str(getattr(current_user, "id", "")),
        host_id=str(getattr(project, "assigned_to", None) or getattr(current_user, "id", "")),
        participant_ids=[pid for pid in [project.assigned_to, lead.assigned_to, lead.closed_by] if pid],
        meeting_date=now + timedelta(days=2),
        meeting_time="10:00",
        duration=60,
        status=MeetingStatus.SCHEDULED,
        created_at=now,
        updated_at=now,
    )
    await meeting.insert()
    return meeting


async def handle_won_deal_automation(current_user: User, lead: SalesProspect, deal: Optional[CRMDeal]) -> Dict[str, Any]:
    now = utc_now()
    client = await _resolve_client(current_user, lead, deal)
    account_manager = await _resolve_account_manager(current_user, lead, client)
    if account_manager:
        previous_owner = getattr(client, "assigned_to", None) or getattr(lead, "assigned_to", None)
        client.assigned_to = str(account_manager.id)
        client.updated_at = now
        await client.save()
        await _record_ownership_transfer(
            company_id=str(lead.company_id),
            entity_type="client",
            entity_id=str(client.id),
            from_user_id=str(previous_owner) if previous_owner else None,
            to_user_id=str(account_manager.id),
            reason="won_automation",
            transferred_by=str(getattr(current_user, "id", "system")),
            notes=f"Auto-assigned from won lead {lead.prospect_name}",
        )
        if getattr(lead, "assigned_to", None) != str(account_manager.id):
            lead.assigned_to = str(account_manager.id)
            lead.updated_at = now
            await lead.save()
            await _record_ownership_transfer(
                company_id=str(lead.company_id),
                entity_type="lead",
                entity_id=str(lead.id),
                from_user_id=str(previous_owner) if previous_owner else None,
                to_user_id=str(account_manager.id),
                reason="won_automation",
                transferred_by=str(getattr(current_user, "id", "system")),
                notes=f"Transferred on win to {account_manager.full_name()}",
            )
        client.account_owner_id = str(account_manager.id)
        client.updated_at = now
        await client.save()
    project = await _resolve_project(current_user, lead, client, deal)
    service = await ensure_sales_handoff_service(client, current_user)
    if service and str(project.id) not in (service.linked_project_ids or []):
        service.linked_project_ids = list(service.linked_project_ids or []) + [str(project.id)]
        service.updated_at = utc_now()
        await service.save()

    existing_activity = await CRMActivity.find_one(
        {
            "company_id": str(lead.company_id),
            "entity_type": "lead",
            "entity_id": str(lead.id),
            "activity_type": CRMActivityType.PIPELINE_CHANGE.value,
            "deleted": False,
            "metadata.client_id": str(client.id),
            "metadata.project_id": str(project.id),
        }
    )
    if existing_activity:
        structure = _project_template_signature(_template_for_lead(lead))
        meeting = await _create_kickoff_meeting(current_user, lead, client, project)
        return {
            "client": client,
            "project": project,
            "meeting": meeting,
            "activity": existing_activity,
            "template": structure["name"],
            "status": "reused",
        }

    steps: List[Dict[str, Any]] = []

    def _step(name: str, status: str = "completed", **details: Any) -> None:
        steps.append({"step": name, "status": status, **details})

    _step("client_lookup", "completed", client_id=str(client.id))
    if account_manager:
        _step("account_manager_assignment", "completed", user_id=str(account_manager.id))
    if str(project.id) not in [str(item) for item in (client.project_ids or [])]:
        client.project_ids = list(client.project_ids or []) + [str(project.id)]
        client.updated_at = now
        await client.save()
    if project.client_id != str(client.id):
        project.client_id = str(client.id)
        project.updated_at = now
        await project.save()
    _step("client_link", "completed", project_id=str(project.id), client_id=str(client.id))
    structure = _template_for_lead(lead)
    project = await _resolve_project(current_user, lead, client, deal)
    _step("project_lookup", "completed", project_id=str(project.id))
    structure_result = await _generate_project_structure(current_user, project, client, lead, deal)
    _step("project_structure", "completed", **structure_result)
    meeting = await _create_kickoff_meeting(current_user, lead, client, project)
    _step("kickoff_meeting", "completed", meeting_id=str(meeting.id))

    activity = CRMActivity(
        company_id=str(lead.company_id),
        entity_type="lead",
        entity_id=str(lead.id),
        activity_type=CRMActivityType.PIPELINE_CHANGE.value,
        title="Deal won onboarding started",
        description=f"Converted {lead.prospect_name} into client {client.name} and project {project.name}.",
        status=CRMActivityStatus.COMPLETED,
        priority=CRMActivityPriority.HIGH,
        owner_id=str(getattr(project, "assigned_to", None) or getattr(current_user, "id", "")),
        owner_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
        completed_at=now,
        completed_by=str(getattr(current_user, "id", "")),
        completed_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
        metadata={
            "client_id": str(client.id),
            "project_id": str(project.id),
            "meeting_id": str(meeting.id),
            "template_name": structure_result["template_name"],
            "automation_status": "completed",
            "automation_steps": steps,
        },
        created_by=str(getattr(current_user, "id", "")),
        created_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
        updated_by=str(getattr(current_user, "id", "")),
        updated_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
        created_at=now,
        updated_at=now,
    )
    await activity.insert()

    await _publish_step_event(
        event_name="DealWon",
        lead=lead,
        current_user=current_user,
        payload={
            "lead_id": str(lead.id),
            "deal_id": str(deal.id) if deal else None,
            "client_id": str(client.id),
            "project_id": str(project.id),
            "meeting_id": str(meeting.id),
            "template_name": structure_result["template_name"],
            "status": "completed",
            "timestamp": now.isoformat(),
        },
        project=project,
    )
    await _publish_step_event(
        event_name="ClientCreated",
        lead=lead,
        current_user=current_user,
        payload={
            "client_id": str(client.id),
            "crm_company_id": getattr(client, "crm_company_id", None),
            "company_name": client.company_name,
            "lead_id": str(lead.id),
            "status": "completed",
            "timestamp": now.isoformat(),
        },
    )
    if account_manager:
        await _publish_step_event(
            event_name="AccountManagerAssigned",
            lead=lead,
            current_user=current_user,
            payload={
                "client_id": str(client.id),
                "lead_id": str(lead.id),
                "account_manager_id": str(account_manager.id),
                "account_manager_name": _display_name(account_manager),
                "reason": "won_automation",
                "status": "completed",
                "timestamp": now.isoformat(),
            },
        )
    await _publish_step_event(
        event_name="ProjectCreated",
        lead=lead,
        current_user=current_user,
        payload={
            "project_id": project.project_id or str(project.id),
            "project_name": project.name,
            "client_id": str(client.id),
            "lead_id": str(lead.id),
            "status": "completed",
            "timestamp": now.isoformat(),
        },
        project=project,
    )
    await _publish_step_event(
        event_name="TemplateApplied",
        lead=lead,
        current_user=current_user,
        payload={
            "project_id": project.project_id or str(project.id),
            "template_name": structure_result["template_name"],
            "phases": structure_result["phases"],
            "status": "completed",
            "timestamp": now.isoformat(),
        },
        project=project,
    )
    await _publish_step_event(
        event_name="TasksGenerated",
        lead=lead,
        current_user=current_user,
        payload={
            "project_id": project.project_id or str(project.id),
            "task_ids": structure_result["task_ids"],
            "status": "completed",
            "timestamp": now.isoformat(),
        },
        project=project,
    )
    await _publish_step_event(
        event_name="TeamAssigned",
        lead=lead,
        current_user=current_user,
        payload={
            "project_id": project.project_id or str(project.id),
            "assigned_to": project.assigned_to,
            "status": "completed",
            "timestamp": now.isoformat(),
        },
        project=project,
    )
    await _publish_step_event(
        event_name="KickoffScheduled",
        lead=lead,
        current_user=current_user,
        payload={
            "meeting_id": str(meeting.id),
            "project_id": project.project_id or str(project.id),
            "client_id": str(client.id),
            "status": "completed",
            "timestamp": now.isoformat(),
        },
    )

    return {
        "client": client,
        "project": project,
        "meeting": meeting,
        "activity": activity,
        "template": structure_result["template_name"],
        "status": "completed",
        "steps": steps,
    }

