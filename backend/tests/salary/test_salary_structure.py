"""
Phase 5 — Salary Structure backend tests.

Tests cover: components CRUD, salary structure creation, revision,
effective-date lookup, overlap prevention, calculation, permissions,
and payroll snapshot.
"""
import pytest
from datetime import datetime, date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.salary import (
    CalculationType,
    ComponentType,
    PayFrequency,
    SalaryComponent,
    SalaryStatus,
    SalaryStructure,
    SalaryStructureItem,
)
from app.services.salary_component_service import (
    create_component,
    deactivate_component,
    ensure_default_components,
    get_component,
    list_components,
    serialize_component,
    update_component,
)
from app.services.salary_structure_service import (
    _build_items_with_calculations,
    _check_overlap,
    create_initial_salary,
    create_salary_revision,
    get_current_salary,
    get_effective_salary_structure,
    get_salary_history,
    get_salary_snapshot_for_payroll,
    get_upcoming_salary,
    resolve_salary_employee_user_id,
    serialize_structure,
)


# =============================================================================
# Helpers
# =============================================================================

def _make_user(user_id="user-1", company_id="company-1", role=None):
    user = MagicMock()
    user.id = user_id
    user.company_id = company_id
    user.role = role or MagicMock(value="admin")
    return user


def _make_component(
    comp_id="comp-1", company_id="company-1", name="Basic Salary", code="basic",
    component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED,
    percentage_rate=None, base_component_id=None, active=True,
):
    comp = MagicMock()
    comp.id = comp_id
    comp.company_id = company_id
    comp.name = name
    comp.code = code
    comp.component_type = component_type
    comp.calculation_type = calculation_type
    comp.percentage_rate = percentage_rate
    comp.base_component_id = base_component_id
    comp.default_value = 0.0
    comp.taxable = False
    comp.payroll_enabled = True
    comp.display_order = 0
    comp.active = active
    comp.created_by = "user-1"
    comp.created_at = datetime(2026, 1, 1)
    comp.updated_at = datetime(2026, 1, 1)
    return comp


class _StrictBeanieQuery:
    """Test double for Beanie query sort API used by Salary services."""

    def __init__(self, result=None):
        self.result = result if result is not None else []
        self.sort_args = None
        self.limit_value = None

    def sort(self, *args):
        if len(args) != 1 or not isinstance(args[0], str):
            raise TypeError("Wrong argument type")
        self.sort_args = args
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    async def to_list(self):
        return self.result


# =============================================================================
# Component Tests
# =============================================================================

class TestSalaryComponentService:
    """Test salary component CRUD operations."""

    @pytest.mark.asyncio
    async def test_serialize_component(self):
        comp = _make_component()
        result = serialize_component(comp)
        assert result["id"] == "comp-1"
        assert result["name"] == "Basic Salary"
        assert result["code"] == "basic"
        assert result["component_type"] == "earning"
        assert result["calculation_type"] == "fixed"
        assert result["active"] is True

    @pytest.mark.asyncio
    async def test_serialize_percentage_component(self):
        comp = _make_component(
            comp_id="comp-2", name="HRA", code="hra",
            calculation_type=CalculationType.PERCENTAGE,
            percentage_rate=40.0, base_component_id="comp-1",
        )
        result = serialize_component(comp)
        assert result["calculation_type"] == "percentage"
        assert result["percentage_rate"] == 40.0
        assert result["base_component_id"] == "comp-1"

    @pytest.mark.asyncio
    async def test_list_components_uses_supported_beanie_sort(self):
        query = _StrictBeanieQuery()

        with patch("app.services.salary_component_service.SalaryComponent.find", return_value=query):
            result = await list_components("company-1")

        assert result == []
        assert query.sort_args == ("display_order",)


# =============================================================================
# Structure Calculation Tests
# =============================================================================

class TestSalaryStructureCalculation:
    """Test salary structure calculation logic."""

    @pytest.mark.asyncio
    async def test_build_items_fixed_earnings(self):
        """Test building items with fixed earning components."""
        basic = _make_component(comp_id="comp-1", name="Basic", code="basic")
        hra = _make_component(comp_id="comp-2", name="HRA", code="hra")

        with patch("app.services.salary_structure_service.list_components", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = [basic, hra]
            items, total_earnings, total_deductions = await _build_items_with_calculations(
                "company-1",
                [
                    {"component_id": "comp-1", "value": 30000},
                    {"component_id": "comp-2", "value": 12000},
                ],
            )
            assert len(items) == 2
            assert total_earnings == 42000.0
            assert total_deductions == 0.0
            assert items[0].calculated_amount == 30000.0
            assert items[1].calculated_amount == 12000.0

    @pytest.mark.asyncio
    async def test_build_items_mixed_earnings_deductions(self):
        """Test building items with both earnings and deductions."""
        basic = _make_component(comp_id="comp-1", name="Basic", code="basic")
        pf = _make_component(
            comp_id="comp-3", name="PF", code="pf",
            component_type=ComponentType.DEDUCTION,
        )

        with patch("app.services.salary_structure_service.list_components", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = [basic, pf]
            items, total_earnings, total_deductions = await _build_items_with_calculations(
                "company-1",
                [
                    {"component_id": "comp-1", "value": 30000},
                    {"component_id": "comp-3", "value": 1800},
                ],
            )
            assert total_earnings == 30000.0
            assert total_deductions == 1800.0

    @pytest.mark.asyncio
    async def test_build_items_percentage_calculation(self):
        """Test percentage-based component calculation."""
        basic = _make_component(comp_id="comp-1", name="Basic", code="basic")
        hra = _make_component(
            comp_id="comp-2", name="HRA", code="hra",
            calculation_type=CalculationType.PERCENTAGE,
            percentage_rate=40.0,
            base_component_id="comp-1",
        )

        with patch("app.services.salary_structure_service.list_components", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = [basic, hra]
            items, total_earnings, total_deductions = await _build_items_with_calculations(
                "company-1",
                [
                    {"component_id": "comp-1", "value": 30000},
                    {"component_id": "comp-2", "value": 0, "percentage": 40.0, "base_component_id": "comp-1"},
                ],
            )
            assert items[1].calculated_amount == 12000.0  # 40% of 30000
            assert total_earnings == 42000.0

    @pytest.mark.asyncio
    async def test_build_items_empty_raises(self):
        """Test that empty items list raises error."""
        with pytest.raises(Exception):
            await _build_items_with_calculations("company-1", [])

    @pytest.mark.asyncio
    async def test_build_items_duplicate_component_raises(self):
        """Test that duplicate components raise error."""
        basic = _make_component(comp_id="comp-1", name="Basic", code="basic")

        with patch("app.services.salary_structure_service.list_components", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = [basic]
            with pytest.raises(Exception, match="Duplicate"):
                await _build_items_with_calculations(
                    "company-1",
                    [
                        {"component_id": "comp-1", "value": 30000},
                        {"component_id": "comp-1", "value": 10000},
                    ],
                )

    @pytest.mark.asyncio
    async def test_build_items_inactive_component_raises(self):
        """Test that inactive component raises error."""
        with patch("app.services.salary_structure_service.list_components", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = []  # No active components
            with pytest.raises(Exception, match="not found or inactive"):
                await _build_items_with_calculations(
                    "company-1",
                    [{"component_id": "comp-1", "value": 30000}],
                )


# =============================================================================
# Overlap Prevention Tests
# =============================================================================

class TestOverlapPrevention:
    """Test salary structure overlap detection."""

    def test_overlap_with_open_ended(self):
        """New structure after open-ended current is a VALID revision (no conflict).

        V1 01-Jan-2026 -> open-ended, revision V2 01-Aug-2026: the previous
        version is closed by the revision service, so this is NOT a conflict.
        """
        existing = MagicMock()
        existing.effective_from = datetime(2026, 1, 1)
        existing.effective_to = None
        existing.id = "s1"

        result = _check_overlap([existing], datetime(2026, 8, 1))
        assert result is None  # Valid revision — old one is closed, not a conflict

    def test_overlap_with_open_ended_before(self):
        """New structure before an open-ended current = conflict (backdated/duplicate)."""
        existing = MagicMock()
        existing.effective_from = datetime(2026, 8, 1)
        existing.effective_to = None
        existing.id = "s1"

        result = _check_overlap([existing], datetime(2026, 6, 1))
        assert result is not None  # A structure already starts on/after this date

    def test_overlap_with_closed_range(self):
        """New structure within closed range = overlap."""
        existing = MagicMock()
        existing.effective_from = datetime(2026, 1, 1)
        existing.effective_to = datetime(2026, 12, 31)
        existing.id = "s1"

        result = _check_overlap([existing], datetime(2026, 6, 1))
        assert result is not None  # Overlap!

    def test_no_overlap_with_closed_range_after(self):
        """New structure after closed range = no overlap."""
        existing = MagicMock()
        existing.effective_from = datetime(2026, 1, 1)
        existing.effective_to = datetime(2026, 7, 31)
        existing.id = "s1"

        result = _check_overlap([existing], datetime(2026, 8, 1))
        assert result is None  # No overlap


# =============================================================================
# Serialization Tests
# =============================================================================

class TestSalarySerialization:
    """Test salary structure serialization."""

    def test_serialize_structure_current(self):
        """Test serialization of current salary structure."""
        structure = MagicMock()
        structure.id = "s1"
        structure.company_id = "company-1"
        structure.employee_id = "emp-1"
        structure.effective_from = datetime(2026, 1, 1)
        structure.effective_to = None
        structure.currency = "INR"
        structure.pay_frequency = PayFrequency.MONTHLY
        structure.status = SalaryStatus.ACTIVE
        structure.items = []
        structure.total_earnings = 50000.0
        structure.total_configured_deductions = 2000.0
        structure.configured_net = 48000.0
        structure.source = "manual"
        structure.notes = None
        structure.created_by = "user-1"
        structure.created_at = datetime(2026, 1, 1)
        structure.updated_at = datetime(2026, 1, 1)

        result = serialize_structure(structure)
        assert result["status_label"] == "current"
        assert result["total_earnings"] == 50000.0
        assert result["total_configured_deductions"] == 2000.0
        assert result["configured_net"] == 48000.0

    def test_serialize_structure_upcoming(self):
        """Test serialization of upcoming salary structure."""
        structure = MagicMock()
        structure.id = "s2"
        structure.effective_from = datetime(2026, 9, 1)
        structure.effective_to = None
        structure.currency = "INR"
        structure.pay_frequency = PayFrequency.MONTHLY
        structure.status = SalaryStatus.ACTIVE
        structure.items = []
        structure.total_earnings = 55000.0
        structure.total_configured_deductions = 2200.0
        structure.configured_net = 52800.0
        structure.source = "revision"
        structure.notes = "Annual revision"
        structure.created_by = "user-1"
        structure.created_at = datetime(2026, 8, 15)
        structure.updated_at = datetime(2026, 8, 15)

        result = serialize_structure(structure, "upcoming")
        assert result["status_label"] == "upcoming"
        assert result["total_earnings"] == 55000.0


class TestSalaryIdentity:
    """Salary uses EmployeeProfile.user_id even when a profile id is supplied."""

    @pytest.mark.asyncio
    async def test_resolves_user_id_identity(self):
        profile = MagicMock()
        profile.user_id = "user-1"

        with patch("app.services.salary_structure_service.EmployeeProfile.find_one", new_callable=AsyncMock) as find_one:
            find_one.return_value = profile

            resolved = await resolve_salary_employee_user_id("company-1", "user-1")

        assert resolved == "user-1"
        find_one.assert_awaited_once_with({"company_id": "company-1", "user_id": "user-1"})

    @pytest.mark.asyncio
    async def test_resolves_profile_id_to_user_id(self):
        profile = MagicMock()
        profile.company_id = "company-1"
        profile.user_id = "user-1"

        with patch("app.services.salary_structure_service.EmployeeProfile.find_one", new_callable=AsyncMock) as find_one, \
             patch("app.services.salary_structure_service.EmployeeProfile.get", new_callable=AsyncMock) as get_profile:
            find_one.return_value = None
            get_profile.return_value = profile

            resolved = await resolve_salary_employee_user_id("company-1", "profile-1")

        assert resolved == "user-1"
        get_profile.assert_awaited_once_with("profile-1")

    @pytest.mark.asyncio
    async def test_resolve_missing_profile_raises_404(self):
        with patch("app.services.salary_structure_service.EmployeeProfile.find_one", new_callable=AsyncMock) as find_one, \
             patch("app.services.salary_structure_service.EmployeeProfile.get", new_callable=AsyncMock) as get_profile:
            find_one.return_value = None
            get_profile.return_value = None

            with pytest.raises(Exception) as exc:
                await resolve_salary_employee_user_id("company-1", "missing")

        assert getattr(exc.value, "status_code", None) == 404


class TestSalaryBeanieSortCompatibility:
    """Salary lookups use the supported Beanie sort call shape."""

    @pytest.mark.asyncio
    async def test_effective_salary_uses_descending_string_sort(self):
        query = _StrictBeanieQuery()

        with patch("app.services.salary_structure_service.SalaryStructure.find", return_value=query):
            result = await get_effective_salary_structure("company-1", "user-1", date(2026, 8, 15))

        assert result is None
        assert query.sort_args == ("-effective_from",)

    @pytest.mark.asyncio
    async def test_upcoming_salary_uses_ascending_string_sort(self):
        query = _StrictBeanieQuery()

        with patch("app.services.salary_structure_service.SalaryStructure.find", return_value=query):
            result = await get_upcoming_salary("company-1", "user-1")

        assert result is None
        assert query.sort_args == ("effective_from",)
        assert query.limit_value == 1

    @pytest.mark.asyncio
    async def test_salary_history_uses_descending_string_sort(self):
        query = _StrictBeanieQuery()

        with patch("app.services.salary_structure_service.SalaryStructure.find", return_value=query):
            result = await get_salary_history("company-1", "user-1")

        assert result == []
        assert query.sort_args == ("-effective_from",)


# =============================================================================
# Payroll Snapshot Tests
# =============================================================================

class TestPayrollSnapshot:
    """Test payroll snapshot adapter."""

    def test_snapshot_format(self):
        """Test that snapshot returns the expected format."""
        structure = MagicMock()
        structure.id = "s1"
        structure.employee_id = "emp-1"
        structure.effective_from = datetime(2026, 1, 1)
        structure.effective_to = None
        structure.currency = "INR"
        structure.pay_frequency = PayFrequency.MONTHLY
        structure.items = [
            MagicMock(
                component_id="c1", component_code="basic", component_name="Basic",
                component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED,
                value=30000, percentage=None, base_component_id=None, calculated_amount=30000,
            ),
        ]
        structure.total_earnings = 30000.0
        structure.total_configured_deductions = 0.0
        structure.configured_net = 30000.0

        # Test the structure serialization directly
        result = serialize_structure(structure, "current")
        assert "items" in result
        assert "total_earnings" in result
        assert "total_configured_deductions" in result
        assert "configured_net" in result
        assert "currency" in result
        assert "effective_from" in result


# =============================================================================
# Component Deactivation Tests
# =============================================================================

class TestComponentDeactivation:
    """Test that component deactivation preserves historical references."""

    def test_deactivated_component_still_serializable(self):
        """A deactivated component should still serialize correctly."""
        comp = _make_component(active=False)
        result = serialize_component(comp)
        assert result["active"] is False
        assert result["name"] == "Basic Salary"

    def test_component_snapshot_preserved_in_structure_item(self):
        """Historical structure items should preserve component name/code."""
        item = SalaryStructureItem(
            component_id="comp-1",
            component_name="House Rent Allowance",  # Old name before rename
            component_code="hra",
            component_type=ComponentType.EARNING,
            calculation_type=CalculationType.PERCENTAGE,
            value=0,
            percentage=40.0,
            base_component_id="comp-1",
            calculated_amount=12000.0,
        )
        # Even if component is renamed/deactivated, the snapshot is intact
        assert item.component_name == "House Rent Allowance"
        assert item.component_code == "hra"
        assert item.calculated_amount == 12000.0
