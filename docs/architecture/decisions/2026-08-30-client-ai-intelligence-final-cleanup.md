# ADR: Client AI Intelligence Uses Grounded Workspace Context

Date: 2026-08-30

## Status
Accepted

## Context
SynTask Clients Phase 10 requires AI-style client intelligence after Phases 0-9 established canonical Client relationships for CRM Company/Contacts, Services, Projects, Deliverables, Communication, Files, Finance, Renewal, Churn, Health, Next Action, Escalation, Overview, Saved Views, and Automation.

The main risk is creating a second Client data model or sending unrestricted records into AI context. Phase 10 must preserve tenant isolation, client permissions, finance restrictions, file permissions, internal-note separation, and Health as an explainable deterministic source of truth.

## Decision
Client AI Intelligence is implemented as a compact server-side context layer over `ClientWorkspaceService`. It does not add a new collection, duplicate Client records, copy files, copy Contacts, or create Tasks/Notifications from AI recommendations.

The AI context includes only bounded same-tenant data already returned by the authorized Client Workspace: lifecycle, Phase 8 Health, services, projects, deliverables, finance aggregates, recent client-facing communication, meetings, renewal, next action, activity, and file category counts. Internal-note bodies and file contents are excluded. Secret-like values such as passwords, tokens, API keys, and bearer credentials are redacted before brief or answer generation.

The first implementation returns deterministic grounded summaries and recommendations with entity references. Health explanations read Phase 8 Health score, level, and reasons directly. Risk, renewal, and upsell answers return `Not enough data to determine this reliably.` when the context lacks reliable support.

## Consequences
- Tenant isolation and Client permissions stay centralized in `ClientWorkspaceService`.
- Phase 10 adds no new migration-required database schema.
- AI recommendations remain advisory and cannot silently execute workflow actions.
- Future provider-backed generation can reuse the same compact context contract if prompt logging, provider controls, and cost governance are added later.
- Cleanup is exposed as a non-destructive admin/lead audit so legacy duplicate stores are not deleted accidentally.

## Verification
- Unit tests cover secret redaction, source-referenced answers, advisory next-action recommendations, Health source-of-truth behavior, insufficient-data responses, and non-destructive cleanup audit behavior.
- Existing Client regression tests remain the negative guard for tenant scoping and canonical relationship reuse.
