from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.dependencies import require_module
from app.api.v1.endpoints import sales_categories, sales_masters, sales_products
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_manager_can_access_sales_module_without_explicit_module_assignment():
    checker = require_module("sales")
    manager = SimpleNamespace(id="manager-1", role=UserRole.MANAGER, modules=[], company_id="company-1")

    assert await checker(manager) is manager


def test_manager_can_manage_sales_masters():
    manager = SimpleNamespace(role=UserRole.MANAGER)

    sales_masters._ensure_admin_permission(manager)


def test_manager_can_delete_sales_products_and_categories():
    manager = SimpleNamespace(role=UserRole.MANAGER)

    sales_products._ensure_delete_permission(manager)
    sales_categories._ensure_delete_permission(manager)


def test_employee_still_cannot_manage_sales_masters():
    employee = SimpleNamespace(role=UserRole.EMPLOYEE)

    with pytest.raises(HTTPException) as exc_info:
        sales_masters._ensure_admin_permission(employee)

    assert exc_info.value.status_code == 403
