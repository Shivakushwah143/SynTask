from app.api.v1.router import api_router


def _route_paths():
    return {getattr(route, "path", None) for route in api_router.routes}


def test_time_settings_router_is_registered():
    assert "/time/settings" in _route_paths()


def test_meetings_router_keeps_collection_route_registered():
    assert "/meetings/" in _route_paths()
