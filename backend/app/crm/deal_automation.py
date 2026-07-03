from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.crm.timeline import publish_crm_timeline_event
from app.models.client import Client, ClientStatus
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.crm_deal import CRMDeal
from app.models.meeting import Meeting, MeetingStatus
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.sales_prospect import SalesProspect
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole


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


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _safe_text(value: Optional[str], fallback: str) -> str:
    text = (value or "").strip()
    return text or fallback


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


async def _resolve_client(current_user: User, lead: SalesProspect, deal: Optional[CRMDeal]) -> Client:
    company_name = _safe_text(getattr(lead, "company_name", None), "Client")
    company_id = str(getattr(lead, "company_id", "") or "")
    existing_client = await Client.find_one(
        {
            "company_id": company_id,
            "deleted": False,
            "$or": [
                {"company_name": company_name},
                {"name": company_name},
            ],
        }
    )
    if existing_client:
        return existing_client

    now = datetime.utcnow()
    client = Client(
        name=company_name,
        company_id=company_id,
        company_name=company_name,
        email=getattr(lead, "email", None),
        contact=getattr(lead, "phone", None),
        status=ClientStatus.ACTIVE,
        assigned_to=str(getattr(deal, "decision_maker", "") or getattr(lead, "assigned_to", "") or getattr(current_user, "id", "")) or None,
        notes=getattr(lead, "remark", None),
        tags=list(getattr(lead, "tag", []) or []),
        created_by=str(getattr(current_user, "id", "")),
        created_at=now,
        updated_at=now,
    )
    await client.insert()
    return client


async def _resolve_owner(current_user: User, lead: SalesProspect) -> Optional[str]:
    if lead.assigned_to:
        assignee = await User.get(lead.assigned_to)
        if assignee and assignee.company_id == lead.company_id and assignee.role in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE, UserRole.ADMIN]:
            return str(assignee.id)
    return str(getattr(current_user, "id", "")) or None


async def _resolve_project(current_user: User, lead: SalesProspect, client: Client, deal: Optional[CRMDeal]) -> Project:
    existing = await Project.find_one(
        {
            "company_id": str(lead.company_id),
            "deleted": {"$ne": True},
            "lead_id": str(lead.id),
        }
    )
    if existing:
        return existing

    template = _template_for_lead(lead)
    now = datetime.utcnow()
    owner_id = await _resolve_owner(current_user, lead)
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
        lead_id=owner_id,
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
    project.board_columns = [
        {"id": f"phase-{index + 1}", "label": phase.upper(), "color": "bg-slate-100", "order": index}
        for index, phase in enumerate(template["phases"])
    ]
    await project.insert()
    return project


async def _generate_project_structure(current_user: User, project: Project, client: Client, lead: SalesProspect, deal: Optional[CRMDeal]) -> Dict[str, Any]:
    template = _template_for_lead(lead)
    now = datetime.utcnow()

    created_tasks: List[str] = []
    for index, task_title in enumerate(template["tasks"]):
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
    project.board_columns = [
        {"id": f"phase-{index + 1}", "label": phase.upper(), "color": "bg-slate-100", "order": index}
        for index, phase in enumerate(template["phases"])
    ]
    project.files = list(project.files or [])
    project.updated_at = now
    await project.save()

    return {
        "template_name": template["name"],
        "task_ids": created_tasks,
        "milestones": milestone_names,
        "phases": template["phases"],
    }


async def _create_kickoff_meeting(current_user: User, lead: SalesProspect, client: Client, project: Project) -> Meeting:
    now = datetime.utcnow()
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
    client = await _resolve_client(current_user, lead, deal)
    project = await _resolve_project(current_user, lead, client, deal)
    structure = await _generate_project_structure(current_user, project, client, lead, deal)
    meeting = await _create_kickoff_meeting(current_user, lead, client, project)

    now = datetime.utcnow()
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
            "template_name": structure["template_name"],
        },
        created_by=str(getattr(current_user, "id", "")),
        created_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
        updated_by=str(getattr(current_user, "id", "")),
        updated_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
        created_at=now,
        updated_at=now,
    )
    await activity.insert()

    await publish_crm_timeline_event(
        event_name="DealWon",
        aggregate_type="sales_prospect",
        aggregate_id=str(lead.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "lead_id": str(lead.id),
            "deal_id": str(deal.id) if deal else None,
            "client_id": str(client.id),
            "project_id": str(project.id),
            "meeting_id": str(meeting.id),
            "template_name": structure["template_name"],
            "timestamp": now.isoformat(),
        },
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )
    await publish_crm_timeline_event(
        event_name="ClientCreated",
        aggregate_type="crm_company",
        aggregate_id=str(client.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "client_id": str(client.id),
            "company_name": client.company_name,
            "lead_id": str(lead.id),
            "timestamp": now.isoformat(),
        },
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )
    await publish_crm_timeline_event(
        event_name="ProjectCreated",
        aggregate_type="project",
        aggregate_id=str(project.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "project_id": project.project_id or str(project.id),
            "project_name": project.name,
            "client_id": str(client.id),
            "lead_id": str(lead.id),
            "timestamp": now.isoformat(),
        },
        project_id=project.project_id or str(project.id),
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )
    await publish_crm_timeline_event(
        event_name="TemplateApplied",
        aggregate_type="project",
        aggregate_id=str(project.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "project_id": project.project_id or str(project.id),
            "template_name": structure["template_name"],
            "phases": structure["phases"],
            "timestamp": now.isoformat(),
        },
        project_id=project.project_id or str(project.id),
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )
    await publish_crm_timeline_event(
        event_name="TasksGenerated",
        aggregate_type="project",
        aggregate_id=str(project.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "project_id": project.project_id or str(project.id),
            "task_ids": structure["task_ids"],
            "timestamp": now.isoformat(),
        },
        project_id=project.project_id or str(project.id),
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )
    await publish_crm_timeline_event(
        event_name="TeamAssigned",
        aggregate_type="project",
        aggregate_id=str(project.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "project_id": project.project_id or str(project.id),
            "assigned_to": project.assigned_to,
            "timestamp": now.isoformat(),
        },
        project_id=project.project_id or str(project.id),
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )
    await publish_crm_timeline_event(
        event_name="KickoffScheduled",
        aggregate_type="meeting",
        aggregate_id=str(meeting.id),
        company_id=str(lead.company_id),
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "meeting_id": str(meeting.id),
            "project_id": project.project_id or str(project.id),
            "client_id": str(client.id),
            "timestamp": now.isoformat(),
        },
        metadata={"surface": "crm", "workflow": "deal_closure"},
    )

    return {
        "client": client,
        "project": project,
        "meeting": meeting,
        "activity": activity,
        "template": structure["template_name"],
    }
