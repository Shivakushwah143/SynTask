import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.api.v1.endpoints import auth as auth_module
from app import main as main_module
from app.models.user import UserStatus
from app.services.file_service import FileService


class FakeUser:
    def __init__(
        self,
        *,
        user_id="user-1",
        email="admin@demo.com",
        first_name="Demo",
        last_name="Admin",
        password_hash="hashed-password",
        status=UserStatus.ACTIVE,
        role="admin",
        company_id="company-1",
        modules=None,
        active_module="task",
        avatar=None,
    ):
        self.id = user_id
        self.email = email
        self.first_name = first_name
        self.last_name = last_name
        self.password_hash = password_hash
        self.status = status
        self.role = role
        self.company_id = company_id
        self.modules = modules or ["task", "sales"]
        self.active_module = active_module
        self.avatar = avatar
        self.notification_preferences = {
            "email_notifications": True,
            "in_app_notifications": True,
            "task_assignment_alerts": True,
            "ticket_updates": True,
        }
        self.password_reset_token = None
        self.password_reset_token_expires_at = None
        self.password_reset_token_used = False
        self.saved = False

    async def save(self):
        self.saved = True
        return self


class _AnyField:
    def __eq__(self, other):
        return other


class FakeUserModel:
    email = _AnyField()

    @staticmethod
    async def find_one(*args, **kwargs):
        return FakeUser()


@pytest.fixture(autouse=True)
def reset_overrides():
    main_module.app.dependency_overrides.clear()
    storage = getattr(main_module.app.state.limiter, "_storage", None)
    if storage is not None and hasattr(storage, "reset"):
        storage.reset()
    yield
    main_module.app.dependency_overrides.clear()
    storage = getattr(main_module.app.state.limiter, "_storage", None)
    if storage is not None and hasattr(storage, "reset"):
        storage.reset()


@pytest.fixture
def client(monkeypatch):
    async def fake_init_db():
        return None

    async def fake_rebuild_all_ancestors():
        return None

    monkeypatch.setattr(main_module, "init_db", fake_init_db)
    monkeypatch.setattr(main_module, "rebuild_all_ancestors", fake_rebuild_all_ancestors)
    main_module.app.state.db_ready = True
    with TestClient(main_module.app) as test_client:
        yield test_client


def test_health_endpoint_returns_healthy(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_login_logout_and_blacklist_flow(monkeypatch, client):
    fake_user = FakeUser()
    blacklisted_tokens = []

    async def fake_find_one(*args, **kwargs):
        return fake_user

    async def fake_blacklist_token(token):
        blacklisted_tokens.append(token)

    async def fake_get_current_user():
        return fake_user

    monkeypatch.setattr(auth_module, "User", FakeUserModel)
    monkeypatch.setattr(FakeUserModel, "find_one", fake_find_one)
    monkeypatch.setattr(auth_module, "verify_password", lambda plain, hashed: plain == "Admin@123")
    monkeypatch.setattr(auth_module, "blacklist_token", fake_blacklist_token)

    main_module.app.dependency_overrides[auth_module.get_token_from_header] = lambda: "access-token"
    main_module.app.dependency_overrides[auth_module.get_current_user] = fake_get_current_user

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.com", "password": "Admin@123", "remember_me": False},
    )
    assert login_response.status_code == 200
    payload = login_response.json()
    assert payload["token_type"] == "bearer"
    assert payload["user"]["email"] == "admin@demo.com"

    logout_response = client.post("/api/v1/auth/logout", json={"refresh_token": "refresh-token"})
    assert logout_response.status_code == 200
    assert logout_response.json()["success"] is True
    assert blacklisted_tokens == ["access-token", "refresh-token"]


def test_login_rate_limit_enforces_429(monkeypatch, client):
    fake_user = FakeUser()

    async def fake_find_one(*args, **kwargs):
        return fake_user

    monkeypatch.setattr(auth_module, "User", FakeUserModel)
    monkeypatch.setattr(FakeUserModel, "find_one", fake_find_one)
    monkeypatch.setattr(auth_module, "verify_password", lambda plain, hashed: True)

    status_codes = []
    for _ in range(11):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@demo.com", "password": "Admin@123", "remember_me": False},
        )
        status_codes.append(response.status_code)

    assert status_codes[:10] == [200] * 10
    assert status_codes[10] == 429


def test_forgot_password_rate_limit_and_success(monkeypatch, client):
    fake_user = FakeUser(email="admin@demo.com", first_name="Demo")

    async def fake_find_one(*args, **kwargs):
        return fake_user

    monkeypatch.setattr(auth_module, "User", FakeUserModel)
    monkeypatch.setattr(FakeUserModel, "find_one", fake_find_one)
    monkeypatch.setattr(auth_module, "generate_reset_token", lambda: "reset-token")
    monkeypatch.setattr(auth_module, "get_password_hash", lambda value: f"hashed-{value}")
    monkeypatch.setattr(auth_module.send_password_reset_email_task, "delay", lambda *args, **kwargs: None)

    first = client.post("/api/v1/auth/forgot-password", data={"email": "admin@demo.com"})
    assert first.status_code == 200
    assert first.json()["message"] == "Password reset link has been sent to your email."
    assert fake_user.saved is True

    statuses = []
    for _ in range(6):
        response = client.post("/api/v1/auth/forgot-password", data={"email": "admin@demo.com"})
        statuses.append(response.status_code)

    assert statuses[:4] == [200] * 4
    assert statuses[4] == 429


def test_cors_blocks_unknown_origin(client):
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") is None


def test_spoofed_upload_is_rejected_by_signature_validation():
    spoofed_bytes = b"<!doctype html><html><body>not really a png</body></html>"

    with pytest.raises(HTTPException) as exc_info:
        FileService.validate_uploaded_file("fake.png", spoofed_bytes)

    assert exc_info.value.status_code == 400
    assert "File type 'text/html' not allowed" in exc_info.value.detail
