from types import SimpleNamespace

from app.models.user import UserRole
from app.rag.permissions import RAGScope, source_visible_to_scope


def test_source_visibility_rejects_other_company():
    scope = RAGScope(company_id="a", tenant_id="a", user_id="u1", role=UserRole.EMPLOYEE.value)
    source = SimpleNamespace(company_id="b", tenant_id="b", status="active", visibility={})

    assert source_visible_to_scope(source, scope) is False


def test_source_visibility_rejects_other_project():
    scope = RAGScope(company_id="a", tenant_id="a", user_id="u1", role=UserRole.EMPLOYEE.value, project_id="p1")
    source = SimpleNamespace(company_id="a", tenant_id="a", status="active", visibility={"project_id": "p2"})

    assert source_visible_to_scope(source, scope) is False


def test_source_visibility_allows_matching_scope():
    scope = RAGScope(company_id="a", tenant_id="a", user_id="u1", role=UserRole.EMPLOYEE.value, project_id="p1")
    source = SimpleNamespace(company_id="a", tenant_id="a", status="active", visibility={"project_id": "p1"})

    assert source_visible_to_scope(source, scope) is True

