# AI and Productivity User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Authenticated user] --> B[/ai-assistant]
  A --> C[/ai-hub]
  A --> D[/ai-prioritization]
  A --> E[/creative-director]
```

## AI Chat
- How the user reaches it: main navigation.
- What they can do: send prompts and review responses.
- What happens after every action: the request is sent to the AI backend and the conversation state updates.
- Backend APIs called: AI chat endpoints.
- Timeline events created: AI actions may be logged if backend instrumentation exists.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Tasks, CRM, Projects depending on prompt context.

## AI Hub
- How the user reaches it: main navigation.
- What they can do: launch AI workflows.
- What happens after every action: selected workflow requests are dispatched to the AI backend.
- Backend APIs called: AI orchestration endpoints.
- Timeline events created: may be logged by AI system.
- Notifications sent: none directly.
- Related modules updated: multiple dependent modules based on workflow output.

## AI Prioritization
- How the user reaches it: main navigation.
- What they can do: inspect prioritization recommendations.
- What happens after every action: actions update the prioritized list or linked work item.
- Backend APIs called: prioritization endpoints.
- Timeline events created: recommendation actions may be logged.
- Notifications sent: none directly.
- Related modules updated: Tasks, CRM Pipeline, Activities.

## Creative Director
- How the user reaches it: main navigation.
- What they can do: review and approve creative decisions.
- What happens after every action: approval/override updates creative state.
- Backend APIs called: creative review endpoints.
- Timeline events created: review/approval events may be logged.
- Notifications sent: none directly.
- Related modules updated: Projects, Clients.

## AI-enabled Phase 2 flow ownership

The canonical product scope for Project Agent, Task-Specific Subagents, Task Performance Agent, Email Draft Agent, transactional email, automated notifications, and Microsoft 365 integration lives in [Product requirements](../product/PRD.md). This user-flow file remains a route-level implementation reference and should not duplicate Phase 2 agent requirements.

Proposed Phase 2 AI flows must preserve the existing AI Chat, AI Hub, AI Prioritization, and Creative Director workflows. New flows must enforce tenant/project/task authorization server-side, show AI output as draft or recommendation, require human approval before external communication or material record changes, and write audit records for agent runs, approvals, delivery, retries, and failures.
