"""
Phase 2 HRMS — HR Document Management tests.

Unit tests in the repository's style: pure functions where possible, small
fakes injected via monkeypatch for the Beanie model layer. No live MongoDB.
Covers document types, upload/list/update/replace/archive, versioning, expiry
states, ownership/company/visibility security, and storage-failure behavior.
"""
import re
from datetime import datetime, timedelta
from pathlib import Path

from bson import ObjectId

import pytest
from fastapi import HTTPException

from app.core.clock import utc_now
from app.models.department import DepartmentType
from app.models.employee_profile import EmploymentStatus
from app.models.hr_document import (
    HRDocumentStatus,
    HRDocumentVisibility,
    build_owner_key,
)
from app.models.user import UserRole
from app.services import hr_document_service as svc
from app.services.hr_document_service import (
    compute_expiry_state,
    create_document_type,
    deactivate_document_type,
    ensure_default_document_types,
    get_document,
    list_document_types,
    list_documents,
    missing_required_documents,
    parse_expiry_date,
    replace_document,
    update_document,
    upload_document,
)


# =============================================================================
# Expiry calculation
# =============================================================================


def test_compute_expiry_state_no_expiry():
    assert compute_expiry_state(None) == "no_expiry"


def test_compute_expiry_state_valid_expiring_expired():
    today = utc_now().date()
    assert compute_expiry_state(datetime(today.year + 1, 1, 1), today=today) == "valid"
    assert compute_expiry_state(datetime(today.year, today.month, today.day) + timedelta(days=15), today=today) == "expiring_soon"
    assert compute_expiry_state(datetime(today.year, today.month, today.day) - timedelta(days=1), today=today) == "expired"


def test_parse_expiry_date_valid_and_invalid():
    parsed = parse_expiry_date("2030-12-31")
    assert parsed == datetime(2030, 12, 31, 0, 0, 0)
    assert parse_expiry_date(None) is None
    with pytest.raises(HTTPException) as exc:
        parse_expiry_date("31/12/2030")
    assert exc.value.status_code == 400


# =============================================================================
# Fakes
# =============================================================================

def _norm(value):
    """Normalize enum values so string query filters match enum fields."""
    if isinstance(value, str) and not hasattr(value, "value"):
        return value
    if hasattr(value, "value"):
        return value.value
    return value


def _get_path(obj, key):
    if key == "_id":
        return getattr(obj, "id", None)
    value = obj
    for part in str(key).split("."):
        if isinstance(value, dict):
            value = value.get(part)
        else:
            value = getattr(value, part, None)
        if value is None:
            return None
    return value


def _matches(query, obj):
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(sub, obj) for sub in expected):
                return False
            continue
        actual = _norm(_get_path(obj, key))
        expected_norm = _norm(expected)
        if isinstance(expected, dict) and any(op.startswith("$") for op in expected):
            for op, value in expected.items():
                if op == "$in":
                    if actual is None or str(actual) not in {str(_norm(v)) for v in value}:
                        return False
                elif op == "$nin":
                    if actual is not None and str(actual) in {str(_norm(v)) for v in value}:
                        return False
                elif op == "$ne":
                    if actual == _norm(value):
                        return False
                elif op == "$regex":
                    if actual is None or not re.search(value, str(actual), re.IGNORECASE):
                        return False
                elif op == "$gte":
                    if actual is None or actual < _norm(value):
                        return False
                elif op == "$gt":
                    if actual is None or actual <= _norm(value):
                        return False
                elif op == "$lte":
                    if actual is None or actual > _norm(value):
                        return False
            continue
        if expected is None:
            if actual is not None:
                return False
        elif actual != expected_norm and str(actual) != str(expected_norm):
            return False
    return True


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self._skip_n = 0
        self._limit_n = None
        self._sort_spec = None

    def sort(self, *args, **kwargs):
        self._sort_spec = args
        return self

    def skip(self, n):
        self._skip_n = n
        return self

    def limit(self, n):
        self._limit_n = n
        return self

    async def count(self):
        return len(self._docs)

    async def to_list(self):
        docs = list(self._docs)
        if self._sort_spec:
            key = self._sort_spec[0]
            direction = self._sort_spec[1] if len(self._sort_spec) > 1 else 1
            docs.sort(key=lambda doc: _norm(_get_path(doc, key)) or 0, reverse=(direction == -1))
        return docs[self._skip_n:][: self._limit_n] if self._limit_n else docs[self._skip_n:]


class FakeCollection:
    def __init__(self, cls):
        self.cls = cls

    def aggregate(self, pipeline):
        return FakeCursor([])

    async def find_one_and_update(self, query, update, return_document=None):
        for doc in self.cls._all:
            if _matches(query, doc):
                for field, amount in (update.get("$inc") or {}).items():
                    setattr(doc, field, getattr(doc, field, 0) + amount)
                result = {}
                for field, value in vars(doc).items():
                    if not field.startswith("_"):
                        result[field] = value
                result["_id"] = doc.id
                return result
        return None


class FakeModel:
    _all: list = []
    _by_id: dict = {}
    # Class-level defaults so the service can read fields never set.
    company_id = None
    id = None
    created_at = None
    updated_at = None

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
        if not getattr(self, "id", None):
            self.id = str(ObjectId())
        if getattr(self, "created_at", None) is None:
            self.created_at = utc_now()
        if getattr(self, "updated_at", None) is None:
            self.updated_at = utc_now()
        self._inserted = False

    async def insert(self):
        self._inserted = True
        self.__class__._all.append(self)
        self.__class__._by_id[self.id] = self
        return self

    async def save(self):
        return self

    async def delete(self):
        if self in self.__class__._all:
            self.__class__._all.remove(self)
        self.__class__._by_id.pop(self.id, None)

    @classmethod
    async def get(cls, model_id):
        if model_id is None:
            return None
        return cls._by_id.get(str(model_id))

    @classmethod
    async def find_one(cls, query):
        for doc in cls._all:
            if _matches(query, doc):
                return doc
        return None

    @classmethod
    def find(cls, query):
        return FakeCursor([doc for doc in cls._all if _matches(query, doc)])


class FakeHRDocumentType(FakeModel):
    _all = []
    _by_id = {}
    name = None
    code = None
    description = None
    owner_scope = None
    required = False
    expiry_supported = True
    default_visibility = None
    active = True
    created_by = None


class FakeHRDocument(FakeModel):
    _all = []
    _by_id = {}
    collection = None
    employee_id = None
    candidate_id = None
    owner_key = None
    document_type_id = None
    current_version_id = None
    current_version_number = 0
    status = None
    expiry_date = None
    description = None
    visibility = None
    uploaded_by = None
    archived_at = None
    archived_by = None


class FakeHRDocumentVersion(FakeModel):
    _all = []
    _by_id = {}
    document_id = None
    version_number = 0
    original_filename = None
    mime_type = None
    file_size = 0
    storage_provider = "local"
    storage_reference = None
    storage_url = None
    storage_resource_type = None
    storage_delivery_type = None
    checksum = None
    uploaded_by = None
    uploaded_at = None
    change_note = None


class FakeUser(FakeModel):
    _all = []
    _by_id = {}
    department_id = None
    modules = []

    def __init__(self, **kwargs):
        kwargs.setdefault("status", "active")
        kwargs.setdefault("role", UserRole.EMPLOYEE)
        kwargs.setdefault("company_id", "company-1")
        super().__init__(**kwargs)

    def full_name(self):
        return f"{getattr(self, 'first_name', '')} {getattr(self, 'last_name', '')}".strip()


class FakeEmployeeProfile(FakeModel):
    _all = []
    _by_id = {}
    employee_number = None
    department_id = None
    designation = None
    employment_status = EmploymentStatus.ACTIVE


class FakeCandidate(FakeModel):
    _all = []
    _by_id = {}
    full_name = "Jane Candidate"


class FakeDepartment(FakeModel):
    _all = []
    _by_id = {}
    company_id = None
    deleted_at = None
    department_type = None


class FakeUploadFile:
    def __init__(self, content: bytes, filename: str = "document.pdf"):
        self.content = content
        self.filename = filename

    async def read(self):
        return self.content


def _install_models(monkeypatch, tmp_path):
    for cls in (FakeHRDocumentType, FakeHRDocument, FakeHRDocumentVersion, FakeUser, FakeEmployeeProfile, FakeCandidate, FakeDepartment):
        cls._all = []
        cls._by_id = {}
    FakeHRDocument.collection = FakeCollection(FakeHRDocument)
    FakeHRDocumentVersion.collection = FakeCollection(FakeHRDocumentVersion)

    monkeypatch.setattr(svc, "HRDocumentType", FakeHRDocumentType)
    monkeypatch.setattr(svc, "HRDocument", FakeHRDocument)
    monkeypatch.setattr(svc, "HRDocumentVersion", FakeHRDocumentVersion)
    monkeypatch.setattr(svc, "User", FakeUser)
    monkeypatch.setattr(svc, "EmployeeProfile", FakeEmployeeProfile)
    monkeypatch.setattr(svc, "Candidate", FakeCandidate)
    monkeypatch.setattr(svc, "Department", FakeDepartment)

    # Default seeded types so uploads resolve (enum values, like real data).
    from app.models.hr_document import HROwnerScope

    def _seed_type(**kwargs):
        doc_type = FakeHRDocumentType(**kwargs)
        FakeHRDocumentType._all.append(doc_type)
        FakeHRDocumentType._by_id[doc_type.id] = doc_type
        return doc_type

    _seed_type(company_id="company-1", name="PAN Card", code="pan", active=True, owner_scope=HROwnerScope.BOTH, expiry_supported=True, required=False, default_visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE)
    _seed_type(company_id="company-1", name="Bank Document", code="bank_document", active=True, owner_scope=HROwnerScope.EMPLOYEE, expiry_supported=False, required=True, default_visibility=HRDocumentVisibility.HR_ONLY)
    _seed_type(company_id="company-1", name="Inactive Type", code="inactive", active=False, owner_scope=HROwnerScope.BOTH, expiry_supported=True, required=False, default_visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE)
    _seed_type(company_id="company-2", name="Offer Letter", code="offer_letter", active=True, owner_scope=HROwnerScope.BOTH, expiry_supported=True, required=False, default_visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE)


def _install_storage(monkeypatch, tmp_path):
    upload_dir = tmp_path / "uploads"
    (upload_dir / "hr_documents").mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(svc.FileService, "resolve_upload_dir", lambda: upload_dir)

    async def fake_store(file, *, upload_dir, url_prefix, scope, sensitive=True):
        content = file.file.read() if hasattr(file, "file") else file.content
        filename = file.filename or "document.pdf"
        ext = Path(filename).suffix.lower()
        unique = f"{len(list(upload_dir.rglob('*')))}-{filename}"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / unique
        file_path.write_bytes(content)
        return {
            "file_path": file_path,
            "file_url": f"{url_prefix}/{unique}",
            "filename": filename,
            "size": len(content),
            "type": "application/pdf",
            "extension": ext,
            "unique_filename": unique,
        }

    monkeypatch.setattr(svc.FileService, "store_uploaded_file", fake_store)
    monkeypatch.setattr(svc.FileService, "detect_mime_type", lambda content, filename: "application/pdf" if Path(filename).suffix.lower() in (".pdf", ".doc", ".docx") else "image/png")
    monkeypatch.setattr(svc.CloudinaryStorage, "enabled", staticmethod(lambda: False))
    monkeypatch.setattr(svc.CloudinaryStorage, "delete", staticmethod(lambda *a, **k: None))

    import app.recruitment.events as events_module

    async def _noop_publish(**kwargs):
        return None

    monkeypatch.setattr(events_module, "publish_recruitment_event", _noop_publish)


def _install_permissions(monkeypatch):
    async def fake_get_capabilities(department_type, role, company_id):
        if department_type == DepartmentType.HR:
            return {"employee_management.view", "employee_management.manage"}
        return set()

    import app.models.capability as capability_module

    monkeypatch.setattr(capability_module, "get_capabilities_for_role", fake_get_capabilities)


def _make_admin(company="company-1", user_id="admin-1"):
    return FakeUser(id=user_id, role=UserRole.ADMIN, company_id=company, first_name="HR", last_name="Admin", email="admin@example.com")


def _make_employee(user_id="u-1", company="company-1", profile_id="p-1"):
    user = FakeUser(id=user_id, role=UserRole.EMPLOYEE, company_id=company, first_name="Jane", last_name="Doe", email="jane@example.com")
    profile = FakeEmployeeProfile(id=profile_id, company_id=company, user_id=user_id, employment_status=EmploymentStatus.ACTIVE)
    FakeUser._all.append(user)
    FakeUser._by_id[user_id] = user
    FakeEmployeeProfile._all.append(profile)
    FakeEmployeeProfile._by_id[profile_id] = profile
    return user, profile


def _make_hr_department_user(user_id="hr-1", company="company-1"):
    dept = FakeDepartment(id="dept-hr", company_id=company, department_type=DepartmentType.HR, deleted_at=None)
    FakeDepartment._all.append(dept)
    FakeDepartment._by_id["dept-hr"] = dept
    user = FakeUser(id=user_id, role=UserRole.EMPLOYEE, company_id=company, department_id="dept-hr", first_name="HR", last_name="Staff")
    FakeUser._all.append(user)
    FakeUser._by_id[user_id] = user
    return user


def _make_document(company="company-1", employee_id="p-1", candidate_id=None, **kwargs):
    defaults = {
        "company_id": company,
        "employee_id": employee_id if not candidate_id else None,
        "candidate_id": candidate_id,
        "owner_key": build_owner_key(employee_id=employee_id if not candidate_id else None, candidate_id=candidate_id),
        "document_type_id": None,
        "status": HRDocumentStatus.ACTIVE,
        "visibility": HRDocumentVisibility.EMPLOYEE_VISIBLE,
        "current_version_number": 0,
    }
    defaults.update(kwargs)
    doc = FakeHRDocument(**defaults)
    FakeHRDocument._all.append(doc)
    FakeHRDocument._by_id[doc.id] = doc
    return doc


def _make_version(document, number, uploaded_by=None, filename="aadhaar.pdf", uploaded_at=None):
    version = FakeHRDocumentVersion(
        company_id=document.company_id,
        document_id=document.id,
        version_number=number,
        original_filename=filename,
        mime_type="application/pdf",
        file_size=1234,
        storage_provider="local",
        storage_reference=f"hr_documents/{number}.pdf",
        storage_url=f"/uploads/hr_documents/{number}.pdf",
        uploaded_by=uploaded_by,
        uploaded_at=uploaded_at or utc_now(),
    )
    FakeHRDocumentVersion._all.append(version)
    FakeHRDocumentVersion._by_id[version.id] = version
    return version


@pytest.fixture(autouse=True)
def _clean_fakes():
    for cls in (FakeHRDocumentType, FakeHRDocument, FakeHRDocumentVersion, FakeUser, FakeEmployeeProfile, FakeCandidate, FakeDepartment):
        cls._all = []
        cls._by_id = {}
    yield
    for cls in (FakeHRDocumentType, FakeHRDocument, FakeHRDocumentVersion, FakeUser, FakeEmployeeProfile, FakeCandidate, FakeDepartment):
        cls._all = []
        cls._by_id = {}


# =============================================================================
# Document Types
# =============================================================================


@pytest.mark.asyncio
async def test_create_document_type_success(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    actor = _make_admin()
    doc_type = await create_document_type("company-1", actor, {"name": "Salary Slip", "code": "salary_slip", "required": True})
    assert doc_type.code == "salary_slip"
    assert doc_type.required is True
    assert len(FakeHRDocumentType._all) == 5  # 4 seeded + 1 created


@pytest.mark.asyncio
async def test_create_document_type_duplicate_code_rejected(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    actor = _make_admin()
    await create_document_type("company-1", actor, {"name": "Salary Slip", "code": "salary_slip"})
    with pytest.raises(HTTPException) as exc:
        await create_document_type("company-1", actor, {"name": "Salary Slip Duplicate", "code": "salary_slip"})
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_create_document_type_company_scoped(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    actor = _make_admin()
    # The seeded "pan" already exists in company-1; the same code in another
    # company is a different tenant and must be allowed.
    doc_type = await create_document_type("company-2", actor, {"name": "PAN", "code": "pan"})
    assert doc_type.company_id == "company-2"
    assert doc_type.code == "pan"


@pytest.mark.asyncio
async def test_deactivate_document_type_is_soft(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    actor = _make_admin()
    pan = await FakeHRDocumentType.find_one({"code": "pan"})
    doc_type = await deactivate_document_type("company-1", pan.id, actor)
    assert doc_type.active is False
    # Historical reference is preserved (record still exists).
    assert await FakeHRDocumentType.get(pan.id) is not None


@pytest.mark.asyncio
async def test_deactivate_document_type_cross_company_not_found(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    actor = _make_admin()
    pan = await FakeHRDocumentType.find_one({"code": "pan"})
    with pytest.raises(HTTPException) as exc:
        await deactivate_document_type("company-2", pan.id, actor)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_ensure_default_document_types_idempotent(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    # FakeHRDocumentType._all already contains 4 seeded types; clear them to test seeding.
    FakeHRDocumentType._all = []
    FakeHRDocumentType._by_id = {}
    created = await ensure_default_document_types("company-1")
    assert created == len(svc.DEFAULT_DOCUMENT_TYPES)
    created_again = await ensure_default_document_types("company-1")
    assert created_again == 0
    assert len(FakeHRDocumentType._all) == len(svc.DEFAULT_DOCUMENT_TYPES)


@pytest.mark.asyncio
async def test_list_document_types_active_only_and_empty(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    active = await list_document_types("company-1")
    assert {item.code for item in active} == {"pan", "bank_document"}

    FakeHRDocumentType._all = [item for item in FakeHRDocumentType._all if item.company_id != "company-1"]
    empty = await list_document_types("company-1")
    assert empty == []


@pytest.mark.asyncio
async def test_list_document_types_company_isolation(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    company_1 = await list_document_types("company-1", include_inactive=True, active_only=False)
    company_2 = await list_document_types("company-2", include_inactive=True, active_only=False)

    assert {item.company_id for item in company_1} == {"company-1"}
    assert {item.code for item in company_1} == {"pan", "bank_document", "inactive"}
    assert {item.company_id for item in company_2} == {"company-2"}
    assert {item.code for item in company_2} == {"offer_letter"}


@pytest.mark.asyncio
async def test_hr_department_user_can_list_document_types(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    hr_user = _make_hr_department_user()

    assert await svc.has_hr_directory_view(hr_user) is True
    types = await list_document_types(hr_user.company_id)
    assert {item.code for item in types} == {"pan", "bank_document"}


# =============================================================================
# Upload
# =============================================================================


@pytest.mark.asyncio
async def test_upload_employee_document_creates_document_and_v1(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    result = await upload_document(
        "company-1", admin,
        employee_id="p-1",
        document_type_id=pan.id,
        file=FakeUploadFile(b"%PDF-1.4 test", "aadhaar.pdf"),
        expiry_date="2030-12-31",
        description="Identity proof",
    )
    assert result["owner_type"] == "employee"
    assert result["current_version"] == 1
    assert result["filename"] == "aadhaar.pdf"
    assert result["expiry_state"] == "valid"
    assert result["can_replace"] is True
    docs = [d for d in FakeHRDocument._all if d.employee_id == "p-1"]
    assert len(docs) == 1
    assert docs[0].owner_key == "employee:p-1"
    assert len(FakeHRDocumentVersion._all) == 1


@pytest.mark.asyncio
async def test_upload_candidate_document(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    candidate = FakeCandidate(id=str(ObjectId()), company_id="company-1", full_name="Bob Smith")
    FakeCandidate._all.append(candidate)
    FakeCandidate._by_id[candidate.id] = candidate
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    result = await upload_document(
        "company-1", admin,
        candidate_id=candidate.id,
        document_type_id=pan.id,
        file=FakeUploadFile(b"%PDF-1.4 test", "resume.pdf"),
    )
    assert result["owner_type"] == "candidate"
    assert result["candidate_name"] == "Bob Smith"


@pytest.mark.asyncio
async def test_upload_requires_manage_permission(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    employee, profile = _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", employee,
            employee_id="p-1",
            document_type_id=pan.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "aadhaar.pdf"),
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_upload_invalid_file_type_rejected(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            employee_id="p-1",
            document_type_id=pan.id,
            file=FakeUploadFile(b"evil", "payload.exe"),
        )
    assert exc.value.status_code == 400
    assert FakeHRDocument._all == []


@pytest.mark.asyncio
async def test_upload_missing_employee_not_found(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            employee_id="p-missing",
            document_type_id=pan.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "a.pdf"),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_upload_cross_company_owner_not_found(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    # Owner exists in another company.
    other = FakeEmployeeProfile(id="p-other", company_id="company-2", user_id="u-other")
    FakeEmployeeProfile._all.append(other)
    FakeEmployeeProfile._by_id["p-other"] = other
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            employee_id="p-other",
            document_type_id=pan.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "a.pdf"),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_upload_inactive_document_type_rejected(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    inactive = await FakeHRDocumentType.find_one({"code": "inactive"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            employee_id="p-1",
            document_type_id=inactive.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "a.pdf"),
        )
    assert exc.value.status_code == 400
    assert "inactive" in exc.value.detail


@pytest.mark.asyncio
async def test_upload_employee_only_type_rejected_for_candidate(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    candidate = FakeCandidate(id="cand-1", company_id="company-1")
    FakeCandidate._all.append(candidate)
    FakeCandidate._by_id["cand-1"] = candidate
    bank = await FakeHRDocumentType.find_one({"code": "bank_document"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            candidate_id="cand-1",
            document_type_id=bank.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "bank.pdf"),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_upload_expiry_on_non_expiry_type_rejected(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    bank = await FakeHRDocumentType.find_one({"code": "bank_document"})

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            employee_id="p-1",
            document_type_id=bank.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "bank.pdf"),
            expiry_date="2030-12-31",
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_upload_storage_failure_creates_no_document(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    async def failing_store(*args, **kwargs):
        raise HTTPException(status_code=502, detail="Cloudinary upload failed")

    monkeypatch.setattr(svc.FileService, "store_uploaded_file", failing_store)

    with pytest.raises(HTTPException) as exc:
        await upload_document(
            "company-1", admin,
            employee_id="p-1",
            document_type_id=pan.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "a.pdf"),
        )
    assert exc.value.status_code == 502
    # No metadata may exist pointing at a non-existent file.
    assert FakeHRDocument._all == []
    assert FakeHRDocumentVersion._all == []


@pytest.mark.asyncio
async def test_upload_metadata_failure_cleans_stored_file(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})

    # Storage succeeds but the version insert fails -> document must be removed
    # and the stored file cleaned up (no orphan active metadata).
    async def failing_insert(self):
        raise RuntimeError("database down")

    monkeypatch.setattr(FakeHRDocumentVersion, "insert", failing_insert)

    with pytest.raises(RuntimeError):
        await upload_document(
            "company-1", admin,
            employee_id="p-1",
            document_type_id=pan.id,
            file=FakeUploadFile(b"%PDF-1.4 test", "a.pdf"),
        )
    assert FakeHRDocument._all == []
    assert FakeHRDocumentVersion._all == []
    # The local file written by the fake storage was removed during cleanup.
    leftover = list((tmp_path / "uploads" / "hr_documents").glob("*"))
    assert leftover == []


# =============================================================================
# Listing + filters
# =============================================================================


@pytest.mark.asyncio
async def test_list_employee_documents_company_scoped(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})
    doc = _make_document(company="company-1", employee_id="p-1", document_type_id=pan.id)
    _make_version(doc, 1)
    other = _make_document(company="company-2", employee_id="p-other")
    _make_version(other, 1)

    items, total = await list_documents("company-1", admin, employee_id="p-1")
    assert total == 1
    assert items[0]["id"] == doc.id


@pytest.mark.asyncio
async def test_list_documents_expiry_state_filter(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    today = utc_now().date()
    expired = _make_document(expiry_date=datetime(today.year - 1, 1, 1), employee_id="p-1")
    _make_version(expired, 1)
    expiring = _make_document(expiry_date=datetime(today.year, today.month, today.day) + timedelta(days=10), employee_id="p-1")
    _make_version(expiring, 1)
    no_expiry = _make_document(employee_id="p-1")
    _make_version(no_expiry, 1)

    items, total = await list_documents("company-1", admin, expiry_state="expired")
    assert total == 1
    assert items[0]["id"] == expired.id
    items, total = await list_documents("company-1", admin, expiry_state="expiring_soon")
    assert total == 1
    assert items[0]["id"] == expiring.id
    items, total = await list_documents("company-1", admin, expiry_state="no_expiry")
    assert total == 1
    assert items[0]["id"] == no_expiry.id


@pytest.mark.asyncio
async def test_employee_self_list_only_own_visible_documents(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    employee, profile = _make_employee(user_id="u-1", profile_id="p-1")
    own_visible = _make_document(employee_id="p-1", visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE)
    _make_version(own_visible, 1)
    own_hr_only = _make_document(employee_id="p-1", visibility=HRDocumentVisibility.HR_ONLY)
    _make_version(own_hr_only, 1)
    _make_employee(user_id="u-2", profile_id="p-2")
    other_doc = _make_document(employee_id="p-2")
    _make_version(other_doc, 1)

    items, total = await list_documents("company-1", employee, employee_id="p-1")
    assert total == 1
    assert items[0]["id"] == own_visible.id
    assert items[0]["can_manage"] is False

    with pytest.raises(HTTPException) as exc:
        await list_documents("company-1", employee, employee_id="p-2")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_candidate_documents_require_hr_view(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    employee, profile = _make_employee(profile_id="p-1")
    candidate = FakeCandidate(id="cand-1", company_id="company-1")
    FakeCandidate._all.append(candidate)
    FakeCandidate._by_id["cand-1"] = candidate

    with pytest.raises(HTTPException) as exc:
        await list_documents("company-1", employee, candidate_id="cand-1")
    assert exc.value.status_code == 403


# =============================================================================
# Versioning
# =============================================================================


@pytest.mark.asyncio
async def test_replace_creates_v2_keeps_v1(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})
    result = await upload_document(
        "company-1", admin,
        employee_id="p-1",
        document_type_id=pan.id,
        file=FakeUploadFile(b"%PDF-1.4 v1", "aadhaar.pdf"),
    )
    document_id = result["id"]

    replaced = await replace_document(
        "company-1", document_id, admin, FakeUploadFile(b"%PDF-1.4 v2", "aadhaar-new.pdf"), change_note="Re-scanned copy"
    )
    assert replaced["current_version"] == 2
    assert replaced["filename"] == "aadhaar-new.pdf"

    versions = sorted(FakeHRDocumentVersion._all, key=lambda v: v.version_number)
    assert [v.version_number for v in versions] == [1, 2]
    assert versions[0].original_filename == "aadhaar.pdf"
    assert versions[1].change_note == "Re-scanned copy"
    # V1 metadata preserved.
    assert versions[0].uploaded_by == "admin-1"
    assert versions[0].uploaded_at is not None


@pytest.mark.asyncio
async def test_replace_v3_current_v1_v2_in_history(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})
    result = await upload_document("company-1", admin, employee_id="p-1", document_type_id=pan.id, file=FakeUploadFile(b"%PDF-1.4 v1", "v1.pdf"))
    document_id = result["id"]
    await replace_document("company-1", document_id, admin, FakeUploadFile(b"%PDF-1.4 v2", "v2.pdf"))
    final = await replace_document("company-1", document_id, admin, FakeUploadFile(b"%PDF-1.4 v3", "v3.pdf"))

    assert final["current_version"] == 3
    versions = sorted(FakeHRDocumentVersion._all, key=lambda v: v.version_number)
    assert [v.original_filename for v in versions] == ["v1.pdf", "v2.pdf", "v3.pdf"]
    assert final["version_count"] == 3


@pytest.mark.asyncio
async def test_replace_archived_document_rejected(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_storage(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    pan = await FakeHRDocumentType.find_one({"code": "pan"})
    result = await upload_document("company-1", admin, employee_id="p-1", document_type_id=pan.id, file=FakeUploadFile(b"%PDF-1.4 v1", "v1.pdf"))
    archived = await svc.archive_document("company-1", result["id"], admin)
    assert archived["status"] == "archived"

    with pytest.raises(HTTPException) as exc:
        await replace_document("company-1", result["id"], admin, FakeUploadFile(b"%PDF-1.4 v2", "v2.pdf"))
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_list_versions_returns_newest_first(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    doc = _make_document(employee_id="p-1")
    _make_version(doc, 1, uploaded_by="u-1")
    _make_version(doc, 2, uploaded_by="admin-1")

    versions = await svc.list_versions("company-1", doc.id, admin)
    assert [v["version_number"] for v in versions] == [2, 1]


# =============================================================================
# Security
# =============================================================================


@pytest.mark.asyncio
async def test_employee_can_access_own_visible_document(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    employee, profile = _make_employee(user_id="u-1", profile_id="p-1")
    doc = _make_document(employee_id="p-1", visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE)
    _make_version(doc, 1)

    detail = await get_document("company-1", doc.id, employee)
    assert detail["id"] == doc.id
    assert detail["can_manage"] is False


@pytest.mark.asyncio
async def test_employee_cannot_access_other_employee_document(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    employee, profile = _make_employee(user_id="u-1", profile_id="p-1")
    _make_employee(user_id="u-2", profile_id="p-2")
    other = _make_document(employee_id="p-2", visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE)
    _make_version(other, 1)

    with pytest.raises(HTTPException) as exc:
        await get_document("company-1", other.id, employee)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_employee_cannot_access_hr_only_document(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    employee, profile = _make_employee(user_id="u-1", profile_id="p-1")
    hr_only = _make_document(employee_id="p-1", visibility=HRDocumentVisibility.HR_ONLY)
    _make_version(hr_only, 1)

    with pytest.raises(HTTPException) as exc:
        await get_document("company-1", hr_only.id, employee)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_hr_can_access_company_documents(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    hr_user = _make_hr_department_user()
    _make_employee(profile_id="p-1")
    hr_only = _make_document(employee_id="p-1", visibility=HRDocumentVisibility.HR_ONLY)
    _make_version(hr_only, 1)

    detail = await get_document("company-1", hr_only.id, hr_user)
    assert detail["id"] == hr_only.id
    assert detail["can_manage"] is True


@pytest.mark.asyncio
async def test_cross_company_document_access_denied(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin(company="company-1")
    other = _make_document(company="company-2", employee_id="p-other")
    _make_version(other, 1)

    with pytest.raises(HTTPException) as exc:
        await get_document("company-1", other.id, admin)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_cross_company_version_download_denied(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin(company="company-1")
    other = _make_document(company="company-2", employee_id="p-other")
    version = _make_version(other, 1)

    with pytest.raises(HTTPException) as exc:
        await svc.get_version_for_download("company-1", other.id, version.id, admin)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_current_version_authorized_for_hr(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    doc = _make_document(employee_id="p-1")
    version = _make_version(doc, 1)
    doc.current_version_id = version.id
    doc.current_version_number = 1

    resolved = await svc.get_current_version("company-1", doc.id, admin)
    assert resolved.id == version.id


# =============================================================================
# Metadata update / archive / missing-required
# =============================================================================


@pytest.mark.asyncio
async def test_update_document_metadata_no_new_version(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    doc = _make_document(employee_id="p-1", visibility=HRDocumentVisibility.HR_ONLY)
    version = _make_version(doc, 1)
    doc.current_version_id = version.id
    doc.current_version_number = 1

    updated = await update_document(
        "company-1", doc.id, admin,
        {"description": "Updated description", "visibility": "employee_visible", "expiry_date": "2031-06-30"},
    )
    assert updated["description"] == "Updated description"
    assert updated["visibility"] == "employee_visible"
    assert updated["expiry_state"] == "valid"
    # No new file version.
    assert len([v for v in FakeHRDocumentVersion._all if v.document_id == doc.id]) == 1


@pytest.mark.asyncio
async def test_archive_document_soft_delete(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    doc = _make_document(employee_id="p-1")
    _make_version(doc, 1)
    doc.current_version_id = FakeHRDocumentVersion._all[0].id

    archived = await svc.archive_document("company-1", doc.id, admin)
    assert archived["status"] == "archived"
    assert archived["archived_at"] is not None
    # History intact.
    assert len(FakeHRDocumentVersion._all) == 1
    # Double archive rejected.
    with pytest.raises(HTTPException) as exc:
        await svc.archive_document("company-1", doc.id, admin)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_missing_required_documents(monkeypatch, tmp_path):
    _install_models(monkeypatch, tmp_path)
    _install_permissions(monkeypatch)
    admin = _make_admin()
    _make_employee(profile_id="p-1")
    # bank_document is the only required type in the seeded set and is missing.
    bank = await FakeHRDocumentType.find_one({"code": "bank_document"})

    result = await missing_required_documents("company-1", "p-1", admin)
    assert result["count"] == 1
    assert any(item["code"] == "bank_document" for item in result["missing"])

    # After upload it is no longer reported as missing.
    _make_document(employee_id="p-1", document_type_id=bank.id)
    result = await missing_required_documents("company-1", "p-1", admin)
    assert result["count"] == 0
    assert all(item["code"] != "bank_document" for item in result["missing"])
