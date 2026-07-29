import ast
from pathlib import Path


def _get_function(tree: ast.AST, name: str) -> ast.AsyncFunctionDef:
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return node
    raise AssertionError(f"{name} not found")


def test_create_employee_does_not_shadow_user_service_import():
    source = Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "endpoints" / "users.py"
    source = source.read_text(encoding="utf-8")
    function = _get_function(ast.parse(source), "create_employee")

    local_user_service_imports = [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.ImportFrom)
        and node.module == "app.services.user_service"
        and any(alias.name == "UserService" for alias in node.names)
    ]

    assert local_user_service_imports == []


def test_create_employee_updates_ancestors_once_before_insert():
    source = Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "endpoints" / "users.py"
    source = source.read_text(encoding="utf-8")
    function = _get_function(ast.parse(source), "create_employee")

    update_calls = [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "update_hierarchy_ancestors"
    ]

    assert len(update_calls) == 1


def test_get_assignable_users_includes_admins_and_employees():
    source = Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "endpoints" / "users.py"
    source = source.read_text(encoding="utf-8")
    function = _get_function(ast.parse(source), "get_assignable_users")

    role_filter_snippets = [
        "UserRole.ADMIN",
        "UserRole.SUB_ADMIN",
        "UserRole.MANAGER",
        "UserRole.LEAD",
        "UserRole.EMPLOYEE",
    ]

    for snippet in role_filter_snippets:
        assert snippet in ast.get_source_segment(source, function)
