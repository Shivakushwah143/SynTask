from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import Any, Optional

from beanie.odm.operators.find.comparison import In
from beanie.odm.operators.find.logical import Or

from app.models.company import Company
from app.models.department import Department
from app.models.task import Task, TaskStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole


class ContextBuilder:
    @staticmethod
    async def _get_team_member_ids(current_user: User) -> list[str]:
        if not current_user.company_id:
            return []

        direct_reports = await User.find(
            User.company_id == current_user.company_id,
            User.reports_to == str(current_user.id),
        ).to_list()
        ids = [str(user.id) for user in direct_reports]
        if current_user.role in {UserRole.MANAGER, UserRole.ADMIN}:
            ids.append(str(current_user.id))
        return list(dict.fromkeys(ids))

    @staticmethod
    async def build_task_prioritization_context(
        current_user: User,
        target_user: Optional[User],
        for_date: date,
        limit: int,
        include_completed: bool = False,
    ) -> dict[str, Any]:

        subject_user = target_user or current_user
        company_id = subject_user.company_id or current_user.company_id

        company = None
        if company_id:
            company = await Company.get(company_id)

        if subject_user.company_id != current_user.company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise ValueError("Target user must belong to the same company")

        departments: dict[str, str] = {}
        if company_id:
            department_docs = await Department.find(
                Department.company_id == company_id,
                Department.deleted_at == None,  # noqa: E711
            ).to_list()
            departments = {str(item.id): item.name for item in department_docs}

        permissions = list(getattr(current_user, "permissions", []) or [])

        query = [
            Task.company_id == company_id,
            Task.assigned_to == str(subject_user.id),
        ]
        if not include_completed:
            query.append(
                In(
                    Task.status,
                    [
                        TaskStatus.TODO.value,
                        TaskStatus.IN_PROGRESS.value,
                        TaskStatus.IN_REVIEW.value,
                    ],
                )
            )

        tasks = await Task.find(*query).sort("due_date").limit(limit * 2).to_list()

        serialized_tasks: list[dict[str, Any]] = []
        today = for_date
        now = datetime.utcnow()
        for task in tasks:
            due_date = task.due_date.date() if task.due_date else None
            days_until_due = (due_date - today).days if due_date else None
            department_name = None
            if getattr(task, "department_id", None):
                department_name = departments.get(task.department_id)
            elif getattr(task, "department", None):
                department_name = task.department

            serialized_tasks.append(
                {
                    "id": str(task.id),
                    "title": task.title,
                    "description": task.description,
                    "status": task.status.value,
                    "priority": task.priority.value,
                    "due_date": task.due_date,
                    "days_until_due": days_until_due,
                    "estimated_hours": task.estimated_hours,
                    "story_points": task.story_points,
                    "department": department_name,
                    "project_id": task.project_id,
                    "created_at": task.created_at,
                    "overdue": bool(due_date and due_date < today),
                    "age_days": (today - task.created_at.date()).days if task.created_at else None,
                }
            )

        return {
            "company": {
                "id": company_id,
                "name": company.name if company else None,
            },
            "permissions": permissions,
            "access_scope": "super_admin" if current_user.role == UserRole.SUPER_ADMIN else (
                "department" if getattr(current_user, "department_id", None) or getattr(current_user, "department", None) else "team" if current_user.role == UserRole.LEAD else "self" if current_user.role == UserRole.EMPLOYEE else "company"
            ),
            "generated_for": {
                "user_id": str(subject_user.id),
                "full_name": subject_user.full_name(),
                "role": subject_user.role.value,
                "department": getattr(subject_user, "department", None),
                "department_id": getattr(subject_user, "department_id", None),
                "team_name": getattr(subject_user, "team_name", None),
            },
            "window": {
                "for_date": for_date.isoformat(),
                "generated_at": now.isoformat(),
                "include_completed": include_completed,
            },
            "team": {
                "reports_to": getattr(subject_user, "reports_to", None),
                "ancestors": list(getattr(subject_user, "ancestors", []) or []),
            },
            "tasks": serialized_tasks,
            "task_count": len(serialized_tasks),
        }

    @staticmethod
    def _infer_chat_intent(message: str) -> str:
        text = message.lower()
        if any(keyword in text for keyword in ["ticket", "support", "issue", "bug", "request"]):
            return "tickets"
        if any(keyword in text for keyword in ["team", "people", "staff", "manager", "lead"]):
            return "team"
        if any(keyword in text for keyword in ["report", "summary", "status", "analytics", "health"]):
            return "reporting"
        if any(keyword in text for keyword in ["task", "todo", "today", "priority", "deadline", "due"]):
            return "tasks"
        if any(keyword in text for keyword in ["revenue", "invoice", "billing", "finance", "cash"]):
            return "finance"
        return "general"

    @staticmethod
    def _serialize_task_for_chat(task: Task, department_lookup: dict[str, str]) -> dict[str, Any]:
        department_name = None
        if getattr(task, "department_id", None):
            department_name = department_lookup.get(task.department_id)
        elif getattr(task, "department", None):
            department_name = task.department

        return {
            "id": str(task.id),
            "title": task.title,
            "status": task.status.value,
            "priority": task.priority.value,
            "due_date": task.due_date,
            "estimated_hours": task.estimated_hours,
            "department": department_name,
            "assigned_to": task.assigned_to,
            "created_at": task.created_at,
        }

    @staticmethod
    def _serialize_ticket_for_chat(ticket: Ticket) -> dict[str, Any]:
        return {
            "id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "title": ticket.title,
            "status": ticket.status.value,
            "priority": ticket.priority.value,
            "type": ticket.type.value,
            "assigned_to": ticket.assigned_to,
            "due_date": ticket.due_date,
            "created_at": ticket.created_at,
        }

    @staticmethod
    async def build_chat_context(
        current_user: User,
        message: str,
        history: list[dict[str, Any]] | None = None,
        limit: int = 5,
    ) -> dict[str, Any]:
        company_id = current_user.company_id
        intent = ContextBuilder._infer_chat_intent(message)
        history = list(history or [])[-10:]
        active_ticket_statuses = [
            TicketStatus.OPEN.value,
            TicketStatus.IN_PROGRESS.value,
            TicketStatus.WAITING_FOR_CUSTOMER.value,
            TicketStatus.REOPENED.value,
        ]

        company_task_query = None
        company_ticket_query = None
        team_member_ids: list[str] = []

        if company_id:
            team_member_ids = await ContextBuilder._get_team_member_ids(current_user)
            if current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
                company_task_query = [Task.company_id == company_id]
                company_ticket_query = [Ticket.company_id == company_id, In(Ticket.status, active_ticket_statuses)]
            elif current_user.role == UserRole.LEAD:
                owner_ids = list(dict.fromkeys([str(current_user.id), *team_member_ids]))
                company_task_query = [Task.company_id == company_id, In(Task.assigned_to, owner_ids)]
                company_ticket_query = [
                    Ticket.company_id == company_id,
                    In(Ticket.status, active_ticket_statuses),
                    Or(
                        In(Ticket.assigned_to, owner_ids),
                        In(Ticket.created_by, owner_ids),
                    ),
                ]
            elif current_user.role == UserRole.MANAGER:
                department_id = getattr(current_user, "department_id", None)
                owner_ids = list(dict.fromkeys([str(current_user.id), *team_member_ids]))
                company_task_query = [Task.company_id == company_id]
                company_ticket_query = [Ticket.company_id == company_id, In(Ticket.status, active_ticket_statuses)]
                if department_id:
                    company_task_query.append(Task.department_id == department_id)
                    company_ticket_query.append(
                        Or(
                            In(Ticket.assigned_to, owner_ids),
                            In(Ticket.created_by, owner_ids),
                        )
                    )
            else:
                company_task_query = [Task.company_id == company_id, Task.assigned_to == str(current_user.id)]
                company_ticket_query = [
                    Ticket.company_id == company_id,
                    In(Ticket.status, active_ticket_statuses),
                    Or(
                        Ticket.assigned_to == str(current_user.id),
                        Ticket.created_by == str(current_user.id),
                    ),
                ]

        company = await Company.get(company_id) if company_id else None
        department = await Department.get(current_user.department_id) if getattr(current_user, "department_id", None) else None
        department_lookup = {}
        if company_id:
            department_docs = await Department.find(
                Department.company_id == company_id,
                Department.deleted_at == None,  # noqa: E711
            ).to_list()
            department_lookup = {str(item.id): item.name for item in department_docs}

        task_query = company_task_query or ([Task.company_id == company_id, Task.assigned_to == str(current_user.id)] if company_id else [])
        ticket_query = company_ticket_query or ([Ticket.company_id == company_id, Ticket.created_by == str(current_user.id)] if company_id else [])

        task_future = Task.find(*task_query).sort("-created_at").limit(limit * 2).to_list() if task_query else asyncio.sleep(0, result=[])
        ticket_future = Ticket.find(*ticket_query).sort("-created_at").limit(limit * 2).to_list() if ticket_query else asyncio.sleep(0, result=[])
        tasks, tickets = await asyncio.gather(task_future, ticket_future)

        serialized_tasks = [ContextBuilder._serialize_task_for_chat(task, department_lookup) for task in tasks]
        serialized_tickets = [ContextBuilder._serialize_ticket_for_chat(ticket) for ticket in tickets]

        role_scope = "self"
        if current_user.role in {UserRole.LEAD, UserRole.MANAGER}:
            role_scope = "team"
        elif current_user.role == UserRole.ADMIN:
            role_scope = "company"
        elif current_user.role == UserRole.SUPER_ADMIN:
            role_scope = "platform"

        return {
            "company": {
                "id": company_id,
                "name": company.name if company else None,
            },
            "department": {
                "id": getattr(department, "id", None),
                "name": department.name if department else getattr(current_user, "department", None),
            },
            "generated_for": {
                "user_id": str(current_user.id),
                "full_name": current_user.full_name(),
                "first_name": current_user.first_name,
                "role": current_user.role.value,
                "department": getattr(current_user, "department", None),
                "department_id": getattr(current_user, "department_id", None),
                "team_name": getattr(current_user, "team_name", None),
            },
            "access_scope": role_scope,
            "intent": intent,
            "query": message,
            "history": history,
            "permissions": list(getattr(current_user, "permissions", []) or []),
            "recent_tasks": serialized_tasks,
            "recent_tickets": serialized_tickets,
            "task_count": len(serialized_tasks),
            "ticket_count": len(serialized_tickets),
            "team_member_ids": team_member_ids,
            "company_summary": {
                "name": company.name if company else None,
                "status": getattr(company, "status", None),
                "industry": getattr(company, "industry", None),
            },
        }
