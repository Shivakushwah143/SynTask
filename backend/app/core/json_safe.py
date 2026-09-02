"""Central recursive JSON-safe serialization utility.

Converts non-JSON-serializable types (PydanticObjectId, bson.ObjectId,
Enum, datetime, date, Pydantic BaseModel, set, tuple) into JSON-safe
primitives before any data is sent to Pydantic serialization, Groq, or
API responses.

Usage::

    from app.core.json_safe import to_json_safe

    safe_dict = to_json_safe(raw_dict)
    json.dumps(safe_dict)  # guaranteed to succeed
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any


def to_json_safe(value: Any) -> Any:
    """Recursively convert *value* into a JSON-serializable representation.

    Handles:
    - ``PydanticObjectId`` / ``bson.ObjectId`` → ``str``
    - ``Enum`` → ``.value``
    - ``datetime`` / ``date`` → ISO-8601 string
    - ``Pydantic BaseModel`` → ``to_json_safe(model_dump())``
    - ``dict`` → recursively converted keys/values
    - ``list`` / ``tuple`` / ``set`` → converted list
    - primitives → unchanged
    """
    # --- Fast-path primitives ---
    if value is None or isinstance(value, (bool, int, float, str)):
        return value

    # --- ObjectId (beanie / bson) ---
    try:
        from beanie.odm.fields import PydanticObjectId
        if isinstance(value, PydanticObjectId):
            return str(value)
    except ImportError:
        pass

    try:
        from bson import ObjectId
        if isinstance(value, ObjectId):
            return str(value)
    except ImportError:
        pass

    # --- Enum ---
    if isinstance(value, Enum):
        return to_json_safe(value.value)

    # --- datetime / date → ISO 8601 ---
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()

    # --- Pydantic BaseModel ---
    try:
        from pydantic import BaseModel
        if isinstance(value, BaseModel):
            return to_json_safe(value.model_dump())
    except ImportError:
        pass

    # --- Collections ---
    if isinstance(value, dict):
        return {str(k): to_json_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [to_json_safe(item) for item in value]

    if isinstance(value, set):
        return [to_json_safe(item) for item in sorted(value, key=str)]

    # --- Fallback: convert to string ---
    return str(value)
