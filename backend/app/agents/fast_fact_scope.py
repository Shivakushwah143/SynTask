"""
Fast-fact entity scoping — resolve the real entity (employee / project /
client / lead / job) a fast-fact question mentions BEFORE executing the
handler, and carry that scope into the canonical query.

Without this layer a question like "Gaurav ke kitne task pending hain?"
matched the ``pending_task_count`` fast fact and returned a company-wide
count even though Gaurav has no assigned tasks. Every handler that can be
entity-scoped now receives a ``FastFactScope`` and applies the resolved ids
to the same canonical model query it already used.

Rules enforced here:

1. Scope/entities are extracted before a fast fact executes.
2. A mentioned employee is resolved to the real user id and applied to the
   query (``assigned_to`` for tasks, ``employee_id`` for leave/attendance,
   ``participant_ids`` for meetings, …).
3. There is NO fallback from an entity-scoped question to company-wide
   data: if an entity was mentioned but cannot be resolved (missing or
   ambiguous), ``FastFactScope.unresolved`` is populated and the caller must
   route to Executive reasoning or ask for clarification.
4. Combinations are supported: employee + project + status + timeframe all
   resolve independently and combine.
5. Resolution reuses the existing fuzzy/prefix matchers from
   ``app.agents.query_gate`` — no new matching logic.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from app.agents.query_gate import _fuzzy_match, _normalize_hinglish

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scope model
# ---------------------------------------------------------------------------

@dataclass
class FastFactScope:
    """Resolved entity scope for a fast-fact execution (all ids are the
    canonical ids the domain models store: User ids, Project logical id /
    object id, Client id, SalesProspect id, RecruitmentJob id)."""

    employee_user_id: Optional[str] = None
    employee_name: Optional[str] = None
    project_id: Optional[str] = None          # logical project_id (e.g. PROJ-001)
    project_object_id: Optional[str] = None   # Mongo _id (for project_object_id links)
    project_name: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    lead_id: Optional[str] = None
    lead_name: Optional[str] = None
    job_id: Optional[str] = None
    job_title: Optional[str] = None
    status: Optional[str] = None              # informational: pending/open/overdue/completed
    timeframe: Optional[str] = None           # informational: today/week/month
    # Entity mentions that could not be resolved (missing or ambiguous).
    unresolved: list[str] = field(default_factory=list)

    @property
    def has_entity(self) -> bool:
        return bool(
            self.employee_user_id
            or self.project_id
            or self.project_object_id
            or self.client_id
            or self.lead_id
            or self.job_id
        )

    @property
    def must_route_to_executive(self) -> bool:
        """An entity was mentioned but could not be resolved — per the rules
        we must NOT fall back to a company-wide fast fact."""
        return bool(self.unresolved)


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------

# Words that describe the metric/domain, not entities. These are removed from
# the message before matching against known names.
_DOMAIN_KEYWORDS = {
    "task", "tasks", "project", "projects", "client", "clients", "lead", "leads",
    "invoice", "invoices", "employee", "employees", "meeting", "meetings",
    "leave", "leaves", "job", "jobs", "opening", "openings", "interview",
    "interviews", "candidate", "candidates", "offer", "offers",
    "pending", "open", "overdue", "completed", "today", "active", "won",
    "lost", "count", "status", "list", "show", "give", "tell", "what", "who",
    "which", "how", "many", "much", "total", "number", "any", "all",
    "and", "or", "the", "a", "an", "is", "are", "was", "were", "has", "have",
    "having", "does", "do", "did", "of", "to", "in", "on", "for", "with",
    "ke", "ki", "ka", "ko", "se", "me", "mein", "ne", "hain", "hai", "ho",
    "tha", "thi", "the", "kitne", "kitna", "kitni", "kya", "kaun", "kyun", "kab",
    "aaj", "kal",
    "sir", "please", "can", "could", "would", "will", "me", "my", "our",
    "this", "that", "there", "they", "we", "you", "i", "by", "from",
}

_STATUS_KEYWORDS = {
    "pending": "pending",
    "open": "open",
    "overdue": "overdue",
    "completed": "completed",
    "done": "completed",
}

_TIMEFRAME_KEYWORDS = {
    "today": "today",
    "aaj": "today",
    "yesterday": "yesterday",
    "week": "week",
    "month": "month",
}


def _candidate_tokens(message: str) -> list[str]:
    """Return lower-cased name-like tokens that could be entity mentions.

    Metric/domain words (task, pending, absent, how many, …) are removed so
    plain company-wide questions yield no candidates; only leftover tokens are
    treated as potential entity names.
    """
    normalized = _normalize_hinglish(message)
    tokens: list[str] = []
    for match in re.findall(r"[a-zA-Z][a-zA-Z0-9._-]*", normalized):
        token = match.lower()
        if token in _DOMAIN_KEYWORDS:
            continue
        if len(token) < 2:
            continue
        tokens.append(token)
    return tokens


# Possessive / entity-introducer grammar: "X ke/ki/ka …", "X's …",
# "for X …", "assigned to X", "X of …" — strong signal that a leftover token
# really is an entity mention even if it is not capitalized.
_POSSESSIVE_KEYS = ("ke", "ki", "ka", "ko", "ne", "se", "of", "for", "to")


def _looks_like_entity_mention(message: str, token: str) -> bool:
    """True when a leftover token plausibly names an entity.

    Signals: the token is capitalized in the original text (proper noun), or
    it sits next to possessive/introducer grammar ("gaurav ke", "gaurav's",
    "for gaurav"). Lowercase metric words ("absent", "videos") without any
    such grammar are ignored so company-wide questions keep using fast facts.
    """
    raw = message or ""
    if re.search(rf"\b{re.escape(token.capitalize())}\b", raw):
        return True
    if re.search(rf"\b{re.escape(token)}\b['’]s\b", raw, re.I):
        return True
    # Token followed by a possessive key: "gaurav ke kitne ..."
    for key in ("ke", "ki", "ka", "ko", "ne", "se"):
        if re.search(rf"\b{re.escape(token)}\s+{key}\b", raw, re.I):
            return True
    # Token preceded by "of / for / to": "tasks of gaurav", "for gaurav"
    for key in ("of", "for", "to"):
        if re.search(rf"\b{key}\s+{re.escape(token)}\b", raw, re.I):
            return True
    return False


def _parse_status_timeframe(message: str) -> tuple[Optional[str], Optional[str]]:
    normalized = _normalize_hinglish(message).lower()
    status = None
    timeframe = None
    for keyword, value in _STATUS_KEYWORDS.items():
        if re.search(rf"\b{keyword}\b", normalized):
            status = value
            break
    for keyword, value in _TIMEFRAME_KEYWORDS.items():
        if re.search(rf"\b{keyword}\b", normalized):
            timeframe = value
            break
    return status, timeframe


# ---------------------------------------------------------------------------
# Name matching (reuses query_gate fuzzy matching)
# ---------------------------------------------------------------------------

def _name_matches(token: str, candidate: str) -> bool:
    """Match one token against a candidate name/email (exact, prefix,
    substring, or fuzzy)."""
    candidate = (candidate or "").lower().strip()
    if not candidate:
        return False
    if token == candidate:
        return True
    # Full-name token (e.g. "riya jain") vs "Riya Jain"
    if candidate in token or token in candidate:
        return True
    for part in candidate.replace("-", " ").split():
        if part == token:
            return True
        if part.startswith(token) and len(token) >= 3:
            return True
    if _fuzzy_match(token, candidate, threshold=0.62):
        return True
    return False


async def _resolve_employee(company_id: str, tokens: list[str]) -> dict[str, Any]:
    from app.models.user import User

    collection = User.get_pymongo_collection()
    docs = await collection.find(
        {"company_id": company_id},
        {"_id": 1, "first_name": 1, "last_name": 1, "email": 1},
    ).limit(300).to_list(length=None)
    matches: dict[str, dict[str, Any]] = {}
    for doc in docs:
        first = doc.get("first_name") or ""
        last = doc.get("last_name") or ""
        email = doc.get("email") or ""
        name = f"{first} {last}".strip()
        for token in tokens:
            if _name_matches(token, name) or _name_matches(token, email):
                matches[str(doc["_id"])] = {"name": name or email, "id": str(doc["_id"])}
                break
    return _single_match("employee", matches)


async def _resolve_project(company_id: str, tokens: list[str]) -> dict[str, Any]:
    from app.models.project import Project

    collection = Project.get_pymongo_collection()
    docs = await collection.find(
        {"company_id": company_id},
        {"_id": 1, "name": 1, "key": 1, "project_id": 1},
    ).limit(300).to_list(length=None)
    matches: dict[str, dict[str, Any]] = {}
    for doc in docs:
        label = doc.get("name") or ""
        for candidate in (label, doc.get("key") or "", doc.get("project_id") or ""):
            for token in tokens:
                if _name_matches(token, candidate):
                    matches[str(doc["_id"])] = {
                        "name": label,
                        "id": str(doc["_id"]),
                        "project_id": doc.get("project_id") or doc.get("key") or "",
                    }
                    break
            if str(doc["_id"]) in matches:
                break
    return _single_match("project", matches)


async def _resolve_client(company_id: str, tokens: list[str]) -> dict[str, Any]:
    from app.models.client import Client

    collection = Client.get_pymongo_collection()
    docs = await collection.find(
        {"company_id": company_id},
        {"_id": 1, "name": 1, "company_name": 1},
    ).limit(300).to_list(length=None)
    matches: dict[str, dict[str, Any]] = {}
    for doc in docs:
        label = doc.get("name") or ""
        for candidate in (label, doc.get("company_name") or ""):
            for token in tokens:
                if _name_matches(token, candidate):
                    matches[str(doc["_id"])] = {"name": label, "id": str(doc["_id"])}
                    break
            if str(doc["_id"]) in matches:
                break
    return _single_match("client", matches)


async def _resolve_lead(company_id: str, tokens: list[str]) -> dict[str, Any]:
    from app.models.sales_prospect import SalesProspect

    collection = SalesProspect.get_pymongo_collection()
    docs = await collection.find(
        {"company_id": company_id, "deleted": {"$ne": True}},
        {"_id": 1, "first_name": 1, "last_name": 1, "prospect_name": 1, "company_name": 1},
    ).limit(300).to_list(length=None)
    matches: dict[str, dict[str, Any]] = {}
    for doc in docs:
        label = doc.get("prospect_name") or (
            f"{doc.get('first_name') or ''} {doc.get('last_name') or ''}".strip()
        )
        for candidate in (label, doc.get("company_name") or ""):
            for token in tokens:
                if _name_matches(token, candidate):
                    matches[str(doc["_id"])] = {"name": label, "id": str(doc["_id"])}
                    break
            if str(doc["_id"]) in matches:
                break
    return _single_match("lead", matches)


async def _resolve_job(company_id: str, tokens: list[str]) -> dict[str, Any]:
    try:
        from app.recruitment.models import RecruitmentJob

        collection = RecruitmentJob.get_pymongo_collection()
        docs = await collection.find(
            {"company_id": company_id, "deleted_at": None},
            {"_id": 1, "title": 1},
        ).limit(300).to_list(length=None)
    except Exception:
        docs = []
    matches: dict[str, dict[str, Any]] = {}
    for doc in docs:
        label = doc.get("title") or ""
        for token in tokens:
            if _name_matches(token, label):
                matches[str(doc["_id"])] = {"name": label, "id": str(doc["_id"])}
                break
    return _single_match("job", matches)


def _single_match(entity_type: str, matches: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if len(matches) == 1:
        return {"resolved": True, "data": next(iter(matches.values()))}
    if len(matches) > 1:
        return {"resolved": False, "ambiguous": True, "entity_type": entity_type}
    return {"resolved": False, "ambiguous": False, "entity_type": entity_type}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def extract_fast_fact_scope(message: str, company_id: str) -> FastFactScope:
    """Extract and resolve the entity scope of a fast-fact question.

    Returns a ``FastFactScope``. If an entity was clearly mentioned but could
    not be resolved, ``scope.unresolved`` lists the failed mentions and
    ``scope.must_route_to_executive`` is True — callers must NOT execute a
    company-wide fast fact in that case.
    """
    scope = FastFactScope()
    if not message or not company_id:
        return scope

    tokens = _candidate_tokens(message)
    status, timeframe = _parse_status_timeframe(message)
    scope.status = status
    scope.timeframe = timeframe

    if not tokens:
        # Nothing name-like: pure company-wide question (e.g. "how many tasks
        # are pending?").
        return scope

    # Employees first (most common entity for task/leave/attendance/meeting
    # questions), then projects, clients, leads, jobs — all independent so
    # combinations (employee + project) resolve together.
    employee = await _resolve_employee(company_id, tokens)
    if employee.get("resolved"):
        data = employee["data"]
        scope.employee_user_id = data["id"]
        scope.employee_name = data["name"]
    elif employee.get("ambiguous"):
        scope.unresolved.append("employee: ambiguous match")

    project = await _resolve_project(company_id, tokens)
    if project.get("resolved"):
        data = project["data"]
        scope.project_object_id = data["id"]
        scope.project_id = data.get("project_id") or None
        scope.project_name = data.get("name") or None
    elif project.get("ambiguous"):
        scope.unresolved.append("project: ambiguous match")

    client = await _resolve_client(company_id, tokens)
    if client.get("resolved"):
        data = client["data"]
        scope.client_id = data["id"]
        scope.client_name = data["name"]
    elif client.get("ambiguous"):
        scope.unresolved.append("client: ambiguous match")

    lead = await _resolve_lead(company_id, tokens)
    if lead.get("resolved"):
        data = lead["data"]
        scope.lead_id = data["id"]
        scope.lead_name = data["name"]
    elif lead.get("ambiguous"):
        scope.unresolved.append("lead: ambiguous match")

    job = await _resolve_job(company_id, tokens)
    if job.get("resolved"):
        data = job["data"]
        scope.job_id = data["id"]
        scope.job_title = data["name"]
    elif job.get("ambiguous"):
        scope.unresolved.append("job: ambiguous match")

    if scope.has_entity or scope.unresolved:
        return scope

    # No entity matched any leftover token. Only treat this as an unresolved
    # entity-scoped question when the leftover token plausibly names someone
    # (proper noun / possessive grammar). Plain company-wide questions that
    # merely contain unknown metric words ("absent", "videos") keep using the
    # company-wide fast fact instead of being routed to Executive.
    plausible = [token for token in tokens if _looks_like_entity_mention(message, token)]
    if plausible:
        scope.unresolved.append("; ".join(plausible))

    return scope