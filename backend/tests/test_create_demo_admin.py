import pytest

import create_demo_admin


EXPECTED_MODULES = [
    "task",
    "sales",
    "tasks_projects",
    "tickets",
    "chat",
    "meetings_calendar",
    "invoicing_ledger",
    "sales_crm",
    "attendance_leaves",
    "recruitment",
    "reports",
    "ai_agents",
]


@pytest.mark.asyncio
async def test_existing_demo_admin_receives_every_supported_module(monkeypatch):
    class ExistingAdmin:
        role = "admin"
        id = "demo-id"
        modules = ["task", "sales"]

        def __init__(self):
            self.saved = False

        async def save(self):
            self.saved = True

    admin = ExistingAdmin()

    class FakeUser:
        email = object()

        @staticmethod
        async def find_one(_query):
            return admin

    monkeypatch.setattr(create_demo_admin, "User", FakeUser)
    monkeypatch.setattr(create_demo_admin, "init_db", lambda: _completed())

    await create_demo_admin.create_demo_admin()

    assert admin.modules == EXPECTED_MODULES
    assert admin.saved is True


async def _completed():
    return None
