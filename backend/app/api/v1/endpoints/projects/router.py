from fastapi import APIRouter

from . import (
    board_columns,
    epics,
    pages,
    project_board_view,
    project_summary,
    project_types,
    project_create,
    project_control,
    project_delete,
    project_detail,
    project_files,
    project_list,
    project_task_creation,
    project_update,
    project_status_summary,
    sprints,
    team,
)

router = APIRouter()
router.include_router(project_create.router)
router.include_router(project_list.router)
# Must be registered before project_detail so the literal /status-summary path
# is not matched as a {project_id}.
router.include_router(project_status_summary.router)
router.include_router(project_types.router)
router.include_router(project_detail.router)
router.include_router(project_control.router)
router.include_router(project_update.router)
router.include_router(project_delete.router)
router.include_router(project_task_creation.router)
router.include_router(epics.router)
router.include_router(sprints.router)
router.include_router(project_board_view.router)
router.include_router(project_summary.router)
router.include_router(board_columns.router)
router.include_router(project_files.router)
router.include_router(pages.router)
router.include_router(team.router)
