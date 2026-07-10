import logging
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status as http_status

from app.models.notification import Notification, NotificationType
from app.models.project import Project, ProjectStatus
from app.models.task import Task
from app.models.user import Employee, Lead, User, UserRole, UserStatus

logger = logging.getLogger(__name__)


class ProjectService:
    @staticmethod
    async def get_by_identifier(project_identifier: str, company_id: str | None = None) -> Project | None:
        if company_id:
            project = await Project.find_one(Project.project_id == project_identifier, Project.company_id == company_id)
        else:
            project = await Project.find_one(Project.project_id == project_identifier)

        if project:
            return project

        try:
            ObjectId(project_identifier)
            project = await Project.get(project_identifier)
            if company_id and project and project.company_id != company_id:
                return None
            return project
        except Exception:
            return None

    @staticmethod
    async def _get_lead_team(company_id: str, lead_id: str) -> list[Employee]:
        lead_id_str = str(lead_id)
        employees_by_lead_id = await Employee.find(
            {
                "company_id": company_id,
                "status": UserStatus.ACTIVE,
                "lead_id": lead_id_str,
            }
        ).to_list()

        employees_by_managed = []
        old_lead = await Lead.get(lead_id)
        managed_ids = getattr(old_lead, "managed_employee_ids", []) if old_lead else []
        if managed_ids:
            try:
                managed_object_ids = [
                    ObjectId(mid) if isinstance(mid, str) and ObjectId.is_valid(mid) else mid
                    for mid in managed_ids
                ]
                employees_by_managed = await Employee.find(
                    {
                        "company_id": company_id,
                        "status": UserStatus.ACTIVE,
                        "_id": {"$in": managed_object_ids},
                    }
                ).to_list()
            except Exception as exc:
                logger.error("Error fetching employees by managed_employee_ids: %s", exc)

        seen_ids: set[str] = set()
        team: list[Employee] = []
        for employee in employees_by_lead_id + employees_by_managed:
            employee_id = str(employee.id)
            if employee_id not in seen_ids:
                seen_ids.add(employee_id)
                team.append(employee)
        return team

    @staticmethod
    async def _filter_team_for_project(project: Project, company_id: str, employees: list[Employee]) -> list[Employee]:
        if not employees:
            return []

        employee_ids = [str(employee.id) for employee in employees]
        project_identifier = project.project_id if project.project_id else str(project.id)
        try:
            project_tasks = await Task.find(
                {
                    "company_id": company_id,
                    "$or": [
                        {"project_id": project_identifier},
                        {"project_id": str(project.id)},
                    ],
                    "assigned_to": {"$in": employee_ids},
                }
            ).to_list()
        except Exception as exc:
            logger.error("Error fetching project tasks for team transfer: %s", exc)
            return employees

        project_employee_ids = {str(task.assigned_to) for task in project_tasks if task.assigned_to}
        if not project_employee_ids:
            return employees
        return [employee for employee in employees if str(employee.id) in project_employee_ids]

    @staticmethod
    async def transfer_project_team_between_leads(
        *,
        project: Project,
        company_id: str,
        old_lead_id: str,
        new_lead_id: str,
        reason: str,
    ) -> int:
        if not old_lead_id or not new_lead_id or str(old_lead_id) == str(new_lead_id):
            return 0

        old_lead = await Lead.get(old_lead_id)
        new_lead = await Lead.get(new_lead_id)
        if not old_lead or not new_lead:
            logger.warning("Cannot transfer project team; old or new lead missing")
            return 0

        team = await ProjectService._get_lead_team(company_id, old_lead_id)
        project_team = await ProjectService._filter_team_for_project(project, company_id, team)
        if not project_team:
            return 0

        new_managed_ids = getattr(new_lead, "managed_employee_ids", []) or []
        if not isinstance(new_managed_ids, list):
            new_managed_ids = []

        transferred_ids: set[str] = set()
        for employee in project_team:
            employee.lead_id = str(new_lead_id)
            await employee.save()

            employee_id = str(employee.id)
            transferred_ids.add(employee_id)
            if employee_id not in new_managed_ids:
                new_managed_ids.append(employee_id)

        new_lead.managed_employee_ids = new_managed_ids
        await new_lead.save()

        old_managed_ids = getattr(old_lead, "managed_employee_ids", []) or []
        if isinstance(old_managed_ids, list):
            old_lead.managed_employee_ids = [
                employee_id for employee_id in old_managed_ids if str(employee_id) not in transferred_ids
            ]
            await old_lead.save()

        logger.info(
            "Transferred %s employees from lead %s to %s for project %s (%s)",
            len(transferred_ids),
            old_lead_id,
            new_lead_id,
            project.project_id or project.id,
            reason,
        )
        return len(transferred_ids)

    @staticmethod
    async def _parse_date(value: Optional[str], field_name: str) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid {field_name} format",
            )

    @staticmethod
    async def _validate_project_lead(lead_id: str, company_id: str) -> User:
        lead = await User.get(lead_id)
        if not lead or lead.company_id != company_id:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid lead")
        if lead.role != UserRole.LEAD:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Lead must be a Lead role")
        return lead

    @staticmethod
    async def _validate_assignee(user_id: str, company_id: str) -> User:
        user = await User.get(user_id)
        if not user or user.company_id != company_id:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid assigned user")
        if user.role not in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE]:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Can only assign projects to Managers, Leads, or Employees",
            )
        return user

    @staticmethod
    async def _notify_project_assignment(project: Project, assigned_to: str, company_id: str) -> None:
        notification = Notification(
            company_id=company_id,
            user_id=assigned_to,
            type=NotificationType.PROJECT_ASSIGNED,
            title="Project Assigned",
            message=f"You have been assigned to project: {project.name}",
            related_id=str(project.id),
            related_type="project",
        )
        await notification.insert()

    @staticmethod
    async def update_project(
        *,
        project: Project,
        current_user: User,
        name: Optional[str] = None,
        description: Optional[str] = None,
        status_filter: Optional[str] = None,
        lead_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        start_date: Optional[str] = None,
        delivery_date: Optional[str] = None,
    ) -> Project:
        if name:
            project.name = name
        if description is not None:
            project.description = description
        if status_filter:
            from app.services.project_workflow import advance_project
            await advance_project(
                project=project,
                current_user=current_user,
                target_status=status_filter,
            )

        if lead_id is not None:
            old_lead_id = project.lead_id
            if lead_id:
                await ProjectService._validate_project_lead(lead_id, current_user.company_id)
                await ProjectService.transfer_project_team_between_leads(
                    project=project,
                    company_id=current_user.company_id,
                    old_lead_id=old_lead_id,
                    new_lead_id=lead_id,
                    reason="lead_id change",
                )
            project.lead_id = lead_id

        if assigned_to is not None:
            old_assigned_to = project.assigned_to
            if assigned_to:
                assigned_user = await ProjectService._validate_assignee(assigned_to, current_user.company_id)
                if assigned_user.role == UserRole.LEAD and old_assigned_to and old_assigned_to != assigned_to:
                    old_assigned_user = await User.get(old_assigned_to)
                    if old_assigned_user and old_assigned_user.role == UserRole.LEAD:
                        await ProjectService.transfer_project_team_between_leads(
                            project=project,
                            company_id=current_user.company_id,
                            old_lead_id=old_assigned_to,
                            new_lead_id=assigned_to,
                            reason="assigned_to change",
                        )

                project.assigned_to = assigned_to
                project.assigned_by = str(current_user.id)
                project.assigned_at = datetime.utcnow()
                if assigned_user.role == UserRole.LEAD:
                    project.lead_id = assigned_to
                if old_assigned_to != assigned_to:
                    await ProjectService._notify_project_assignment(project, assigned_to, current_user.company_id)
            else:
                project.assigned_to = None
                project.assigned_by = None
                project.assigned_at = None

        parsed_start_date = await ProjectService._parse_date(start_date, "start date")
        parsed_delivery_date = await ProjectService._parse_date(delivery_date, "delivery date")
        if parsed_start_date:
            project.start_date = parsed_start_date
        if parsed_delivery_date:
            project.delivery_date = parsed_delivery_date

        if project.start_date and project.delivery_date and project.start_date > project.delivery_date:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Start date cannot be after delivery date",
            )

        project.updated_at = datetime.utcnow()
        await project.save()
        return project
