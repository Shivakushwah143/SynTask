import logging
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status as http_status

from app.models.notification import Notification, NotificationType
from app.models.project import Project, ProjectPriority, ProjectStatus, ProjectTypeConfiguration
from app.models.task import Task
from app.models.user import Employee, User, UserRole, UserStatus
from app.core.clock import utc_now

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
        return await Employee.find(
            {
                "company_id": company_id,
                "status": UserStatus.ACTIVE,
                "lead_id": str(lead_id),
            }
        ).to_list()

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

        team = await ProjectService._get_lead_team(company_id, old_lead_id)
        project_team = await ProjectService._filter_team_for_project(project, company_id, team)
        if not project_team:
            return 0

        transferred_ids: set[str] = set()
        for employee in project_team:
            employee.lead_id = str(new_lead_id)
            await employee.save()

            employee_id = str(employee.id)
            transferred_ids.add(employee_id)

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
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid project owner")
        if lead.role not in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD]:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Project owner must be an Admin, Manager, or Lead")
        return lead

    @staticmethod
    def _validate_priority(value: Optional[str]) -> ProjectPriority:
        try:
            return ProjectPriority((value or ProjectPriority.MEDIUM.value).lower())
        except ValueError as exc:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {[item.value for item in ProjectPriority]}",
            ) from exc

    @staticmethod
    def _is_internal_project_type(value: Optional[str]) -> bool:
        return (value or "").strip().lower().replace(" ", "_") == "internal"

    @staticmethod
    async def ensure_project_type(company_id: str, value: str, current_user: User) -> str:
        normalized = (value or "software").strip().lower().replace(" ", "_")
        if not normalized:
            normalized = "software"
        existing = await ProjectTypeConfiguration.find_one(
            ProjectTypeConfiguration.company_id == company_id,
            ProjectTypeConfiguration.value == normalized,
        )
        if not existing:
            label = normalized.replace("_", " ").title()
            await ProjectTypeConfiguration(
                company_id=company_id,
                value=normalized,
                label=label,
                created_by=str(current_user.id),
            ).insert()
        return normalized

    @staticmethod
    async def sync_client_project_link(project: Project, new_client_id: Optional[str], company_id: str) -> None:
        from app.models.client import Client

        old_client_id = getattr(project, "client_id", None)
        project_refs = {str(project.id)}
        if getattr(project, "project_id", None):
            project_refs.add(str(project.project_id))

        if old_client_id and old_client_id != new_client_id:
            old_client = await Client.get(old_client_id)
            if old_client and str(old_client.company_id) == str(company_id):
                old_client.project_ids = [item for item in (old_client.project_ids or []) if str(item) not in project_refs]
                old_client.updated_at = utc_now()
                await old_client.save()

        client = None
        if new_client_id:
            client = await Client.get(new_client_id)
            if not client or str(client.company_id) != str(company_id):
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid client")
            ids = [str(item) for item in (client.project_ids or [])]
            if str(project.id) not in ids:
                client.project_ids = ids + [str(project.id)]
                client.updated_at = utc_now()
                await client.save()
        project.client_id = new_client_id

    @staticmethod
    async def _validate_assignee(user_id: str, company_id: str) -> User:
        user = await User.get(user_id)
        if not user or user.company_id != company_id:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid assigned user")
        if user.role not in [UserRole.MANAGER, UserRole.EMPLOYEE]:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Can only assign projects to Managers or Employees",
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
        client_id: Optional[str] = None,
        type: Optional[str] = None,
        priority: Optional[str] = None,
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

        if type is not None:
            project.type = await ProjectService.ensure_project_type(current_user.company_id, type, current_user)

        if priority is not None:
            project.priority = ProjectService._validate_priority(priority)

        if client_id is not None:
            if client_id == "" and not ProjectService._is_internal_project_type(project.type):
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Client is required for client-facing projects")
            await ProjectService.sync_client_project_link(project, client_id or None, current_user.company_id)

        if assigned_to is not None:
            old_assigned_to = project.assigned_to
            if assigned_to:
                assigned_user = await ProjectService._validate_assignee(assigned_to, current_user.company_id)
                project.assigned_to = assigned_to
                project.assigned_by = str(current_user.id)
                project.assigned_at = utc_now()
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
            project.assigned_at = utc_now() if clean_ids else None
            if old_ids != clean_ids:
                history = getattr(project, "assignment_history", None) or []
                history.append({
                    "assigned_by": str(current_user.id),
                    "assigned_user_ids": clean_ids,
                    "assigned_at": utc_now().isoformat(),
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

        project.updated_at = utc_now()
        await project.save()
        return project

    # ------------------------------------------------------------------
    # Cascade project deletion
    # ------------------------------------------------------------------

    @staticmethod
    async def delete_project_cascade(
        *,
        project: Project,
        current_user: User,
    ) -> dict:
        """
        Delete a project and everything it owns.

        Cascade order (children before parents, project deleted last):
          1. task-dependent records (comments, watchers, extension requests,
             time logs, issue links, timesheet entries, notifications)
          2. every task belonging to the project (any status, any link style)
          3. project-scoped records (epics, sprints, components, versions,
             pages, content calendar, AI memory, workflows, automation rules,
             webhooks, issue types, creative review family, scheduled jobs
             that would recreate the project or its tasks, notifications)
          4. the project document itself

        Runs inside a MongoDB transaction when the deployment supports it
        (replica set / Atlas) and falls back to a carefully ordered, idempotent
        cascade otherwise. Every stage is keyed by project/task identifiers plus
        the project's company, so no record from another project or organization
        can ever be touched.

        Deliberately preserved (intentional history / audit / financial):
        timeline events, change logs, audit logs, agent runs, invoices, EOD
        reports, and CRM/sales records that merely reference the project.
        """
        from app.core import database
        from app.core.cache import cache_delete, cache_delete_pattern, project_list_key

        company_id = str(project.company_id)
        actor_id = str(getattr(current_user, "id", "") or "")
        project_label = project.project_id or str(project.id)
        logger.info(
            "PROJECT_DELETE_STARTED project_id=%s company_id=%s user_id=%s",
            project_label, company_id, actor_id,
        )

        project_identifiers = [str(project.id)]
        if getattr(project, "project_id", None):
            project_identifiers.append(str(project.project_id))

        # 1. Discover every task belonging to this project (any status, either
        #    link style: logical project_id or normalized project_object_id).
        task_filter = {
            "company_id": company_id,
            "$or": [
                {"project_id": {"$in": project_identifiers}},
                {"project_object_id": str(project.id)},
            ],
        }
        tasks = await Task.find(task_filter).to_list()
        task_ids = [str(task.id) for task in tasks]
        logger.info(
            "PROJECT_DELETE_TASKS_FOUND project_id=%s task_count=%s",
            project_label, len(task_ids),
        )

        db = database.get_database()
        stages = ProjectService._build_delete_stages(
            project=project,
            company_id=company_id,
            project_identifiers=project_identifiers,
            task_ids=task_ids,
        )

        # 2. Execute the ordered cascade (transaction when supported).
        deleted = await ProjectService._run_delete_stages(db, stages)

        # 3. Detach the project from its linked client (reference cleanup).
        await ProjectService._detach_client_reference(project, company_id)

        # 4. Best-effort local storage cleanup for project files (never blocks).
        await ProjectService._cleanup_project_files(project)

        # 5. Cache invalidation.
        try:
            await cache_delete(project_list_key(company_id))
            await cache_delete_pattern(f"dashboard:stats:{company_id}:*")
        except Exception as exc:  # pragma: no cover - cache is best-effort
            logger.warning("Project delete cache invalidation failed: %s", exc)

        logger.info(
            "PROJECT_DELETE_COMPLETED project_id=%s deleted=%s",
            project_label, deleted,
        )
        return {
            "deleted_tasks": len(task_ids),
            "deleted_records": {key: int(value) for key, value in deleted.items()},
        }

    @staticmethod
    def _build_delete_stages(
        *,
        project: Project,
        company_id: str,
        project_identifiers: list[str],
        task_ids: list[str],
    ) -> list[tuple[str, dict]]:
        """Return ordered (collection, filter) stages for the cascade."""
        from bson import ObjectId

        stages: list[tuple[str, dict]] = []
        project_filter = {"project_id": {"$in": project_identifiers}}

        # --- Task-dependent records (only when tasks exist) ---
        if task_ids:
            task_ids_in = {"$in": task_ids}
            stages.extend([
                ("task_comments", {"task_id": task_ids_in, "company_id": company_id}),
                ("watchers", {"task_id": task_ids_in, "company_id": company_id}),
                ("task_extension_requests", {"task_id": task_ids_in, "company_id": company_id}),
                ("time_logs", {"task_id": task_ids_in}),
                ("time_tracking_summaries", {"task_id": task_ids_in}),
                ("issue_links", {
                    "$or": [
                        {"source_task_id": task_ids_in},
                        {"destination_task_id": task_ids_in},
                    ]
                }),
                ("timesheet_entries", {"task_id": task_ids_in, "company_id": company_id}),
            ])

            # Tasks themselves, by canonical Mongo id.
            task_oids = [ObjectId(tid) for tid in task_ids if ObjectId.is_valid(tid)]
            if task_oids:
                stages.append(("tasks", {"_id": {"$in": task_oids}, "company_id": company_id}))

        # --- Project-scoped records ---
        stages.extend([
            ("epics", {**project_filter, "company_id": company_id}),
            ("sprints", {**project_filter, "company_id": company_id}),
            ("components", {**project_filter, "company_id": company_id}),
            ("versions", {**project_filter, "company_id": company_id}),
            ("pages", {**project_filter, "company_id": company_id}),
            ("content_calendar_items", {**project_filter, "company_id": company_id}),
            ("project_memory", {**project_filter, "company_id": company_id}),
            ("knowledge_records", {**project_filter, "company_id": company_id}),
            ("workflows", {**project_filter, "company_id": company_id}),
            ("automation_rules", {**project_filter, "company_id": company_id}),
            ("webhooks", {**project_filter, "company_id": company_id}),
            ("issue_types", {**project_filter, "company_id": company_id}),
            ("creative_reviews", {**project_filter, "company_id": company_id}),
            ("creative_review_history", {**project_filter, "company_id": company_id}),
            ("creative_issues", {**project_filter, "company_id": company_id}),
            ("creative_suggestions", {**project_filter, "company_id": company_id}),
            ("creative_asset_metadata", {**project_filter, "company_id": company_id}),
            ("creative_campaign_reviews", {**project_filter, "company_id": company_id}),
            # timesheet_entries appears twice by design: entries may reference a
            # task (task-dependent) or the project bucket directly (project-scoped).
            # delete_many is idempotent, so the overlap is harmless.
            ("timesheet_entries", {**project_filter, "company_id": company_id}),
            ("notifications", {
                "company_id": company_id,
                "$or": [
                    {"related_type": "task", "related_id": {"$in": task_ids}},
                    {"related_type": "project", "related_id": {"$in": project_identifiers}},
                ],
            }),
            # Scheduled jobs that would recreate the project or its tasks. Logical
            # project ids are unique per company, so scope by company too - a
            # same-id scheduled job in another organization must never be touched.
            ("scheduled_jobs", {
                "company_id": company_id,
                "action_type": {"$in": ["CREATE_TASK", "CREATE_PROJECT"]},
                "payload.project_id": {"$in": project_identifiers},
            }),
        ])

        # --- The project document itself is deleted LAST ---
        project_oid = ObjectId(str(project.id)) if ObjectId.is_valid(str(project.id)) else str(project.id)
        stages.append(("projects", {"_id": project_oid}))
        return stages

    @staticmethod
    def _is_transaction_unsupported(exc: Exception) -> bool:
        """True when the server rejected a transaction because the deployment
        is not a replica set / mongos (pymongo OperationFailure code 20)."""
        if getattr(exc, "code", None) == 20:
            return True
        message = str(exc).lower()
        return any(
            token in message
            for token in (
                "transaction numbers are only allowed on a replica set member or mongos",
                "transactions are not supported",
                "does not support transactions",
            )
        )

    @staticmethod
    async def _run_delete_stages(db, stages: list[tuple[str, dict]]) -> dict:
        """
        Run all cascade stages, inside a MongoDB transaction when supported.

        A replica set / Atlas deployment supports transactions; a standalone
        mongod or a missing client does not. We attempt a transaction first and
        transparently fall back to the carefully ordered, idempotent cascade
        (children before parents, project deleted last) when transactions are
        unavailable - the order makes the fallback safe: a partial failure can
        never leave a parent (task/project) without its children removed first.

        Note: pymongo's start_transaction() is lazy - on a standalone mongod the
        replica-set error surfaces when the FIRST operation executes, not at
        start_transaction(). Both failure points are therefore handled.
        """
        async def execute(session=None) -> dict:
            deleted: dict[str, int] = {}
            for collection_name, filt in stages:
                collection = db[collection_name]
                if session is None:
                    result = await collection.delete_many(filt)
                else:
                    result = await collection.delete_many(filt, session=session)
                deleted[collection_name] = int(getattr(result, "deleted_count", 0) or 0)
            return deleted

        from app.core import database
        from pymongo.errors import OperationFailure

        session = None
        transaction_started = False
        client = getattr(database, "client", None)
        if client is not None:
            try:
                session = await client.start_session()
                session.start_transaction()
                transaction_started = True
            except Exception as exc:
                # No session / transaction support at all (e.g. broken client).
                logger.warning(
                    "PROJECT_DELETE_TRANSACTION_UNSUPPORTED - using ordered cascade fallback: %s", exc
                )
                if session is not None:
                    try:
                        session.end_session()
                    except Exception:
                        pass
                    session = None

        try:
            result = await execute(session)
        except OperationFailure as exc:
            if transaction_started and ProjectService._is_transaction_unsupported(exc):
                # Standalone mongod: the transaction was accepted locally but the
                # first write with the session was rejected. Abort the dead
                # transaction and re-run the whole cascade WITHOUT a session.
                # delete_many is idempotent, so re-running already-completed
                # stages (none, in practice) is safe.
                logger.warning(
                    "PROJECT_DELETE_TRANSACTION_UNSUPPORTED - using ordered cascade fallback: %s", exc
                )
                if session is not None:
                    try:
                        await session.abort_transaction()
                    except Exception:
                        pass
                    try:
                        session.end_session()
                    except Exception:
                        pass
                    session = None
                return await execute(session=None)
            if session is not None and transaction_started:
                try:
                    await session.abort_transaction()
                except Exception:
                    pass
            raise
        except Exception:
            if session is not None and transaction_started:
                try:
                    await session.abort_transaction()
                except Exception:
                    pass
            raise
        else:
            if session is not None and transaction_started:
                await session.commit_transaction()
            return result
        finally:
            if session is not None:
                try:
                    session.end_session()
                except Exception:
                    pass

    @staticmethod
    async def _detach_client_reference(project: Project, company_id: str) -> None:
        """Remove the deleted project id from its linked Client's project_ids."""
        client_id = getattr(project, "client_id", None)
        if not client_id:
            return
        try:
            from app.models.client import Client
            client = await Client.get(client_id)
            if not client or str(client.company_id) != str(company_id):
                return
            project_ids = [
                item
                for item in (getattr(client, "project_ids", None) or [])
                if str(item) not in (str(project.id), str(project.project_id or ""))
            ]
            if len(project_ids) != len(getattr(client, "project_ids", None) or []):
                client.project_ids = project_ids
                await client.save()
        except Exception as exc:  # pragma: no cover - reference cleanup is best-effort
            logger.warning("Project delete client reference cleanup failed: %s", exc)

    @staticmethod
    async def _cleanup_project_files(project: Project) -> None:
        """Best-effort removal of local storage files owned by the project."""
        try:
            from pathlib import Path
            from app.api.v1.endpoints.projects.shared import PROJECT_UPLOAD_DIR
            removed = 0
            for file_data in getattr(project, "files", None) or []:
                url = file_data.get("url") or ""
                if not url:
                    continue
                file_path = PROJECT_UPLOAD_DIR / Path(url).name
                try:
                    if file_path.exists():
                        file_path.unlink()
                        removed += 1
                except Exception:
                    pass
            if removed:
                logger.info(
                    "PROJECT_DELETE_FILES_REMOVED project_id=%s count=%s",
                    project.project_id or project.id, removed,
                )
        except Exception as exc:  # pragma: no cover - storage cleanup is best-effort
            logger.warning("Project delete file cleanup failed: %s", exc)

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
        priority: Optional[str] = None,
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
        project_type = await ProjectService.ensure_project_type(current_user.company_id, normalize_project_type(type), current_user)
        project_priority = ProjectService._validate_priority(priority)
        
        if not lead_id:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Project owner is required")
        await ProjectService._validate_project_lead(lead_id, current_user.company_id)

        client = None
        if client_id:
            client = await Client.get(client_id)
            if not client or client.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Invalid client"
                )
        elif not ProjectService._is_internal_project_type(project_type):
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Client is required for client-facing projects")
        
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
            "priority": project_priority,
            "lead_id": lead_id,
            "assigned_to": primary_assigned_to,
            "assigned_user_ids": assigned_ids,
            "assigned_by": str(current_user.id) if assigned_ids else None,
            "assigned_at": utc_now() if assigned_ids else None,
            "assignment_history": [{
                "assigned_by": str(current_user.id),
                "assigned_user_ids": assigned_ids,
                "assigned_at": utc_now().isoformat(),
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

        await ProjectService.sync_client_project_link(project, client_id, current_user.company_id)
        await project.save()
        
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
