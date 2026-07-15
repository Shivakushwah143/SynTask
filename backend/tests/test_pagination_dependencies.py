import re
from pathlib import Path

import pytest
from fastapi import FastAPI, Query
from fastapi.testclient import TestClient


def test_shared_pagination_dependency_rejects_limit_above_global_max():
    from app.api.deps import PaginationParams, get_pagination_params

    app = FastAPI()

    @app.get("/items")
    async def items(pagination: PaginationParams = get_pagination_params()):
        return pagination.model_dump()

    response = TestClient(app).get("/items?limit=501")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "limit"]


def test_shared_pagination_dependency_accepts_custom_default_limit():
    from app.api.deps import PaginationParams, get_pagination_params

    app = FastAPI()

    @app.get("/items")
    async def items(pagination: PaginationParams = get_pagination_params(default_limit=20)):
        return pagination.model_dump()

    response = TestClient(app).get("/items")

    assert response.status_code == 200
    assert response.json() == {"skip": 0, "limit": 20}


def test_shared_pagination_dependency_rejects_negative_skip():
    from app.api.deps import PaginationParams, get_pagination_params

    app = FastAPI()

    @app.get("/items")
    async def items(pagination: PaginationParams = get_pagination_params()):
        return pagination.model_dump()

    response = TestClient(app).get("/items?skip=-1")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "skip"]


def test_endpoint_specific_limit_can_exceed_shared_max_when_declared():
    app = FastAPI()

    @app.get("/pipeline")
    async def pipeline(limit: int = Query(500, ge=1, le=1000)):
        return {"limit": limit}

    response = TestClient(app).get("/pipeline?limit=700")

    assert response.status_code == 200
    assert response.json() == {"limit": 700}


def test_main_no_longer_contains_global_limit_validation():
    source = Path("app/main.py").read_text()

    assert 'query_params.get("limit")' not in source
    assert "MAX_PAGE_SIZE" not in source


def test_plain_pagination_limit_params_are_not_left_in_endpoint_modules():
    endpoint_dir = Path("app/api/v1/endpoints")
    offenders: list[str] = []

    for path in endpoint_dir.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        for match in re.finditer(r"limit\s*:\s*int\s*=\s*(?:20|50|100)(?:,|\n)", source):
            line = source.count("\n", 0, match.start()) + 1
            offenders.append(f"{path}:{line}")
        for line_number, line in enumerate(source.splitlines(), start=1):
            if "limit: int = Query" in line and "le=" not in line:
                offenders.append(f"{path}:{line_number}")

    assert offenders == []
