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
        assigned_user_ids: Optional[list[str]] = None,
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
                project.assigned_at = datetime.now()
                if assigned_user.role == UserRole.LEAD:
                    project.lead_id = assigned_to
                if old_assigned_to != assigned_to:
                    await ProjectService._notify_project_assignment(project, assigned_to, current_user.company_id)
            else:
                project.assigned_to = None
                project.assigned_by = None
                project.assigned_at = None

        if assigned_user_ids is not None:
            old_ids = [str(item) for item in (getattr(project, "assigned_user_ids", None) or []) if item]
            clean_ids = []
            for user_id in assigned_user_ids:
                user_id = str(user_id).strip()
                if user_id and user_id not in clean_ids:
                    await ProjectService._validate_assignee(user_id, current_user.company_id)
                    clean_ids.append(user_id)
            project.assigned_user_ids = clean_ids
            project.assigned_to = clean_ids[0] if clean_ids else None
            project.assigned_by = str(current_user.id) if clean_ids else None
            project.assigned_at = datetime.now() if clean_ids else None
            if old_ids != clean_ids:
                history = getattr(project, "assignment_history", None) or []
                history.append({
                    "assigned_by": str(current_user.id),
                    "assigned_user_ids": clean_ids,
                    "assigned_at": datetime.now().isoformat(),
                    "action": "updated",
                })
                project.assignment_history = history
                for user_id in clean_ids:
                    if user_id not in old_ids:
                        await ProjectService._notify_project_assignment(project, user_id, current_user.company_id)

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

        project.updated_at = datetime.now()
        await project.save()
        return project

    @staticmethod
    async def create_project_core(
        *,
        name: str,
        key: str,
        description: Optional[str] = None,
        type: str = "software",
        client_id: Optional[str] = None,
        lead_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_user_ids: Optional[str] = None,
        start_date: Optional[str] = None,
        delivery_date: Optional[str] = None,
        project_id: str,
        current_user: User
    ) -> dict:
        from app.models.client import Client
        from app.events import publish_event
        from app.events.factories import build_domain_event
        from app.api.v1.endpoints.projects.shared import (
            can_create_project,
            normalize_project_type,
            validate_project_assignees,
            project_list_key,
        )
        from app.core.cache import cache_delete, cache_delete_pattern
        from datetime import datetime

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
        project_id = project_id.strip() if project_id else ""
        if not project_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Project ID is required. Please enter a unique Project ID."
            )
        
        existing_by_id = await Project.find_one(
            Project.project_id == project_id,
            Project.company_id == current_user.company_id
        )
        if existing_by_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Project ID '{project_id}' already exists in your company. Please use a different ID."
            )
        
        existing = await Project.find_one(
            Project.key == key.upper(),
            Project.company_id == current_user.company_id
        )
        if existing:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Project key already exists"
            )
        
        final_project_id = project_id
        project_type = normalize_project_type(type)
        
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
        assigned_users = await validate_project_assignees(current_user, current_user.company_id, requested_assignees) if requested_assignees else []
        assigned_ids = [str(user.id) for user in assigned_users]
        primary_assigned_to = assigned_ids[0] if assigned_ids else None
        
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
        
        if start_date_obj and delivery_date_obj and start_date_obj > delivery_date_obj:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Start date cannot be after delivery date"
            )
        
        project_data = {
            "name": name,
            "key": key.upper(),
            "project_id": final_project_id,
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
        
        project = Project(**project_data)
        project.project_id = final_project_id
        await project.insert()
        await cache_delete(project_list_key(current_user.company_id))
        await cache_delete_pattern(f"dashboard:stats:{current_user.company_id}:*")
        
        try:
            from app.core.database import get_database
            from bson import ObjectId
            db = get_database()
            project_oid = project.id if isinstance(project.id, ObjectId) else ObjectId(project.id)
            await db["projects"].update_one(
                {"_id": project_oid},
                {"$set": {"project_id": final_project_id}}
            )
        except Exception:
            pass
        project.project_id = final_project_id
        await project.save()

        if client:
            client_project_ids = [str(item) for item in (client.project_ids or [])]
            if str(project.id) not in client_project_ids:
                client.project_ids = client_project_ids + [str(project.id)]
            client.updated_at = datetime.now()
            await client.save()
        
        # Send notification to assigned user
        for assigned_user in assigned_users:
            from app.models.notification import Notification, NotificationType
            notification = Notification(
                company_id=current_user.company_id,
                user_id=str(assigned_user.id),
                type=NotificationType.PROJECT_ASSIGNED,
                title="New Project Assigned",
                message=f"You have been assigned to project: {name}",
                related_id=final_project_id,
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
            background_warnings.append("Project created, but background processing is degraded.")
        
        return {
            "message": "Project created successfully",
            "project_id": final_project_id,
            "id": str(project.id),
            "key": project.key,
            "warnings": background_warnings
        }


