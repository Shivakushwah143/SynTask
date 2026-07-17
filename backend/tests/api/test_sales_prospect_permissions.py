from app.api.v1.endpoints import sales_prospects
from app.api.v1.router import api_router


def _route(router, path: str, method: str):
    for route in router.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return route
    raise AssertionError(f"Route {method} {path} not found")


def _dependency_names(route):
    return [getattr(dependency.call, "__name__", "") for dependency in route.dependant.dependencies]


def test_manual_prospect_create_does_not_require_bulk_import_capability():
    route = _route(sales_prospects.router, "/", "POST")

    assert "_checker" not in _dependency_names(route)


def test_mounted_manual_prospect_create_does_not_require_sales_module_gate():
    route = _route(api_router, "/sales/prospects/", "POST")

    assert "_checker" not in _dependency_names(route)


def test_bulk_upload_still_requires_import_capability():
    route = _route(sales_prospects.router, "/bulk-upload", "POST")

    assert "_checker" in _dependency_names(route)
