"""
Phase 7 — Payslip backend tests.

Covers: PDF renderer (pure), payslip data builder accuracy, generation from
PROCESSED records only, idempotency, regeneration/versioning, snapshot
stability (historical values never change), bulk generation (+ partial
failure), storage failure handling, employee ownership / payroll permission /
company isolation security, and secure file responses.

Style follows tests/recruitment/test_hr_documents.py: pure functions plus
small fakes injected via monkeypatch for the Beanie model layer. No live DB.
"""
import re
from datetime import datetime, timedelta
from pathlib import Path

from bson import ObjectId

import pytest
from fastapi import HTTPException
from fastapi.responses import RedirectResponse
from reportlab.lib.pagesizes import A4

from app.core.clock import utc_now
from app.models.department import DepartmentType
from app.models.payroll import (
    PayrollDeductionItem,
    PayrollEarningItem,
    PayrollPeriodStatus,
    PayrollRecordStatus,
)
from app.models.payslip import PayslipStatus
from app.models.user import UserRole
from app.services import payslip_service as svc
from app.services.payslip_pdf import number_to_words_inr, render_payslip_pdf
from app.services.payslip_service import (
    build_payslip_data,
    generate_payslip,
    generate_period_payslips,
    get_my_payslips,
    has_payroll_manage,
    has_payroll_view,
    list_record_payslips,
    payslip_file_name,
    payslip_state_for_record,
    regenerate_payslip,
    serialize_payslip,
)


# =============================================================================
# Fakes (mirror tests/recruitment/test_hr_documents.py)
# =============================================================================

def _norm(value):
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
                elif op == "$gte":
                    if actual is None or actual < _norm(value):
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
            if isinstance(key, str) and key.startswith("-"):
                key = key[1:]
                direction = -1
            docs.sort(key=lambda doc: _norm(_get_path(doc, key)) or 0, reverse=(direction == -1))
        return docs[self._skip_n:][: self._limit_n] if self._limit_n else docs[self._skip_n:]


class FakeModel:
    _all: list = []
    _by_id: dict = {}
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

    async def insert(self):
        self.__class__._all.append(self)
        self.__class__._by_id[self.id] = self
        return self

    async def save(self):
        return self

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


class FakePayslip(FakeModel):
    _all = []
    _by_id = {}
    payroll_record_id = None
    payroll_period_id = None
    employee_id = None
    version = 1
    file_name = None
    mime_type = "application/pdf"
    file_size = 0
    storage_provider = "local"
    storage_reference = None
    storage_url = None
    storage_resource_type = None
    storage_delivery_type = None
    checksum = None
    generated_by = None
    generated_at = None
    status = PayslipStatus.GENERATED
    payroll_snapshot_hash = None


class FakePayrollPeriod(FakeModel):
    _all = []
    _by_id = {}
    year = None
    month = None
    period_start = None
    period_end = None
    status = None


class FakePayrollRecord(FakeModel):
    _all = []
    _by_id = {}
    payroll_period_id = None
    employee_id = None
    employee_name = None
    employee_number = None
    department = None
    designation = None
    salary_structure_id = None
    currency = "INR"
    attendance_snapshot = {}
    working_days = 0
    payable_days = 0.0
    earnings = []
    deductions = []
    gross_salary = 0.0
    total_deductions = 0.0
    net_salary = 0.0
    status = PayrollRecordStatus.READY
    processed_at = None


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


class FakeDepartment(FakeModel):
    _all = []
    _by_id = {}
    company_id = None
    deleted_at = None
    department_type = None


class FakeCompany(FakeModel):
    _all = []
    _by_id = {}
    name = None
    address = None
    city = None
    state = None
    country = None
    zip_code = None
    phone = None
    email = None
    website = None
    registration_number = None


def _install_models(monkeypatch):
    for cls in (FakePayslip, FakePayrollPeriod, FakePayrollRecord, FakeUser, FakeDepartment, FakeCompany):
        cls._all = []
        cls._by_id = {}
    monkeypatch.setattr(svc, "Payslip", FakePayslip)
    monkeypatch.setattr(svc, "PayrollPeriod", FakePayrollPeriod)
    monkeypatch.setattr(svc, "PayrollRecord", FakePayrollRecord)
    monkeypatch.setattr(svc, "User", FakeUser)
    monkeypatch.setattr(svc, "Department", FakeDepartment)
    monkeypatch.setattr(svc, "Company", FakeCompany)

    async def _noop_event(**kwargs):
        return None

    import app.services.timeline_service as timeline_module

    monkeypatch.setattr(timeline_module, "create_timeline_event", _noop_event)


def _install_storage(monkeypatch, tmp_path):
    upload_dir = tmp_path / "uploads"
    (upload_dir / "payslips").mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(svc.FileService, "resolve_upload_dir", lambda: upload_dir)

    async def fake_store(file, *, upload_dir, url_prefix, scope, sensitive=True):
        content = file.file.read() if hasattr(file, "file") else file.content
        filename = file.filename or "payslip.pdf"
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
    monkeypatch.setattr(svc.FileService, "detect_mime_type", lambda content, filename: "application/pdf" if Path(filename).suffix.lower() == ".pdf" else "application/octet-stream")
    monkeypatch.setattr(svc.CloudinaryStorage, "enabled", staticmethod(lambda: False))
    monkeypatch.setattr(svc.CloudinaryStorage, "delete", staticmethod(lambda *a, **k: None))


def _install_permissions(monkeypatch):
    async def fake_get_capabilities(department_type, role, company_id):
        if department_type == DepartmentType.HR:
            return {"payroll.view", "payroll.manage"}
        return set()

    import app.models.capability as capability_module

    monkeypatch.setattr(capability_module, "get_capabilities_for_role", fake_get_capabilities)


def _add(cls, obj):
    """Register a fake document, replacing any existing entry with the same id."""
    cls._all = [d for d in cls._all if getattr(d, "id", None) != obj.id]
    cls._all.append(obj)
    cls._by_id[obj.id] = obj
    return obj


def _seed_period(period_id="period-1", company="company-1", year=2026, month=8, status=PayrollPeriodStatus.PROCESSED):
    period = FakePayrollPeriod(
        id=period_id, company_id=company, year=year, month=month,
        period_start=datetime(year, month, 1),
        period_end=datetime(year, month + 1, 1) - timedelta(seconds=1) if month < 12 else datetime(year, 12, 31, 23, 59, 59),
        status=status,
    )
    return _add(FakePayrollPeriod, period)


def _make_earnings():
    return [
        PayrollEarningItem(component_code="basic", component_name="Basic Salary", component_type="earning", calculation_type="fixed", configured_amount=30000.0, proration_factor=1.0, calculated_amount=30000.0, source="salary_structure"),
        PayrollEarningItem(component_code="hra", component_name="HRA", component_type="earning", calculation_type="fixed", configured_amount=12000.0, proration_factor=1.0, calculated_amount=12000.0, source="salary_structure"),
        PayrollEarningItem(component_code="allowance", component_name="Special Allowance", component_type="earning", calculation_type="fixed", configured_amount=8000.0, proration_factor=1.0, calculated_amount=8000.0, source="salary_structure"),
    ]


def _make_deductions():
    return [
        PayrollDeductionItem(component_code="pf", component_name="PF", component_type="deduction", configured_amount=1800.0, calculated_amount=1800.0, source="salary_structure"),
        PayrollDeductionItem(component_code="unpaid_leave", component_name="Unpaid Leave", component_type="deduction", configured_amount=2000.0, calculated_amount=2000.0, source="salary_structure"),
    ]


def _seed_record(
    record_id="record-1", period_id="period-1", company="company-1", employee_id="emp-1",
    name="John Doe", number="EMP-2026-0001", status=PayrollRecordStatus.READY,
    gross=50000.0, deductions_total=3800.0, net=46200.0,
    department="Engineering", designation="Software Engineer", **kwargs,
):
    fields = dict(kwargs)
    record = FakePayrollRecord(
        id=record_id, company_id=company, payroll_period_id=period_id, employee_id=employee_id,
        employee_name=name, employee_number=number,
        department=department, designation=designation,
        currency="INR",
        attendance_snapshot={
            "working_days": 22, "present_days": 20, "paid_leave_days": 1,
            "unpaid_leave_days": 0, "absent_days": 0, "half_days": 0,
            "holiday_days": 0, "week_off_days": 0, "payable_days": 21.0,
        },
        working_days=22, payable_days=21.0,
        earnings=_make_earnings(),
        deductions=_make_deductions(),
        gross_salary=gross, total_deductions=deductions_total, net_salary=net,
        status=status,
        processed_at=datetime(2026, 8, 5),
        **fields,
    )
    return _add(FakePayrollRecord, record)


def _seed_payslip(record_id="record-1", company="company-1", period_id="period-1", employee_id="emp-1", version=1, file_name=None, **kwargs):
    fields = {
        "company_id": company, "payroll_record_id": record_id, "payroll_period_id": period_id,
        "employee_id": employee_id, "version": version,
        "file_name": file_name or "PAYSLIP-EMP-2026-0001-2026-08.pdf",
        "file_size": 1234, "storage_provider": "local",
        "storage_reference": f"payslips/{version}.pdf",
        "storage_url": f"/uploads/payslips/{version}.pdf",
        "generated_by": "admin-1", "generated_at": utc_now(),
    }
    fields.update(kwargs)
    return _add(FakePayslip, FakePayslip(**fields))


async def _stream_body(response):
    return b"".join([chunk async for chunk in response.body_iterator])


def _make_admin(company="company-1", user_id="admin-1"):
    return FakeUser(id=user_id, role=UserRole.ADMIN, company_id=company, first_name="HR", last_name="Admin")


def _make_hr_user(user_id="hr-1", company="company-1"):
    dept = FakeDepartment(id="dept-hr", company_id=company, department_type=DepartmentType.HR, deleted_at=None)
    FakeDepartment._all.append(dept)
    FakeDepartment._by_id["dept-hr"] = dept
    user = FakeUser(id=user_id, role=UserRole.EMPLOYEE, company_id=company, department_id="dept-hr")
    FakeUser._all.append(user)
    FakeUser._by_id[user_id] = user
    return user


def _make_employee(user_id="emp-1", company="company-1"):
    user = FakeUser(id=user_id, role=UserRole.EMPLOYEE, company_id=company)
    FakeUser._all.append(user)
    FakeUser._by_id[user_id] = user
    return user


def _make_manager_without_payroll(user_id="mgr-1", company="company-1"):
    dept = FakeDepartment(id="dept-ops", company_id=company, department_type=DepartmentType.OPERATIONS, deleted_at=None)
    FakeDepartment._all.append(dept)
    FakeDepartment._by_id["dept-ops"] = dept
    user = FakeUser(id=user_id, role=UserRole.MANAGER, company_id=company, department_id="dept-ops")
    FakeUser._all.append(user)
    FakeUser._by_id[user_id] = user
    return user


@pytest.fixture(autouse=True)
def _clean_fakes():
    for cls in (FakePayslip, FakePayrollPeriod, FakePayrollRecord, FakeUser, FakeDepartment, FakeCompany):
        cls._all = []
        cls._by_id = {}
    yield
    for cls in (FakePayslip, FakePayrollPeriod, FakePayrollRecord, FakeUser, FakeDepartment, FakeCompany):
        cls._all = []
        cls._by_id = {}


# =============================================================================
# PDF renderer (pure)
# =============================================================================

def _sample_data(**overrides):
    data = {
        "company": {"name": "SynTask Pvt Ltd", "address": "123 Main St", "city": "Indore", "state": "MP", "zip_code": "452001", "country": "India", "email": "hr@syntask.app"},
        "employee": {"name": "John Doe", "employee_number": "EMP-2026-0001", "department": "Engineering", "designation": "Software Engineer"},
        "period": {"year": 2026, "month": 8, "label": "August 2026", "period_start": datetime(2026, 8, 1), "period_end": datetime(2026, 8, 31), "period_range": "01 Aug 2026 – 31 Aug 2026"},
        "attendance": {"working_days": 22, "present_days": 20, "paid_leave_days": 1, "unpaid_leave_days": 0, "absent_days": 0, "half_days": 0, "holiday_days": 0, "week_off_days": 0},
        "payable_days": 21.0,
        "earnings": [{"component_name": "Basic Salary", "calculated_amount": 30000.0}, {"component_name": "HRA", "calculated_amount": 12000.0}, {"component_name": "Special Allowance", "calculated_amount": 8000.0}],
        "deductions": [{"component_name": "PF", "calculated_amount": 1800.0}, {"component_name": "Unpaid Leave", "calculated_amount": 2000.0}],
        "totals": {"gross": 50000.0, "total_deductions": 3800.0, "net": 46200.0},
        "currency": "INR",
        "generated_at": datetime(2026, 8, 13, 10, 0, 0),
        "version": 1,
    }
    data.update(overrides)
    return data


class TestPayslipPdfRenderer:
    def test_render_produces_valid_pdf(self):
        pdf = render_payslip_pdf(_sample_data())
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 1000

    def test_render_without_company_data(self):
        data = _sample_data(company={}, employee={** _sample_data()["employee"], "department": None, "designation": None})
        pdf = render_payslip_pdf(data)
        assert pdf.startswith(b"%PDF")

    def test_render_long_names(self):
        data = _sample_data(
            employee={"name": "Maximilian von Oberhausen-Strassendorf III", "employee_number": "EMP-2026-9999", "department": "Very Long Department Name for Engineering Excellence", "designation": "Principal Distinguished Staff Engineer — Platform Architecture"},
        )
        pdf = render_payslip_pdf(data)
        assert pdf.startswith(b"%PDF")

    def test_render_many_components(self):
        earnings = [{"component_name": f"Component {i}", "calculated_amount": 1000.0 + i} for i in range(15)]
        deductions = [{"component_name": f"Deduction {i}", "calculated_amount": 50.0 + i} for i in range(10)]
        data = _sample_data(earnings=earnings, deductions=deductions)
        pdf = render_payslip_pdf(data)
        assert pdf.startswith(b"%PDF")

    def test_render_zero_deductions(self):
        data = _sample_data(deductions=[], totals={"gross": 50000.0, "total_deductions": 0.0, "net": 50000.0})
        pdf = render_payslip_pdf(data)
        assert pdf.startswith(b"%PDF")

    def test_render_decimal_values(self):
        data = _sample_data(
            earnings=[{"component_name": "Basic Salary", "calculated_amount": 30000.55}],
            deductions=[{"component_name": "PF", "calculated_amount": 1800.25}],
            totals={"gross": 30000.55, "total_deductions": 1800.25, "net": 28200.30},
        )
        pdf = render_payslip_pdf(data)
        assert pdf.startswith(b"%PDF")

    def test_amount_in_words(self):
        assert number_to_words_inr(45700) == "Forty Five Thousand Seven Hundred Rupees Only"
        assert number_to_words_inr("45700.50") == "Forty Five Thousand Seven Hundred Rupees and Fifty Paise Only"
        assert number_to_words_inr(10000000) == "One Crore Rupees Only"
        assert number_to_words_inr(0) == "Zero Rupees Only"
        assert number_to_words_inr(12345678) == "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only"


# =============================================================================
# Data builder accuracy
# =============================================================================

class TestPayslipDataBuilder:
    @pytest.mark.asyncio
    async def test_exact_snapshot_values(self, monkeypatch):
        _install_models(monkeypatch)
        _seed_period()
        record = _seed_record()
        _add(FakeCompany, FakeCompany(id="company-1", name="Acme Corp", address="1 Test Lane"))

        data = await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"], generated_at=datetime(2026, 8, 13))

        assert data["employee"]["name"] == "John Doe"
        assert data["employee"]["employee_number"] == "EMP-2026-0001"
        assert data["employee"]["department"] == "Engineering"
        assert data["employee"]["designation"] == "Software Engineer"
        assert data["period"]["label"] == "August 2026"
        assert data["period"]["period_range"] == "01 Aug 2026 – 31 Aug 2026"
        assert data["payable_days"] == 21.0
        assert data["attendance"]["working_days"] == 22
        assert data["attendance"]["present_days"] == 20
        assert [e["calculated_amount"] for e in data["earnings"]] == [30000.0, 12000.0, 8000.0]
        assert [d["calculated_amount"] for d in data["deductions"]] == [1800.0, 2000.0]
        assert data["totals"]["gross"] == 50000.0
        assert data["totals"]["total_deductions"] == 3800.0
        assert data["totals"]["net"] == 46200.0
        assert data["currency"] == "INR"
        assert data["company"]["name"] == "Acme Corp"

    @pytest.mark.asyncio
    async def test_missing_employee_name_blocks(self, monkeypatch):
        _install_models(monkeypatch)
        _seed_period()
        record = _seed_record(name=None)

        with pytest.raises(HTTPException) as exc:
            await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"])
        assert exc.value.status_code == 400
        assert "employee name" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_missing_period_blocks(self, monkeypatch):
        _install_models(monkeypatch)
        _seed_period()
        record = _seed_record()
        period = FakePayrollPeriod._by_id["period-1"]
        period.year = None

        with pytest.raises(HTTPException) as exc:
            await build_payslip_data("company-1", record, period)
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_inconsistent_snapshot_blocks(self, monkeypatch):
        """gross − deductions ≠ net must block generation (root cause is Phase 6)."""
        _install_models(monkeypatch)
        _seed_period()
        record = _seed_record(gross=50000.0, deductions_total=3800.0, net=99999.0)

        with pytest.raises(HTTPException) as exc:
            await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"])
        assert exc.value.status_code == 400
        assert "inconsistent" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_optional_missing_fields_graceful(self, monkeypatch):
        _install_models(monkeypatch)
        _seed_period()
        record = _seed_record(department=None, designation=None)
        _add(FakeCompany, FakeCompany(id="company-1", name="Acme Corp"))  # no address/email etc.

        data = await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"])
        assert data["employee"]["department"] is None
        assert data["employee"]["designation"] is None
        assert data["company"]["address"] is None

    @pytest.mark.asyncio
    async def test_department_id_resolved_to_name(self, monkeypatch):
        _install_models(monkeypatch)
        _seed_period()
        dept_id = str(ObjectId())
        dept = FakeDepartment(id=dept_id, company_id="company-1", name="Research & Development", department_type=DepartmentType.OPERATIONS, deleted_at=None)
        FakeDepartment._all.append(dept)
        FakeDepartment._by_id[dept_id] = dept
        record = _seed_record(department=dept_id)

        data = await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"])
        assert data["employee"]["department"] == "Research & Development"


# =============================================================================
# Generation
# =============================================================================

class TestPayslipGeneration:
    @pytest.mark.asyncio
    async def test_generate_from_processed_record(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        record = _seed_record()
        admin = _make_admin()

        payslip = await generate_payslip("company-1", "record-1", admin)

        assert payslip.version == 1
        assert payslip.payroll_record_id == "record-1"
        assert payslip.employee_id == "emp-1"
        assert payslip.file_name == "PAYSLIP-EMP-2026-0001-2026-08.pdf"
        assert payslip.mime_type == "application/pdf"
        assert payslip.file_size > 0
        assert payslip.storage_provider == "local"
        assert payslip.storage_reference
        assert payslip.payroll_snapshot_hash
        # Metadata exists AND the file exists on disk.
        assert len(FakePayslip._all) == 1
        stored_files = list((tmp_path / "uploads" / "payslips").glob("*.pdf"))
        assert len(stored_files) == 1
        assert stored_files[0].read_bytes().startswith(b"%PDF")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [
        PayrollPeriodStatus.DRAFT,
        PayrollPeriodStatus.CALCULATED,
        PayrollPeriodStatus.REVIEW,
        PayrollPeriodStatus.APPROVED,
    ])
    async def test_generate_rejects_non_processed_period(self, monkeypatch, tmp_path, status):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period(status=status)
        _seed_record()
        admin = _make_admin()

        with pytest.raises(HTTPException) as exc:
            await generate_payslip("company-1", "record-1", admin)
        assert exc.value.status_code == 400
        assert "processed" in str(exc.value.detail).lower()
        assert FakePayslip._all == []

    @pytest.mark.asyncio
    async def test_generate_idempotent_returns_existing(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        admin = _make_admin()

        first = await generate_payslip("company-1", "record-1", admin)
        second = await generate_payslip("company-1", "record-1", admin)

        assert second.id == first.id
        assert second.version == 1
        assert len(FakePayslip._all) == 1
        assert len(list((tmp_path / "uploads" / "payslips").glob("*.pdf"))) == 1

    @pytest.mark.asyncio
    async def test_generate_requires_manage_permission(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        employee = _make_employee()

        with pytest.raises(HTTPException) as exc:
            await generate_payslip("company-1", "record-1", employee)
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_generate_cross_company_record_not_found(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period(company="company-2")
        _seed_record(company="company-2")
        admin = _make_admin(company="company-1")

        with pytest.raises(HTTPException) as exc:
            await generate_payslip("company-1", "record-1", admin)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_storage_failure_creates_no_metadata(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        admin = _make_admin()

        async def failing_store(*args, **kwargs):
            raise HTTPException(status_code=502, detail="Cloudinary upload failed")

        monkeypatch.setattr(svc.FileService, "store_uploaded_file", failing_store)

        with pytest.raises(HTTPException) as exc:
            await generate_payslip("company-1", "record-1", admin)
        assert exc.value.status_code == 502
        assert FakePayslip._all == []

    @pytest.mark.asyncio
    async def test_metadata_failure_cleans_stored_file(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        admin = _make_admin()

        async def failing_insert(self):
            raise RuntimeError("database down")

        monkeypatch.setattr(FakePayslip, "insert", failing_insert)

        with pytest.raises(RuntimeError):
            await generate_payslip("company-1", "record-1", admin)
        assert FakePayslip._all == []
        leftover = list((tmp_path / "uploads" / "payslips").glob("*"))
        assert leftover == []


# =============================================================================
# Snapshot stability + versioning
# =============================================================================

class TestPayslipStabilityAndVersioning:
    @pytest.mark.asyncio
    async def test_regeneration_uses_stored_snapshot_only(self, monkeypatch, tmp_path):
        """Regeneration reads the STORED payroll record — it never recalculates
        from live salary/attendance/leave sources and never mutates the record.

        (Phase 6 finalization already makes processed records immutable; if the
        snapshot were ever inconsistent, generation blocks — see
        ``test_inconsistent_snapshot_blocks``.)
        """
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        record = _seed_record()
        admin = _make_admin()

        v1 = await generate_payslip("company-1", "record-1", admin)
        original_gross = record.gross_salary
        original_designation = record.designation

        v2 = await regenerate_payslip("company-1", v1.id, admin)

        assert v2.version == 2
        assert v1.version == 1
        assert v2.payroll_record_id == "record-1"
        # V1 metadata + file preserved (versioning, never deleted).
        assert len(FakePayslip._all) == 2
        assert len(list((tmp_path / "uploads" / "payslips").glob("*.pdf"))) == 2
        # Regeneration is read-only with respect to the payroll record.
        assert record.gross_salary == original_gross
        assert record.designation == original_designation

        # Both versions render from the SAME stored snapshot values.
        data_v1 = await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"], version=1)
        data_v2 = await build_payslip_data("company-1", record, FakePayrollPeriod._by_id["period-1"], version=2)
        assert data_v1["totals"] == data_v2["totals"]
        assert data_v1["employee"]["designation"] == "Software Engineer"
        assert data_v1["totals"]["gross"] == 50000.0
        assert data_v1["totals"]["net"] == 46200.0
        assert data_v1["attendance"]["working_days"] == 22

    @pytest.mark.asyncio
    async def test_regenerate_keeps_same_file_name(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        admin = _make_admin()

        v1 = await generate_payslip("company-1", "record-1", admin)
        v2 = await regenerate_payslip("company-1", v1.id, admin)

        assert v1.file_name == v2.file_name == "PAYSLIP-EMP-2026-0001-2026-08.pdf"

    @pytest.mark.asyncio
    async def test_regenerate_rejects_non_processed(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        period = _seed_period()
        _seed_record()
        admin = _make_admin()
        payslip = _seed_payslip()

        period.status = PayrollPeriodStatus.APPROVED

        with pytest.raises(HTTPException) as exc:
            await regenerate_payslip("company-1", payslip.id, admin)
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_regenerate_cross_company_denied(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period(company="company-2")
        _seed_record(company="company-2")
        admin = _make_admin(company="company-1")
        payslip = _seed_payslip(company="company-2")

        with pytest.raises(HTTPException) as exc:
            await regenerate_payslip("company-1", payslip.id, admin)
        assert exc.value.status_code == 404


# =============================================================================
# Bulk generation
# =============================================================================

class TestBulkGeneration:
    @pytest.mark.asyncio
    async def test_bulk_generates_all(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        for i in range(10):
            _seed_record(record_id=f"record-{i}", employee_id=f"emp-{i}", number=f"EMP-2026-{i:04d}")
        admin = _make_admin()

        summary = await generate_period_payslips("company-1", "period-1", admin)

        assert len(summary["generated"]) == 10
        assert len(summary["already_existing"]) == 0
        assert len(summary["failed"]) == 0
        assert len(FakePayslip._all) == 10

    @pytest.mark.asyncio
    async def test_bulk_idempotent_rerun(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        for i in range(10):
            _seed_record(record_id=f"record-{i}", employee_id=f"emp-{i}", number=f"EMP-2026-{i:04d}")
        admin = _make_admin()

        first = await generate_period_payslips("company-1", "period-1", admin)
        second = await generate_period_payslips("company-1", "period-1", admin)

        assert len(first["generated"]) == 10
        assert len(second["generated"]) == 0
        assert len(second["already_existing"]) == 10
        assert len(FakePayslip._all) == 10

    @pytest.mark.asyncio
    async def test_bulk_partial_failure_keeps_rest(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        for i in range(10):
            _seed_record(record_id=f"record-{i}", employee_id=f"emp-{i}", number=f"EMP-2026-{i:04d}")
        # One record has an inconsistent snapshot → generation fails for it only.
        _seed_record(record_id="record-9", employee_id="emp-9", number="EMP-2026-0009", gross=50000.0, deductions_total=3800.0, net=99999.0)
        admin = _make_admin()

        summary = await generate_period_payslips("company-1", "period-1", admin)

        assert len(summary["generated"]) == 9
        assert len(summary["failed"]) == 1
        assert summary["failed"][0]["record_id"] == "record-9"
        assert "inconsistent" in summary["failed"][0]["error"]
        assert len(FakePayslip._all) == 9

    @pytest.mark.asyncio
    async def test_bulk_skips_blocked_records(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record(record_id="record-1", employee_id="emp-1")
        _seed_record(record_id="record-2", employee_id="emp-2", status=PayrollRecordStatus.BLOCKED)
        admin = _make_admin()

        summary = await generate_period_payslips("company-1", "period-1", admin)

        assert len(summary["generated"]) == 1
        assert len(summary["skipped"]) == 1
        assert summary["skipped"][0]["record_id"] == "record-2"

    @pytest.mark.asyncio
    async def test_bulk_rejects_unprocessed_period(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period(status=PayrollPeriodStatus.DRAFT)
        admin = _make_admin()

        with pytest.raises(HTTPException) as exc:
            await generate_period_payslips("company-1", "period-1", admin)
        assert exc.value.status_code == 400


# =============================================================================
# Security
# =============================================================================

class TestPayslipSecurity:
    @pytest.mark.asyncio
    async def test_employee_can_access_own_payslip_metadata(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        payslip = _seed_payslip(employee_id="emp-1")
        employee = _make_employee(user_id="emp-1")

        serialized = await serialize_payslip(payslip, actor=employee)
        assert serialized["id"] == payslip.id
        assert serialized["can_preview"] is True
        assert serialized["can_download"] is True
        assert serialized["can_regenerate"] is False

    @pytest.mark.asyncio
    async def test_employee_cannot_access_other_payslip(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        _seed_payslip(employee_id="emp-1")
        other = _make_employee(user_id="emp-2")

        payslip = FakePayslip._by_id[FakePayslip._all[0].id]
        # serialize with an unrelated actor must not grant access.
        serialized = await serialize_payslip(payslip, actor=other)
        assert serialized["can_preview"] is False
        assert serialized["can_download"] is False

        # The service-level access gate also denies.
        with pytest.raises(HTTPException) as exc:
            await svc._require_payslip_access("company-1", payslip, other)
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_payroll_viewer_can_preview_not_generate(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_permissions(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        payslip = _seed_payslip()
        viewer = _make_hr_user()

        assert await has_payroll_view(viewer) is True
        assert await has_payroll_manage(viewer) is True  # seeded capability includes manage

        serialized = await serialize_payslip(payslip, actor=viewer)
        assert serialized["can_preview"] is True

    @pytest.mark.asyncio
    async def test_manager_without_payroll_denied(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        manager = _make_manager_without_payroll()

        assert await has_payroll_view(manager) is False
        assert await has_payroll_manage(manager) is False

        with pytest.raises(HTTPException) as exc:
            await generate_payslip("company-1", "record-1", manager)
        assert exc.value.status_code == 403

        payslip = _seed_payslip()
        with pytest.raises(HTTPException) as exc:
            await svc._require_payslip_access("company-1", payslip, manager)
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_cross_company_payslip_denied(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        payslip = _seed_payslip()
        admin_b = _make_admin(company="company-2")

        with pytest.raises(HTTPException) as exc:
            # The endpoint passes the ACTOR's company — cross-company payslips are
            # treated as not found (no identifier from the frontend is trusted).
            await svc._require_payslip_access("company-2", payslip, admin_b)
        assert exc.value.status_code == 404


# =============================================================================
# File access
# =============================================================================

class TestPayslipFileAccess:
    @pytest.mark.asyncio
    async def test_download_local_file_response(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        admin = _make_admin()

        payslip = await generate_payslip("company-1", "record-1", admin)
        response = await svc.build_payslip_file_response(payslip, download=True)

        assert response.status_code == 200
        assert response.media_type == "application/pdf"
        assert response.filename == "PAYSLIP-EMP-2026-0001-2026-08.pdf"

    @pytest.mark.asyncio
    async def test_missing_file_returns_404(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        payslip = _seed_payslip(storage_reference="payslips/ghost.pdf")

        with pytest.raises(HTTPException) as exc:
            await svc.build_payslip_file_response(payslip, download=False)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_payslip_id_returns_none(self, monkeypatch):
        _install_models(monkeypatch)
        assert await svc.get_payslip("company-1", "does-not-exist") is None

    @pytest.mark.asyncio
    async def test_traversal_reference_denied(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        payslip = _seed_payslip(storage_reference="../../secrets/secret.pdf")

        with pytest.raises(HTTPException) as exc:
            await svc.build_payslip_file_response(payslip, download=False)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_download_cloudinary_streams_server_side(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        payslip = _seed_payslip(
            storage_provider="cloudinary",
            storage_reference="syntask/payslips/private-payslip",
            storage_url="https://res.cloudinary.com/demo/image/authenticated/v1/syntask/payslips/private-payslip.pdf",
            storage_resource_type="image",
            storage_delivery_type="authenticated",
        )
        calls = []

        def fake_download_content(public_id, *, resource_type, delivery_type, storage_url=None, mime_type=None):
            calls.append((public_id, resource_type, delivery_type, storage_url))
            return b"%PDF-1.4\nprivate payslip bytes"

        monkeypatch.setattr(svc.CloudinaryStorage, "download_content", staticmethod(fake_download_content))

        response = await svc.build_payslip_file_response(payslip, download=False)

        assert response.status_code == 200
        assert response.media_type == "application/pdf"
        assert not isinstance(response, RedirectResponse)
        assert (await _stream_body(response)).startswith(b"%PDF")
        assert calls == [(
            "syntask/payslips/private-payslip",
            "image",
            "authenticated",
            "https://res.cloudinary.com/demo/image/authenticated/v1/syntask/payslips/private-payslip.pdf",
        )]


# =============================================================================
# History + my payslips (Phase 8 readiness)
# =============================================================================

class TestPayslipHistoryAndSelfService:
    @pytest.mark.asyncio
    async def test_list_record_payslips_newest_first(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        _seed_payslip(version=1)
        _seed_payslip(version=2)
        admin = _make_admin()

        items = await list_record_payslips("company-1", "record-1", admin)
        assert [item["version"] for item in items] == [2, 1]
        assert items[0]["can_preview"] is True

    @pytest.mark.asyncio
    async def test_list_record_payslips_denied_for_other_employee(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        _seed_period()
        _seed_record()
        _seed_payslip()
        other = _make_employee(user_id="emp-2")

        with pytest.raises(HTTPException) as exc:
            await list_record_payslips("company-1", "record-1", other)
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_get_my_payslips_only_own_latest_version(self, monkeypatch, tmp_path):
        _install_models(monkeypatch)
        _install_storage(monkeypatch, tmp_path)
        period_id = str(ObjectId())
        _seed_period(period_id=period_id)
        _seed_record(period_id=period_id)  # emp-1
        _seed_record(record_id="record-2", period_id=period_id, employee_id="emp-2", number="EMP-2026-0002")
        _seed_payslip(period_id=period_id, record_id="record-1", employee_id="emp-1", version=1)
        _seed_payslip(period_id=period_id, record_id="record-1", employee_id="emp-1", version=2)
        _seed_payslip(period_id=period_id, record_id="record-2", employee_id="emp-2", version=1)
        employee = _make_employee(user_id="emp-1")

        items = await get_my_payslips(employee)

        assert len(items) == 1
        assert items[0]["version"] == 2
        assert items[0]["year"] == 2026
        assert items[0]["month"] == 8
        assert items[0]["gross"] == 50000.0
        assert items[0]["net"] == 46200.0
        assert items[0]["currency"] == "INR"
        assert items[0]["can_download"] is True
        assert items[0]["period"]["label"] == "August 2026"

    @pytest.mark.asyncio
    async def test_payslip_state_for_record(self, monkeypatch):
        _install_models(monkeypatch)
        assert payslip_state_for_record(None) == {"generated": False}
        payslip = _seed_payslip(version=2)
        state = payslip_state_for_record(payslip)
        assert state["generated"] is True
        assert state["version"] == 2
        assert state["payslip_id"] == payslip.id

    def test_payslip_file_name_sanitized(self):
        assert payslip_file_name(_seed_record(number="EMP-0042"), _seed_period()) == "PAYSLIP-EMP-0042-2026-08.pdf"
        assert payslip_file_name(_seed_record(number="A/B\\C:Bad"), _seed_period()) == "PAYSLIP-A-B-C-Bad-2026-08.pdf"
        assert payslip_file_name(_seed_record(number=None), _seed_period()) == "PAYSLIP-EMP-2026-08.pdf"
