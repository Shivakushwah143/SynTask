from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class AITaskPrioritizationRequest(BaseModel):
    target_user_id: Optional[str] = None
    for_date: date = Field(default_factory=date.today)
    limit: int = Field(default=10, ge=1, le=25)
    include_completed: bool = False


class AIInsightTaskItem(BaseModel):
    task_id: str
    title: str
    status: str
    priority: str
    score: int
    reason: str
    recommended_action: str
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    department: Optional[str] = None


class AIDailyBlock(BaseModel):
    time_block: str
    focus: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    rationale: str


class AITaskPrioritizationResponse(BaseModel):
    summary: str
    top_priorities: List[AIInsightTaskItem]
    daily_breakdown: List[AIDailyBlock]
    risks: List[str] = Field(default_factory=list)
    actions: List[dict[str, Any]] = Field(default_factory=list)
    source: str
    provider: str
    model: str
    role: str
    prompt_version: str
    fallback_chain: List[str] = Field(default_factory=list)
    fallback_used: bool = False
    generated_at: datetime
    context: dict[str, Any] = Field(default_factory=dict)


class AITaskPrioritizationLLMResponse(BaseModel):
    summary: str
    top_priorities: List[AIInsightTaskItem]
    daily_breakdown: List[AIDailyBlock]
    risks: List[str] = Field(default_factory=list)
    actions: List[dict[str, Any]] = Field(default_factory=list)


class AIChatHistoryItem(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: List[AIChatHistoryItem] = Field(default_factory=list)


class AIChatSuggestedAction(BaseModel):
    label: str
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AIChatResponse(BaseModel):
    message: str
    suggested_actions: List[AIChatSuggestedAction] = Field(default_factory=list)
    actions: List[dict[str, Any]] = Field(default_factory=list)
    source: str
    provider: str
    model: str
    role: str
    prompt_version: str
    prompt_role_key: str
    fallback_chain: List[str] = Field(default_factory=list)
    fallback_used: bool = False
    generated_at: datetime
    context: dict[str, Any] = Field(default_factory=dict)


class AIChatLLMResponse(BaseModel):
    message: str
    suggested_actions: List[AIChatSuggestedAction] = Field(default_factory=list)
    actions: List[dict[str, Any]] = Field(default_factory=list)


class AILogListItem(BaseModel):
    id: str
    feature: str
    role: str
    provider: str
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    prompt_role_key: Optional[str] = None
    status: str
    company_id: Optional[str] = None
    user_id: Optional[str] = None
    target_user_id: Optional[str] = None
    latency_ms: Optional[float] = None
    fallback_used: bool = False
    fallback_chain: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    created_at: datetime
