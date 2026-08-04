"""Tests for the global search endpoint helpers and query construction."""
from types import SimpleNamespace

import pytest

from app.models.user import UserRole


def user(user_id, role, company_id="company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id)


class TestRegexEscaping:
    def test_plain_query_is_not_escaped(self):
        from app.api.v1.endpoints.search import _regex

        assert _regex("website") == {"$regex": "website", "$options": "i"}

    def test_special_characters_are_escaped(self):
        from app.api.v1.endpoints.search import _regex

        pattern = _regex("C++ (v2.0)")
        # re.escape escapes regex metacharacters so they match literally.
        assert pattern["$options"] == "i"
        assert "(" not in pattern["$regex"] or "\\(" in pattern["$regex"]
        assert "+" not in pattern["$regex"] or "\\+" in pattern["$regex"]

    def test_escaped_pattern_compiles(self):
        from app.api.v1.endpoints.search import _regex
        import re

        pattern = _regex("100% [done] (urgent)*")
        # Must not raise — this is the regression: raw input used to crash MongoDB regex.
        re.compile(pattern["$regex"])


class TestCompanyScope:
    def test_super_admin_has_no_scope(self):
        from app.api.v1.endpoints.search import _company_scope

        assert _company_scope(user("super-1", UserRole.SUPER_ADMIN)) == {}

    def test_regular_user_is_scoped_to_company(self):
        from app.api.v1.endpoints.search import _company_scope

        assert _company_scope(user("emp-1", UserRole.EMPLOYEE)) == {"company_id": "company-1"}

    def test_admin_is_scoped_to_company(self):
        from app.api.v1.endpoints.search import _company_scope

        assert _company_scope(user("admin-1", UserRole.ADMIN)) == {"company_id": "company-1"}


@pytest.mark.asyncio
async def test_global_search_builds_scoped_queries(monkeypatch):
    """Search queries must scope to the company and escape the raw query."""
    import re

    from app.api.v1.endpoints import search as search_module

    captured = {}

    class FakeQuery:
        def __init__(self, query):
            captured.setdefault("queries", []).append(query)

        def limit(self, n):
            return self

        async def to_list(self):
            return []

    def fake_find(query):
        return FakeQuery(query)

    for model_name in ("Task", "Project", "Ticket", "Client"):
        monkeypatch.setattr(f"app.api.v1.endpoints.search.{model_name}.find", fake_find)

    current_user = user("emp-1", UserRole.EMPLOYEE)
    await search_module.global_search("C++ (urgent)", current_user)

    expected_regex = re.escape("C++ (urgent)")
    assert len(captured["queries"]) == 4
    for query in captured["queries"]:
        assert query["company_id"] == "company-1"
        # Every regex in the query must be the escaped form of the raw input.
        for clause in query["$or"]:
            for field, condition in clause.items():
                assert condition == {"$regex": expected_regex, "$options": "i"}
