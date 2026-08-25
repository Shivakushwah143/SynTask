"""
Global search endpoint.

Registry-driven application-wide search covering every navigation module
(Work, Content, People & HR, Clients & CRM, Finance, Calendar & Inbox,
AI Workspace, Settings). Results are permission-gated, relevance-ranked,
de-duplicated, and grouped by module.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.search_service import (
    _company_scope,
    _regex,
    global_search,
)

router = APIRouter()


@router.get("/search")
async def global_search_endpoint(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(40, ge=1, le=100),
    module: Optional[str] = Query(None, description="Optional module key filter (e.g. work, sales, people)"),
    current_user: User = Depends(get_current_user),
):
    return await global_search(q, current_user, limit=limit, module=module)
