"""
Phase 5/11 — Salary revision & historical lookup regression tests.

Covers the Phase 11 closure fixes:
- Normal revisions of an open-ended structure are VALID (previous version is closed).
- Historical lookup is driven by effective_from/effective_to, never current status.
- Same-day / backdated / mid-history revisions are rejected (409).
- A concurrent duplicate revision is detected and rejected.
"""
from contextlib import ExitStack

import pytest
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models.employee_profile import EmploymentStatus
from app.models.salary import SalaryStatus
from app.services.salary_structure_service import (
    create_salary_revision,
    get_effective_salary_structure,
)

pytestmark = pytest.mark.asyncio


def _profile(status=EmploymentStatus.ACTIVE):
    p = MagicMock()
    p.id = "p1"
    p.employment_status = status
    return p


def _structure(sid, effective_from, effective_to=None, status=SalaryStatus.ACTIVE):
    s = MagicMock()
    s.id = sid
    s.effective_from = effective_from
    s.effective_to = effective_to
    s.status = status
    s.save = AsyncMock()
    s.insert = AsyncMock()
    s.delete = AsyncMock()
    return s


def _mock_find(structures):
    """SalaryStructure.find mock that applies the effective_from <= $lte filter
    and sorts by effective_from descending (like the real query)."""
    def _side_effect(query):
        q = MagicMock()
        q.sort.return_value = q

        async def _to_list():
            end_dt = (query.get("effective_from") or {}).get("$lte")
            items = [s for s in structures if end_dt is None or s.effective_from <= end_dt]
            return sorted(items, key=lambda s: s.effective_from, reverse=True)

        q.to_list = _to_list
        return q

    mock = MagicMock()
    mock.side_effect = _side_effect
    return mock


# =============================================================================
# Effective lookup — historical (SUPERSEDED) versions must be returned
# =============================================================================

class TestEffectiveLookup:
    async def test_lookup_query_never_filters_by_status(self):
        """get_effective_salary_structure must be range-driven, not status-driven."""
        query = MagicMock()
        query.sort.return_value = query
        query.to_list = AsyncMock(return_value=[])

        with patch("app.services.salary_structure_service.SalaryStructure.find", return_value=query) as mock_find:
            await get_effective_salary_structure("company-1", "user-1", date(2026, 7, 15))

        query_dict = mock_find.call_args[0][0]
        assert "status" not in query_dict

    async def test_july_returns_v1_august_returns_v2(self):
        """V1 Jan 1 → Jul 31 (SUPERSEDED), V2 Aug 1 → open (ACTIVE)."""
        v1 = _structure("s1", datetime(2026, 1, 1), datetime(2026, 7, 31, 23, 59, 59), SalaryStatus.SUPERSEDED)
        v2 = _structure("s2", datetime(2026, 8, 1), None, SalaryStatus.ACTIVE)

        with patch("app.services.salary_structure_service.SalaryStructure.find", _mock_find([v1, v2])):
            july = await get_effective_salary_structure("company-1", "user-1", date(2026, 7, 15))
            august = await get_effective_salary_structure("company-1", "user-1", date(2026, 8, 15))

        assert str(july.id) == "s1"
        assert str(august.id) == "s2"


# =============================================================================
# Revision semantics
# =============================================================================

class TestSalaryRevision:
    def _salary_cls(self, existing, find_one_result=None):
        """A SalaryStructure class mock whose find/find_one mirror the real API
        and whose constructor returns a lightweight insertable structure."""
        cls = MagicMock()
        cls.find = _mock_find(existing)
        cls.find_one = AsyncMock(return_value=find_one_result)
        cls.return_value = MagicMock(insert=AsyncMock(), delete=AsyncMock())
        return cls

    async def test_normal_revision_closes_previous_structure(self):
        """V1 Jan 1 → open; revision Aug 1 must succeed and close V1 at Jul 31."""
        v1 = _structure("s1", datetime(2026, 1, 1), None, SalaryStatus.ACTIVE)
        actor = MagicMock()
        actor.id = "actor-1"

        with ExitStack() as stack:
            stack.enter_context(patch(
                "app.services.salary_structure_service.EmployeeProfile.find_one",
                AsyncMock(return_value=_profile()),
            ))
            salary_cls = self._salary_cls([v1])
            stack.enter_context(patch(
                "app.services.salary_structure_service.SalaryStructure", salary_cls,
            ))
            stack.enter_context(patch(
                "app.services.salary_structure_service._build_items_with_calculations",
                AsyncMock(return_value=([], 50000.0, 2000.0)),
            ))
            created = await create_salary_revision(
                "company-1", "user-1", actor,
                {"effective_from": "2026-08-01", "items": [{"component_id": "c1", "value": 50000}]},
            )

        assert v1.effective_to == datetime(2026, 8, 1) - timedelta(seconds=1)
        assert v1.status == SalaryStatus.SUPERSEDED
        v1.save.assert_awaited()
        created.insert.assert_awaited()
        kwargs = salary_cls.call_args.kwargs
        assert kwargs["employee_id"] == "user-1"
        assert kwargs["effective_from"] == datetime(2026, 8, 1)
        assert kwargs["status"] == SalaryStatus.ACTIVE
        assert kwargs["source"] == "revision"

    async def test_future_revision_allowed(self):
        """A future-dated revision is valid and closes the previous structure."""
        v1 = _structure("s1", datetime(2026, 1, 1), None, SalaryStatus.ACTIVE)
        actor = MagicMock()
        actor.id = "actor-1"

        with ExitStack() as stack:
            stack.enter_context(patch(
                "app.services.salary_structure_service.EmployeeProfile.find_one",
                AsyncMock(return_value=_profile()),
            ))
            salary_cls = self._salary_cls([v1])
            stack.enter_context(patch(
                "app.services.salary_structure_service.SalaryStructure", salary_cls,
            ))
            stack.enter_context(patch(
                "app.services.salary_structure_service._build_items_with_calculations",
                AsyncMock(return_value=([], 50000.0, 2000.0)),
            ))
            await create_salary_revision(
                "company-1", "user-1", actor,
                {"effective_from": "2026-09-01", "items": [{"component_id": "c1", "value": 50000}]},
            )

        assert v1.effective_to == datetime(2026, 9, 1) - timedelta(seconds=1)
        assert salary_cls.call_args.kwargs["effective_from"] == datetime(2026, 9, 1)

    async def test_same_day_revision_rejected(self):
        """A revision with the same effective date as an existing structure is a conflict."""
        v1 = _structure("s1", datetime(2026, 8, 1), None, SalaryStatus.ACTIVE)
        actor = MagicMock()
        actor.id = "actor-1"

        with patch(
            "app.services.salary_structure_service.EmployeeProfile.find_one",
            AsyncMock(return_value=_profile()),
        ), patch("app.services.salary_structure_service.SalaryStructure.find", _mock_find([v1])):
            with pytest.raises(HTTPException) as exc:
                await create_salary_revision(
                    "company-1", "user-1", actor,
                    {"effective_from": "2026-08-01", "items": [{"component_id": "c1", "value": 1}]},
                )

        assert exc.value.status_code == 409

    async def test_backdated_revision_before_existing_rejected(self):
        """A revision dated before an existing structure's effective_from is a conflict."""
        v1 = _structure("s1", datetime(2026, 8, 1), None, SalaryStatus.ACTIVE)
        actor = MagicMock()
        actor.id = "actor-1"

        with patch(
            "app.services.salary_structure_service.EmployeeProfile.find_one",
            AsyncMock(return_value=_profile()),
        ), patch("app.services.salary_structure_service.SalaryStructure.find", _mock_find([v1])):
            with pytest.raises(HTTPException) as exc:
                await create_salary_revision(
                    "company-1", "user-1", actor,
                    {"effective_from": "2026-06-01", "items": [{"component_id": "c1", "value": 1}]},
                )

        assert exc.value.status_code == 409

    async def test_revision_inside_closed_history_rejected(self):
        """V1 Jan→Jul (closed), V2 Aug→open: a Jun revision inside V1's range is rejected."""
        v1 = _structure("s1", datetime(2026, 1, 1), datetime(2026, 7, 31, 23, 59, 59), SalaryStatus.SUPERSEDED)
        v2 = _structure("s2", datetime(2026, 8, 1), None, SalaryStatus.ACTIVE)
        actor = MagicMock()
        actor.id = "actor-1"

        with patch(
            "app.services.salary_structure_service.EmployeeProfile.find_one",
            AsyncMock(return_value=_profile()),
        ), patch("app.services.salary_structure_service.SalaryStructure.find", _mock_find([v1, v2])):
            with pytest.raises(HTTPException) as exc:
                await create_salary_revision(
                    "company-1", "user-1", actor,
                    {"effective_from": "2026-06-01", "items": [{"component_id": "c1", "value": 1}]},
                )

        assert exc.value.status_code == 409

    async def test_concurrent_duplicate_revision_detected(self):
        """A revision inserted concurrently with the same effective date is removed (409)."""
        v1 = _structure("s1", datetime(2026, 1, 1), None, SalaryStatus.ACTIVE)
        duplicate = _structure("s-other", datetime(2026, 8, 1), None, SalaryStatus.ACTIVE)
        actor = MagicMock()
        actor.id = "actor-1"

        fake_structure = MagicMock(insert=AsyncMock(), delete=AsyncMock())
        salary_cls = MagicMock(return_value=fake_structure)
        salary_cls.find = _mock_find([v1])
        salary_cls.find_one = AsyncMock(return_value=duplicate)
        with ExitStack() as stack:
            stack.enter_context(patch(
                "app.services.salary_structure_service.EmployeeProfile.find_one",
                AsyncMock(return_value=_profile()),
            ))
            stack.enter_context(patch(
                "app.services.salary_structure_service.SalaryStructure", salary_cls,
            ))
            stack.enter_context(patch(
                "app.services.salary_structure_service._build_items_with_calculations",
                AsyncMock(return_value=([], 50000.0, 2000.0)),
            ))
            with pytest.raises(HTTPException) as exc:
                await create_salary_revision(
                    "company-1", "user-1", actor,
                    {"effective_from": "2026-08-01", "items": [{"component_id": "c1", "value": 1}]},
                )

        assert exc.value.status_code == 409
        fake_structure.delete.assert_awaited()
