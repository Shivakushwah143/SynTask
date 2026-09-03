"""
Query Gate — hybrid router that determines the cheapest execution path.

Two-tier routing:
  1. Deterministic regex matching (0 Groq calls) — for obvious fast-fact
     queries like "how many employees?" or "overdue tasks count".
  2. Semantic fallback (1 Groq call, cached) — for ambiguous CEO questions
     that regex cannot confidently classify. Uses a tiny Groq call to
     classify intent and select the best path.

Entity Resolution:
  - Fuzzy matching: tolerates typos via edit-distance heuristics.
  - Hinglish support: common Hindi-English transliterations are normalized.
  - Partial matching: "gaur" matches "Gaurav", "riya j" matches "Riya Jain".

The Executive Agent now owns ALL domains including HR. There is no separate
HR_SPECIALIST routing path.

Paths:
  FAST_FACT        — deterministic handler, 0 Groq calls
  EXECUTIVE        — executive agent (all domains), 2-3 Groq calls
  CLARIFICATION    — ask user to clarify
  UNSUPPORTED      — cannot answer
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class QueryPath(str, Enum):
    FAST_FACT = "FAST_FACT"
    EXECUTIVE = "EXECUTIVE"
    CLARIFICATION = "CLARIFICATION"
    UNSUPPORTED = "UNSUPPORTED"


@dataclass
class QueryGateResult:
    path: QueryPath
    confidence: float
    reason: str
    fast_fact_handler: str | None = None
    entity_hint: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Hinglish normalization map
# ---------------------------------------------------------------------------

_HINGLISH_MAP: dict[str, str] = {
    "kaise": "how", "kya": "what", "kaun": "who", "kyun": "why",
    "kab": "when", "kitna": "how many", "kitne": "how many",
    "employee": "employee", "karmachari": "employee",
    "kaam": "work", "project": "project", "proejct": "project",
    "task": "task", "taske": "task",
    "client": "client", "clinet": "client", "cusotmer": "customer",
    "salary": "salary", "paise": "salary", "vetan": "salary",
    "attendance": "attendance", "haziri": "attendance",
    "leave": "leave", "chutti": "leave",
    "interview": "interview", "placement": "interview",
    "meeting": "meeting", "baithak": "meeting",
    "invoice": "invoice", "bill": "invoice",
    "revenue": "revenue", "munafa": "revenue",
    "overdue": "overdue", "lately": "overdue",
    "risk": "risk", "khatra": "risk",
    "summary": "summary", "saaransh": "summary",
    "today": "today", "aaj": "today",
    "company": "company", "companyy": "company",
}


def _normalize_hinglish(text: str) -> str:
    """Normalize Hinglish words to English equivalents."""
    words = text.lower().split()
    normalized = []
    for w in words:
        # Strip common Hindi suffixes
        w_clean = re.sub(r'(ka|ki|ke|ko|se|mein|hai|hain|ho|hu|tha|thi|the)$', '', w)
        if w_clean in _HINGLISH_MAP:
            normalized.append(_HINGLISH_MAP[w_clean])
        else:
            normalized.append(w)
    return " ".join(normalized)


# ---------------------------------------------------------------------------
# Fuzzy entity resolution helpers
# ---------------------------------------------------------------------------

def _edit_distance(s1: str, s2: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return _edit_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]


def _fuzzy_match(query: str, candidate: str, threshold: float = 0.6) -> bool:
    """Check if query fuzzy-matches candidate with edit distance threshold."""
    q = query.lower().strip()
    c = candidate.lower().strip()
    if not q or not c:
        return False
    # Exact substring match
    if q in c or c in q:
        return True
    # Prefix match
    if c.startswith(q) or q.startswith(c):
        return True
    # Edit distance
    dist = _edit_distance(q, c)
    max_len = max(len(q), len(c))
    similarity = 1.0 - (dist / max_len) if max_len > 0 else 0.0
    return similarity >= threshold


# ---------------------------------------------------------------------------
# Fast-fact patterns: deterministic questions answerable without Groq
# ---------------------------------------------------------------------------

_FAST_FACT_RULES: list[tuple[list[re.Pattern[str]], str, str]] = [
    # (patterns, handler_name, reason)
    # ── Bounded LIST / name answers (0 Groq calls) ───────────────────────
    (
        [
            re.compile(r"\bwhat\s+tasks\s+exist\b", re.I),
            re.compile(r"\blist\s+(all\s+)?(open\s+)?tasks?\b", re.I),
            re.compile(r"\bshow\s+(all\s+)?(open\s+)?tasks?\b", re.I),
        ],
        "open_task_list",
        "deterministic_open_task_list",
    ),
    (
        [
            re.compile(r"\bshow\s+our\s+clients?\b", re.I),
            re.compile(r"\blist\s+(our\s+|all\s+)?clients?\b", re.I),
            re.compile(r"\bclients?\s+names?\b", re.I),
            re.compile(r"\bwhat\s+are\s+our\s+clients?\b", re.I),
        ],
        "client_names",
        "deterministic_client_names",
    ),
    (
        [
            re.compile(r"\b(list|show)\s+(open\s+)?jobs?\b", re.I),
            re.compile(r"\bjob\s+openings?\s+list\b", re.I),
        ],
        "open_jobs_list",
        "deterministic_open_jobs_list",
    ),
    (
        [
            re.compile(r"\btoday's\s+meetings?\b", re.I),
            re.compile(r"\bmeetings?\s+today\b", re.I),
            re.compile(r"\bagenda\s+for\s+today\b", re.I),
        ],
        "today_meetings",
        "deterministic_today_meetings",
    ),
    (
        [
            re.compile(r"\bwho\s+has\s+(a\s+)?pending\s+leave\b", re.I),
            re.compile(r"\blist\s+(pending\s+)?leaves?\b", re.I),
            re.compile(r"\bwhose\s+(leave|leaves)\b", re.I),
        ],
        "pending_leave_names",
        "deterministic_pending_leave_names",
    ),
    (
        [
            re.compile(r"\bhow\s+many\s+employees?\b", re.I),
            re.compile(r"\bemployee\s+count\b", re.I),
            re.compile(r"\bnumber\s+of\s+employees?\b", re.I),
            re.compile(r"\bteam\s+size\b", re.I),
            re.compile(r"\btotal\s+(active\s+)?employees?\b", re.I),
            re.compile(r"\bkitn(e|a)\s+employee\b", re.I),
        ],
        "employee_count",
        "deterministic_employee_count",
    ),
    (
        [
            re.compile(r"\bgive\s+me\s+(their|all|the)\s+names?\b", re.I),
            re.compile(r"\blist\s+(their|all|the)\s+employees?\b", re.I),
            re.compile(r"\bname\s+all\s+employees?\b", re.I),
            re.compile(r"\bshow\s+(all|the)\s+employees?\b", re.I),
        ],
        "employee_names",
        "deterministic_employee_names",
    ),
    (
        [
            re.compile(r"\bhow\s+many\s+tasks?\b", re.I),
            re.compile(r"\btask\s+count\b", re.I),
            re.compile(r"\btotal\s+(open\s+)?tasks?\b", re.I),
            re.compile(r"\bpending\s+task\s+count\b", re.I),
            re.compile(r"\boverdue\s+task\s+count\b", re.I),
            re.compile(r"\bcompleted\s+today\s+count\b", re.I),
            # Entity-scoped variants: "Gaurav ke kitne task pending hain?",
            # "Riya completed how many today?", "Project Alpha ke pending tasks?"
            re.compile(r"\bpending\s+tasks?\b", re.I),
            re.compile(r"\bcompleted\s+how\s+many\b", re.I),
            re.compile(r"\bhow\s+many\s+completed\b", re.I),
            re.compile(r"\boverdue\s+tasks?\b", re.I),
        ],
        None,  # dynamic handler based on keywords
        "deterministic_task_count",
    ),
    (
        [
            re.compile(r"\bhow\s+many\s+projects?\b", re.I),
            re.compile(r"\bproject\s+count\b", re.I),
            re.compile(r"\bactive\s+projects?\s+count\b", re.I),
        ],
        "project_count",
        "deterministic_project_count",
    ),
    (
        [
            re.compile(r"\bhow\s+many\s+clients?\b", re.I),
            re.compile(r"\bclient\s+count\b", re.I),
            re.compile(r"\bactive\s+clients?\s+count\b", re.I),
        ],
        "client_count",
        "deterministic_client_count",
    ),
    (
        [
            re.compile(r"\bhow\s+many\s+leads?\b", re.I),
            re.compile(r"\blead\s+count\b", re.I),
            re.compile(r"\bsales\s+pipeline\s+count\b", re.I),
        ],
        "sales_count",
        "deterministic_sales_count",
    ),
    (
        [
            re.compile(r"\boverdue\s+invoices?\b", re.I),
            re.compile(r"\binvoice\s+count\b", re.I),
        ],
        "invoice_count",
        "deterministic_invoice_count",
    ),
    (
        [
            re.compile(r"\bopen\s+jobs?\b", re.I),
            re.compile(r"\bpending\s+interviews?\b", re.I),
            re.compile(r"\boffers?\s+pending\b", re.I),
        ],
        "recruitment_count",
        "deterministic_recruitment_count",
    ),
    # ── HR-specific fast facts ──────────────────────────────────────────
    (
        [
            re.compile(r"\babsent\s+employees?\b", re.I),
            re.compile(r"\bwho\s+is\s+absent\b", re.I),
            re.compile(r"\babsent\s+today\b", re.I),
            re.compile(r"\bhaziri\s+nahi\b", re.I),
        ],
        "absent_today_count",
        "deterministic_absent_today",
    ),
    (
        [
            re.compile(r"\bpending\s+leaves?\b", re.I),
            re.compile(r"\bleave\s+requests?\s+pending\b", re.I),
            re.compile(r"\bpending\s+leave\s+count\b", re.I),
        ],
        "pending_leave_count",
        "deterministic_pending_leave",
    ),
    (
        [
            re.compile(r"\bopen\s+jobs?\b", re.I),
            re.compile(r"\bjob\s+openings?\b", re.I),
            re.compile(r"\bvacancy\b", re.I),
        ],
        "open_jobs_count",
        "deterministic_open_jobs",
    ),
]

# Semantic classification prompt — used when regex confidence is low
_CLASSIFY_PROMPT = """You are a query classifier. Given a CEO question about their company, classify it into one of:
- FAST_FACT: simple count/lookup answerable with a single database query (e.g. "how many employees", "list all projects", "overdue task count")
- EXECUTIVE: requires reasoning, analysis, or cross-domain investigation (e.g. "why is Acme at risk", "what's Rahul's salary", "how is sales performing")

Reply with ONLY the category name, nothing else."""


class QueryGate:
    """Decide the cheapest correct execution path for a CEO question."""

    def __init__(self):
        self._semantic_cache: dict[str, QueryGateResult] = {}

    async def classify(
        self,
        message: str,
        *,
        company_id: str,
        user_role: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> QueryGateResult:
        """Classify the query and return the execution path."""
        text = (message or "").strip()
        if not text:
            return QueryGateResult(
                path=QueryPath.CLARIFICATION,
                confidence=1.0,
                reason="empty_message",
            )

        # Normalize Hinglish before classification
        normalized = _normalize_hinglish(text)

        # ── Tier 1: Deterministic regex matching (0 Groq calls) ──────────────
        fast_fact = self._check_fast_fact(normalized)
        if fast_fact and fast_fact.confidence >= 0.85:
            return fast_fact

        # ── Tier 2: Semantic classification (1 Groq call, cached) ────────────
        cache_key = normalized.strip()[:100]
        if cache_key in self._semantic_cache:
            return self._semantic_cache[cache_key]

        semantic_result = await self._semantic_classify(normalized)
        if semantic_result:
            # A semantic FAST_FACT has no deterministic handler (Tier 1 missed
            # it), so route it to the Executive path instead of claiming a
            # fast-fact that cannot execute (which would burn an extra call).
            if semantic_result.path == QueryPath.FAST_FACT and not semantic_result.fast_fact_handler:
                semantic_result = QueryGateResult(
                    path=QueryPath.EXECUTIVE,
                    confidence=0.75,
                    reason="semantic_fast_fact_without_handler_routed_to_executive",
                )
            self._semantic_cache[cache_key] = semantic_result
            # Limit cache size
            if len(self._semantic_cache) > 500:
                oldest = list(self._semantic_cache.keys())[:250]
                for k in oldest:
                    self._semantic_cache.pop(k, None)
            return semantic_result

        # ── Fallback: default to executive ───────────────────────────────────
        return QueryGateResult(
            path=QueryPath.EXECUTIVE,
            confidence=0.6,
            reason="general_query_default_executive",
        )

    async def _semantic_classify(self, text: str) -> QueryGateResult | None:
        """Use a tiny Groq call to classify ambiguous queries."""
        try:
            from app.ai.providers.groq import GroqProvider
            provider = GroqProvider()
            result = await provider.generate(
                prompt=_CLASSIFY_PROMPT,
                context={},
                options={
                    "messages": [{"role": "user", "content": text}],
                    "temperature": 0.0,
                    "max_tokens": 20,
                },
            )
            category = (result.content or "").strip().upper()
            if category == "FAST_FACT":
                return QueryGateResult(
                    path=QueryPath.FAST_FACT,
                    confidence=0.8,
                    reason="semantic_classified_fast_fact",
                )
            elif category == "EXECUTIVE":
                return QueryGateResult(
                    path=QueryPath.EXECUTIVE,
                    confidence=0.8,
                    reason="semantic_classified_executive",
                )
        except Exception:
            logger.debug("Semantic classification failed, falling back to executive", exc_info=True)
        return None

    def _check_fast_fact(self, text: str) -> QueryGateResult | None:
        """Check if the question can be answered deterministically."""
        for patterns, handler, reason in _FAST_FACT_RULES:
            for pattern in patterns:
                if pattern.search(text):
                    # Dynamic task handler selection
                    actual_handler = handler
                    if handler is None:
                        # Task count variants
                        if "overdue" in text:
                            actual_handler = "overdue_task_count"
                        elif "completed" in text and "today" in text:
                            actual_handler = "completed_today_count"
                        elif "pending" in text:
                            actual_handler = "pending_task_count"
                        else:
                            actual_handler = "task_count"
                    return QueryGateResult(
                        path=QueryPath.FAST_FACT,
                        confidence=0.95,
                        reason=reason,
                        fast_fact_handler=actual_handler,
                    )
        return None

    def resolve_entity_hint(self, text: str, known_names: list[str]) -> str | None:
        """Resolve a fuzzy entity name from the query against known names.

        Supports:
        - Exact match
        - Prefix match ("gaur" → "Gaurav")
        - Fuzzy/typo match ("Rahual" → "Rahul")
        - Partial match ("riya j" → "Riya Jain")
        - Hinglish normalization

        Returns the best-matching known name, or None.
        """
        normalized_text = _normalize_hinglish(text)
        # Extract potential name tokens (2-3 words that aren't common keywords)
        stop_words = {
            "how", "many", "what", "show", "give", "tell", "about", "the", "a", "an",
            "is", "are", "was", "were", "do", "does", "did", "has", "have", "had",
            "can", "could", "would", "should", "will", "may", "might",
            "and", "or", "but", "for", "with", "from", "to", "in", "on", "at",
            "today", "yesterday", "this", "that", "my", "our", "their",
            "employee", "employees", "team", "staff", "person", "people",
            "project", "projects", "task", "tasks", "client", "clients",
            "salary", "attendance", "leave", "meeting", "invoice", "lead",
            "hr", "summary", "overview", "status", "report",
            # Hinglish
            "kaise", "kya", "kaun", "kyun", "kab", "kitna", "kitne",
            "kaam", "paise", "haziri", "chutti", "baithak", "bill",
            "aaj", "hai", "hain", "ho", "tha", "thi", "the",
        }
        tokens = [
            t for t in re.findall(r'\w+', normalized_text.lower())
            if t not in stop_words and len(t) >= 2
        ]
        if not tokens:
            return None

        # Try to match tokens against known names
        best_match: str | None = None
        best_score = 0.0

        for name in known_names:
            name_lower = name.lower()
            name_parts = set(name_lower.split())

            for token in tokens:
                # Exact match
                if token == name_lower or token in name_parts:
                    return name  # Exact match, return immediately

                # Fuzzy match
                if _fuzzy_match(token, name, threshold=0.55):
                    score = 1.0 - (_edit_distance(token, name_lower) / max(len(token), len(name_lower)))
                    if score > best_score:
                        best_score = score
                        best_match = name

                # Prefix match
                for part in name_parts:
                    if part.startswith(token) or token.startswith(part):
                        score = 0.8
                        if score > best_score:
                            best_score = score
                            best_match = name

        return best_match if best_score >= 0.55 else None
