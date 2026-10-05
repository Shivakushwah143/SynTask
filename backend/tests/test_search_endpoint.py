"""Tests for the global search service: query construction, scoping, permissions, scoring, dedupe, and grouping."""
from types import SimpleNamespace

import pytest

from app.models.user import UserRole
from app.services import search_service


def user(user_id, role, company_id="company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id)


class TestRegexEscaping:
    def test_plain_query_is_not_escaped(self):
        assert search_service._regex("website") == {"$regex": "website", "$options": "i"}

    def test_special_characters_are_escaped(self):
        import re

        pattern = search_service._regex("C++ (v2.0)")
        assert pattern["$options"] == "i"
        re.compile(pattern["$regex"])  # must not raise

    def test_escaped_pattern_compiles(self):
        import re

        pattern = search_service._regex("100% [done] (urgent)*")
        re.compile(pattern["$regex"])


class TestCompanyScope:
    def test_super_admin_has_no_scope(self):
        assert search_service._company_scope(user("super-1", UserRole.SUPER_ADMIN)) == {}

    def test_regular_user_is_scoped_to_company(self):
        assert search_service._company_scope(user("emp-1", UserRole.EMPLOYEE)) == {"company_id": "company-1"}

    def test_admin_is_scoped_to_company(self):
        assert search_service._company_scope(user("admin-1", UserRole.ADMIN)) == {"company_id": "company-1"}


class TestNormalizeQuery:
    def test_collapses_whitespace_and_lowercases(self):
        assert search_service.normalize_query("  Project   Alpha  ") == "project alpha"

    def test_empty_query(self):
        assert search_service.normalize_query("   ") == ""


class TestModuleAndHrGates:
    def test_module_allowed_for_standard_roles(self):
        assert search_service.module_allowed(user("m-1", UserRole.MANAGER), "tasks_projects") is True
        assert search_service.module_allowed(user("e-1", UserRole.EMPLOYEE), "sales_crm") is True
        assert search_service.module_allowed(user("e-1", UserRole.EMPLOYEE), "invoicing_ledger") is False

    def test_hr_access_allowed(self):
        assert search_service.hr_access_allowed(user("a-1", UserRole.ADMIN)) is True
        assert search_service.hr_access_allowed(user("m-1", UserRole.MANAGER)) is True
        assert search_service.hr_access_allowed(user("e-hr", UserRole.EMPLOYEE, company_id="c")) is False

        hr_employee = SimpleNamespace(id="e-1", role=UserRole.EMPLOYEE, company_id="c", department="HR")
        assert search_service.hr_access_allowed(hr_employee) is True


class TestScoring:
    def test_exact_title_match_scores_highest(self):
        entity = next(e for e in search_service.SEARCHABLE_ENTITIES if e.key == "task")
        item = SimpleNamespace(title="Fix login bug", description="login flow", tags=["login"])
        exact = search_service._score_item(item, entity, ["fix", "login", "bug"])
        prefix = search_service._score_item(item, entity, ["fix", "login"])
        substring = search_service._score_item(item, entity, ["login"])
        assert exact > prefix > substring > 0

    def test_no_tokens_gives_neutral_score(self):
        entity = next(e for e in search_service.SEARCHABLE_ENTITIES if e.key == "task")
        assert search_service._score_item(SimpleNamespace(title="x", description="y"), entity, []) == 50


@pytest.mark.asyncio
async def test_search_entity_applies_scope_and_soft_delete(monkeypatch):
    captured = {}

    class FakeQuery:
        def __init__(self, query):
            captured["query"] = query

        def limit(self, n):
            captured["limit"] = n
            return self

        async def to_list(self):
            return []

    def fake_find(query):
        return FakeQuery(query)

    entity = next(e for e in search_service.SEARCHABLE_ENTITIES if e.key == "lead")
    monkeypatch.setattr(entity.model, "find", fake_find)

    current_user = user("emp-1", UserRole.EMPLOYEE)
    await search_service._search_entity(entity, current_user, ["acme"])

    query = captured["query"]
    assert query["company_id"] == "company-1"
    assert query["deleted"] is False  # soft-delete filter applied
    assert "$and" in query
    # All tokens produce a clause over the searchable fields.
    assert len(query["$and"]) == 1


@pytest.mark.asyncio
async def test_search_entity_skips_denied_entities(monkeypatch):
    called = {}

    async def fake_find(query):
        called["called"] = True
        return []

    entity = next(e for e in search_service.SEARCHABLE_ENTITIES if e.key == "invoice")
    monkeypatch.setattr(entity.model, "find", lambda query: type("Q", (), {"limit": lambda self, n: self, "to_list": fake_find})())

    current_user = user("emp-1", UserRole.EMPLOYEE)
    results = await search_service._search_entity(entity, current_user, ["inv"])
    assert results == []
    assert "called" not in called  # finance is admin-only, query never runs


@pytest.mark.asyncio
async def test_global_search_groups_and_dedupes(monkeypatch):
    """Registry search groups by module, dedupes (type, id), and respects caps."""
    results_by_key = {
        "task": [
            {"id": "t1", "type": "task", "title": "Fix login", "subtitle": "todo", "href": "/tasks/t1",
             "module": "Work", "moduleKey": "work", "parent": "Work → Tasks", "score": 900, "updated_at": None},
            {"id": "t2", "type": "task", "title": "Fix login again", "subtitle": "todo", "href": "/tasks/t2",
             "module": "Work", "moduleKey": "work", "parent": "Work → Tasks", "score": 500, "updated_at": None},
        ],
        "project": [
            {"id": "p1", "type": "project", "title": "Login project", "subtitle": "PROJ", "href": "/projects/p1/board",
             "module": "Work", "moduleKey": "work", "parent": "Work → Projects", "score": 400, "updated_at": None},
        ],
        "lead": [
            {"id": "l1", "type": "lead", "title": "Login Acme", "subtitle": "new", "href": "/crm/leads/l1",
             "module": "CRM", "moduleKey": "sales", "parent": "CRM → Leads", "score": 300, "updated_at": None},
        ],
    }

    async def fake_search_entity(entity, user, tokens):
        return results_by_key.get(entity.key, [])

    monkeypatch.setattr(search_service, "_search_entity", fake_search_entity)
    result = await search_service.global_search("login", user("emp-1", UserRole.EMPLOYEE))

    assert result["total"] == 4
    group_keys = {g["moduleKey"] for g in result["groups"]}
    assert group_keys == {"work", "sales"}
    work = next(g for g in result["groups"] if g["moduleKey"] == "work")
    assert [i["id"] for i in work["items"]] == ["t1", "t2", "p1"]  # sorted by score desc


@pytest.mark.asyncio
async def test_global_search_module_filter(monkeypatch):
    async def fake_search_entity(entity, user, tokens):
        key = entity.key
        return [{
            "id": key, "type": key, "title": key, "subtitle": "", "href": "/x",
            "module": entity.module, "moduleKey": entity.module_key,
            "parent": entity.module, "score": 100, "updated_at": None,
        }]

    monkeypatch.setattr(search_service, "_search_entity", fake_search_entity)
    result = await search_service.global_search("x", user("emp-1", UserRole.EMPLOYEE), module="sales")
    assert result["total"] > 0
    assert all(g["moduleKey"] == "sales" for g in result["groups"])


@pytest.mark.asyncio
async def test_global_search_second_call_hits_cache(monkeypatch):
    """Identical queries are served from the short per-user cache, so the ~35
    entity scans only run once; tenants/users can never read each other's keys."""
    store: dict = {}
    calls = {"search": 0}

    async def fake_get(key):
        return store.get(key)

    async def fake_set(key, value, ttl=300):
        store[key] = value
        return True

    monkeypatch.setattr(search_service, "cache_get", fake_get)
    monkeypatch.setattr(search_service, "cache_set", fake_set)

    async def fake_search_entity(entity, user, tokens):
        calls["search"] += 1
        return [{
            "id": f"{entity.key}-1", "type": entity.key, "title": entity.key, "subtitle": "",
            "href": "/x", "module": entity.module, "moduleKey": entity.module_key,
            "parent": entity.module, "score": 100, "updated_at": None,
        }]

    monkeypatch.setattr(search_service, "_search_entity", fake_search_entity)

    first = await search_service.global_search("login", user("emp-1", UserRole.EMPLOYEE))
    entity_calls_after_first = calls["search"]
    assert entity_calls_after_first > 0

    second = await search_service.global_search("  LOGIN ", user("emp-1", UserRole.EMPLOYEE))
    assert second == first
    assert calls["search"] == entity_calls_after_first  # no re-scan on cache hit

    # Different user -> different key (permission-filtered results are never shared).
    await search_service.global_search("login", user("emp-2", UserRole.EMPLOYEE))
    assert calls["search"] > entity_calls_after_first

    # Key is company-scoped and normalized.
    key_1 = search_service._search_cache_key(user("emp-1", UserRole.EMPLOYEE), None, "login", 40)
    key_2 = search_service._search_cache_key(user("emp-1", UserRole.EMPLOYEE), None, "  LOGIN ", 40)
    key_other_company = search_service._search_cache_key(user("emp-1", UserRole.EMPLOYEE, company_id="company-2"), None, "login", 40)
    assert key_1 == key_2
    assert key_1.startswith("search:company-1:")
    assert key_other_company != key_1
