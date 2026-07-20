# SynTask Phase 2 Agent Platform Implementation Plan

Status: Technical plan for continued development after Milestone 5 foundation work
Date: 2026-07-20

## Source Note

The canonical `SynTask_Phase_2_AI_Agents_Workflows_and_User_Stories` source was not present in this workspace when this plan was written. This plan follows the accepted Milestone 5 direction and the current Phase 2 RAG architecture.

## Product Decision

WhatsApp, Meta and LinkedIn are secure communication connectors used by expert departmental agents. They are not standalone agents and must not duplicate department-specific intelligence, memory, planning or approval logic.

Departmental agents own reasoning and workflow behavior. Connectors only provide authenticated channel access, message normalization, delivery status, inbound event capture, rate-limit handling, audit trails and user-approved outbound dispatch.

## Platform Principles

- All agents request context through the Central ContextPackage service.
- Agents do not query MongoDB, Redis, Qdrant or business collections directly.
- Structured Memory is authoritative for current SynTask business facts.
- RAG is governed document evidence and must preserve citations.
- Working Memory only stores short-lived conversational state.
- LLM output never mutates business state without an explicit approved action.
- Prompt injection in documents or messages is treated as untrusted content and cannot change system, policy or tool rules.
- Every agent run records provider, model, prompt/profile versions, citations, decisions, proposed actions and feedback links.

## Agent Contract

Each expert agent must define:

- `agent_id`
- `department`
- `allowed_capabilities`
- `required_context_profile`
- `allowed_connectors`
- `forbidden_source_types`
- `input_schema`
- `output_schema`
- `approval_policy`
- `audit_policy`
- `evaluation_suite`

## Runtime State Machine

1. `draft`: agent definition exists but is not callable.
2. `review`: security, product and QA review in progress.
3. `shadow`: agent can run without user-visible actions.
4. `assisted`: agent can propose actions for user approval.
5. `limited_auto`: agent can execute low-risk pre-approved actions.
6. `retired`: agent is disabled but audit history remains.

Milestone 6 should implement only `draft`, `review`, `shadow` and `assisted`. `limited_auto` requires a later approval-gateway milestone.

## Core Runtime Components

- Agent Registry: stores agent definitions, versions, capability grants and lifecycle status.
- Agent Run Orchestrator: validates requests, builds context packages, calls provider router, validates schema output and records audit events.
- Capability Guard: maps user role, company, department, project, client and module permissions to allowed agent tools.
- Provider Router: selects OpenAI or Groq by task type, risk, tenant policy, schema needs, timeout, retry and cost metadata.
- Feedback Service: captures useful/not useful ratings, unsafe reports and incorrect citations for review.
- Evaluation Runner: executes a seeded gold retrieval and agent-output suite before promotion.
- Connector Gateway: normalizes inbound/outbound channel events and delegates business decisions to departmental agents.

## Departmental Agent Blueprints

1. Project Planning Agent: schedule risks, task breakdowns, dependency summaries and delivery-plan drafts.
2. Sales Agent: prospect context, lead follow-up drafts, proposal support and CRM-safe recommendations.
3. HR/Recruitment Agent: candidate summaries, interview preparation and guarded recruitment workflows.
4. Marketing Agent: campaign briefs, content-calendar support and creative review summaries.
5. Client Success Agent: account context, meeting preparation and escalation summaries.
6. Finance/Billing Agent: invoice explanation drafts and payment-status summaries.
7. Support Agent: ticket triage, resolution suggestions and knowledge-backed replies.
8. Operations Agent: cross-department status, blockers and process-health summaries.
9. Executive Agent: company-level summaries with strict tenant and role scoping.
10. Knowledge Governance Agent: source review queues, citation audits and stale-document detection.

## Connector Model

WhatsApp, Meta and LinkedIn must be implemented as connectors under the Connector Gateway:

- WhatsApp Connector: inbound/outbound business messages, template enforcement, consent tracking and delivery receipts.
- Meta Connector: page/account message ingestion, campaign-comment triage and governed outbound replies.
- LinkedIn Connector: lead/message capture, profile-context attachment and user-approved outreach drafts.

Connector rules:

- Connectors cannot decide business actions by themselves.
- Connectors cannot maintain independent long-term memory.
- Connectors cannot bypass RAG governance, Structured Memory permissions or provider policies.
- Outbound messages require an agent-generated draft plus user approval unless a later milestone explicitly enables limited automation.
- Connector events are stored as auditable channel records and passed to the correct departmental agent based on workspace, account, user, conversation and configured routing.

## Milestone 5 Foundation Scope

Milestone 5 completes foundation pieces needed before agent implementation:

- Multi-format ingestion for DOCX, PPTX, XLSX, CSV and HTML with parser limits and macro rejection.
- Real retrieval evaluation runner with quality, security, citation and latency metrics.
- Provider router with provider selection, fallback, retry, schema validation, token budget and sensitive-data blocking.
- Governance operations for source listing, chunk preview, rejection, disable, versions and citation audit.
- Feedback capture for ratings, unsafe reports and incorrect citations.
- Agent platform plan defining scope boundaries for Milestone 6.

## Milestone 6 Exact Implementation Scope

Milestone 6 should implement the Agent Registry, Agent Run Orchestrator and two shadow-mode agents:

- Project Planning Agent
- Sales Agent

Milestone 6 must not implement autonomous external sending, standalone WhatsApp/Meta/LinkedIn agents, long-term self-learning or direct database access from agents.

## Promotion Gates

- Retrieval quality thresholds pass on the seeded real-service suite.
- No cross-tenant source appears in citations or context packages.
- Unauthorized project/client/department sources are rejected.
- Prompt-injection cases do not alter policy, tool or instruction boundaries.
- Provider router records fallback, cost and schema-validation outcomes.
- Feedback and governance actions are auditable.
- Connector design review confirms channels are transport surfaces, not intelligence owners.

