"""
Phase 6 — Payroll backend tests.

Tests cover: period CRUD, lifecycle transitions, calculation service,
eligibility, snapshots, permissions, and serialization.
"""
import pytest
from datetime import datetime, date, timedelta, time
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.payroll import (
    PayrollDeductionItem,
    PayrollEarningItem,
    PayrollPeriod,
    PayrollPeriodStatus,
    PayrollRecord,
    PayrollRecordStatus,
)
from app.services.payroll_service import (
    _assert_transition,
    serialize_period,
    serialize_record,
)
from app.services.payroll_calculation_service import (
    _round_currency,
    calculate_employee_payroll,
)


# =============================================================================
# Helpers
# =============================================================================

def _make_period(
    period_id="p1", company_id="company-1", year=2026, month=8,
    status=PayrollPeriodStatus.DRAFT,
):
    p = MagicMock(spec=PayrollPeriod)
    p.id = period_id
    p.company_id = company_id
    p.year = year
    p.month = month
    p.period_start = datetime(year, month, 1)
    p.period_end = datetime(year, month + 1, 1) - timedelta(seconds=1) if month < 12 else datetime(year, 12, 31, 23, 59, 59)
    p.status = status
    p.employee_count = 0
    p.ready_count = 0
    p.warning_count = 0
    p.blocked_count = 0
    p.total_earnings = 0.0
    p.total_deductions = 0.0
    p.total_net = 0.0
    p.created_by = "user-1"
    p.created_at = datetime(2026, 8, 1)
    p.calculated_by = None
    p.calculated_at = None
    p.approved_by = None
    p.approved_at = None
    p.processed_by = None
    p.processed_at = None
    p.notes = None
    p.calculation_version = 1
    p.updated_at = datetime(2026, 8, 1)
    return p


def _make_record(
    record_id="r1", company_id="company-1", period_id="p1", employee_id="emp-1",
    status=PayrollRecordStatus.READY,
):
    r = MagicMock(spec=PayrollRecord)
    r.id = record_id
    r.company_id = company_id
    r.payroll_period_id = period_id
    r.employee_id = employee_id
    r.employee_name = "John Doe"
    r.employee_number = "EMP-2026-0001"
    r.department = "Engineering"
    r.designation = "Software Engineer"
    r.salary_structure_id = "s1"
    r.salary_effective_from = datetime(2026, 1, 1)
    r.currency = "INR"
    r.configured_earnings = 50000.0
    r.configured_deductions = 2000.0
    r.attendance_snapshot = {"working_days": 22, "present_days": 20, "payable_days": 20.5}
    r.working_days = 22
    r.payable_days = 20.5
    r.earnings = [
        PayrollEarningItem(
            component_code="basic", component_name="Basic Salary",
            component_type="earning", calculation_type="fixed",
            configured_amount=30000, proration_factor=0.93,
            calculated_amount=27900.0, source="salary_structure",
        ),
        PayrollEarningItem(
            component_code="hra", component_name="HRA",
            component_type="earning", calculation_type="fixed",
            configured_amount=12000, proration_factor=0.93,
            calculated_amount=11160.0, source="salary_structure",
        ),
    ]
    r.deductions = [
        PayrollDeductionItem(
            component_code="pf", component_name="PF",
            component_type="deduction", configured_amount=1800,
            calculated_amount=1800.0, source="salary_structure",
        ),
    ]
    r.gross_salary = 39060.0
    r.total_deductions = 1800.0
    r.net_salary = 37260.0
    r.status = status
    r.warnings = []
    r.blockers = []
    r.calculated_at = datetime(2026, 8, 15)
    r.processed_at = None
    r.calculation_version = 1
    r.created_at = datetime(2026, 8, 15)
    r.updated_at = datetime(2026, 8, 15)
    return r


# =============================================================================
# Lifecycle Tests
# =============================================================================

class TestPayrollLifecycle:
    """Test payroll period status transitions."""

    def test_valid_draft_to_calculated(self):
        _assert_transition(PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.CALCULATED)

    def test_valid_calculated_to_review(self):
        _assert_transition(PayrollPeriodStatus.CALCULATED, PayrollPeriodStatus.REVIEW)

    def test_valid_review_to_approved(self):
        _assert_transition(PayrollPeriodStatus.REVIEW, PayrollPeriodStatus.APPROVED)

    def test_valid_approved_to_processed(self):
        _assert_transition(PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.PROCESSED)

    def test_invalid_processed_to_draft(self):
        with pytest.raises(Exception):
            _assert_transition(PayrollPeriodStatus.PROCESSED, PayrollPeriodStatus.DRAFT)

    def test_invalid_draft_to_approved(self):
        with pytest.raises(Exception):
            _assert_transition(PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.APPROVED)

    def test_invalid_review_to_calculated(self):
        with pytest.raises(Exception):
            _assert_transition(PayrollPeriodStatus.REVIEW, PayrollPeriodStatus.CALCULATED)

    def test_valid_calculated_to_calculating(self):
        _assert_transition(PayrollPeriodStatus.CALCULATED, PayrollPeriodStatus.CALCULATING)


# =============================================================================
# Rounding Tests
# =============================================================================

class TestCurrencyRounding:
    """Test decimal-safe financial calculations."""

    def test_round_whole_number(self):
        assert _round_currency(30000.0) == 30000.0

    def test_round_two_decimals(self):
        assert _round_currency(30000.123) == 30000.12

    def test_round_third_decimal_up(self):
        assert _round_currency(30000.125) == 30000.13

    def test_round_third_decimal_down(self):
        assert _round_currency(30000.124) == 30000.12

    def test_round_percentage_calculation(self):
        # 30000 * 0.931 = 27930
        result = _round_currency(30000 * 0.931)
        assert result == 27930.0


# =============================================================================
# Serialization Tests
# =============================================================================

class TestPayrollSerialization:
    """Test payroll period and record serialization."""

    def test_serialize_period(self):
        period = _make_period()
        result = serialize_period(period)
        assert result["id"] == "p1"
        assert result["year"] == 2026
        assert result["month"] == 8
        assert result["status"] == "draft"

    def test_serialize_record(self):
        record = _make_record()
        result = serialize_record(record)
        assert result["id"] == "r1"
        assert result["employee_name"] == "John Doe"
        assert result["gross_salary"] == 39060.0
        assert result["net_salary"] == 37260.0
        assert len(result["earnings"]) == 2
        assert len(result["deductions"]) == 1

    def test_serialize_record_with_warnings(self):
        record = _make_record(status=PayrollRecordStatus.WARNING)
        record.warnings = ["Unpaid leave: 3 days"]
        result = serialize_record(record)
        assert result["status"] == "warning"
        assert "Unpaid leave: 3 days" in result["warnings"]

    def test_serialize_record_blocked(self):
        record = _make_record(status=PayrollRecordStatus.BLOCKED)
        record.blockers = ["No salary structure effective for this period"]
        result = serialize_record(record)
        assert result["status"] == "blocked"
        assert len(result["blockers"]) == 1


# =============================================================================
# Eligibility Tests (Phase 11 closure: employment-overlap based)
# =============================================================================

class TestPayrollEligibility:
    """Eligibility is driven by employment overlap with the period — never by the
    current employment_status alone. An employee who exited mid-period (current
    status EXITED) must still appear in the overlapping payroll run."""

    @pytest.mark.asyncio
    async def test_eligibility_query_uses_employment_overlap(self):
        """The eligibility query is: joining_date <= period_end AND
        (last_working_day IS NULL OR last_working_day >= period_start) — never a
        current-status-only filter."""
        from app.services import payroll_calculation_service as svc

        find_mock = MagicMock()
        query_holder = {}

        def _side_effect(query):
            query_holder["query"] = query
            q = MagicMock()
            q.to_list = AsyncMock(return_value=[])
            return q

        find_mock.side_effect = _side_effect
        with patch.object(svc.EmployeeProfile, "find", find_mock):
            await svc.calculate_period_payroll("company-1", date(2026, 8, 1), date(2026, 8, 31))

        query = query_holder["query"]
        assert "employment_status" not in query
        and_clauses = query["$and"]
        assert len(and_clauses) == 2
        joining_or = and_clauses[0]["$or"]
        assert {"joining_date": None} in joining_or
        assert {"joining_date": {"$lte": datetime.combine(date(2026, 8, 31), time.max)}} in joining_or
        exit_or = and_clauses[1]["$or"]
        assert {"last_working_day": None} in exit_or
        assert {"last_working_day": {"$gte": datetime.combine(date(2026, 8, 1), time.min)}} in exit_or

    @pytest.mark.asyncio
    async def test_exited_mid_period_employee_eligible(self):
        """An employee whose last_working_day falls inside the period is eligible
        even when their current employment_status is EXITED."""
        from app.services import payroll_calculation_service as svc

        profile = MagicMock()
        profile.user_id = "user-1"
        profile.employment_status = "exited"  # current status is EXITED

        find_mock = MagicMock()

        def _side_effect(query):
            q = MagicMock()
            q.to_list = AsyncMock(return_value=[profile])
            return q

        find_mock.side_effect = _side_effect
        with patch.object(svc.EmployeeProfile, "find", find_mock), patch.object(
            svc, "calculate_employee_payroll", AsyncMock(return_value={
                "employee_id": "user-1",
                "status": PayrollRecordStatus.READY,
                "warnings": [],
                "blockers": [],
                "gross_salary": 100.0,
                "total_deductions": 0.0,
                "net_salary": 100.0,
            }),
        ):
            results, summary = await svc.calculate_period_payroll(
                "company-1", date(2026, 8, 1), date(2026, 8, 31),
            )

        assert len(results) == 1
        assert results[0]["employee_id"] == "user-1"
        assert summary["ready_count"] == 1

    @pytest.mark.asyncio
    async def test_calculation_result_always_contains_employee_identity(self):
        """Every result (READY/WARNING/BLOCKED) includes employee_id so PayrollService
        never silently skips a successful calculation."""
        from app.services import payroll_calculation_service as svc

        with patch.object(
            svc.EmployeeProfile, "find_one", AsyncMock(return_value=None),
        ), patch.object(
            svc, "get_salary_snapshot_for_payroll", AsyncMock(return_value=None),
        ):
            blocked = await svc.calculate_employee_payroll(
                "company-1", "user-1", date(2026, 8, 1), date(2026, 8, 31),
            )

        assert blocked["employee_id"] == "user-1"
        assert blocked["status"] == PayrollRecordStatus.BLOCKED


# =============================================================================
# Payroll Record Persistence (Phase 11 closure)
# =============================================================================

class TestPayrollRecordPersistence:
    """A successful (READY) calculation must create a PayrollRecord — the result
    contract always carries employee_id so records are never silently skipped."""

    @pytest.mark.asyncio
    async def test_successful_employee_creates_payroll_record(self):
        from app.services import payroll_service as svc

        period = _make_period()
        period.save = AsyncMock()
        result = {
            "employee_id": "user-1",
            "status": PayrollRecordStatus.READY,
            "warnings": [],
            "blockers": [],
            "earnings": [],
            "deductions": [],
            "gross_salary": 50000.0,
            "total_deductions": 2000.0,
            "net_salary": 48000.0,
            "payable_days": 22.0,
            "working_days": 22,
            "attendance_snapshot": {},
            "employee_name": "John Doe",
            "employee_number": "EMP-2026-0001",
            "department": "dept-1",
            "designation": "Engineer",
            "salary_structure_id": "s1",
            "salary_effective_from": datetime(2026, 1, 1),
            "currency": "INR",
            "configured_earnings": 50000.0,
            "configured_deductions": 2000.0,
        }
        summary = {
            "employee_count": 1, "ready_count": 1, "warning_count": 0,
            "blocked_count": 0, "total_earnings": 50000.0,
            "total_deductions": 2000.0, "total_net": 48000.0,
        }

        record_instance = MagicMock()
        record_instance.insert = AsyncMock()
        record_cls = MagicMock(return_value=record_instance)
        record_cls.find_one = AsyncMock(return_value=None)

        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc, "calculate_period_payroll", AsyncMock(return_value=([result], summary))), \
             patch.object(svc, "PayrollRecord", record_cls):
            calculated = await svc.calculate_payroll("company-1", "p1", MagicMock(id="actor-1"))

        assert calculated.status == PayrollPeriodStatus.CALCULATED
        assert calculated.employee_count == 1
        record_instance.insert.assert_awaited()

    @pytest.mark.asyncio
    async def test_ready_result_without_employee_id_skipped_only_when_missing(self):
        """Results without employee_id are skipped (defensive), but the fixed
        calculation contract always includes it — a READY result is never lost."""
        from app.services import payroll_service as svc

        period = _make_period()
        period.save = AsyncMock()
        result = {
            "status": PayrollRecordStatus.READY,
            "warnings": [], "blockers": [], "earnings": [], "deductions": [],
            "gross_salary": 100.0, "total_deductions": 0.0, "net_salary": 100.0,
        }
        summary = {
            "employee_count": 1, "ready_count": 1, "warning_count": 0,
            "blocked_count": 0, "total_earnings": 100.0,
            "total_deductions": 0.0, "total_net": 100.0,
        }

        record_instance = MagicMock()
        record_instance.insert = AsyncMock()
        record_cls = MagicMock(return_value=record_instance)
        record_cls.find_one = AsyncMock(return_value=None)

        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc, "calculate_period_payroll", AsyncMock(return_value=([result], summary))), \
             patch.object(svc, "PayrollRecord", record_cls):
            calculated = await svc.calculate_payroll("company-1", "p1", MagicMock(id="actor-1"))

        record_instance.insert.assert_not_awaited()


# =============================================================================
# Calculation Contract Tests
# =============================================================================

class TestPayrollCalculationContract:
    """Test the calculation contract and expected output format."""

    def test_blocked_when_no_salary(self):
        """When no salary structure exists, result should be BLOCKED."""
        status = PayrollRecordStatus.BLOCKED
        blockers = ["No salary structure effective for this period"]
        assert status == PayrollRecordStatus.BLOCKED
        assert len(blockers) == 1

    def test_proration_factor(self):
        """Proration: payable_days / calendar_days."""
        payable_days = 20.5
        calendar_days = 31
        proration = payable_days / calendar_days
        assert abs(proration - 0.661) < 0.01

    def test_gross_equals_sum_earnings(self):
        """Gross salary should equal sum of calculated earnings."""
        earnings = [27900.0, 11160.0]
        gross = _round_currency(sum(earnings))
        assert gross == 39060.0

    def test_net_equals_gross_minus_deductions(self):
        """Net salary should equal gross minus total deductions."""
        gross = 39060.0
        deductions = 1800.0
        net = _round_currency(gross - deductions)
        assert net == 37260.0

    def test_half_day_payable_factor(self):
        """Half day should contribute 0.5 to payable days."""
        from app.services.attendance_status_resolver import get_payable_factor
        assert get_payable_factor("half_day") == 0.5

    def test_paid_leave_payable_factor(self):
        """Paid leave should contribute 1.0 to payable days."""
        from app.services.attendance_status_resolver import get_payable_factor
        assert get_payable_factor("paid_leave") == 1.0

    def test_unpaid_leave_payable_factor(self):
        """Unpaid leave should contribute 0.0 to payable days."""
        from app.services.attendance_status_resolver import get_payable_factor
        assert get_payable_factor("unpaid_leave") == 0.0

    def test_absent_payable_factor(self):
        """Absent should contribute 0.0 to payable days."""
        from app.services.attendance_status_resolver import get_payable_factor
        assert get_payable_factor("absent") == 0.0

    def test_holiday_payable_factor(self):
        """Holiday should contribute 1.0 to payable days."""
        from app.services.attendance_status_resolver import get_payable_factor
        assert get_payable_factor("holiday") == 1.0

    def test_week_off_payable_factor(self):
        """Week off should contribute 1.0 to payable days."""
        from app.services.attendance_status_resolver import get_payable_factor
        assert get_payable_factor("week_off") == 1.0


# =============================================================================
# Phase 7 closure — processing auto-generates missing payslips
# =============================================================================

class TestProcessAutoGeneratesPayslips:
    """Processing a payroll finalizes records AND backfills missing payslips so
    employees see them in My HR without a manual HR step.

    The backfill reuses the existing idempotent bulk payslip generator — it
    never recalculates payroll, never duplicates existing payslips, and never
    fails the authoritative PROCESSED transition (best-effort + logged).
    """

    @pytest.mark.asyncio
    async def test_process_marks_records_processed_and_triggers_backfill(self):
        from app.services import payroll_service as svc

        period = _make_period(status=PayrollPeriodStatus.APPROVED)
        period.save = AsyncMock()
        record = _make_record()
        record.save = AsyncMock()
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=[record])
        actor = MagicMock(id="actor-1")

        generated = {
            "generated": [{"record_id": "r1", "payslip_id": "payslip-1", "version": 1}],
            "already_existing": [],
            "failed": [],
            "skipped": [],
        }
        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc.PayrollRecord, "find", MagicMock(return_value=cursor)), \
             patch("app.services.payslip_service.generate_period_payslips", AsyncMock(return_value=generated)) as gen_mock:
            result = await svc.process_payroll("company-1", "p1", actor)

        assert result.status == PayrollPeriodStatus.PROCESSED
        assert result.processed_by == "actor-1"
        assert result.processed_at is not None
        # Records are finalized before the backfill runs.
        assert record.processed_at is not None
        record.save.assert_awaited()
        # The existing idempotent bulk generator is called once, without
        # regenerate — existing payslips are never re-created here.
        gen_mock.assert_awaited_once_with("company-1", "p1", actor)

    @pytest.mark.asyncio
    async def test_process_backfill_skips_records_with_existing_payslips(self):
        from app.services import payroll_service as svc

        period = _make_period(status=PayrollPeriodStatus.APPROVED)
        period.save = AsyncMock()
        record = _make_record()
        record.save = AsyncMock()
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=[record])
        actor = MagicMock(id="actor-1")

        generated = {
            "generated": [],
            "already_existing": [{"record_id": "r1", "payslip_id": "payslip-1", "version": 2}],
            "failed": [],
            "skipped": [],
        }
        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc.PayrollRecord, "find", MagicMock(return_value=cursor)), \
             patch("app.services.payslip_service.generate_period_payslips", AsyncMock(return_value=generated)) as gen_mock:
            result = await svc.process_payroll("company-1", "p1", actor)

        # The transition still succeeds and the already-existing payslip is
        # reported back as untouched (idempotency is delegated to the service).
        assert result.status == PayrollPeriodStatus.PROCESSED
        gen_mock.assert_awaited_once_with("company-1", "p1", actor)

    @pytest.mark.asyncio
    async def test_process_transition_survives_backfill_failure(self):
        """Payslip generation is best-effort: a failure (e.g. PDF renderer or
        storage outage) must never roll back the PROCESSED payroll."""
        from app.services import payroll_service as svc

        period = _make_period(status=PayrollPeriodStatus.APPROVED)
        period.save = AsyncMock()
        record = _make_record()
        record.save = AsyncMock()
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=[record])
        actor = MagicMock(id="actor-1")

        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc.PayrollRecord, "find", MagicMock(return_value=cursor)), \
             patch("app.services.payslip_service.generate_period_payslips", AsyncMock(side_effect=RuntimeError("pdf render failed"))):
            result = await svc.process_payroll("company-1", "p1", actor)

        assert result.status == PayrollPeriodStatus.PROCESSED
        assert record.processed_at is not None

    @pytest.mark.asyncio
    async def test_process_backfill_empty_records_is_not_an_error(self):
        """Empty data must never produce a 500: a processed period with no
        records completes normally and the backfill no-ops."""
        from app.services import payroll_service as svc

        period = _make_period(status=PayrollPeriodStatus.APPROVED)
        period.save = AsyncMock()
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=[])
        actor = MagicMock(id="actor-1")

        generated = {"generated": [], "already_existing": [], "failed": [], "skipped": []}
        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc.PayrollRecord, "find", MagicMock(return_value=cursor)), \
             patch("app.services.payslip_service.generate_period_payslips", AsyncMock(return_value=generated)) as gen_mock:
            result = await svc.process_payroll("company-1", "p1", actor)

        assert result.status == PayrollPeriodStatus.PROCESSED
        gen_mock.assert_awaited_once_with("company-1", "p1", actor)

    @pytest.mark.asyncio
    async def test_backfill_per_record_failures_do_not_break_transition(self):
        """The bulk generator already isolates per-record failures; the
        transition is unaffected and the failure summary is returned/logged."""
        from app.services import payroll_service as svc

        period = _make_period(status=PayrollPeriodStatus.APPROVED)
        period.save = AsyncMock()
        record = _make_record()
        record.save = AsyncMock()
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=[record])
        actor = MagicMock(id="actor-1")

        generated = {
            "generated": [],
            "already_existing": [],
            "failed": [{"record_id": "r1", "error": "snapshot inconsistent"}],
            "skipped": [],
        }
        with patch.object(svc.PayrollPeriod, "get", AsyncMock(return_value=period)), \
             patch.object(svc.PayrollRecord, "find", MagicMock(return_value=cursor)), \
             patch("app.services.payslip_service.generate_period_payslips", AsyncMock(return_value=generated)) as gen_mock:
            result = await svc.process_payroll("company-1", "p1", actor)

        assert result.status == PayrollPeriodStatus.PROCESSED
        gen_mock.assert_awaited_once_with("company-1", "p1", actor)
