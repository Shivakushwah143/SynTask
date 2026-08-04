from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user import UserRole
from app.recruitment.permissions import require_job_view


def user(role, **overrides):
    data = {
        "id": "user-1",
        "role": role,
        "company_id": "company-1",
        "department_id": None,
        "modules": [],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_sub_admin_can_view_recruitment_job_dashboard_without_department_capability():
    sub_admin = user(UserRole.SUB_ADMIN)

    result = await require_job_view(sub_admin)

    assert result is sub_admin


@pytest.mark.asyncio
async def test_employee_without_hr_department_still_cannot_view_recruitment_jobs():
    employee = user(UserRole.EMPLOYEE)

    with pytest.raises(HTTPException) as exc:
        await require_job_view(employee)

    assert exc.value.status_code == 403
