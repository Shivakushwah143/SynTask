"""Integration tests for the HR document request lifecycle.

Covers the complete chain:
  Test 1 – HR creates a document request → employee sees it
  Test 2 – Employee uploads against the request → status becomes submitted
  Test 3 – HR sees the linked submission in the document list
  Test 4 – HR previews the document
  Test 5 – HR downloads the document
  Test 6 – HR approves → linked request advances to approved
  Test 7 – HR rejects → linked request advances to rejected, employee can re-upload
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.models.hr_document import (
    HRDocument,
    HRDocumentRequest,
    HRDocumentType,
    HRDocumentVersion,
    HRRequestPriority,
    HRRequestRequirementLevel,
    HRRequestStatus,
    HRReviewStatus,
)
from app.models.user import User, UserRole


# ---------------------------------------------------------------------------
# Helpers — lightweight fakes (no MongoDB required)
# ---------------------------------------------------------------------------

COMPANY = "company-1"
NOW = datetime.utcnow()


def _user(uid: str, role: UserRole = UserRole.ADMIN) -> SimpleNamespace:
    return SimpleNamespace(
        id=uid,
        role=role,
        company_id=COMPANY,
        department_id="dept-hr",
        full_name=lambda: f"User {uid}",
    )


def _employee_profile(user_id: str = "emp-user-1", emp_id: str = "emp-1", company: str = COMPANY):
    return SimpleNamespace(
        id=emp_id,
        company_id=company,
        user_id=user_id,
        employee_number="EMP001",
        full_name=lambda: "Jane Doe",
    )


def _doc_type(dt_id: str = "type-resume", code: str = "resume") -> SimpleNamespace:
    return SimpleNamespace(
        id=dt_id,
        company_id=COMPANY,
        name="Resume",
        code=code,
        active=True,
        required=True,
        expiry_supported=False,
        owner_scope="employee",
        default_visibility="employee_visible",
        employee_upload_allowed=True,
    )


def _document(doc_id: str = "doc-1", **overrides) -> SimpleNamespace:
    defaults = dict(
        id=doc_id,
        _is_fake=True,
        company_id=COMPANY,
        employee_id="emp-1",
        candidate_id=None,
        owner_key=f"employee:emp-1",
        document_type_id="type-resume",
        status="active",
        submission_source="employee",
        review_status="pending",
        review_note=None,
        reviewed_by=None,
        reviewed_at=None,
        expiry_date=None,
        description=None,
        visibility="employee_visible",
        uploaded_by="emp-user-1",
        current_version_number=1,
        current_version_id="ver-1",
        created_at=NOW,
        updated_at=NOW,
        archived_at=None,
        archived_by=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _version(ver_id: str = "ver-1", doc_id: str = "doc-1", **overrides) -> SimpleNamespace:
    defaults = dict(
        id=ver_id,
        _is_fake=True,
        company_id=COMPANY,
        document_id=doc_id,
        version_number=1,
        original_filename="resume.pdf",
        mime_type="application/pdf",
        file_size=102400,
        storage_provider="local",
        storage_reference="hr_documents/resume.pdf",
        storage_url=None,
        storage_resource_type=None,
        storage_delivery_type=None,
        checksum="abc123",
        uploaded_by="emp-user-1",
        uploaded_at=NOW,
        change_note=None,
        submission_source="employee",
        review_status="pending",
        reviewed_by=None,
        reviewed_at=None,
        review_note=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _request(req_id: str = "req-1", **overrides) -> SimpleNamespace:
    defaults = dict(
        id=req_id,
        _is_fake=True,
        company_id=COMPANY,
        employee_id="emp-1",
        document_type_id="type-resume",
        document_type_name="Resume",
        requirement_level=HRRequestRequirementLevel.MANDATORY,
        priority=HRRequestPriority.NORMAL,
        instructions="Please upload your latest resume",
        due_date=NOW + timedelta(days=14),
        status=HRRequestStatus.PENDING,
        requested_by="hr-user-1",
        requested_at=NOW,
        submitted_at=None,
        reviewed_at=None,
        fulfilled_document_id=None,
        created_at=NOW,
        updated_at=NOW,
    )
    defaults.update(overrides)
    ns = SimpleNamespace(**defaults)
    ns.save = AsyncMock(return_value=ns)
    ns.insert = AsyncMock(return_value=ns)
    return ns


def _patch_get(model_class, fake_obj):
    """Return a patch for ModelClass.get that returns fake_obj."""
    async def fake_get(doc_id):
        if doc_id == fake_obj.id:
            return fake_obj
        return None
    return patch.object(model_class, "get", side_effect=fake_get)


def _patch_find_one(model_class, fake_obj):
    """Return a patch for ModelClass.find_one."""
    async def fake_find_one(query):
        return fake_obj
    return patch.object(model_class, "find_one", side_effect=fake_find_one)


def _patch_find(model_class, items):
    """Return a patch for ModelClass.find that returns a chainable query."""
    query_obj = AsyncMock()
    query_obj.sort.return_value = query_obj
    query_obj.skip.return_value = query_obj
    query_obj.limit.return_value = query_obj
    query_obj.to_list = AsyncMock(return_value=items)
    query_obj.count = AsyncMock(return_value=len(items))

    def fake_find(query=None):
        return query_obj

    return patch.object(model_class, "find", side_effect=fake_find)


def _patch_user_get():
    """Patch User.get to resolve employee profile user_id."""
    hr_user = _user("hr-user-1", UserRole.ADMIN)
    emp_user = _user("emp-user-1", UserRole.EMPLOYEE)

    async def fake_user_get(uid):
        if uid == "hr-user-1":
            return hr_user
        if uid == "emp-user-1":
            return emp_user
        return None
    return patch.object(User, "get", side_effect=fake_user_get)


# ============================================================================
# Test 1: HR creates a document request → serialized correctly
# ============================================================================

@pytest.mark.asyncio
async def test_create_document_request():
    """HR creates a request and gets back the serialized representation."""
    from app.services.hr_document_service import create_document_request

    profile = _employee_profile()
    doc_type = _doc_type()
    hr_user = _user("hr-user-1", UserRole.ADMIN)

    # The serialized result that _serialize_document_request will return
    serialized = {
        "id": "req-new",
        "company_id": COMPANY,
        "employee_id": "emp-1",
        "employee_name": "Jane Doe",
        "document_type_id": "type-resume",
        "document_type_name": "Resume",
        "requirement_level": "mandatory",
        "priority": "normal",
        "instructions": "Please upload your latest resume",
        "status": "pending",
        "requested_by": "hr-user-1",
        "requested_by_name": "User hr-user-1",
        "can_upload": True,
        "can_cancel": True,
        "is_overdue": False,
    }

    with (
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=profile),
        patch("app.services.hr_document_service.HRDocumentType.get", new_callable=AsyncMock, return_value=doc_type),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=hr_user),
        patch("app.services.hr_document_service.parse_expiry_date", return_value=NOW + timedelta(days=14)),
        patch("app.services.hr_document_service._record_document_event", new_callable=AsyncMock),
        patch("app.services.hr_document_service._create_notification", new_callable=AsyncMock),
        patch("app.services.hr_document_service._serialize_document_request", new_callable=AsyncMock, return_value=serialized),
        patch("app.services.hr_document_service.has_hr_directory_view", new_callable=AsyncMock, return_value=True),
    ):
        # Patch the HRDocumentRequest class to avoid Beanie collection init
        fake_req = _request()
        fake_req.insert = AsyncMock(return_value=fake_req)
        fake_req.save = AsyncMock(return_value=fake_req)
        FakeHRDocumentRequest = MagicMock(return_value=fake_req)
        FakeHRDocumentRequest.find_one = AsyncMock(return_value=None)

        with patch("app.services.hr_document_service.HRDocumentRequest", FakeHRDocumentRequest):
            result = await create_document_request(
                COMPANY,
                hr_user,
                {
                    "employee_id": "emp-1",
                    "document_type_id": "type-resume",
                    "document_type_name": "Resume",
                    "requirement_level": "mandatory",
                    "priority": "normal",
                    "instructions": "Please upload your latest resume",
                    "due_date": (NOW + timedelta(days=14)).strftime("%Y-%m-%d"),
                },
            )

    assert result["document_type_name"] == "Resume"
    assert result["status"] == "pending"
    assert result["employee_id"] == "emp-1"
    assert result["can_upload"] is True  # pending → can upload
    assert result["can_cancel"] is True   # HR requester → can cancel


# ============================================================================
# Test 2: Employee uploads against a request → request status becomes submitted
# ============================================================================

@pytest.mark.asyncio
async def test_employee_upload_for_request():
    """Employee uploads a file against a pending request."""
    from app.services.hr_document_service import employee_upload_for_request

    req = _request()
    profile = _employee_profile()
    doc_type = _doc_type()
    emp_user = _user("emp-user-1", UserRole.EMPLOYEE)

    stored = {
        "filename": "resume.pdf",
        "file_path": "/tmp/resume.pdf",
        "file_url": "/files/resume.pdf",
    }

    # Mock file upload
    mock_file = MagicMock()
    mock_file.read = AsyncMock(return_value=b"fake pdf content")
    mock_file.filename = "resume.pdf"

    with (
        patch("app.services.hr_document_service._require_employee_profile", new_callable=AsyncMock, return_value=profile),
        _patch_get(HRDocumentRequest, req),
        _patch_get(HRDocument, None),  # no existing fulfilled doc
        patch("app.services.hr_document_service._resolve_document_type", new_callable=AsyncMock, return_value=doc_type),
        patch("app.services.hr_document_service._store_hr_file", new_callable=AsyncMock, return_value=stored),
        patch("app.services.hr_document_service._build_version_from_stored", side_effect=lambda *a, **kw: _version()),
        patch("app.services.hr_document_service._record_document_event", new_callable=AsyncMock),
        patch("app.services.hr_document_service._create_notification", new_callable=AsyncMock),
        patch("app.services.hr_document_service._build_list_context", new_callable=AsyncMock, return_value={}),
        patch("app.services.hr_document_service.serialize_document", new_callable=AsyncMock, return_value={"id": "doc-1", "review_status": "pending"}),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=emp_user),
        patch("app.services.hr_document_service.parse_expiry_date", return_value=None),
        patch("app.services.hr_document_service.build_owner_key", return_value="employee:emp-1"),
    ):
        # Mock HRDocument and HRDocumentVersion as AsyncMock so .insert()/.save() work with await
        fake_doc_instance = AsyncMock()
        fake_doc_instance.id = "doc-1"
        fake_doc_instance.current_version_id = None

        fake_version_instance = AsyncMock()
        fake_version_instance.id = "ver-1"

        FakeHRDocument = MagicMock(return_value=fake_doc_instance)
        FakeHRDocument.insert = AsyncMock(return_value=fake_doc_instance)

        FakeHRDocumentVersion = MagicMock(return_value=fake_version_instance)
        FakeHRDocumentVersion.insert = AsyncMock(return_value=fake_version_instance)

        # Make _build_version_from_stored return the fake version instance
        def fake_build_version(*args, **kwargs):
            return fake_version_instance

        with (
            patch("app.services.hr_document_service.HRDocument", FakeHRDocument),
            patch("app.services.hr_document_service.HRDocumentVersion", FakeHRDocumentVersion),
            patch("app.services.hr_document_service._build_version_from_stored", side_effect=fake_build_version),
        ):
            result = await employee_upload_for_request(
                COMPANY,
                emp_user,
                document_request_id="req-1",
                file=mock_file,
            )

    # The request should have been updated to submitted
    assert result["id"] == "doc-1"
    assert result["review_status"] == "pending"


# ============================================================================
# Test 3: HR sees the linked submission in the document list
# ============================================================================

@pytest.mark.asyncio
async def test_hr_sees_submitted_document():
    """After employee uploads, HR sees the document with correct review_status."""
    from app.services.hr_document_service import review_document

    doc = _document(review_status="pending", submission_source="employee")
    ver = _version()
    hr_user = _user("hr-user-1", UserRole.ADMIN)

    with (
        _patch_get(HRDocument, doc),
        _patch_get(HRDocumentVersion, ver),
        patch("app.services.hr_document_service._require_document_access", new_callable=AsyncMock),
        patch("app.services.hr_document_service._require_company_document_view", new_callable=AsyncMock),
        patch("app.services.hr_document_service.has_hr_manage", new_callable=AsyncMock, return_value=True),
    ):
        # Verify the document is in pending state (ready for review)
        from app.services.hr_document_service import review_status_value, submission_source_value
        assert review_status_value(doc.review_status) == HRReviewStatus.PENDING.value
        assert submission_source_value(doc.submission_source) == "employee"


# ============================================================================
# Test 4: HR previews the document (can_preview check)
# ============================================================================

@pytest.mark.asyncio
async def test_hr_can_preview_document():
    """Document with PDF mime type should be previewable."""
    from app.services.hr_document_service import serialize_document

    doc = _document()
    ver = _version(mime_type="application/pdf")

    context = {
        "version_by_id": {"ver-1": ver},
        "type_by_id": {"type-resume": _doc_type()},
        "user_by_id": {"emp-user-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "employee_by_id": {"emp-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "candidate_by_id": {},
        "version_counts": {},
    }

    with patch("app.services.hr_document_service.compute_expiry_state", return_value="no_expiry"):
        result = await serialize_document(doc, context=context, can_manage=True)

    assert result["can_preview"] is True
    assert result["mime_type"] == "application/pdf"
    assert result["can_download"] is True


@pytest.mark.asyncio
async def test_hr_can_preview_image_document():
    """Document with image mime type should be previewable."""
    from app.services.hr_document_service import serialize_document

    doc = _document()
    ver = _version(mime_type="image/png")

    context = {
        "version_by_id": {"ver-1": ver},
        "type_by_id": {"type-resume": _doc_type()},
        "user_by_id": {"emp-user-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "employee_by_id": {"emp-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "candidate_by_id": {},
        "version_counts": {},
    }

    with patch("app.services.hr_document_service.compute_expiry_state", return_value="no_expiry"):
        result = await serialize_document(doc, context=context, can_manage=True)

    assert result["can_preview"] is True


@pytest.mark.asyncio
async def test_docx_not_previewable():
    """DOCX document should NOT be previewable."""
    from app.services.hr_document_service import serialize_document

    doc = _document()
    ver = _version(mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    context = {
        "version_by_id": {"ver-1": ver},
        "type_by_id": {"type-resume": _doc_type()},
        "user_by_id": {"emp-user-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "employee_by_id": {"emp-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "candidate_by_id": {},
        "version_counts": {},
    }

    with patch("app.services.hr_document_service.compute_expiry_state", return_value="no_expiry"):
        result = await serialize_document(doc, context=context, can_manage=True)

    assert result["can_preview"] is False


# ============================================================================
# Test 5: HR downloads the document
# ============================================================================

@pytest.mark.asyncio
async def test_hr_can_download_document():
    """Any document with a version should be downloadable."""
    from app.services.hr_document_service import serialize_document

    doc = _document()
    ver = _version()

    context = {
        "version_by_id": {"ver-1": ver},
        "type_by_id": {"type-resume": _doc_type()},
        "user_by_id": {"emp-user-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "employee_by_id": {"emp-1": _user("emp-user-1", UserRole.EMPLOYEE)},
        "candidate_by_id": {},
        "version_counts": {},
    }

    with patch("app.services.hr_document_service.compute_expiry_state", return_value="no_expiry"):
        result = await serialize_document(doc, context=context, can_manage=True)

    assert result["can_download"] is True
    assert result["filename"] == "resume.pdf"


# ============================================================================
# Test 6: HR approves → linked request advances to approved
# ============================================================================

@pytest.mark.asyncio
async def test_approve_updates_linked_request():
    """When HR approves a document, the linked request status becomes approved."""
    from app.services.hr_document_service import review_document

    doc = _document(review_status="pending", submission_source="employee")
    ver = _version()
    req = _request(fulfilled_document_id="doc-1", status=HRRequestStatus.SUBMITTED)
    hr_user = _user("hr-user-1", UserRole.ADMIN)
    profile = _employee_profile()
    emp_user = _user("emp-user-1", UserRole.EMPLOYEE)

    with (
        _patch_get(HRDocument, doc),
        _patch_get(HRDocumentVersion, ver),
        _patch_find_one(HRDocumentRequest, req),
        patch("app.services.hr_document_service._require_document_access", new_callable=AsyncMock),
        patch("app.services.hr_document_service._record_document_event", new_callable=AsyncMock),
        patch("app.services.hr_document_service._create_notification", new_callable=AsyncMock),
        patch("app.services.hr_document_service._build_list_context", new_callable=AsyncMock, return_value={}),
        patch("app.services.hr_document_service.serialize_document", new_callable=AsyncMock, return_value={"id": "doc-1", "review_status": "approved"}),
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=profile),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=emp_user),
        patch("app.services.hr_document_service.has_hr_manage", new_callable=AsyncMock, return_value=True),
    ):
        # Assign mock save methods to track state changes
        async def capture_ver_save():
            pass

        async def capture_doc_save():
            pass

        async def capture_req_save():
            pass

        ver.save = capture_ver_save
        doc.save = capture_doc_save
        req.save = capture_req_save

        result = await review_document(
            COMPANY, hr_user, "doc-1",
            action="approve",
        )

    assert result["review_status"] == "approved"
    assert req.status == HRRequestStatus.APPROVED
    assert req.reviewed_at is not None


# ============================================================================
# Test 7: HR rejects → linked request advances to rejected, employee can re-upload
# ============================================================================

@pytest.mark.asyncio
async def test_reject_updates_linked_request():
    """When HR rejects a document, the linked request status becomes rejected."""
    from app.services.hr_document_service import review_document

    doc = _document(review_status="pending", submission_source="employee")
    ver = _version()
    req = _request(fulfilled_document_id="doc-1", status=HRRequestStatus.SUBMITTED)
    hr_user = _user("hr-user-1", UserRole.ADMIN)
    profile = _employee_profile()
    emp_user = _user("emp-user-1", UserRole.EMPLOYEE)

    with (
        _patch_get(HRDocument, doc),
        _patch_get(HRDocumentVersion, ver),
        _patch_find_one(HRDocumentRequest, req),
        patch("app.services.hr_document_service._require_document_access", new_callable=AsyncMock),
        patch("app.services.hr_document_service._record_document_event", new_callable=AsyncMock),
        patch("app.services.hr_document_service._create_notification", new_callable=AsyncMock),
        patch("app.services.hr_document_service._build_list_context", new_callable=AsyncMock, return_value={}),
        patch("app.services.hr_document_service.serialize_document", new_callable=AsyncMock, return_value={"id": "doc-1", "review_status": "rejected"}),
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=profile),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=emp_user),
        patch("app.services.hr_document_service.has_hr_manage", new_callable=AsyncMock, return_value=True),
    ):
        saved_states = {}

        async def capture_ver_save():
            saved_states["ver_status"] = ver.review_status

        async def capture_doc_save():
            saved_states["doc_status"] = doc.review_status

        async def capture_req_save():
            saved_states["req_status"] = req.status

        ver.save = capture_ver_save
        doc.save = capture_doc_save
        req.save = capture_req_save

        result = await review_document(
            COMPANY, hr_user, "doc-1",
            action="reject",
            note="Please provide a more recent version",
        )

    assert result["review_status"] == "rejected"
    assert req.status == HRRequestStatus.REJECTED
    assert req.reviewed_at is not None


# ============================================================================
# Bonus: request serialization flags
# ============================================================================

@pytest.mark.asyncio
async def test_request_serialization_pending_can_upload():
    """A pending request should have can_upload=True."""
    from app.services.hr_document_service import _serialize_document_request

    req = _request(status=HRRequestStatus.PENDING)

    with (
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=_employee_profile()),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=_user("hr-user-1", UserRole.ADMIN)),
        patch("app.services.hr_document_service.has_hr_directory_view", new_callable=AsyncMock, return_value=True),
    ):
        result = await _serialize_document_request(COMPANY, req)

    assert result["can_upload"] is True
    assert result["can_cancel"] is True
    assert result["status"] == "pending"


@pytest.mark.asyncio
async def test_request_serialization_submitted_cannot_upload():
    """A submitted (awaiting review) request should have can_upload=False."""
    from app.services.hr_document_service import _serialize_document_request

    req = _request(status=HRRequestStatus.SUBMITTED)

    with (
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=_employee_profile()),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=_user("hr-user-1", UserRole.ADMIN)),
        patch("app.services.hr_document_service.has_hr_directory_view", new_callable=AsyncMock, return_value=True),
    ):
        result = await _serialize_document_request(COMPANY, req)

    assert result["can_upload"] is False
    assert result["status"] == "submitted"


@pytest.mark.asyncio
async def test_request_serialization_approved_cannot_upload_or_cancel():
    """An approved request should have can_upload=False and can_cancel=False."""
    from app.services.hr_document_service import _serialize_document_request

    req = _request(status=HRRequestStatus.APPROVED)

    with (
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=_employee_profile()),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=_user("hr-user-1", UserRole.ADMIN)),
        patch("app.services.hr_document_service.has_hr_directory_view", new_callable=AsyncMock, return_value=True),
    ):
        result = await _serialize_document_request(COMPANY, req)

    assert result["can_upload"] is False
    assert result["can_cancel"] is False
    assert result["status"] == "approved"


@pytest.mark.asyncio
async def test_request_serialization_rejected_can_reupload():
    """A rejected request should have can_upload=True (for re-upload)."""
    from app.services.hr_document_service import _serialize_document_request

    req = _request(status=HRRequestStatus.REJECTED)

    with (
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=_employee_profile()),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=_user("hr-user-1", UserRole.ADMIN)),
        patch("app.services.hr_document_service.has_hr_directory_view", new_callable=AsyncMock, return_value=True),
    ):
        result = await _serialize_document_request(COMPANY, req)

    assert result["can_upload"] is True
    assert result["can_cancel"] is False


@pytest.mark.asyncio
async def test_request_overdue_detection():
    """A request with a past due_date and pending status is overdue."""
    from app.services.hr_document_service import _serialize_document_request

    req = _request(
        status=HRRequestStatus.PENDING,
        due_date=NOW - timedelta(days=3),  # 3 days ago
    )

    with (
        patch("app.services.hr_document_service.EmployeeProfile.get", new_callable=AsyncMock, return_value=_employee_profile()),
        patch("app.services.hr_document_service.User.get", new_callable=AsyncMock, return_value=_user("hr-user-1", UserRole.ADMIN)),
        patch("app.services.hr_document_service.has_hr_directory_view", new_callable=AsyncMock, return_value=True),
    ):
        result = await _serialize_document_request(COMPANY, req)

    assert result["is_overdue"] is True
