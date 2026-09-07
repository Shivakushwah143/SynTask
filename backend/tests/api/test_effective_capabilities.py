from types import SimpleNamespace

import pytest

from app.api import dependencies
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_explicit_grant_is_effective_without_role_default():
    user = SimpleNamespace(role=UserRole.MANAGER, company_id="company-a", department_id=None, capability_grants=["employee_management.view"])
    assert await dependencies.has_capability(user, "employee_management.view")


@pytest.mark.asyncio
async def test_removed_grant_is_denied_immediately():
    user = SimpleNamespace(role=UserRole.MANAGER, company_id="company-a", department_id=None, capability_grants=[])
    assert not await dependencies.has_capability(user, "employee_management.view")


@pytest.mark.asyncio
async def test_admin_role_keeps_backward_compatible_full_capabilities():
    user = SimpleNamespace(role=UserRole.ADMIN, company_id="company-a", department_id=None, capability_grants=[])
    assert await dependencies.has_capability(user, "employee_management.manage")
