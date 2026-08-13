"""Tests for the member-level module permission system.

Covers:
- normalize_modules / role_module_defaults from the canonical catalog
- _restrict_modules_for_creator (privilege-escalation guard)
- _resolve_new_user_modules (create flows)
- create_employee / update_user endpoint wiring (modules param + guards)
"""
import ast
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.models.user import UserRole
from app.schemas.admin_permissions import (
    MODULE_CATALOG,
    normalize_modules,
    role_module_defaults,
)
from app.api.v1.endpoints.users import (
    _restrict_modules_for_creator,
    _resolve_new_user_modules,
)
from app.api.dependencies import _is_legacy_module_config, require_module


def _user(role, modules=None):
    return SimpleNamespace(role=role, modules=modules or [])


# ── Catalog + defaults ───────────────────────────────────────────────────────

def test_normalize_modules_drops_unknown_keys():
    assert normalize_modules(["tasks_projects", "not_a_module", ""], require_tasks_projects=False) == ["tasks_projects"]


def test_normalize_modules_auto_inserts_tasks_projects():
    result = normalize_modules(["attendance_leaves"], require_tasks_projects=True)
    assert result == ["tasks_projects", "attendance_leaves"]


def test_normalize_modules_handles_csv_string():
    assert normalize_modules("chat, reports, attendance_leaves", require_tasks_projects=False) == ["chat", "reports", "attendance_leaves"]


def test_role_module_defaults_known_and_unknown_roles():
    admin_defaults = role_module_defaults("admin")
    assert set(admin_defaults) == {entry["id"] for entry in MODULE_CATALOG}
    # Unknown / legacy roles must never be locked out -> employee defaults.
    legacy_defaults = role_module_defaults("hr_manager")
    assert legacy_defaults == role_module_defaults("employee")
    assert "projects" in legacy_defaults
    assert "tasks_projects" not in legacy_defaults


# ── Privilege-escalation guard ───────────────────────────────────────────────

def test_admin_can_grant_any_module():
    creator = _user(UserRole.ADMIN, modules=[])
    requested = ["tasks_projects", "sales_crm", "reports"]
    assert _restrict_modules_for_creator(creator, requested) == requested


def test_super_admin_can_grant_any_module():
    creator = _user(UserRole.SUPER_ADMIN, modules=[])
    assert _restrict_modules_for_creator(creator, ["ai_agents", "reports"]) == ["ai_agents", "reports"]


def test_manager_can_only_grant_modules_they_have():
    creator = _user(UserRole.MANAGER, modules=["task", "attendance_leaves"])
    # "tasks_projects" is covered by the alias "task"; "chat" is covered by
    # "task"; "meetings_calendar" is NOT in the creator's list -> stripped.
    result = _restrict_modules_for_creator(
        creator,
        ["tasks_projects", "chat", "meetings_calendar", "attendance_leaves"],
    )
    assert set(result) == {"tasks_projects", "chat", "attendance_leaves"}


def test_restrict_falls_back_to_creators_own_modules_when_nothing_survives():
    creator = _user(UserRole.MANAGER, modules=["attendance_leaves"])
    # The fallback must never grant modules the creator does not hold.
    assert _restrict_modules_for_creator(creator, ["sales_crm", "reports"]) == ["attendance_leaves"]


def test_employee_creator_cannot_grant_admin_modules():
    creator = _user(UserRole.EMPLOYEE, modules=["task"])
    assert _restrict_modules_for_creator(creator, ["reports", "ai_agents", "invoicing_ledger"]) == ["task"]


def test_restrict_fallback_never_exceeds_creator_authority():
    creator = _user(UserRole.MANAGER, modules=["chat"])
    result = _restrict_modules_for_creator(creator, ["invoicing_ledger", "ai_agents"])
    assert result == ["chat"]
    assert set(result) <= set(creator.modules)


# ── Create-flow resolution ───────────────────────────────────────────────────

def test_resolve_new_user_modules_none_keeps_legacy_defaults():
    creator = _user(UserRole.ADMIN)
    assert _resolve_new_user_modules(creator, None) == ["task", "attendance_leaves"]


def test_resolve_new_user_modules_normalizes_and_restricts():
    creator = _user(UserRole.ADMIN)
    result = _resolve_new_user_modules(creator, "attendance_leaves, bogus, reports")
    assert result == ["attendance_leaves", "reports"]


def test_resolve_new_user_modules_keeps_granular_work_without_parent_alias():
    creator = _user(UserRole.ADMIN)
    result = _resolve_new_user_modules(creator, "projects,tasks")
    assert result == ["projects", "tasks"]
    assert "tasks_projects" not in result


# ── Endpoint wiring (AST) ────────────────────────────────────────────────────

USERS_PY = Path(__file__).resolve().parents[2] / "app" / "api" / "v1" / "endpoints" / "users.py"


def _function_source(name: str) -> str:
    tree = ast.parse(USERS_PY.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return ast.get_source_segment(USERS_PY.read_text(encoding="utf-8"), node)
    raise AssertionError(f"{name} not found")


def test_create_employee_accepts_modules_param_and_applies_guard():
    source = _function_source("create_employee")
    assert "modules: Optional[str] = Form(None)" in source
    assert "_resolve_new_user_modules(current_user," in source
    assert "_form_or_none(modules)" in source


def test_form_or_none_treats_sentinel_as_not_provided():
    from fastapi import Form
    from app.api.v1.endpoints.users import _form_or_none

    sentinel = Form(None)  # what direct function calls bind as the default
    assert _form_or_none(sentinel) is None
    assert _form_or_none(None) is None
    assert _form_or_none("tasks_projects,chat") == "tasks_projects,chat"
    assert _form_or_none(["tasks_projects"]) == ["tasks_projects"]


def test_update_user_accepts_modules_param_and_applies_guard():
    source = _function_source("update_user")
    assert "modules: Optional[str] = Form(None)" in source
    assert "user.modules = _restrict_modules_for_creator(current_user, parsed_modules)" in source


def test_create_user_hierarchical_restricts_non_admin_creators():
    source = _function_source("create_user_hierarchical")
    assert "_restrict_modules_for_creator(current_user, parsed_modules)" in source


def test_restrict_helper_has_no_bare_setattr_loophole():
    """The guard must never mutate the creator's own modules."""
    creator = _user(UserRole.MANAGER, modules=["task"])
    before = list(creator.modules)
    _restrict_modules_for_creator(creator, ["reports"])
    assert list(creator.modules) == before


# ── Legacy vs explicit module enforcement (require_module) ───────────────────


def test_is_legacy_module_config_cases():
    assert _is_legacy_module_config(["task"]) is True
    assert _is_legacy_module_config(["task", "attendance_leaves"]) is True
    assert _is_legacy_module_config([]) is True
    # `tasks_projects` is a NEW id written only by permission-system flows, so a
    # member created with just "Tasks & Projects" selected is explicit, not
    # legacy (which would auto-grant Sales/Tickets/Recruitment).
    assert _is_legacy_module_config(["tasks_projects"]) is False
    assert _is_legacy_module_config(["tasks_projects", "chat"]) is False
    assert _is_legacy_module_config(["tasks_projects", "sales_crm", "attendance_leaves"]) is False
    assert _is_legacy_module_config(None) is True


@pytest.mark.asyncio
async def test_require_module_explicit_single_module_employee_is_blocked_from_sales():
    """An employee created with ONLY 'tasks_projects' selected must NOT be
    auto-granted Sales — this was the 'deselect Sales but it still appears'
    regression where ['tasks_projects'] was misclassified as legacy."""
    checker = require_module("sales_crm")
    user = _user(UserRole.EMPLOYEE, modules=["tasks_projects"])
    with pytest.raises(Exception) as exc_info:
        await checker(current_user=user)
    assert getattr(exc_info.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_require_module_legacy_employee_keeps_sales_autogrant():
    checker = require_module("sales")
    user = _user(UserRole.EMPLOYEE, modules=["task"])
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_require_module_legacy_employee_keeps_recruitment_autogrant():
    checker = require_module("recruitment")
    user = _user(UserRole.EMPLOYEE, modules=["task"])
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_require_module_explicit_employee_without_sales_is_blocked():
    checker = require_module("sales")
    user = _user(UserRole.EMPLOYEE, modules=["tasks_projects", "chat", "attendance_leaves"])
    with pytest.raises(Exception) as exc_info:
        await checker(current_user=user)
    assert getattr(exc_info.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_require_module_explicit_employee_with_sales_passes():
    checker = require_module("sales")
    user = _user(UserRole.EMPLOYEE, modules=["tasks_projects", "sales_crm", "attendance_leaves"])
    assert await checker(current_user=user) is user


@pytest.mark.asyncio
async def test_require_module_explicit_employee_without_recruitment_is_blocked():
    checker = require_module("recruitment")
    user = _user(UserRole.EMPLOYEE, modules=["tasks_projects", "chat"])
    with pytest.raises(Exception) as exc_info:
        await checker(current_user=user)
    assert getattr(exc_info.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_require_module_admin_always_passes():
    checker = require_module("sales")
    user = _user(UserRole.ADMIN, modules=[])
    assert await checker(current_user=user) is user
