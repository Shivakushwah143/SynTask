"""
Global search endpoint.

Uses scoped regex queries now; Phase 6 can replace this with text indexes.
"""
import re
from typing import List

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_current_user
from app.models.client import Client
from app.models.project import Project
from app.models.task import Task
from app.models.ticket import Ticket
from app.models.user import User, UserRole

router = APIRouter()


def _company_scope(user: User) -> dict:
    if user.role == UserRole.SUPER_ADMIN:
        return {}
    return {"company_id": user.company_id}


def _regex(value: str) -> dict:
    # Escape user input so regex metacharacters (e.g. "C++", "v2.0", "(") are
    # treated as literal text instead of breaking the MongoDB query.
    return {"$regex": re.escape(value), "$options": "i"}


@router.get("/search", response_model=List[dict])
async def global_search(
    q: str = Query(..., min_length=2, max_length=80),
    current_user: User = Depends(get_current_user),
):
    scope = _company_scope(current_user)
    results = []

    tasks = await Task.find({
        **scope,
        "$or": [{"title": _regex(q)}, {"description": _regex(q)}, {"project_id": _regex(q)}],
    }).limit(5).to_list()
    projects = await Project.find({
        **scope,
        "$or": [{"name": _regex(q)}, {"key": _regex(q)}, {"project_id": _regex(q)}, {"description": _regex(q)}],
    }).limit(5).to_list()
    tickets = await Ticket.find({
        **scope,
        "$or": [{"title": _regex(q)}, {"ticket_number": _regex(q)}, {"description": _regex(q)}],
    }).limit(5).to_list()
    clients = await Client.find({
        **scope,
        "$or": [{"name": _regex(q)}, {"company_name": _regex(q)}, {"email": _regex(q)}],
    }).limit(5).to_list()

    results.extend([
        {"id": str(item.id), "type": "task", "title": item.title, "subtitle": item.project_id or item.status}
        for item in tasks
    ])
    results.extend([
        {"id": item.project_id or str(item.id), "type": "project", "title": item.name, "subtitle": item.key}
        for item in projects
    ])
    results.extend([
        {"id": str(item.id), "type": "ticket", "title": item.title, "subtitle": item.ticket_number}
        for item in tickets
    ])
    results.extend([
        {"id": str(item.id), "type": "client", "title": item.name, "subtitle": item.company_name or item.email}
        for item in clients
    ])
    return results[:20]
