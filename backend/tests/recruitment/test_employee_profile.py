"""
Phase 1 HRMS — Employee Profile + canonical candidate onboarding tests.

Unit tests in the repository's style: pure functions where possible, small
fakes injected via monkeypatch for the Beanie model layer. No live MongoDB.
"""
import pytest
from fastapi import HTTPException

from app.models.employee_profile import EmploymentStatus, EmploymentType, EmployeeWorkMode
from app.models.user import UserRole
from app.recruitment.models import CandidateStatus
from app.services import employee_profile_service as svc
from app.services.employee_profile_service import (
    EmployeeOnboardingService,
    create_profile,
    generate_employee_number,
    get_employee,
    normalize_employment_status,
    normalize_employment_type,
    normalize_work_mode,
    update_profile,
)


# =============================================================================
# Boundary normalization
# =============================================================================


def test_normalize_work_mode_collapses_legacy_variants():
    assert normalize_work_mode("office") == EmployeeWorkMode.ONSITE
    assert normalize_work_mode("OFFICE") == EmployeeWorkMode.ONSITE
    assert normalize_work_mode("wfh") == EmployeeWorkMode.REMOTE
    assert normalize_work_mode("work_from_home") == EmployeeWorkMode.REMOTE
    assert normalize_work_mode("hybrid") == EmployeeWorkMode.HYBRID
    assert normalize_work_mode("onsite") == EmployeeWorkMode.ONSITE
    assert normalize_work_mode("unknown-mode") is None


def test_normalize_employment_type_aliases():
    assert normalize_employment_type("full_time") == EmploymentType.FULL_TIME
    assert normalize_employment_type("internship") == EmploymentType.INTERN
    assert normalize_employment_type("intern") == EmploymentType.INTERN
    assert normalize_employment_type("temporary") == EmploymentType.TEMPORARY
    assert normalize_employment_type("bogus") is None


def test_normalize_employment_status_aliases():
    assert normalize_employment_status("notice_period") == EmploymentStatus.NOTICE_PERIOD
    assert normalize_employment_status("noticeperiod") == EmploymentStatus.NOTICE_PERIOD
    assert normalize_employment_status("resigned") == EmploymentStatus.EXITED
    assert normalize_employment_status("active") == EmploymentStatus.ACTIVE


# =============================================================================
# Employee number
# =============================================================================


class FakeProfile:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class FakeCursor:
    def __init__(self, docs):
        self._docs = docs
        self._skip_n = 0

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        self._skip_n = n
        return self

    def limit(self, n):
        return self

    async def count(self):
        return len(self._docs)

    async def to_list(self):
        return self._docs[self._skip_n:]


async def _none(*args, **kwargs):
    return None


@pytest.mark.asyncio
async def test_generate_employee_number_is_company_scoped(monkeypatch):
    monkeypatch.setattr(svc.EmployeeProfile, "find", classmethod(lambda cls, q: FakeCursor([])))
    monkeypatch.setattr(svc.EmployeeProfile, "find_one", classmethod(lambda cls, q: _none()))

    number = await generate_employee_number("company-1")

    assert number.startswith("EMP-")
    assert number.endswith("0001")


@pytest.mark.asyncio
async def test_generate_employee_number_skips_taken_numbers(monkeypatch):
    taken = {"EMP-2026-0001", "EMP-2026-0002"}

    async def fake_find_one(query):
        number = query.get("employee_number")
        return FakeProfile(employee_number=number) if number in taken else None

    async def find_one_wrapper(cls, query):
        return await fake_find_one(query)

    monkeypatch.setattr(svc.EmployeeProfile, "find", classmethod(lambda cls, q: FakeCursor([])))
    monkeypatch.setattr(svc.EmployeeProfile, "find_one", classmethod(find_one_wrapper))

    number = await generate_employee_number("company-1")
    assert number == "EMP-2026-0003"


# =============================================================================
# Fakes for model-backed operations
# =============================================================================


class FakeUser:
    _all: list = []
    _by_id: dict = {}

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        if not getattr(self, "id", None):
            self.id = f"u-{len(FakeUser._all) + 1}"
        self.inserted = False

    async def insert(self):
        self.inserted = True
        FakeUser._all.append(self)
        FakeUser._by_id[self.id] = self
        return self

    async def save(self):
        return self

    def full_name(self):
        return f"{getattr(self, 'first_name', '')} {getattr(self, 'last_name', '')}".strip()

    @classmethod
    async def find_one(cls, query):
        for user in cls._all:
            if all(getattr(user, key, None) == value for key, value in query.items()):
                return user
        return None

    @classmethod
    async def get(cls, user_id):
        return cls._by_id.get(user_id)


class FakeProfileModel:
    _all: list = []
    _by_id: dict = {}
    # Class-level defaults so the service can read fields that were never set.
    company_id = None
    user_id = None
    department_id = None
    reports_to = None
    candidate_id = None
    employee_number = None
    designation = None
    employment_status = None
    employment_type = None
    work_mode = None
    work_location = None
    joining_date = None
    date_of_birth = None
    gender = None
    personal_email = None
    personal_phone = None
    address = None
    emergency_contact = None
    probation = None
    exit_info = None
    created_at = None
    updated_at = None

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        if not getattr(self, "id", None):
            self.id = f"p-{len(FakeProfileModel._all) + 1}"
        self.inserted = False

    async def insert(self):
        self.inserted = True
        FakeProfileModel._all.append(self)
        FakeProfileModel._by_id[self.id] = self
        return self

    async def save(self):
        return self

    @classmethod
    async def find_one(cls, query):
        for profile in cls._all:
            if all(getattr(profile, key, None) == value for key, value in query.items()):
                return profile
        return None

    @classmethod
    async def get(cls, profile_id):
        return cls._by_id.get(profile_id)


class FakeDepartment:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class FakeDepartmentModel:
    _by_id: dict = {}

    @classmethod
    async def get(cls, department_id):
        return cls._by_id.get(department_id)


class FakeCandidate:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        if not getattr(self, "id", None):
            self.id = "c-1"
        if not hasattr(self, "employee_id"):
            self.employee_id = None
        if not hasattr(self, "job_id"):
            self.job_id = None
        if not hasattr(self, "updated_at"):
            self.updated_at = None

    async def save(self):
        return self


def _make_user(**kwargs):
    defaults = {
        "email": "u@example.com",
        "first_name": "Test",
        "last_name": "User",
        "role": UserRole.EMPLOYEE,
        "status": "active",
        "company_id": "company-1",
    }
    defaults.update(kwargs)
    return FakeUser(**defaults)


def _reset_fakes():
    FakeUser._all = []
    FakeUser._by_id = {}
    FakeProfileModel._all = []
    FakeProfileModel._by_id = {}
    FakeDepartmentModel._by_id = {}
    FakeLifecycleEvent._all = []


class FakeLifecycleEvent:
    """Minimal stand-in for EmployeeLifecycleEvent used by record_profile_changes."""
    _all: list = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = f"evt-{len(FakeLifecycleEvent._all) + 1}"

    async def insert(self):
        FakeLifecycleEvent._all.append(self)
        return self

    async def delete(self):
        if self in FakeLifecycleEvent._all:
            FakeLifecycleEvent._all.remove(self)
        return None


def _install_model_fakes(monkeypatch, *, profile_cls=FakeProfileModel):
    monkeypatch.setattr(svc, "User", FakeUser)
    monkeypatch.setattr(svc, "EmployeeProfile", profile_cls)
    monkeypatch.setattr(svc, "Department", FakeDepartmentModel)
    # record_profile_changes (called by update_profile for lifecycle-sensitive
    # fields) persists EmployeeLifecycleEvent — fake it so no live MongoDB is
    # needed. Timeline emission is already best-effort inside the service.
    import app.services.lifecycle_service as lifecycle_svc

    FakeLifecycleEvent._all = []
    monkeypatch.setattr(lifecycle_svc, "EmployeeLifecycleEvent", FakeLifecycleEvent)


@pytest.fixture(autouse=True)
def _clean_fakes():
    _reset_fakes()
    yield
    _reset_fakes()


@pytest.mark.asyncio
async def test_create_profile_rejects_duplicate_profile(monkeypatch):
    user = _make_user(id="u-1", role=UserRole.ADMIN)
    FakeUser._all.append(user)
    FakeUser._by_id["u-1"] = user
    existing = FakeProfileModel(company_id="company-1", user_id="u-1")
    FakeProfileModel._all.append(existing)
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await create_profile("company-1", user, {"user_id": "u-1"})

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_create_profile_rejects_cross_company_user(monkeypatch):
    user = _make_user(id="u-1", company_id="company-2")
    FakeUser._all.append(user)
    FakeUser._by_id["u-1"] = user
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await create_profile("company-1", user, {"user_id": "u-1"})

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_create_profile_rejects_super_admin(monkeypatch):
    user = _make_user(id="u-1", role=UserRole.SUPER_ADMIN)
    FakeUser._all.append(user)
    FakeUser._by_id["u-1"] = user
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await create_profile("company-1", user, {"user_id": "u-1"})

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_create_profile_rejects_cross_company_department(monkeypatch):
    actor = _make_user(id="admin-1", role=UserRole.ADMIN)
    user = _make_user(id="u-1")
    FakeUser._all += [actor, user]
    FakeUser._by_id.update({"admin-1": actor, "u-1": user})
    FakeDepartmentModel._by_id["dept-9"] = FakeDepartment(
        company_id="company-2", deleted_at=None
    )
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await create_profile("company-1", actor, {"user_id": "u-1", "department_id": "dept-9"})

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_update_profile_rejects_cross_company_employee(monkeypatch):
    actor = _make_user(id="admin-1", role=UserRole.ADMIN)
    profile = FakeProfileModel(company_id="company-2", user_id="u-1", employment_status=EmploymentStatus.ACTIVE)
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await update_profile("company-1", profile.id, actor, {"designation": "Engineer"})

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_profile_rejects_self_reporting(monkeypatch):
    actor = _make_user(id="admin-1", role=UserRole.ADMIN)
    user = _make_user(id="u-1")
    FakeUser._all += [actor, user]
    FakeUser._by_id.update({"admin-1": actor, "u-1": user})
    profile = FakeProfileModel(
        id="p-1", company_id="company-1", user_id="u-1", employment_status=EmploymentStatus.ACTIVE
    )
    FakeProfileModel._all.append(profile)
    FakeProfileModel._by_id["p-1"] = profile
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await update_profile("company-1", "p-1", actor, {"reports_to": "u-1"})

    assert exc.value.status_code == 400
    assert "themselves" in exc.value.detail


@pytest.mark.asyncio
async def test_update_profile_rejects_cross_company_manager(monkeypatch):
    actor = _make_user(id="admin-1", role=UserRole.ADMIN)
    user = _make_user(id="u-1")
    manager = _make_user(id="m-1", company_id="company-2")
    FakeUser._all += [actor, user, manager]
    FakeUser._by_id.update({"admin-1": actor, "u-1": user, "m-1": manager})
    profile = FakeProfileModel(
        id="p-1", company_id="company-1", user_id="u-1", employment_status=EmploymentStatus.ACTIVE
    )
    FakeProfileModel._all.append(profile)
    FakeProfileModel._by_id["p-1"] = profile
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await update_profile("company-1", "p-1", actor, {"reports_to": "m-1"})

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_update_profile_applies_partial_change(monkeypatch):
    actor = _make_user(id="admin-1", role=UserRole.ADMIN)
    user = _make_user(id="u-1", first_name="Jane", last_name="Doe")
    FakeUser._all += [actor, user]
    FakeUser._by_id.update({"admin-1": actor, "u-1": user})
    profile = FakeProfileModel(
        id="p-1", company_id="company-1", user_id="u-1",
        employment_status=EmploymentStatus.ACTIVE, designation=None,
    )
    FakeProfileModel._all.append(profile)
    FakeProfileModel._by_id["p-1"] = profile
    _install_model_fakes(monkeypatch)

    detail = await update_profile("company-1", "p-1", actor, {"designation": "Lead Engineer"})

    assert profile.designation == "Lead Engineer"
    assert detail["designation"] == "Lead Engineer"
    assert detail["full_name"] == "Jane Doe"


# =============================================================================
# get_employee access rules
# =============================================================================


def _make_profile(**kwargs):
    defaults = {
        "id": "p-1",
        "company_id": "company-1",
        "user_id": "u-1",
        "employment_status": EmploymentStatus.ACTIVE,
    }
    defaults.update(kwargs)
    return FakeProfileModel(**defaults)


@pytest.mark.asyncio
async def test_get_employee_blocks_other_employees_profile(monkeypatch):
    actor = _make_user(id="u-2")
    user = _make_user(id="u-1", first_name="Jane", last_name="Doe")
    FakeUser._all += [actor, user]
    FakeUser._by_id.update({"u-1": user, "u-2": actor})
    profile = _make_profile()
    FakeProfileModel._all.append(profile)
    FakeProfileModel._by_id["p-1"] = profile
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await get_employee("company-1", "p-1", actor)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_employee_allows_own_profile(monkeypatch):
    actor = _make_user(id="u-1", first_name="Jane", last_name="Doe")
    FakeUser._all.append(actor)
    FakeUser._by_id["u-1"] = actor
    profile = _make_profile()
    FakeProfileModel._all.append(profile)
    FakeProfileModel._by_id["p-1"] = profile
    _install_model_fakes(monkeypatch)

    detail = await get_employee("company-1", "p-1", actor)

    assert detail["full_name"] == "Jane Doe"
    assert detail["user_id"] == "u-1"


@pytest.mark.asyncio
async def test_get_employee_cross_company_not_found(monkeypatch):
    actor = _make_user(id="admin-1", role=UserRole.ADMIN)
    FakeUser._all.append(actor)
    FakeUser._by_id["admin-1"] = actor
    profile = _make_profile(company_id="company-2")
    FakeProfileModel._all.append(profile)
    FakeProfileModel._by_id["p-1"] = profile
    _install_model_fakes(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await get_employee("company-1", "p-1", actor)

    assert exc.value.status_code == 404


# =============================================================================
# Canonical candidate onboarding
# =============================================================================


def _install_onboarding_fakes(monkeypatch):
    _install_model_fakes(monkeypatch)
    FakeDepartmentModel._by_id["dept-1"] = FakeDepartment(
        company_id="company-1", deleted_at=None
    )
    monkeypatch.setattr(
        svc, "generate_employee_number", _async_return("EMP-2026-0001")
    )

    async def _noop_publish(**kwargs):
        return None

    import app.recruitment.events as events_module

    monkeypatch.setattr(events_module, "publish_recruitment_event", _noop_publish)


def _async_return(value):
    async def _inner(*args, **kwargs):
        return value

    return _inner


def _make_job(**kwargs):
    defaults = {
        "id": "job-1",
        "title": "Backend Engineer",
        "department_id": "dept-1",
        "hiring_manager_id": None,
        "employment_type": "full_time",
        "work_mode": "remote",
        "location": "Remote",
    }
    defaults.update(kwargs)
    return type("FakeJob", (), defaults)()


@pytest.mark.asyncio
async def test_onboarding_blocks_duplicate_conversion(monkeypatch):
    _install_onboarding_fakes(monkeypatch)
    candidate = FakeCandidate(
        company_id="company-1",
        full_name="John Doe",
        email="john@example.com",
        status=CandidateStatus.EMPLOYEE,
        employee_id="u-1",
    )

    with pytest.raises(HTTPException) as exc:
        await EmployeeOnboardingService.create_employee_from_candidate(
            "company-1", "actor-1", candidate, job=_make_job()
        )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_onboarding_creates_user_and_profile_with_mapped_job_fields(monkeypatch):
    _install_onboarding_fakes(monkeypatch)
    candidate = FakeCandidate(
        company_id="company-1",
        full_name="John Doe",
        email="john@example.com",
        status=CandidateStatus.OFFER_ACCEPTED,
    )
    job = _make_job()

    result = await EmployeeOnboardingService.create_employee_from_candidate(
        "company-1", "actor-1", candidate, job=job
    )

    assert result["created_user"] is True
    user = result["user"]
    assert user.email == "john@example.com"
    assert user.company_id == "company-1"
    assert user.department_id == "dept-1"

    profile = result["profile"]
    assert profile.designation == "Backend Engineer"
    assert profile.department_id == "dept-1"
    assert profile.work_mode == EmployeeWorkMode.REMOTE
    assert profile.employment_type == EmploymentType.FULL_TIME
    assert profile.work_location == "Remote"
    assert profile.employment_status == EmploymentStatus.ONBOARDING
    assert candidate.status == CandidateStatus.EMPLOYEE
    assert candidate.employee_id == user.id


@pytest.mark.asyncio
async def test_onboarding_reuses_existing_same_company_user(monkeypatch):
    _install_onboarding_fakes(monkeypatch)
    existing = _make_user(id="u-9", email="john@example.com")
    FakeUser._all.append(existing)
    FakeUser._by_id["u-9"] = existing
    candidate = FakeCandidate(
        company_id="company-1",
        full_name="John Doe",
        email="john@example.com",
        status=CandidateStatus.JOINED,
    )

    result = await EmployeeOnboardingService.create_employee_from_candidate(
        "company-1", "actor-1", candidate, job=_make_job()
    )

    assert result["created_user"] is False
    assert result["user"].id == "u-9"
    assert candidate.employee_id == "u-9"


@pytest.mark.asyncio
async def test_onboarding_rejects_existing_user_in_other_company(monkeypatch):
    _install_onboarding_fakes(monkeypatch)
    existing = _make_user(id="u-9", email="john@example.com", company_id="company-2")
    FakeUser._all.append(existing)
    FakeUser._by_id["u-9"] = existing
    candidate = FakeCandidate(
        company_id="company-1",
        full_name="John Doe",
        email="john@example.com",
        status=CandidateStatus.JOINED,
    )

    with pytest.raises(HTTPException) as exc:
        await EmployeeOnboardingService.create_employee_from_candidate(
            "company-1", "actor-1", candidate, job=_make_job()
        )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_onboarding_maps_offer_joining_date_to_probation(monkeypatch):
    from datetime import datetime

    _install_onboarding_fakes(monkeypatch)
    candidate = FakeCandidate(
        company_id="company-1",
        full_name="Jane Roe",
        email="jane@example.com",
        status=CandidateStatus.JOINED,
    )
    offer = type("FakeOffer", (), {
        "job_title": "Product Manager",
        "joining_date": datetime(2026, 9, 1),
        "work_location": "Bangalore",
        "employment_type": "full_time",
        "reporting_manager_id": None,
    })()

    result = await EmployeeOnboardingService.create_employee_from_candidate(
        "company-1", "actor-1", candidate, offer=offer
    )

    profile = result["profile"]
    assert profile.designation == "Product Manager"
    assert profile.joining_date == datetime(2026, 9, 1)
    assert profile.employment_status == EmploymentStatus.PROBATION
    assert profile.work_location == "Bangalore"
