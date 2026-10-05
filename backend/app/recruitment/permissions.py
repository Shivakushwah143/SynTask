from fastapi import Depends, HTTPException, status

from app.api.dependencies import get_current_user, require_capability
from app.models.department import Department, DepartmentType
from app.models.user import User, UserRole


async def _check_capability(user: User, capability: str) -> None:
    """Skip capability check for managers (they have full recruitment access)."""
    if user.role != UserRole.MANAGER:
        await require_capability(capability)(user)


async def require_recruitment_access(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER):
        return current_user
    if not current_user.company_id or not current_user.department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR department access required")
    department = await Department.get(current_user.department_id)
    if not department or department.company_id != current_user.company_id or department.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR department access required")
    if department.department_type != DepartmentType.HR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR department access required")
    await require_capability("recruitment.view")(current_user)
    return current_user


async def require_recruitment_manager(current_user: User = Depends(require_recruitment_access)) -> User:
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruitment manager access required")
    return current_user


# Job-specific permission dependencies
async def require_job_view(current_user: User = Depends(require_recruitment_access)) -> User:
    """Require permission to view jobs."""
    await _check_capability(current_user, "recruitment.jobs.view")
    return current_user


async def require_job_create(current_user: User = Depends(require_recruitment_manager)) -> User:
    """Require permission to create jobs."""
    await _check_capability(current_user, "recruitment.jobs.create")
    return current_user


async def require_job_update(current_user: User = Depends(require_recruitment_manager)) -> User:
    """Require permission to update jobs."""
    await _check_capability(current_user, "recruitment.jobs.update")
    return current_user


async def require_job_publish(current_user: User = Depends(require_recruitment_manager)) -> User:
    """Require permission to publish jobs."""
    await _check_capability(current_user, "recruitment.jobs.publish")
    return current_user


async def require_job_archive(current_user: User = Depends(require_recruitment_manager)) -> User:
    """Require permission to archive jobs."""
    await _check_capability(current_user, "recruitment.jobs.archive")
    return current_user


async def require_job_approve(current_user: User = Depends(require_recruitment_manager)) -> User:
    """Require permission to approve jobs."""
    await _check_capability(current_user, "recruitment.jobs.approve")
    return current_user


async def require_candidate_view(current_user: User = Depends(require_recruitment_access)) -> User:
    await _check_capability(current_user, "recruitment.candidates.view")
    return current_user


async def require_candidate_manage(current_user: User = Depends(require_recruitment_manager)) -> User:
    await _check_capability(current_user, "recruitment.candidates.manage")
    return current_user


async def require_candidate_assign(current_user: User = Depends(require_recruitment_manager)) -> User:
    await _check_capability(current_user, "recruitment.candidates.assign")
    return current_user


async def require_resume_pool_view(current_user: User = Depends(require_recruitment_access)) -> User:
    await _check_capability(current_user, "recruitment.resume_pool.view")
    return current_user


async def require_interview_view(current_user: User = Depends(require_recruitment_access)) -> User:
    await _check_capability(current_user, "recruitment.interviews.view")
    return current_user


async def require_interview_manage(current_user: User = Depends(require_recruitment_manager)) -> User:
    await _check_capability(current_user, "recruitment.interviews.manage")
    return current_user


async def require_interview_feedback(current_user: User = Depends(require_recruitment_access)) -> User:
    await _check_capability(current_user, "recruitment.interviews.feedback")
    return current_user


async def require_report_view(current_user: User = Depends(require_recruitment_access)) -> User:
    await _check_capability(current_user, "recruitment.reports.view")
    return current_user
