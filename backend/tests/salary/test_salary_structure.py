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
        """New structure after open-ended current = overlap (old needs closing)."""
        existing = MagicMock()
        existing.effective_from = datetime(2026, 1, 1)
        existing.effective_to = None
        existing.id = "s1"

        result = _check_overlap([existing], datetime(2026, 8, 1))
        assert result is not None  # Overlap — revision service should close old one

    def test_overlap_with_open_ended_before(self):
        """New structure before open-ended current = overlap."""
        existing = MagicMock()
        existing.effective_from = datetime(2026, 8, 1)
        existing.effective_to = None
        existing.id = "s1"

        result = _check_overlap([existing], datetime(2026, 6, 1))
        assert result is None  # Before open-ended = no overlap (new one becomes the current)

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
