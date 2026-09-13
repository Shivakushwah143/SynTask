from types import SimpleNamespace

import pytest

from app.models.user import PermissionEffect, PermissionOverride, UserRole
from app.services.authorization_service import authorize, permission_result


def user(*, grants=None, overrides=None, user_id="actor"):
    return SimpleNamespace(
        id=user_id,
        role=UserRole.EMPLOYEE,
        company_id="company-a",
        department_id=None,
        capability_grants=grants or [],
        permission_overrides=overrides or [],
    )


@pytest.mark.asyncio
async def test_explicit_deny_beats_legacy_allow():
    actor = user(
        grants=["tasks.delete"],
        overrides=[PermissionOverride(permission="tasks.delete", effect=PermissionEffect.DENY)],
    )
    result = await permission_result(actor, "tasks.delete")
    assert not result.allowed
    assert result.reason == "explicit_deny"


@pytest.mark.asyncio
async def test_team_scope_rejects_user_outside_reporting_team():
    actor = user(overrides=[PermissionOverride(permission="tasks.assign", effect=PermissionEffect.ALLOW, scope="team")])
    outsider = user(user_id="outsider")
    result = await authorize(actor, "tasks.assign", target_user=outsider)
    assert not result.allowed
    assert result.reason == "scope_violation"


@pytest.mark.asyncio
async def test_cross_tenant_is_rejected_before_override():
    actor = user(overrides=[PermissionOverride(permission="tasks.assign", effect=PermissionEffect.ALLOW, scope="company")])
    foreign = user(user_id="foreign")
    foreign.company_id = "company-b"
    result = await authorize(actor, "tasks.assign", target_user=foreign)
    assert not result.allowed
    assert result.source == "tenant"
