"""UTC ISO JSON response serializer.

All persisted instants are stored as naive UTC (see ``app.core.clock``). By
default FastAPI/Starlette serialize a naive ``datetime`` as
``"2026-07-19T05:00:00"`` without any UTC designator, which JavaScript then
interprets as browser-local time. This response class appends the UTC ``Z``
designator to naive ISO datetime strings so every API response returns explicit
UTC ISO timestamps and the frontend can convert them through the central
timezone service without ambiguity.

Use it as the default response class for the FastAPI application:

    app = FastAPI(..., default_response_class=UTCJSONResponse)
"""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi.responses import JSONResponse

from app.core.json_safe import to_json_safe

# Matches a quoted ISO datetime with a time component and NO timezone suffix,
# e.g. "2026-07-19T05:00:00" or "2026-07-19T05:00:00.123456". Date-only values
# (e.g. "2026-07-19") and values that already carry a timezone offset or Z are
# left untouched.
_NAIVE_DATETIME_RE = re.compile(
    r'"(?P<dt>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)"'
)


def _append_z_to_naive_datetimes(text: str) -> str:
    return _NAIVE_DATETIME_RE.sub(lambda match: f'"{match.group("dt")}Z"', text)


class UTCJSONResponse(JSONResponse):
    """JSONResponse that serializes naive UTC datetimes with an explicit ``Z``.

    Also converts any remaining non-JSON-serializable types (PydanticObjectId,
    Enum, datetime, etc.) via ``to_json_safe`` before encoding.
    """

    def render(self, content: Any) -> bytes:
        safe_content = to_json_safe(content)
        rendered = json.dumps(safe_content, ensure_ascii=False, default=str).encode("utf-8")
        decoded = rendered.decode("utf-8")
        decoded = _append_z_to_naive_datetimes(decoded)
        return decoded.encode("utf-8")
