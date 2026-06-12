from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    company_id: Optional[str] = None
    type: str
    title: str
    message: str
    metadata: Optional[Dict[str, Any]] = None
    is_read: bool
    created_at: datetime
