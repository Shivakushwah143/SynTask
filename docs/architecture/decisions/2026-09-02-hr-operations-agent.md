# HR Operations Agent

Status: Implemented
Date: 2026-09-02

## Decision

SynTask will implement a single unified HR Operations Agent that becomes the intelligent natural-language interface over Employee Management and Recruitment. The agent uses Groq as its LLM provider with tool/function calling to investigate real SynTask data and return data-grounded answers.

The HR Agent replaces the need for HR users to know which specific page or tab contains the information they need. Instead, they ask natural-language questions and the agent locates, connects, and explains the relevant records.

## Context

HR users currently need to navigate multiple pages to understand employee status, recruitment pipeline health, attendance anomalies, pending leaves, missing documents, and hiring blockers. A unified AI agent that can investigate across all these domains provides significant operational efficiency.

## Approach

### Architecture

The HR Agent integrates into the existing SynTask Agent Platform:

```
HR User Question
  ↓
DeterministicAgentRouter (keyword matching)
  ↓
HROperationsAgent (tool-call loop with Groq)
  ↓
HR Tool Implementations (call existing SynTask services)
  ↓
Existing SynTask Models/Services (Employee, Recruitment, Attendance, Leave, etc.)
  ↓
Data-grounded answer
```

### Agent Loop

The agent implements the mandatory pattern:
- **Goal** → Understand intent
- **Resolve** → Entity resolution (employee/candidate/job by name, email, id)
- **Fetch** → Call tools to get current SynTask data
- **Reason** → Analyze and connect information
- **Fetch More** → Drill down when needed
- **Answer** → Structured response with facts, blockers, and next actions

Max steps are enforced via `HR_AGENT_MAX_STEPS` (default: 15).

### Tools

18 read-only tools covering:

| Category | Tools |
|---|---|
| Entity Resolution | `search_employees`, `search_candidates`, `search_jobs` |
| 360 Views | `get_employee_360`, `get_candidate_360`, `get_job_360` |
| Employee Data | `get_employee_attendance`, `get_employee_leave`, `get_employee_documents` |
| Recruitment | `get_recruitment_overview`, `get_interviews`, `get_interview_feedback_status`, `get_offer_status` |
| Intelligence | `get_hr_attention_summary` |
| Payroll (branch-dependent) | `get_employee_salary`, `get_payroll_status`, `get_payroll_blockers`, `get_employee_payslip_status` |

### Groq Provider Enhancement

The existing `GroqProvider` was enhanced with `generate_with_tools()` to support OpenAI-compatible tool/function calling. This uses the Groq API's native tool calling capability without requiring a separate SDK.

### Routing

HR-related queries are routed based on keyword detection in `DeterministicAgentRouter`. Keywords include: employee, attendance, leave, candidate, recruitment, interview, offer, hiring, payroll, etc.

### Capability Packs

The HR Agent is accessible to Manager, Admin, Super Admin, and Lead roles. Employee role has base agents only (no HR Agent access for general employees — HR operations require elevated permissions).

### Security

- Company/tenant isolation enforced on every tool execution
- Tool arguments validated via Pydantic schemas before execution
- No generic database query or write tools
- Read-only V1 — mutations use proposal-only pattern
- LLM never has direct database access
- Sensitive fields (salary, payroll) only available through branch-dependent tools

### Payroll Branch-Dependency

Payroll tools (`get_employee_salary`, `get_payroll_status`, `get_payroll_blockers`, `get_employee_payslip_status`) detect at runtime whether the payroll module models are available. When unavailable, they return a clear message stating the module is not available in the current branch.

## Configuration

```env
# Backend
AI_PROVIDER=groq
GROQ_API_KEY=your-key
GROQ_MODEL=llama-3.1-70b-versatile
HR_AGENT_ENABLED=true
HR_AGENT_MAX_STEPS=15
HR_AGENT_MODEL=  # falls back to GROQ_MODEL

# Frontend
VITE_HR_AGENT_ENABLED=true
```

## API

- `POST /api/v1/hr-agent/chat` — Chat with the HR Agent
- `GET /api/v1/hr-agent/quick-actions` — Get HR-specific quick action prompts

## Files Changed

| File | Change |
|---|---|
| `backend/app/core/config.py` | Added `HR_AGENT_ENABLED`, `HR_AGENT_MAX_STEPS`, `HR_AGENT_MODEL`, `GROQ_BASE_URL` |
| `backend/app/ai/provider.py` | Added `ToolCall` dataclass, `generate_with_tools()` method |
| `backend/app/ai/providers/groq.py` | Enhanced with tool calling support |
| `backend/app/agents/routing.py` | Added HR agent routing with keyword detection |
| `backend/app/agents/capability_packs.py` | Added `HR_AGENT_ID` to Manager/Admin/Lead capability packs |
| `backend/app/agents/hr/__init__.py` | New: HR agent package |
| `backend/app/agents/hr/tools.py` | New: 18 HR tools with Pydantic validation |
| `backend/app/agents/hr/agent.py` | New: HR agent loop with max-step safeguard |
| `backend/app/agents/hr/service.py` | New: HR agent service with audit logging |
| `backend/app/api/v1/endpoints/hr_agent.py` | New: HR Agent API endpoint |
| `backend/app/api/v1/router.py` | Registered HR agent router |
| `frontend/src/api/ai.js` | Added `hrChat()` and `hrQuickActions()` API methods |
| `frontend/src/pages/AIChat.jsx` | Added HR-specific quick actions and intent detection |
| `backend/.env.example` | Added HR agent config variables |
| `frontend/.env.example` | Added `VITE_HR_AGENT_ENABLED` |

## Non-Goals for V1

- No separate Attendance Agent, Payroll Agent, or Recruitment Agent — one unified HR Agent
- No direct database access by the LLM
- No automatic hiring/rejection/termination decisions
- No new payroll module — uses existing payroll when available
- No bypass of existing RBAC/confirmation flows

## Rollback

Set `HR_AGENT_ENABLED=false` and `VITE_HR_AGENT_ENABLED=false`. The HR Agent endpoint returns 503. All existing HRMS screens continue working unchanged. The routing changes are additive and non-breaking.
