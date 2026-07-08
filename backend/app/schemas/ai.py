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


class AITaskBreakdownRequest(BaseModel):
    task_id: str = Field(min_length=1)
    max_subtasks: int = Field(default=5, ge=3, le=10)


class AITaskBreakdownTaskItem(BaseModel):
    task_id: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    department: Optional[str] = None
    assigned_to: Optional[str] = None


class AITaskSubtaskItem(BaseModel):
    order: int
    title: str
    description: str
    estimated_hours: float
    dependencies: List[str] = Field(default_factory=list)
    milestone: Optional[str] = None


class AITaskMilestoneItem(BaseModel):
    title: str
    description: str
    due_in_days: Optional[int] = None
    success_criteria: str


class AITaskBreakdownResponse(BaseModel):
    summary: str
    task: AITaskBreakdownTaskItem
    subtasks: List[AITaskSubtaskItem]
    dependencies: List[str] = Field(default_factory=list)
    milestones: List[AITaskMilestoneItem] = Field(default_factory=list)
    time_estimate_hours: float
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


class AITaskBreakdownLLMResponse(BaseModel):
    summary: str
    subtasks: List[AITaskSubtaskItem]
    dependencies: List[str] = Field(default_factory=list)
    milestones: List[AITaskMilestoneItem] = Field(default_factory=list)
    time_estimate_hours: float
    actions: List[dict[str, Any]] = Field(default_factory=list)


class TaskBreakdownRequest(BaseModel):
    task_title: str = Field(min_length=1, max_length=200)
    task_description: Optional[str] = Field(default=None, max_length=2000)
    task_id: Optional[str] = None
    max_steps: int = Field(default=5, ge=3, le=10)


class TaskBreakdownStep(BaseModel):
    title: str
    description: str
    estimated_minutes: int = Field(ge=1)
    dependencies: List[str] = Field(default_factory=list)
    status: str = "pending"


class TaskBreakdownLLMResponse(BaseModel):
    task_id: str
    task_title: str
    steps: List[TaskBreakdownStep]


class TaskBreakdownResponse(BaseModel):
    task_id: str
    task_title: str
    steps: List[TaskBreakdownStep]
    source: str
    provider: str
    model: str
    role: str
    prompt_version: str
    fallback_chain: List[str] = Field(default_factory=list)
    fallback_used: bool = False
    generated_at: datetime
    context: dict[str, Any] = Field(default_factory=dict)


class AIDailyReportRequest(BaseModel):
    report_date: date = Field(default_factory=date.today)
    limit: int = Field(default=10, ge=1, le=25)


class AIDailyReportItem(BaseModel):
    item_type: str
    title: str
    description: Optional[str] = None
    item_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    assigned_to: Optional[str] = None
    project_name: Optional[str] = None
    note: Optional[str] = None


class AIDailyReportSection(BaseModel):
    title: str
    summary: str
    items: List[AIDailyReportItem] = Field(default_factory=list)


class AIDailyReportResponse(BaseModel):
    report_type: str
    summary: str
    sections: List[AIDailyReportSection]
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


class AIDailyReportLLMResponse(BaseModel):
    report_type: str
    summary: str
    sections: List[AIDailyReportSection]
    actions: List[dict[str, Any]] = Field(default_factory=list)


class AIChatHistoryItem(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(min_length=1, max_length=4000)
    history: List[AIChatHistoryItem] = Field(default_factory=list)


class AIChatSuggestedAction(BaseModel):
    label: str
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AIChatResponse(BaseModel):
    conversation_id: Optional[str] = None
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


class AILeadIntelligenceRequest(BaseModel):
    lead_id: str = Field(min_length=1)
    depth: str = Field(default="standard", pattern="^(minimal|standard|full)$")
    persist: bool = False


class AILeadIntelligenceMatch(BaseModel):
    lead_id: str
    prospect_name: str
    company_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    match_score: int = Field(ge=0, le=100)


class AILeadIntelligenceResponse(BaseModel):
    lead_id: str
    lead_name: str
    company_name: Optional[str] = None
    lead_score: int = Field(ge=0, le=100)
    priority: str
    urgency: str
    buying_intent: str
    duplicate_risk: bool = False
    duplicate_matches: List[AILeadIntelligenceMatch] = Field(default_factory=list)
    recommended_salesperson: dict[str, Any] = Field(default_factory=dict)
    recommended_pipeline_stage: str
    recommended_next_action: str
    reasoning_summary: str
    source: str
    provider: str
    model: str
    generated_at: datetime
    context: dict[str, Any] = Field(default_factory=dict)


class AISalesAgentRequest(BaseModel):
    lead_id: str = Field(min_length=1)
    depth: str = Field(default="standard", pattern="^(minimal|standard|full)$")
    persist: bool = False
    execution_mode: str = Field(default="manual", pattern="^(manual|auto)$")


class AISalesAgentCommunication(BaseModel):
    subject: Optional[str] = None
    html: Optional[str] = None
    text: Optional[str] = None


class AISalesAgentMeeting(BaseModel):
    recommended: bool = False
    duration_minutes: int = Field(default=30, ge=15, le=120)
    reason: str


class AISalesAgentFollowUp(BaseModel):
    recommended_date: Optional[str] = None
    summary: str


class AISalesAgentCRM(BaseModel):
    next_stage: str
    activity_summary: str


class AISalesAgentResponse(BaseModel):
    communication_strategy: dict[str, Any]
    email: AISalesAgentCommunication
    whatsapp: dict[str, Any] = Field(default_factory=dict)
    meeting: AISalesAgentMeeting
    follow_up: AISalesAgentFollowUp
    crm: AISalesAgentCRM
    lead_intelligence: AILeadIntelligenceResponse
    source: str
    provider: str
    model: str
    execution_mode: str = "manual"
    execution_status: str = "generated"
    delivery: dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime
    context: dict[str, Any] = Field(default_factory=dict)
