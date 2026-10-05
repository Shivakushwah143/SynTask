"""
Manager dashboard aggregation for the operational dashboard.

This keeps the HTTP layer thin while centralizing the business logic used by
the manager-facing dashboard metrics payload.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List

from app.crm.models import SalesProspect, ProspectStatus
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.services.task_service import TaskService
from app.core.clock import utc_now
from app.services.work_overview_service import shared_work_metrics


def _user_label(user: User) -> str:
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.email or str(user.id)


async def build_manager_dashboard_metrics(current_user: User) -> Dict[str, Any]:
    subordinates = await current_user.get_all_subordinates()
    visible_users: List[User] = subordinates + [current_user]
    visible_user_ids = [str(user.id) for user in visible_users]

    tasks = await Task.find({"company_id": current_user.company_id, "assigned_to": {"$in": visible_user_ids}}).to_list()
    prospects = await SalesProspect.find({"company_id": current_user.company_id, "deleted": False}).to_list()

    workload = TaskService.workload_snapshot(tasks)
    shared_metrics = await shared_work_metrics(tasks, timezone_name=getattr(current_user, "timezone", None))
    overdue_tasks = [
        task
        for task in tasks
        if task.due_date and task.status not in {TaskStatus.COMPLETED, TaskStatus.CANCELLED} and task.due_date < utc_now()
    ]

    team_workload = []
    assigned_counts = defaultdict(list)
    for task in tasks:
        if task.assigned_to:
            assigned_counts[str(task.assigned_to)].append(task)

    user_map = {str(user.id): user for user in visible_users}
    for user_id, user_tasks in assigned_counts.items():
        user = user_map.get(user_id)
        if not user:
            continue
        task_snapshot = TaskService.workload_snapshot(user_tasks)
        team_workload.append(
            {
                "user_id": user_id,
                "user_name": _user_label(user),
                "user_email": user.email,
                "task_count": task_snapshot["total"],
                "in_progress": task_snapshot["by_status"].get(TaskStatus.IN_PROGRESS.value, 0),
                "completed": task_snapshot["by_status"].get(TaskStatus.COMPLETED.value, 0),
                "overdue": task_snapshot["overdue"],
                "workload_percentage": int(round((task_snapshot["total"] / len(tasks) * 100) if tasks else 0, 0)),
            }
        )

    team_workload.sort(key=lambda item: (-item["task_count"], item["user_name"].lower()))

    lead_assignment = {
        "total_leads": len(prospects),
        "unassigned_leads": len([lead for lead in prospects if not lead.assigned_to]),
        "assigned_leads": len([lead for lead in prospects if lead.assigned_to]),
        "assigned_to_team": len([lead for lead in prospects if lead.assigned_to in visible_user_ids]),
    }

    pipeline_counts: Dict[str, int] = defaultdict(int)
    for lead in prospects:
        pipeline_counts[str(lead.current_stage or "new")] += 1

    pipeline_health = {
        "active_leads": len([lead for lead in prospects if lead.status == ProspectStatus.ACTIVE]),
        "won_leads": len([lead for lead in prospects if lead.status == ProspectStatus.WON]),
        "lost_leads": len([lead for lead in prospects if lead.status == ProspectStatus.LOST]),
        "by_stage": [
            {"stage": stage, "count": count}
            for stage, count in sorted(pipeline_counts.items(), key=lambda item: (-item[1], item[0].lower()))
        ],
    }

    capacity = {
        "team_size": len(visible_users),
        "active_assignees": len(assigned_counts),
        "unassigned_capacity": max(0, len(visible_users) - len(assigned_counts)),
        "overdue_tasks": workload["overdue"],
    }

    performance = {
        "total_tasks": workload["total"],
        "completed_tasks": workload["by_status"].get(TaskStatus.COMPLETED.value, 0),
        "in_progress_tasks": workload["by_status"].get(TaskStatus.IN_PROGRESS.value, 0),
        "overdue_tasks": workload["overdue"],
        "completion_rate": round(
            (workload["by_status"].get(TaskStatus.COMPLETED.value, 0) / workload["total"] * 100)
            if workload["total"]
            else 0.0,
            2,
        ),
    }

    source_counts: Dict[str, int] = defaultdict(int)
    for lead in prospects:
        source_counts[str(lead.source or "unknown")] += 1

    analytics = {
        "task_breakdown": workload["by_status"],
        "priority_breakdown": workload["by_priority"],
        "lead_sources": [{"source": source, "count": count} for source, count in sorted(source_counts.items(), key=lambda item: (-item[1], item[0].lower()))],
    }

    return {
        "role": "manager",
        "team_workload": team_workload,
        "pipeline_health": pipeline_health,
        "lead_assignment": lead_assignment,
        "performance": performance,
        "capacity": capacity,
        "analytics": analytics,
        "overdue_tasks": [
            {
                "id": str(task.id),
                "title": task.title,
                "assigned_to": task.assigned_to,
                "due_date": task.due_date,
                "priority": task.priority.value if getattr(task.priority, "value", None) else str(task.priority),
                "status": task.status.value if getattr(task.status, "value", None) else str(task.status),
            }
            for task in overdue_tasks
        ],
        "total_tasks": workload["total"],
        "active_tasks": shared_metrics["active"],
        "overdue_count": shared_metrics["overdue"],
        "blocked_count": shared_metrics["blocked"],
        "awaiting_review_count": shared_metrics["awaiting_review"],
        "completed_tasks": workload["by_status"].get(TaskStatus.COMPLETED.value, 0),
        "total_subordinates": len(subordinates),
    }

