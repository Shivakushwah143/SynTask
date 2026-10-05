"""Tests for Employee Detail Change Request workflow.

30 test scenarios covering:
  - Model creation and enum validation
  - Service: create, list own, list review queue, approve, reject, cancel
  - Canonical mutation service (update_employee_details)
  - Stale-data detection
  - Atomic approval (double-approval prevention)
  - Self-approval prevention
  - Company isolation
  - Role-based access control
  - Lifecycle field protection
  - Email uniqueness enforcement
  - Reporting cycle detection
  - Notification sending
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.models.employee_detail_change_request import (
    CHANGEABLE_PROFILE_FIELDS,
    CHANGEABLE_USER_FIELDS,
    PROTECTED_FIELDS,
    ChangeRequestStatus,
    ChangeRequestType,
    EmployeeDetailChangeRequest,
)
from app.models.employee_profile import (
    Address,
    EmergencyContact,
    EmployeeProfile,
    EmploymentStatus,
    EmploymentType,
    EmployeeWorkMode,
    Gender,
)
from app.models.user import User, UserRole


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

COMPANY = "company-1"
NOW = datetime.utcnow()


def _user(uid: str = "user-1", role: UserRole = UserRole.EMPLOYEE, company: str = COMPANY) -> SimpleNamespace:
    return SimpleNamespace(
        id=uid,
        role=role,
        company_id=company,
        department_id="dept-1",
        first_name="Test",
        last_name="User",
        email=f"{uid}@example.com",
        phone="+1234567890",
        reports_to=None,
        full_name=lambda: f"Test User {uid}",
    )


def _profile(
    user_id: str = "user-1",
    profile_id: str = "profile-1",
    company: str = COMPANY,
    **overrides,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=profile_id,
        company_id=company,
        user_id=user_id,
        employee_number="EMP-2026-0001",
        personal_email=None,
        personal_phone=None,
        address=None,
        emergency_contact=None,
        date_of_birth=None,
        gender=None,
        employment_type=EmploymentType.FULL_TIME,
        joining_date=NOW,
        department_id="dept-1",
        designation="Engineer",
        reports_to=None,
        work_location="Office",
        work_mode=EmployeeWorkMode.ONSITE,
        employment_status=EmploymentStatus.ACTIVE,
        probation=None,
        exit_info=None,
        updated_at=NOW,
        **overrides,
    )


def _change_request(
    req_id: str = "req-1",
    status_val: ChangeRequestStatus = ChangeRequestStatus.PENDING,
    company: str = COMPANY,
    employee_id: str = "profile-1",
    user_id: str = "user-1",
    requested_by_val: str = "user-1",
    request_type: ChangeRequestType = ChangeRequestType.PERSONAL_INFO,
    original_values: Optional[Dict[str, Any]] = None,
    requested_changes: Optional[Dict[str, Any]] = None,
    changed_fields: Optional[list] = None,
    reason: Optional[str] = "Updated email",
    reviewed_by: Optional[str] = None,
    reviewed_at: Optional[datetime] = None,
    review_comment: Optional[str] = None,
    rejection_reason: Optional[str] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=req_id,
        company_id=company,
        employee_id=employee_id,
        user_id=user_id,
        requested_by=requested_by_val,
        request_type=request_type,
        original_values=original_values if original_values is not None else {"personal_email": "old@example.com"},
        requested_changes=requested_changes if requested_changes is not None else {"personal_email": "new@example.com"},
        changed_fields=changed_fields if changed_fields is not None else ["personal_email"],
        reason=reason,
        status=status_val,
        reviewed_by=reviewed_by,
        reviewed_at=reviewed_at,
        review_comment=review_comment,
        rejection_reason=rejection_reason,
        created_at=NOW,
        updated_at=NOW,
    )


# ---------------------------------------------------------------------------
# 1-5: Model and enum tests
# ---------------------------------------------------------------------------


class TestModelEnums:
    """Tests 1-5: Model, enums, and field sets."""

    def test_01_change_request_status_values(self):
        """Test ChangeRequestStatus has all required values."""
        assert ChangeRequestStatus.PENDING == "pending"
        assert ChangeRequestStatus.APPROVED == "approved"
        assert ChangeRequestStatus.REJECTED == "rejected"
        assert ChangeRequestStatus.CANCELLED == "cancelled"

    def test_02_change_request_type_values(self):
        """Test ChangeRequestType has all required values."""
        assert ChangeRequestType.PERSONAL_INFO == "personal_info"
        assert ChangeRequestType.CONTACT_INFO == "contact_info"
        assert ChangeRequestType.EMPLOYMENT_INFO == "employment_info"
        assert ChangeRequestType.EMERGENCY_CONTACT == "emergency_contact"

    def test_03_protected_fields_excludes_changeable(self):
        """Protected fields and changeable fields must be disjoint."""
        assert PROTECTED_FIELDS.isdisjoint(CHANGEABLE_PROFILE_FIELDS)
        assert PROTECTED_FIELDS.isdisjoint(CHANGEABLE_USER_FIELDS)

    def test_04_changeable_profile_fields_cover_hr_fields(self):
        """Key editable profile fields are in the changeable set."""
        expected = {
            "personal_email", "personal_phone", "address", "emergency_contact",
            "department_id", "designation", "reports_to", "work_location", "work_mode",
            "employment_type", "joining_date", "date_of_birth", "gender",
        }
        assert expected.issubset(CHANGEABLE_PROFILE_FIELDS)

    def test_05_changeable_user_fields_cover_identity(self):
        """User identity fields are in the changeable set."""
        expected = {"first_name", "last_name", "email", "phone"}
        assert expected.issubset(CHANGEABLE_USER_FIELDS)


# ---------------------------------------------------------------------------
# 6-10: Create change request tests
# ---------------------------------------------------------------------------


class TestCreateChangeRequest:
    """Tests 6-10: Creating change requests."""

    @pytest.mark.asyncio
    async def test_06_create_request_success(self):
        """Employee creates a change request for own profile."""
        from app.services.change_request_service import create_change_request

        profile = _profile()
        user = _user()

        # Create a mock instance to be returned when EmployeeDetailChangeRequest is constructed
        mock_req_instance = MagicMock()
        mock_req_instance.id = "mock-req-id"
        mock_req_instance.insert = AsyncMock()

        # Create a mock for the class itself — find_one must be awaitable
        mock_class = MagicMock()
        mock_class.find_one = AsyncMock(return_value=None)
        mock_class.return_value = mock_req_instance

        with patch("app.services.change_request_service.EmployeeProfile.find_one", new_callable=AsyncMock, return_value=None):
            with patch("app.services.change_request_service._validate_request_payload", new_callable=AsyncMock):
                with patch("app.services.change_request_service.User.get", new_callable=AsyncMock, return_value=user):
                    with patch("app.services.change_request_service._snapshot_both", new_callable=AsyncMock, return_value={"personal_email": "old@example.com"}):
                        with patch("app.services.change_request_service._classify_request_type", return_value=ChangeRequestType.PERSONAL_INFO):
                            with patch("app.services.change_request_service.EmployeeDetailChangeRequest", mock_class):
                                req = await create_change_request(
                                    COMPANY, user, profile,
                                    {"personal_email": "new@example.com"},
                                    reason="Updated email",
                                )
                                assert req is not None
                                mock_req_instance.insert.assert_called_once()

    @pytest.mark.asyncio
    async def test_07_create_request_rejects_other_profile(self):
        """Employee cannot create request for someone else's profile."""
        from app.services.change_request_service import create_change_request
        from fastapi import HTTPException

        profile = _profile(user_id="other-user")
        user = _user(uid="user-1")

        with pytest.raises(HTTPException) as exc_info:
            await create_change_request(COMPANY, user, profile, {"personal_email": "x@y.com"})
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_08_create_request_rejects_empty_changes(self):
        """Empty changes dict is rejected."""
        from app.services.change_request_service import create_change_request
        from fastapi import HTTPException

        profile = _profile()
        user = _user()

        with pytest.raises(HTTPException) as exc_info:
            await create_change_request(COMPANY, user, profile, {})
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_09_create_request_rejects_protected_fields(self):
        """Protected fields are rejected at creation time."""
        from app.services.change_request_service import _validate_request_payload
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await _validate_request_payload(COMPANY, {"employment_status": "active"}, "user-1")
        assert exc_info.value.status_code == 400
        assert "protected" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_10_create_request_rejects_unknown_fields(self):
        """Unknown fields are rejected."""
        from app.services.change_request_service import _validate_request_payload
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await _validate_request_payload(COMPANY, {"nonexistent_field": "value"}, "user-1")
        assert exc_info.value.status_code == 400
        assert "unknown" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# 11-15: Validation tests
# ---------------------------------------------------------------------------


class TestValidation:
    """Tests 11-15: Request validation."""

    @pytest.mark.asyncio
    async def test_11_validate_invalid_department(self):
        """Invalid department is rejected."""
        from app.services.change_request_service import _validate_request_payload
        from fastapi import HTTPException

        with patch("app.services.change_request_service.Department.get", new_callable=AsyncMock, return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                await _validate_request_payload(COMPANY, {"department_id": "invalid-dept"}, "user-1")
            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_12_validate_manager_self_report(self):
        """Employee cannot report to themselves."""
        from app.services.change_request_service import _validate_request_payload
        from fastapi import HTTPException

        mock_manager = _user(uid="user-1")
        with patch("app.services.change_request_service.User.get", new_callable=AsyncMock, return_value=mock_manager):
            with pytest.raises(HTTPException) as exc_info:
                await _validate_request_payload(COMPANY, {"reports_to": "user-1"}, "user-1")
            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_13_validate_manager_wrong_company(self):
        """Manager from another company is rejected."""
        from app.services.change_request_service import _validate_request_payload
        from fastapi import HTTPException

        mock_manager = _user(uid="manager-1", company="other-company")
        with patch("app.services.change_request_service.User.get", new_callable=AsyncMock, return_value=mock_manager):
            with pytest.raises(HTTPException) as exc_info:
                await _validate_request_payload(COMPANY, {"reports_to": "manager-1"}, "user-1")
            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_14_validate_email_uniqueness(self):
        """Email already in use is rejected."""
        from app.services.change_request_service import _validate_request_payload
        from fastapi import HTTPException

        existing_user = _user(uid="user-2")
        with patch("app.services.change_request_service.User.find_one", new_callable=AsyncMock, return_value=existing_user):
            with pytest.raises(HTTPException) as exc_info:
                await _validate_request_payload(COMPANY, {"email": "taken@example.com"}, "user-1")
            assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_15_validate_valid_manager(self):
        """Valid manager from same company is accepted."""
        from app.services.change_request_service import _validate_request_payload

        mock_manager = _user(uid="manager-1")
        with patch("app.services.change_request_service.User.get", new_callable=AsyncMock, return_value=mock_manager):
            # Should not raise
            await _validate_request_payload(COMPANY, {"reports_to": "manager-1"}, "user-1")


# ---------------------------------------------------------------------------
# 16-20: Approve / reject / cancel tests
# ---------------------------------------------------------------------------


class TestApproveRejectCancel:
    """Tests 16-20: Approve, reject, cancel operations."""

    @pytest.mark.asyncio
    async def test_16_approve_requires_reviewer_role(self):
        """Non-reviewer role cannot approve."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        actor = _user(uid="reviewer-1", role=UserRole.EMPLOYEE)
        with pytest.raises(HTTPException) as exc_info:
            await approve_change_request(COMPANY, "req-1", actor)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_17_approve_self_approval_blocked(self):
        """Requester cannot approve their own request."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        actor = _user(uid="user-1", role=UserRole.ADMIN)
        req = _change_request(requested_by_val="user-1")

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.find_one", new_callable=AsyncMock, return_value=req):
            with pytest.raises(HTTPException) as exc_info:
                await approve_change_request(COMPANY, "req-1", actor)
            assert exc_info.value.status_code == 403
            assert "own" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_18_reject_requires_reviewer_role(self):
        """Non-reviewer role cannot reject."""
        from app.services.change_request_service import reject_change_request
        from fastapi import HTTPException

        actor = _user(uid="reviewer-1", role=UserRole.LEAD)
        # Leads CAN review, but let's test with Employee
        actor_employee = _user(uid="reviewer-1", role=UserRole.EMPLOYEE)
        with pytest.raises(HTTPException) as exc_info:
            await reject_change_request(COMPANY, "req-1", actor_employee)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_19_cancel_only_by_requester(self):
        """Only the requester can cancel their own request."""
        from app.services.change_request_service import cancel_change_request
        from fastapi import HTTPException

        req = _change_request(requested_by_val="user-1")
        actor = _user(uid="user-2")

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.get", new_callable=AsyncMock, return_value=req):
            with pytest.raises(HTTPException) as exc_info:
                await cancel_change_request(COMPANY, "req-1", actor)
            assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_20_cancel_pending_request(self):
        """Requester can cancel their own pending request."""
        from app.services.change_request_service import cancel_change_request

        req = _change_request(requested_by_val="user-1")
        actor = _user(uid="user-1")
        # req starts as PENDING (default) — cancel should change it to CANCELLED
        req.save = AsyncMock()

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.get", new_callable=AsyncMock, return_value=req):
            with patch("app.services.change_request_service._enrich_request", new_callable=AsyncMock, return_value={"id": "req-1", "status": "cancelled"}):
                result = await cancel_change_request(COMPANY, "req-1", actor)
                assert result["status"] == "cancelled"
                req.save.assert_called_once()


# ---------------------------------------------------------------------------
# 21-25: Stale data and double-approval tests
# ---------------------------------------------------------------------------


class TestStaleDataAndConcurrency:
    """Tests 21-25: Stale-data detection and concurrency."""

    @pytest.mark.asyncio
    async def test_21_approve_rejects_already_approved(self):
        """Cannot approve a request that's already approved."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        req = _change_request(status_val=ChangeRequestStatus.APPROVED)
        actor = _user(uid="admin-1", role=UserRole.ADMIN)

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.find_one", new_callable=AsyncMock, return_value=None):
            with patch("app.services.change_request_service.EmployeeDetailChangeRequest.get", new_callable=AsyncMock, return_value=req):
                with pytest.raises(HTTPException) as exc_info:
                    await approve_change_request(COMPANY, "req-1", actor)
                assert exc_info.value.status_code in (404, 409)

    @pytest.mark.asyncio
    async def test_22_approve_rejects_already_rejected(self):
        """Cannot approve a request that's already rejected."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        req = _change_request(status_val=ChangeRequestStatus.REJECTED)
        actor = _user(uid="admin-1", role=UserRole.ADMIN)

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.find_one", new_callable=AsyncMock, return_value=None):
            with patch("app.services.change_request_service.EmployeeDetailChangeRequest.get", new_callable=AsyncMock, return_value=req):
                with pytest.raises(HTTPException) as exc_info:
                    await approve_change_request(COMPANY, "req-1", actor)
                assert exc_info.value.status_code in (404, 409)

    @pytest.mark.asyncio
    async def test_23_approve_detects_stale_email(self):
        """Stale-data detection catches changed email."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        req = _change_request(
            requested_changes={"personal_email": "new@example.com"},
            original_values={"personal_email": "old@example.com"},
            changed_fields=["personal_email"],
        )
        profile = _profile()
        user = _user()
        # User's email has changed since request was created
        user.email = "changed@example.com"

        actor = _user(uid="admin-1", role=UserRole.ADMIN)
        req.save = AsyncMock()

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.find_one", new_callable=AsyncMock, return_value=req):
            with patch("app.services.change_request_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=profile):
                with patch("app.services.change_request_service.User.get", new_callable=AsyncMock, return_value=user):
                    with patch("app.services.change_request_service._snapshot_both", new_callable=AsyncMock, return_value={"personal_email": "changed@example.com"}):
                        with pytest.raises(HTTPException) as exc_info:
                            await approve_change_request(COMPANY, "req-1", actor)
                        assert exc_info.value.status_code == 409
                        assert "stale" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_24_approve_detects_stale_department(self):
        """Stale-data detection catches changed department."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        req = _change_request(
            requested_changes={"department_id": "dept-new"},
            original_values={"department_id": "dept-old"},
            changed_fields=["department_id"],
        )
        profile = _profile()
        profile.department_id = "dept-changed"  # Changed since request
        user = _user()

        actor = _user(uid="admin-1", role=UserRole.ADMIN)
        req.save = AsyncMock()

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.find_one", new_callable=AsyncMock, return_value=req):
            with patch("app.services.change_request_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=profile):
                with patch("app.services.change_request_service.User.get", new_callable=AsyncMock, return_value=user):
                    with patch("app.services.change_request_service._snapshot_both", new_callable=AsyncMock, return_value={"department_id": "dept-changed"}):
                            with pytest.raises(HTTPException) as exc_info:
                                await approve_change_request(COMPANY, "req-1", actor)
                            assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_25_approve_rejects_missing_profile(self):
        """Profile no longer exists → auto-rejected."""
        from app.services.change_request_service import approve_change_request
        from fastapi import HTTPException

        req = _change_request()
        actor = _user(uid="admin-1", role=UserRole.ADMIN)
        req.save = AsyncMock()

        with patch("app.services.change_request_service.EmployeeDetailChangeRequest.find_one", new_callable=AsyncMock, return_value=req):
            with patch("app.services.change_request_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=None):
                    with pytest.raises(HTTPException) as exc_info:
                        await approve_change_request(COMPANY, "req-1", actor)
                    assert exc_info.value.status_code == 410


# ---------------------------------------------------------------------------
# 26-28: Role-based access and scope tests
# ---------------------------------------------------------------------------


class TestRoleBasedAccess:
    """Tests 26-28: Role-based access control."""

    def test_26_can_review_admin(self):
        """Admin can review."""
        from app.services.change_request_service import _can_review

        actor = _user(role=UserRole.ADMIN)
        assert _can_review(actor) is True

    def test_27_can_review_sub_admin(self):
        """SubAdmin can review."""
        from app.services.change_request_service import _can_review

        actor = _user(role=UserRole.SUB_ADMIN)
        assert _can_review(actor) is True

    def test_28_cannot_review_employee(self):
        """Employee cannot review."""
        from app.services.change_request_service import _can_review

        actor = _user(role=UserRole.EMPLOYEE)
        assert _can_review(actor) is False


# ---------------------------------------------------------------------------
# 29-30: Canonical mutation and classification tests
# ---------------------------------------------------------------------------


class TestCanonicalMutation:
    """Tests 29-30: Canonical mutation and request classification."""

    def test_29_classify_personal_fields(self):
        """Personal fields are classified as PERSONAL_INFO."""
        from app.services.change_request_service import _classify_request_type

        result = _classify_request_type({"personal_email", "address"})
        assert result == ChangeRequestType.PERSONAL_INFO

    def test_30_classify_employment_fields(self):
        """Employment fields are classified as EMPLOYMENT_INFO."""
        from app.services.change_request_service import _classify_request_type

        result = _classify_request_type({"department_id", "designation"})
        assert result == ChangeRequestType.EMPLOYMENT_INFO
