"""
Structured answer blocks + answer-quality helpers for the Executive and HR
Operations Agents.

Every agent response carries two parallel surfaces:

1. ``answer`` — the narrative LLM text (streamed as token deltas).
2. ``answer_blocks`` — deterministic, UI-renderable blocks derived from the
   tool results the agent actually used. The frontend renders these as
   cards/tables/lists instead of parsing Markdown pipes out of prose.

Block types (``type`` field):

- ``count``    — a headline number (e.g. "12 overdue tasks")
- ``list``     — a flat set of records/names (optional label + detail)
- ``table``    — columns + rows for tabular tool results (workload, invoices…)
- ``summary``  — short key/value fact grid (company summary counts)
- ``detail``   — a single entity's fields (360 views)
- ``risk``     — prioritized attention items (what needs attention)

Content rules enforced here:

- Mongo/ObjectIds are NEVER emitted as display values unless the user
  explicitly asked for IDs. Rows keep human-readable names, titles, emails,
  statuses, dates and human codes (project_id/key).
- Roles/designations are only surfaced when the tool result actually
  contains them; nothing is ever synthesized from task assignments.
- Answers are made concise (title + count + clean records; filler like
  "let me know if…" is stripped).
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Optional

# ---------------------------------------------------------------------------
# ObjectId / internal-id handling
# ---------------------------------------------------------------------------

_OBJECT_ID_RE = re.compile(r"\b[0-9a-f]{24}\b")

# Fields whose raw values are internal ids (Mongo ObjectIds or user ids) and
# must not be shown as display values unless the user explicitly asks.
_INTERNAL_ID_FIELDS = {
    "id",
    "_id",
    "user_id",
    "company_id",
    "tenant_id",
    "created_by",
    "created_by_id",
    "updated_by",
    "assigned_to",
    "assignee_id",
    "lead_id",
    "client_id",
    "project_object_id",
    "entity_id",
    "owner_id",
    "employee_id",
    "candidate_id",
    "job_id",
    "application_id",
    "interview_id",
    "offer_id",
    "document_id",
    "department_id",
    "manager_id",
    "reports_to",
    "reporting_to",
    "team_member_ids",
    "assigned_user_ids",
    "managed_employee_ids",
}

# Internal ids that ARE safe to show when the user asked for them.
_INTERNAL_ID_FIELDS_ALLOWED = {"id", "_id"}

# Human code / slug fields that are meaningful identifiers users can see.
_HUMAN_CODE_FIELDS = {"key", "project_id", "employee_number", "code", "slug", "reference"}

_FIELD_LABELS: dict[str, str] = {
    "name": "Name",
    "title": "Title",
    "email": "Email",
    "status": "Status",
    "priority": "Priority",
    "due_date": "Due date",
    "start_date": "Start date",
    "end_date": "End date",
    "days_overdue": "Days overdue",
    "overdue": "Overdue",
    "total": "Total",
    "count": "Count",
    "amount": "Amount",
    "outstanding_amount": "Outstanding",
    "total_outstanding": "Total outstanding",
    "total_amount": "Total",
    "stage": "Stage",
    "stage_name": "Stage",
    "company_name": "Company",
    "full_name": "Name",
    "first_name": "First name",
    "last_name": "Last name",
    "phone": "Phone",
    "designation": "Designation",
    "role": "Role",
    "department": "Department",
    "category": "Category",
    "type": "Type",
    "created_at": "Created",
    "updated_at": "Updated",
    "closed_date": "Closed date",
    "next_follow_up_at": "Next follow-up",
    "meeting_date": "Meeting date",
    "date": "Date",
    "health_status": "Health",
    "severity": "Severity",
    "recommended_action": "Recommended action",
    "detail": "Detail",
    "description": "Description",
}

# Filler sentence starts stripped from the end of answers (concise rule).
_FILLER_SENTENCE_RE = re.compile(
    r"(?i)^\s*(let me know|feel free to (ask|reach|contact)|please (let me know|feel free)|"
    r"if you (have|need|want) (any|more)|would you like|do you want|i hope (this|that)|"
    r"i'm (here|happy) (to|if)|don't hesitate|reach out)[^.\n]*\.?\s*$"
)

_FILLER_PHRASES_RE = re.compile(
    r"(?i)\b(let me know if you have any (other )?questions?|"
    r"feel free to (ask|reach out)( if you have any questions?)?|"
    r"i hope this (helps|is helpful)|let me know if you need (anything|more|further|help)|"
    r"please don't hesitate to (ask|reach out)|"
    r"would you like me to (do|help|check|dig) (anything else|further)|"
    r"do you have any (other )?questions?)\s*[.!]*\s*"
)

_ROLE_INVENTED_RE = re.compile(
    r"(?i)\b(role|designation|position|job title|title)[: ]+[^.\n]*"
    r"\b(according to|based on|from (the|their)|derived from|as per)\b[^.\n]*\.?"
)


def user_asked_for_ids(message: str | None) -> bool:
    """True when the user explicitly asked for raw ids."""
    text = (message or "").strip()
    return bool(re.search(r"\b(ids?|id numbers?)\b", text, re.I))


def _is_object_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_OBJECT_ID_RE.fullmatch(value))


def redact_object_ids(value: Any, asked_for_ids: bool = False) -> Any:
    """Recursively replace ObjectId-looking strings with a neutral marker."""
    if isinstance(value, dict):
        return {k: redact_object_ids(v, asked_for_ids) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_object_ids(item, asked_for_ids) for item in value]
    if asked_for_ids:
        return value
    if _is_object_id(value):
        return ""
    return value


def _display_value(key: str, value: Any, asked_for_ids: bool) -> Any:
    """Return a display-safe value for one record field."""
    key_lower = (key or "").lower().lstrip("_")
    if _is_object_id(value) and not asked_for_ids:
        return ""
    if key_lower in _INTERNAL_ID_FIELDS:
        if key_lower in _HUMAN_CODE_FIELDS or (asked_for_ids and key_lower in _INTERNAL_ID_FIELDS_ALLOWED):
            return value
        return ""
    if value is None:
        return ""
    return value


def field_label(key: str) -> str:
    key_lower = (key or "").lower().lstrip("_")
    if key_lower in _FIELD_LABELS:
        return _FIELD_LABELS[key_lower]
    return " ".join(word.capitalize() for word in key_lower.split("_") if word)


# ---------------------------------------------------------------------------
# Answer text post-processing (concise, no invented roles, no raw ids)
# ---------------------------------------------------------------------------

def make_answer_concise(text: str, message: str | None = None) -> str:
    """Trim filler, collapse blank runs and redact raw ObjectIds.

    Never removes factual content — only trailing filler sentences, repeated
    blank lines and bare Mongo ids (unless the user explicitly asked for ids).
    """
    if not text:
        return text
    asked_for_ids = user_asked_for_ids(message)
    result = text
    # Redact bare ObjectIds that the LLM echoed back from tool results.
    if not asked_for_ids:
        result = _OBJECT_ID_RE.sub("", result)
    # Strip standalone filler sentences at the end of the answer.
    lines = [line.rstrip() for line in result.splitlines()]
    while lines and lines[-1].strip() == "":
        lines.pop()
    while lines and _FILLER_SENTENCE_RE.match(lines[-1].strip()):
        lines.pop()
    # Remove filler phrases inline ("Let me know if you have any questions").
    joined = "\n".join(lines)
    joined = _FILLER_PHRASES_RE.sub("", joined)
    # Collapse 3+ blank lines (keeps 1 blank line between paragraphs).
    joined = re.sub(r"\n{3,}", "\n\n", joined).strip()
    return joined


def strip_invented_roles(text: str) -> str:
    """Remove sentences that fabricate a role/designation from other data.

    The agents' tools return real ``designation``/``role`` fields only when
    they exist. If the LLM nonetheless phrases a role as derived from task
    assignments ("role: X, based on their tasks"), drop that fragment so we
    never present invented titles as facts.
    """
    if not text:
        return text
    return _ROLE_INVENTED_RE.sub("", text)


def finalize_answer_text(answer: str, message: str | None = None) -> str:
    """Run the full answer-quality pipeline on a narrative answer."""
    cleaned = strip_invented_roles(answer)
    cleaned = make_answer_concise(cleaned, message=message)
    return cleaned


# ---------------------------------------------------------------------------
# Record row helpers
# ---------------------------------------------------------------------------

# Preferred display columns for list/table blocks, in priority order.
_DISPLAY_COLUMN_ORDER = (
    "name",
    "full_name",
    "title",
    "email",
    "company_name",
    "status",
    "priority",
    "stage",
    "stage_name",
    "due_date",
    "start_date",
    "days_overdue",
    "total",
    "amount",
    "outstanding_amount",
    "count",
    "health_status",
    "severity",
    "key",
    "project_id",
    "employee_number",
    "meeting_date",
    "date",
)


def record_display_row(record: dict[str, Any], asked_for_ids: bool, max_columns: int = 5) -> list[tuple[str, Any]]:
    """Pick a small, human-readable set of (label, value) pairs from a record.

    Internal id fields and ObjectIds are dropped unless the user asked for
    ids; unknown fields are skipped so only meaningful values render.
    """
    pairs: list[tuple[str, Any]] = []
    keys_by_pref: dict[str, str] = {}
    for key, value in record.items():
        key_lower = (key or "").lower().lstrip("_")
        if _is_object_id(value) and not asked_for_ids:
            continue
        if key_lower in _INTERNAL_ID_FIELDS and not (asked_for_ids and key_lower in _INTERNAL_ID_FIELDS_ALLOWED):
            continue
        if value is None or value == "" or value == [] or value == {}:
            continue
        if isinstance(value, (dict, list)):
            continue
        keys_by_pref[key_lower] = key
    ordered = []
    for pref in _DISPLAY_COLUMN_ORDER:
        if pref in keys_by_pref:
            ordered.append(keys_by_pref.pop(pref))
    ordered.extend(list(keys_by_pref.values()))
    for key in ordered[:max_columns]:
        value = record[key]
        if isinstance(value, str) and len(value) > 120:
            value = value[:117] + "..."
        pairs.append((field_label(key), value))
    return pairs


def _is_risk_item(item: dict[str, Any]) -> bool:
    return any(key in item for key in ("priority", "severity", "recommended_action")) and (
        "title" in item or "detail" in item or "risk_type" in item
    )


# ---------------------------------------------------------------------------
# Block builders (deterministic, from tool results)
# ---------------------------------------------------------------------------

def _count_block(title: str, value: Any, subtitle: str | None = None) -> dict[str, Any]:
    block: dict[str, Any] = {"type": "count", "title": title, "value": value}
    if subtitle:
        block["subtitle"] = subtitle
    return block


def _list_block(title: str, items: list[Any]) -> dict[str, Any]:
    return {"type": "list", "title": title, "items": items[:8]}


def _table_block(title: str, columns: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    return {"type": "table", "title": title, "columns": columns[:6], "rows": rows[:8]}


def _summary_block(title: str, facts: list[tuple[str, Any]]) -> dict[str, Any]:
    return {"type": "summary", "title": title, "facts": [{"label": label, "value": value} for label, value in facts]}


def _detail_block(title: str, fields: list[tuple[str, Any]]) -> dict[str, Any]:
    return {"type": "detail", "title": title, "fields": [{"label": label, "value": value} for label, value in fields]}


def _risk_block(title: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "risk", "title": title, "items": items[:8]}


def _human_title(tool_name: str) -> str:
    words = tool_name.replace("get_", "").replace("search_", "").split("_")
    return " ".join(word.capitalize() for word in words if word) or "Results"


def _result_block(
    tool_name: str,
    result: dict[str, Any],
    asked_for_ids: bool,
) -> Optional[dict[str, Any]]:
    """Convert one tool result into a display block, or None if not renderable."""
    if not isinstance(result, dict):
        return None
    if "error" in result:
        return None
    if "warning" in result:
        return None

    # ── Risk / attention items ───────────────────────────────────────────
    items = result.get("items")
    if isinstance(items, list) and items and all(isinstance(i, dict) for i in items):
        if any(_is_risk_item(i) for i in items):
            risk_items = []
            for item in items:
                risk_items.append({
                    "priority": item.get("priority") or item.get("severity") or "info",
                    "title": item.get("title") or item.get("risk_type") or "Item",
                    "detail": item.get("detail") or item.get("description") or "",
                    "action": item.get("recommended_action") or "",
                })
            return _risk_block(_human_title(tool_name), risk_items)
        # Plain list of items (e.g. overdue tasks, leave names).
        rows = []
        for item in items:
            if isinstance(item, dict):
                row = record_display_row(item, asked_for_ids, max_columns=3)
                if row:
                    rows.append(dict(row))
            else:
                rows.append({"Name": item})
        if rows:
            return _list_block(_human_title(tool_name), rows)

    # ── Team workload / tabular group data ───────────────────────────────
    workload = result.get("workload")
    if isinstance(workload, list) and workload:
        columns = ["Name", "Tasks", "Overdue"]
        rows = []
        for entry in workload:
            if not isinstance(entry, dict):
                continue
            name = entry.get("name") or entry.get("user_id") or ""
            if _is_object_id(name) and not asked_for_ids:
                name = ""
            rows.append([
                name,
                entry.get("total") or 0,
                entry.get("overdue") or 0,
            ])
        return _table_block("Team workload", columns, rows)

    # ── Named record collections (tasks, projects, clients, invoices…) ───
    collection_keys = (
        "tasks", "projects", "clients", "employees", "invoices", "meetings",
        "candidates", "jobs", "interviews", "offers", "leads", "team_members",
        "documents", "records", "results", "pending_leaves", "followups",
        "overdue_tasks", "overdue_invoices", "attention_items", "upcoming_meetings",
    )
    for key in collection_keys:
        records = result.get(key)
        if isinstance(records, list) and records:
            first = records[0]
            if isinstance(first, dict):
                rows = [dict(record_display_row(r, asked_for_ids)) for r in records[:8]]
                columns = list(rows[0].keys()) if rows else []
                if columns:
                    return _table_block(_human_title(tool_name), columns, [list(r.values()) for r in rows])
            else:
                return _list_block(_human_title(tool_name), [str(r) for r in records[:8]])

    # ── Headline counts (employee count, task count, …) ──────────────────
    count_value = result.get("count")
    if count_value is None:
        count_value = result.get("total")
    if isinstance(count_value, (int, float)):
        subtitle = None
        for key in ("active", "open", "overdue", "pending", "won", "today"):
            val = result.get(key)
            if isinstance(val, (int, float)):
                subtitle = f"{key.capitalize()}: {val}"
                break
        return _count_block(_human_title(tool_name), int(count_value), subtitle)

    # ── Single entity detail (360 views) ─────────────────────────────────
    entity = result.get("employee") or result.get("client") or result.get("project") or result.get("candidate") or result.get("job") or result.get("lead") or result.get("invoice")
    if isinstance(entity, dict):
        fields = record_display_row(entity, asked_for_ids, max_columns=8)
        if fields:
            return _detail_block(_human_title(tool_name), fields)
    if isinstance(result.get("profile"), dict):
        fields = record_display_row(result["profile"], asked_for_ids, max_columns=8)
        if fields:
            return _detail_block(_human_title(tool_name), fields)

    # ── Company summary style key/value grids ────────────────────────────
    scalar_facts = []
    for key, value in result.items():
        key_lower = key.lower().lstrip("_")
        if key_lower in {"date", "as_of", "generated_at", "total_items"}:
            continue
        if isinstance(value, (str, int, float)) and not _is_object_id(value):
            scalar_facts.append((field_label(key), value))
    if scalar_facts:
        return _summary_block(_human_title(tool_name), scalar_facts)

    return None


def build_answer_blocks(
    tool_executions: Iterable[Any],
    *,
    message: str | None = None,
    max_blocks: int = 4,
) -> list[dict[str, Any]]:
    """Derive up to ``max_blocks`` structured blocks from tool executions.

    Executions are processed newest-first (the final investigation round is
    the most relevant). Tool results carrying an ``error``/``warning`` are
    skipped. Block count is bounded so payloads stay small.
    """
    asked_for_ids = user_asked_for_ids(message)
    blocks: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for execution in reversed(list(tool_executions)):
        if len(blocks) >= max_blocks:
            break
        tool_name = getattr(execution, "tool_name", None) or ""
        result = getattr(execution, "result", None) or {}
        block = _result_block(tool_name, result, asked_for_ids)
        if not block:
            continue
        title = str(block.get("title") or "").lower()
        if title in seen_titles:
            continue
        seen_titles.add(title)
        block["tool"] = tool_name
        blocks.append(block)
    return blocks


def build_fast_fact_blocks(
    facts: Iterable[dict[str, Any]] | None,
    *,
    title: str = "Result",
    max_blocks: int = 2,
) -> list[dict[str, Any]]:
    """Convert fast-fact ``facts`` (``[{"metric": ..., "value": ...}]``) into
    structured blocks so deterministic answers render the same rich UI as
    tool-driven ones.

    A single numeric fact becomes a ``count`` KPI block; multiple facts
    become a ``summary`` grid. Non-numeric list facts (names) are skipped so
    the narrative answer stays the primary surface for prose lists.
    """
    facts = [f for f in (facts or []) if isinstance(f, dict)]
    if not facts:
        return []

    numeric: list[tuple[str, Any]] = []
    for fact in facts:
        value = fact.get("value")
        metric = str(fact.get("metric") or "")
        if isinstance(value, (int, float)):
            label = " ".join(word.capitalize() for word in metric.split(".")[-1].split("_") if word) or "Total"
            numeric.append((label, value))

    blocks: list[dict[str, Any]] = []
    if len(numeric) == 1 and len(blocks) < max_blocks:
        label, value = numeric[0]
        blocks.append({"type": "count", "title": title, "value": value, "subtitle": label})
    elif len(numeric) > 1 and len(blocks) < max_blocks:
        blocks.append({
            "type": "summary",
            "title": title,
            "facts": [{"label": label, "value": value} for label, value in numeric[:6]],
        })
    return blocks[:max_blocks]