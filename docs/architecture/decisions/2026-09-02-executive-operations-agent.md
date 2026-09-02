# Executive Operations Agent

Status: Implemented
Date: 2026-09-02

## Decision

SynTask will implement a single Executive Operations Agent that becomes the CEO/executive team's primary company intelligence and operational coordination layer. The agent uses Groq as its LLM provider with tool/function calling to investigate real SynTask data across ALL business domains — Projects, Tasks, Clients, Sales, HR, Finance, and Meetings — and return data-grounded, cross-domain answers.

The Executive Agent replaces the need for executives to know which module contains the answer. They ask natural-language questions and the agent locates, connects, and explains relevant records across the entire company.

## Context

Executives need a unified view across all business domains to make informed decisions. Currently, understanding why a client is at risk requires manually checking projects, tasks, invoices, meetings, and team workload across separate pages. Cross-domain reasoning — connecting evidence across departments — is the most critical capability for executive decision-making.

## Approach

### Architecture

The Executive Agent integrates into the existing SynTask Agent Platform alongside the HR Agent:

```
CEO / Executive Question
  ↓
DeterministicAgentRouter (keyword matching)
  ↓
ExecutiveOperationsAgent (tool-call loop with Groq)
  ↓
Executive Tool Implementations (call existing SynTask services/models)
  ↓
Domain-specific tools across ALL business domains
  ↓
Cross-domain evidence connection
  ↓
Data-grounded executive answer
```

### Agent Loop

The agent implements the mandatory pattern:
- **Goal** → Understand intent
- **Resolve** → Entity resolution (project/client/employee/lead by name, email, id)
- **Fetch** → Call tools to get current SynTask data across domains
- **Reason** → Connect evidence across departments
- **Fetch More** → Drill down when investigation requires more data
- **Answer** → Structured response with facts, cross-domain analysis, risks, and recommendations

Max steps are enforced via `EXECUTIVE_AGENT_MAX_STEPS` (default: 20).

### Tools

23 read-only tools covering all business domains:

| Domain | Tools |
|---|---|
| Company Intelligence | `get_company_summary`, `get_company_attention_summary` |
| Projects | `search_projects`, `get_project_360`, `get_project_risks` |
| Tasks | `get_overdue_tasks`, `get_user_tasks`, `get_user_task_activity`, `get_team_workload` |
| Clients | `search_clients`, `get_client_360`, `get_client_risks` |
| Sales / CRM | `get_sales_summary`, `get_followup_risks`, `get_lead_360` |
| Finance | `get_finance_summary`, `get_overdue_invoices` |
| Meetings | `get_meeting_summary`, `get_pending_meeting_followups` |
| HR (delegated) | `search_employees`, `get_employee_360`, `get_hr_attention_summary` |
| Documents | `get_entity_documents` |

### Cross-Domain Reasoning

The primary differentiator is cross-domain investigation. For example, when asked "Why is Client ABC at risk?":

1. `get_client_360` → client state, linked projects
2. `get_project_risks` → overdue tasks, deadline analysis
3. `get_overdue_tasks` → specific blocking tasks and assignees
4. `get_team_workload` → assignee capacity
5. `get_meeting_summary` → recent client interactions
6. `get_finance_summary` → invoice status

The agent connects this evidence and explains the root cause with recommendations.

### Routing

Executive-level queries are routed based on keyword detection in `DeterministicAgentRouter`. Keywords include: "what needs my attention", "company health", "client risk", "project delayed", "sales performing", "team workload", "finance status", etc. Executive routing takes priority over HR routing.

### Capability Packs

The Executive Agent is accessible to Manager, Admin, and Super Admin roles. Lead and Employee roles do not get executive-level access (HR-only for leads, base agents for employees).

### Security

- Company/tenant isolation enforced on every tool execution
- Tool arguments validated via Pydantic schemas before execution
- No generic database query or write tools
- Read-only V1 — mutations use proposal-only pattern
- LLM never has direct database access
- RBAC enforced server-side via capability packs
- Policy gateway validates every tool call

## Configuration

```env
# Backend
AI_PROVIDER=groq
GROQ_API_KEY=your-key
GROQ_MODEL=llama-3.1-70b-versatile
EXECUTIVE_AGENT_ENABLED=true
EXECUTIVE_AGENT_MAX_STEPS=20
EXECUTIVE_AGENT_MODEL=  # falls back to GROQ_MODEL

# Frontend
VITE_EXECUTIVE_AGENT_ENABLED=true
```

## API

- `POST /api/v1/executive-agent/chat` — Chat with the Executive Agent
- `GET /api/v1/executive-agent/quick-actions` — Get executive quick action prompts

## Files Changed

| File | Change |
|---|---|
| `backend/app/core/config.py` | Added `EXECUTIVE_AGENT_ENABLED`, `EXECUTIVE_AGENT_MAX_STEPS`, `EXECUTIVE_AGENT_MODEL` |
| `backend/app/agents/executive/__init__.py` | Updated: exports agent classes |
| `backend/app/agents/executive/tools.py` | New: 23 cross-domain executive tools |
| `backend/app/agents/executive/agent.py` | New: Executive agent loop with max-step safeguard |
| `backend/app/agents/executive/service.py` | New: Executive agent service with audit logging |
| `backend/app/agents/routing.py` | Added executive agent routing with keyword detection |
| `backend/app/agents/capability_packs.py` | Added `EXECUTIVE_AGENT_ID` to Manager/Admin/Lead capability packs |
| `backend/app/api/v1/endpoints/executive_agent.py` | New: Executive Agent API endpoint |
| `backend/app/api/v1/router.py` | Registered executive agent router |
| `frontend/src/api/ai.js` | Added `executiveChat()` and `executiveQuickActions()` API methods |
| `frontend/src/pages/AIChat.jsx` | Added executive quick actions, intent detection, and routing |
| `backend/.env.example` | Added executive agent config variables |
| `frontend/.env.example` | Added `VITE_EXECUTIVE_AGENT_ENABLED` |

## Non-Goals for V1

- No separate sub-agents per domain — one unified Executive Agent
- No direct database access by the LLM
- No automatic business decisions — critical decisions remain with the CEO
- No voice interface (planned for future)
- No write operations in V1 — all mutations are proposal-only
- No bypass of existing RBAC/confirmation flows

## Relationship to HR Agent

The Executive Agent delegates HR-specific tool implementations to the existing HR Agent tools where applicable (`get_employee_360`, `get_hr_attention_summary`). This avoids code duplication while giving the Executive Agent full cross-domain access. The HR Agent remains available for HR-specific workflows.

## Rollback

Set `EXECUTIVE_AGENT_ENABLED=false` and `VITE_EXECUTIVE_AGENT_ENABLED=false`. The Executive Agent endpoint returns 503. All existing screens and the HR Agent continue working unchanged. The routing changes are additive and non-breaking.
