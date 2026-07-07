from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from typing import Any, Optional

from beanie.odm.operators.find.comparison import In
from beanie.odm.operators.find.logical import Or

from app.ai.memory import AIMemoryService
from app.models.company import Company
from app.models.department import Department
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.ticket import Ticket, TicketPriority, TicketStatus
from app.models.user import User, UserRole, UserStatus
from app.api.dependencies import get_project_by_id


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
            "completed_at": task.completed_at,
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
    def _serialize_task_for_daily_report(
        task: Task,
        department_lookup: dict[str, str],
        project_name: str | None,
        report_date: date,
    ) -> dict[str, Any]:
        serialized = ContextBuilder._serialize_task_for_breakdown(task, department_lookup, project_name)
        due_date = task.due_date.date() if task.due_date else None
        completed_date = task.completed_at.date() if task.completed_at else None
        priority_weight = {
            TaskPriority.CRITICAL.value: 3,
            TaskPriority.HIGH.value: 2,
            TaskPriority.MEDIUM.value: 1,
            TaskPriority.LOW.value: 0,
        }.get(task.priority.value, 1)
        serialized.update(
            {
                "item_type": "task",
                "item_id": str(task.id),
                "due_in_days": (due_date - report_date).days if due_date else None,
                "is_overdue": bool(due_date and due_date < report_date and task.status != TaskStatus.COMPLETED),
                "completed_today": bool(completed_date == report_date),
                "owner": task.assigned_to,
                "priority_weight": priority_weight,
            }
        )
        return serialized

    @staticmethod
    def _serialize_ticket_for_daily_report(ticket: Ticket, report_date: date) -> dict[str, Any]:
        due_date = ticket.due_date.date() if ticket.due_date else None
        priority_weight = {
            TicketPriority.URGENT.value: 3,
            TicketPriority.HIGH.value: 2,
            TicketPriority.MEDIUM.value: 1,
            TicketPriority.LOW.value: 0,
        }.get(ticket.priority.value, 1)
        return {
            "item_type": "ticket",
            "item_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "title": ticket.title,
            "description": ticket.description,
            "status": ticket.status.value,
            "priority": ticket.priority.value,
            "type": ticket.type.value,
            "due_date": ticket.due_date,
            "due_in_days": (due_date - report_date).days if due_date else None,
            "is_overdue": bool(due_date and due_date < report_date and ticket.status not in {TicketStatus.RESOLVED, TicketStatus.CLOSED}),
            "created_by": ticket.created_by,
            "assigned_to": ticket.assigned_to,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
            "priority_weight": priority_weight,
        }

    @staticmethod
    def _serialize_task_for_breakdown(task: Task, department_lookup: dict[str, str], project_name: str | None) -> dict[str, Any]:
        department_name = None
        if getattr(task, "department_id", None):
            department_name = department_lookup.get(task.department_id)
        elif getattr(task, "department", None):
            department_name = task.department

        return {
            "task_id": str(task.id),
            "title": task.title,
            "description": task.description,
            "status": task.status.value,
            "priority": task.priority.value,
            "due_date": task.due_date,
            "estimated_hours": task.estimated_hours,
            "story_points": task.story_points,
            "project_id": task.project_id,
            "project_name": project_name,
            "department": department_name,
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "parent_task_id": task.parent_task_id,
            "tags": list(getattr(task, "tags", []) or []),
        }

    @staticmethod
    async def build_task_breakdown_context(
        current_user: User,
        task_id: str,
        max_subtasks: int = 5,
    ) -> dict[str, Any]:
        task = await Task.get(task_id)
        if not task:
            raise ValueError("Task not found")

        if current_user.role != UserRole.SUPER_ADMIN and task.company_id != current_user.company_id:
            raise ValueError("Task must belong to the same company")

        team_member_ids = await ContextBuilder._get_team_member_ids(current_user)
        is_admin = current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}
        is_team_visible = False

        if is_admin:
            is_team_visible = True
        elif current_user.role == UserRole.MANAGER:
            is_team_visible = (
                task.assigned_to in team_member_ids
                or task.created_by == str(current_user.id)
                or (
                    getattr(current_user, "department_id", None)
                    and task.department_id == getattr(current_user, "department_id", None)
                )
            )
        elif current_user.role == UserRole.LEAD:
            is_team_visible = task.assigned_to in team_member_ids or task.created_by == str(current_user.id)
        else:
            is_team_visible = task.assigned_to == str(current_user.id) or task.created_by == str(current_user.id)

        if not is_team_visible:
            raise ValueError("Not allowed to generate breakdown for this task")

        company = await Company.get(task.company_id) if task.company_id else None
        department_lookup: dict[str, str] = {}
        if task.company_id:
            department_docs = await Department.find(
                Department.company_id == task.company_id,
                Department.deleted_at == None,  # noqa: E711
            ).to_list()
            department_lookup = {str(item.id): item.name for item in department_docs}

        project = None
        project_name = None
        project_identifier = task.project_id or task.project_object_id
        if project_identifier:
            project, _ = await get_project_by_id(project_identifier, task.company_id)
            if project:
                project_name = project.name

        assignee = await User.get(task.assigned_to) if task.assigned_to else None
        creator = await User.get(task.created_by) if task.created_by else None

        child_tasks = await Task.find(
            Task.company_id == task.company_id,
            Task.parent_task_id == str(task.id),
        ).sort("created_at").limit(max_subtasks).to_list()

        serialized_child_tasks = [
            ContextBuilder._serialize_task_for_breakdown(child_task, department_lookup, project_name)
            for child_task in child_tasks
        ]

        existing_dependencies: list[str] = []
        if task.parent_task_id:
            existing_dependencies.append(task.parent_task_id)
        if task.project_id:
            existing_dependencies.append(task.project_id)
        if task.project_object_id and task.project_object_id not in existing_dependencies:
            existing_dependencies.append(task.project_object_id)

        return {
            "company": {
                "id": task.company_id,
                "name": company.name if company else None,
            },
            "task": ContextBuilder._serialize_task_for_breakdown(task, department_lookup, project_name),
            "assignee": {
                "id": str(assignee.id) if assignee else None,
                "name": assignee.full_name() if assignee else None,
                "role": assignee.role.value if assignee else None,
            },
            "creator": {
                "id": str(creator.id) if creator else None,
                "name": creator.full_name() if creator else None,
                "role": creator.role.value if creator else None,
            },
            "project": {
                "id": str(project.id) if project else task.project_object_id,
                "project_id": project.project_id if project and project.project_id else task.project_id,
                "name": project_name,
                "status": project.status.value if project else None,
                "lead_id": getattr(project, "lead_id", None) if project else None,
            },
            "team": {
                "current_user_id": str(current_user.id),
                "current_user_role": current_user.role.value,
                "team_member_ids": team_member_ids,
            },
            "existing_subtasks": serialized_child_tasks,
            "existing_dependencies": existing_dependencies,
            "subtask_limit": max_subtasks,
            "access_scope": (
                "platform"
                if current_user.role == UserRole.SUPER_ADMIN
                else "company"
                if current_user.role == UserRole.ADMIN
                else "department"
                if current_user.role == UserRole.MANAGER and getattr(current_user, "department_id", None)
                else "team"
                if current_user.role in {UserRole.MANAGER, UserRole.LEAD}
                else "self"
            ),
        }

    @staticmethod
    async def build_task_breakdown_agent_context(
        current_user: User,
        task_title: str,
        task_description: str | None = None,
        max_steps: int = 5,
    ) -> dict[str, Any]:
        company = await Company.get(current_user.company_id) if current_user.company_id else None
        recent_tasks: list[dict[str, Any]] = []
        if current_user.company_id:
            tasks = await Task.find(
                Task.company_id == current_user.company_id,
                Task.assigned_to == str(current_user.id),
            ).sort("-updated_at").limit(max_steps * 2).to_list()
            recent_tasks = [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status.value,
                    "priority": task.priority.value,
                    "due_date": task.due_date,
                    "estimated_hours": task.estimated_hours,
                    "department": getattr(task, "department", None),
                }
                for task in tasks
            ]

        return {
            "company": {
                "id": current_user.company_id,
                "name": company.name if company else None,
            },
            "generated_for": {
                "user_id": str(current_user.id),
                "full_name": current_user.full_name(),
                "first_name": current_user.first_name,
                "role": current_user.role.value,
                "department": getattr(current_user, "department", None),
                "team_name": getattr(current_user, "team_name", None),
            },
            "task": {
                "task_id": None,
                "title": task_title,
                "description": task_description,
            },
            "recent_tasks": recent_tasks,
            "max_steps": max_steps,
            "access_scope": (
                "company"
                if current_user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}
                else "team"
                if current_user.role in {UserRole.MANAGER, UserRole.LEAD}
                else "self"
            ),
        }

    @staticmethod
    async def build_semantic_knowledge_context(
        current_user: User,
        *,
        query: str,
        project_id: str | None = None,
        campaign_id: str | None = None,
        knowledge_type: str | None = None,
        limit: int = 8,
    ) -> dict[str, Any]:
        from app.semantic.context_builder import KnowledgeContextBuilder
        from app.semantic.runtime import knowledge_retriever

        if not current_user.company_id:
            return {}
        context = await knowledge_retriever.retrieve(
            company_id=str(current_user.company_id),
            query=query,
            project_id=project_id,
            campaign_id=campaign_id,
            knowledge_type=knowledge_type,
            limit=limit,
        )
        return KnowledgeContextBuilder.build_payload(context)

    @staticmethod
    async def build_daily_report_context(
        current_user: User,
        report_date: date,
        limit: int = 10,
    ) -> dict[str, Any]:
        company_id = current_user.company_id
        if not company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise ValueError("User must belong to a company")

        company = await Company.get(company_id) if company_id else None
        department = await Department.get(current_user.department_id) if getattr(current_user, "department_id", None) else None

        department_lookup: dict[str, str] = {}
        if company_id:
            department_docs = await Department.find(
                Department.company_id == company_id,
                Department.deleted_at == None,  # noqa: E711
            ).to_list()
            department_lookup = {str(item.id): item.name for item in department_docs}

        scope_user_ids = [str(current_user.id)]
        report_type = "employee"
        access_scope = "self"

        if current_user.role == UserRole.SUPER_ADMIN:
            report_type = "admin"
            access_scope = "platform"
            scope_user_ids = []
        elif current_user.role == UserRole.ADMIN:
            report_type = "admin"
            access_scope = "company"
            if company_id:
                company_users = await User.find(
                    User.company_id == company_id,
                    User.status == UserStatus.ACTIVE,
                ).to_list()
                scope_user_ids = [str(user.id) for user in company_users]
        elif current_user.role == UserRole.MANAGER and getattr(current_user, "department_id", None):
            report_type = "department"
            access_scope = "department"
            department_users = await User.find(
                User.company_id == company_id,
                User.department_id == current_user.department_id,
                User.status == UserStatus.ACTIVE,
            ).to_list()
            scope_user_ids = [str(user.id) for user in department_users]
        elif current_user.role == UserRole.MANAGER:
            report_type = "lead"
            access_scope = "team"
            subordinates = await current_user.get_all_subordinates()
            scope_user_ids = [str(subordinate.id) for subordinate in subordinates]
        elif current_user.role == UserRole.LEAD:
            report_type = "lead"
            access_scope = "team"
            direct_reports = await User.find(
                User.company_id == company_id,
                User.reports_to == str(current_user.id),
                User.status == UserStatus.ACTIVE,
            ).to_list()
            scope_user_ids = [str(user.id) for user in direct_reports]

        if str(current_user.id) not in scope_user_ids:
            scope_user_ids.append(str(current_user.id))
        scope_user_ids = list(dict.fromkeys(scope_user_ids))

        task_filters: list[Any] = []
        ticket_filters: list[Any] = []
        if company_id:
            task_filters.append(Task.company_id == company_id)
            ticket_filters.append(Ticket.company_id == company_id)

        if current_user.role == UserRole.EMPLOYEE:
            task_filters.append(Task.assigned_to == str(current_user.id))
            ticket_filters.append(
                Or(
                    Ticket.created_by == str(current_user.id),
                    Ticket.assigned_to == str(current_user.id),
                )
            )
        elif report_type == "lead":
            task_filters.append(In(Task.assigned_to, scope_user_ids))
            ticket_filters.append(
                Or(
                    In(Ticket.created_by, scope_user_ids),
                    In(Ticket.assigned_to, scope_user_ids),
                )
            )
        elif report_type == "department":
            department_id = getattr(current_user, "department_id", None)
            if department_id:
                task_filters.append(
                    Or(
                        Task.department_id == department_id,
                        In(Task.assigned_to, scope_user_ids),
                    )
                )
            else:
                task_filters.append(In(Task.assigned_to, scope_user_ids))
            ticket_filters.append(
                Or(
                    In(Ticket.created_by, scope_user_ids),
                    In(Ticket.assigned_to, scope_user_ids),
                )
            )

        tasks = await Task.find(*task_filters).sort("-created_at").limit(limit * 4).to_list()
        tickets = await Ticket.find(*ticket_filters).sort("-created_at").limit(limit * 4).to_list()

        task_project_names: dict[str, str] = {}
        project_identifiers: list[str] = []
        for task in tasks:
            identifier = task.project_id or task.project_object_id
            if identifier and identifier not in project_identifiers:
                project_identifiers.append(identifier)
        for identifier in project_identifiers[:limit]:
            project, project_name = await get_project_by_id(identifier, company_id)
            if project_name:
                task_project_names[identifier] = project_name
            elif project and getattr(project, "name", None):
                task_project_names[identifier] = project.name

        serialized_tasks = [
            ContextBuilder._serialize_task_for_daily_report(
                task,
                department_lookup,
                task_project_names.get(task.project_id or task.project_object_id),
                report_date,
            )
            for task in tasks
        ]
        serialized_tickets = [
            ContextBuilder._serialize_ticket_for_daily_report(ticket, report_date)
            for ticket in tickets
        ]

        completed_tasks = [
            item for item in serialized_tasks
            if item["completed_today"] or item["status"] == TaskStatus.COMPLETED.value
        ]
        pending_tasks = [
            item for item in serialized_tasks
            if item["status"] != TaskStatus.COMPLETED.value
        ]
        blockers = [
            item for item in serialized_tasks
            if item["is_overdue"] or item["status"] == TaskStatus.IN_REVIEW.value
        ]
        tomorrow = report_date + timedelta(days=1)
        tomorrow_priorities = [
            item for item in serialized_tasks
            if item["due_date"] and item["due_date"].date() == tomorrow and item["status"] != TaskStatus.COMPLETED.value
        ]
        open_tickets = [
            item for item in serialized_tickets
            if item["status"] in {
                TicketStatus.OPEN.value,
                TicketStatus.IN_PROGRESS.value,
                TicketStatus.WAITING_FOR_CUSTOMER.value,
                TicketStatus.REOPENED.value,
            }
        ]
        overdue_tickets = [item for item in serialized_tickets if item["is_overdue"]]

        task_count_by_owner: dict[str, int] = {}
        for item in serialized_tasks:
            owner = item.get("owner") or "unassigned"
            task_count_by_owner[owner] = task_count_by_owner.get(owner, 0) + 1

        project_counts: dict[str, dict[str, int]] = {}
        for item in serialized_tasks:
            project_name = item.get("project_name") or item.get("project_id") or "No project"
            bucket = project_counts.setdefault(project_name, {"total": 0, "completed": 0, "pending": 0})
            bucket["total"] += 1
            if item["status"] == TaskStatus.COMPLETED.value:
                bucket["completed"] += 1
            else:
                bucket["pending"] += 1

        return {
            "company": {
                "id": company_id,
                "name": company.name if company else None,
            },
            "department": {
                "id": getattr(department, "id", None) if department else None,
                "name": department.name if department else getattr(current_user, "department", None),
            },
            "report_type": report_type,
            "report_scope": access_scope,
            "report_date": report_date.isoformat(),
            "generated_for": {
                "user_id": str(current_user.id),
                "full_name": current_user.full_name(),
                "first_name": current_user.first_name,
                "role": current_user.role.value,
                "department": getattr(current_user, "department", None),
                "department_id": getattr(current_user, "department_id", None),
                "team_name": getattr(current_user, "team_name", None),
            },
            "scope_user_ids": scope_user_ids,
            "scope_summary": {
                "task_count": len(serialized_tasks),
                "ticket_count": len(serialized_tickets),
                "completed_tasks": len(completed_tasks),
                "pending_tasks": len(pending_tasks),
                "blockers": len(blockers) + len(overdue_tickets),
                "tomorrow_priorities": len(tomorrow_priorities),
            },
            "task_count_by_owner": task_count_by_owner,
            "project_summary": [
                {
                    "project_name": project_name,
                    "total_tasks": counts["total"],
                    "completed_tasks": counts["completed"],
                    "pending_tasks": counts["pending"],
                }
                for project_name, counts in sorted(project_counts.items(), key=lambda item: (-item[1]["total"], item[0]))[:limit]
            ],
            "tasks": serialized_tasks,
            "tickets": serialized_tickets,
            "completed_tasks": completed_tasks[:limit],
            "pending_tasks": pending_tasks[:limit],
            "blockers": [
                *blockers,
                *overdue_tickets,
            ][:limit],
            "tomorrow_priorities": sorted(
                tomorrow_priorities,
                key=lambda item: (
                    -item.get("priority_weight", 0),
                    item.get("due_date") or datetime.max,
                    item.get("title") or "",
                ),
            )[:limit],
            "open_tickets": open_tickets[:limit],
            "overdue_tickets": overdue_tickets[:limit],
            "summary_metrics": {
                "tasks_completed_today": len(completed_tasks),
                "tasks_pending": len(pending_tasks),
                "ticket_blockers": len(overdue_tickets),
                "project_count": len(project_counts),
            },
        }

    @staticmethod
    async def build_marketing_context(
        current_user: User,
        message: str,
        limit: int = 10,
    ) -> dict[str, Any]:
        """
        Build marketing-specific context for digital marketing support agent.
        Includes campaigns, invoices, subscriptions, clients, and content calendar.
        """
        company_id = current_user.company_id
        if not company_id:
            return {}
        
        # Fetch campaigns
        from app.models.project import Project, ProjectType
        from app.models.content_calendar import ContentCalendarItem
        from app.models.client import Client
        from app.models.invoice import Invoice
        from app.models.subscription_plan import SubscriptionPlan
        from app.models.company_subscription import CompanySubscription
        from app.models.task import Task
        from app.models.ticket import Ticket
        
        # Get marketing projects
        marketing_projects = await Project.find(
            Project.company_id == company_id,
            Project.type == ProjectType.MARKETING,
            Project.status != ProjectStatus.ARCHIVED,
        ).limit(limit).to_list()
        
        # Get content calendar items
        content_items = await ContentCalendarItem.find(
            ContentCalendarItem.company_id == company_id,
        ).sort("-publish_date").limit(limit).to_list()
        
        # Get clients
        clients = await Client.find(
            Client.company_id == company_id,
            Client.status != "archived",
        ).limit(limit).to_list()
        
        # Get recent invoices
        invoices = await Invoice.find(
            Invoice.company_id == company_id,
        ).sort("-invoice_date").limit(limit).to_list()
        
        # Get subscription
        subscription = await CompanySubscription.find_one(
            CompanySubscription.company_id == company_id
        )
        plan = None
        if subscription and subscription.plan_id:
            plan = await SubscriptionPlan.get(subscription.plan_id)
        
        # Get recent tasks
        tasks = await Task.find(
            Task.company_id == company_id,
            Task.assigned_to == str(current_user.id),
        ).sort("-created_at").limit(limit).to_list()
        
        # Get open tickets
        from beanie.odm.operators.find.comparison import In
        tickets = await Ticket.find(
            Ticket.company_id == company_id,
            In(Ticket.status, [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_FOR_CUSTOMER]),
        ).limit(limit).to_list()
        
        # Serialize data
        campaigns = []
        for project in marketing_projects:
            campaigns.append({
                "project_id": project.project_id,
                "name": project.name,
                "status": project.status.value,
                "type": project.type.value,
                "lead_id": project.lead_id,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "delivery_date": project.delivery_date.isoformat() if project.delivery_date else None,
                "team_members": project.team_member_ids,
                "description": project.description,
            })
        
        content_calendar = []
        for item in content_items:
            content_calendar.append({
                "content_id": str(item.id),
                "project_id": item.project_id,
                "campaign": item.campaign,
                "platform": item.platform,
                "title": item.title,
                "content_type": item.content_type.value,
                "status": item.status.value,
                "priority": item.priority.value,
                "publish_date": item.publish_date.isoformat() if item.publish_date else None,
                "due_date": item.due_date.isoformat() if item.due_date else None,
                "assignee": item.assignee_name,
                "completed": item.completed,
            })
        
        client_list = []
        for client in clients:
            client_list.append({
                "client_id": str(client.id),
                "name": client.name,
                "company_name": client.company_name,
                "email": client.email,
                "status": client.status.value,
                "industry": client.industry,
                "assigned_to": client.assigned_to,
            })
        
        invoice_list = []
        for invoice in invoices:
            invoice_list.append({
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "client_name": invoice.client_name,
                "invoice_date": invoice.invoice_date.isoformat(),
                "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
                "total_amount": invoice.total_amount,
                "outstanding_amount": invoice.outstanding_amount,
                "status": invoice.status.value,
                "currency": invoice.currency,
            })
        
        subscription_data = None
        if subscription:
            subscription_data = {
                "plan_id": subscription.plan_id,
                "plan_name": plan.name if plan else "Unknown",
                "status": subscription.status.value if hasattr(subscription, 'status') else "active",
                "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
                "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
                "current_users": subscription.current_users if hasattr(subscription, 'current_users') else 0,
                "max_users": plan.max_users if plan else None,
                "price_monthly": plan.price_monthly if plan else 0,
                "price_yearly": plan.price_yearly if plan else 0,
                "currency": plan.currency if plan else "INR",
                "enabled_modules": plan.enabled_modules if plan else [],
                "features": plan.features if plan else [],
            }
        
        task_list = []
        for task in tasks:
            task_list.append({
                "task_id": str(task.id),
                "title": task.title,
                "status": task.status.value,
                "priority": task.priority.value,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "estimated_hours": task.estimated_hours,
            })
        
        ticket_list = []
        for ticket in tickets:
            ticket_list.append({
                "ticket_id": str(ticket.id),
                "ticket_number": ticket.ticket_number,
                "title": ticket.title,
                "status": ticket.status.value,
                "priority": ticket.priority.value,
                "type": ticket.type.value,
                "created_at": ticket.created_at.isoformat(),
            })
        
        return {
            "company": {
                "id": company_id,
                "name": (await Company.get(company_id)).name if company_id else None,
            },
            "generated_for": {
                "user_id": str(current_user.id),
                "full_name": current_user.full_name(),
                "first_name": current_user.first_name,
                "role": current_user.role.value,
                "email": current_user.email,
            },
            "campaigns": campaigns,
            "campaign_count": len(campaigns),
            "content_calendar": content_calendar,
            "content_calendar_count": len(content_calendar),
            "clients": client_list,
            "client_count": len(client_list),
            "invoices": invoice_list,
            "invoice_count": len(invoice_list),
            "subscription": subscription_data,
            "recent_tasks": task_list,
            "task_count": len(task_list),
            "open_tickets": ticket_list,
            "ticket_count": len(ticket_list),
        }

    @staticmethod
    async def build_chat_context(
        current_user: User,
        message: str,
        history: list[dict[str, Any]] | None = None,
        conversation_id: str | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        conversation_state: dict[str, Any] | None = None,
        emotional_state: dict[str, Any] | None = None,
        workload_metrics: dict[str, Any] | None = None,
        tone_guidance: dict[str, Any] | None = None,
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

        project_ids = [
            item["project_id"]
            for item in serialized_tasks
            if item.get("project_id")
        ]
        memory_context = await AIMemoryService().retrieve_for_context(
            current_user,
            query=message,
            access_scope=role_scope,
            project_ids=project_ids,
            limit=limit,
        )
        semantic_context = await ContextBuilder.build_semantic_knowledge_context(
            current_user,
            query=message,
            project_id=project_ids[0] if project_ids else None,
            limit=limit,
        )

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
            "conversation": {
                "conversation_id": conversation_id,
                "history": conversation_history or [],
                "state": conversation_state or {},
            },
            "emotion": {
                "emotional_state": emotional_state or {},
                "workload_metrics": workload_metrics or {},
                "tone_guidance": tone_guidance or {},
            },
            "permissions": list(getattr(current_user, "permissions", []) or []),
            "recent_tasks": serialized_tasks,
            "recent_tickets": serialized_tickets,
            "task_count": len(serialized_tasks),
            "ticket_count": len(serialized_tickets),
            "memory": memory_context,
            "semantic_knowledge": semantic_context,
            "team_member_ids": team_member_ids,
            "company_summary": {
                "name": company.name if company else None,
                "status": getattr(company, "status", None),
                "industry": getattr(company, "industry", None),
            },
        }
