# Sales User Flows

## Sales Overview

```mermaid
flowchart TD
  A[Authenticated user with sales access] --> B[/sales/dashboard]
  B --> C[/sales/contacts]
  B --> D[/sales/prospects]
  B --> E[/sales/pipeline]
  B --> F[/sales/reports]
  B --> G[/sales/settings]
```

## Sales Dashboard
- How the user reaches it: `/sales` or module navigation.
- What they can do: inspect sales overview and jump to sales workspaces.
- What happens after every action: route navigation or filter changes trigger the corresponding list/dashboard fetch.
- Backend APIs called: `GET /api/v1/sales/dashboard`
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: Prospect, Contact, Pipeline, Reports.

## Sales Contacts
- How the user reaches it: sales dashboard/sidebar or `/sales/contacts`.
- What they can do: list, create, edit, delete contacts; open contact detail.
- What happens after every action: CRUD mutations refresh the list/detail.
- Backend APIs called: `GET/POST/PUT/DELETE /api/v1/sales/contacts`
- Timeline events created: contact updates may be reflected in CRM timeline if the backend emits activity events.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: CRM Contacts, Company Workspace.

## Sales Prospects
- How the user reaches it: sales dashboard/sidebar or `/sales/prospects`.
- What they can do: list prospects, create prospects, edit prospects, bulk upload, open detail.
- What happens after every action: list updates, stage updates, and detail screens refresh the prospect record. Manual create requires a phone number but allows duplicate phones so duplicate management can review and merge them later.
- Backend APIs called: `GET/POST/PUT /api/v1/sales/prospects`, bulk upload, search/contact helpers.
- Timeline events created: prospect lifecycle events should flow into CRM activity/timeline if backend emits them.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: CRM Pipeline, Lead Workspace, Activities.

## Sales Pipeline
- How the user reaches it: sales sidebar or `/sales/pipeline`.
- What they can do: drag prospects between stages.
- What happens after every action: the board updates and the prospect stage is persisted.
- Backend APIs called: sales prospect read/update APIs and stage data.
- Timeline events created: stage updates should be surfaced in activity/timeline where configured.
- Notifications sent: none directly.
- Related modules updated: CRM Pipeline, Lead Timeline, Reports.

## Sales Reports
- How the user reaches it: `/sales/reports`.
- What they can do: inspect report views and review analytics.
- What happens after every action: report filters refetch data.
- Backend APIs called: sales report endpoints.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: CRM Reports.

## Sales Settings
- How the user reaches it: `/sales/settings`.
- What they can do: manage stages, tags, channels, categories, products. Admin, Sub Admin, Manager, Lead, and Super Admin users with sales module access can create and update categories and products for their permitted tenant scope.
- What happens after every action: configuration lists refresh after CRUD mutations.
- Backend APIs called:
  - `GET/POST /api/v1/sales/masters/stages`
  - `GET/POST /api/v1/sales/masters/tags`
  - `GET/POST /api/v1/sales/masters/channels`
  - `GET/POST /api/v1/sales/categories`
  - `GET/POST /api/v1/sales/products`
- Timeline events created: generally not yet consistent.
- Notifications sent: none directly.
- Related modules updated: CRM Settings, Pipeline, Reports.

## Guided Stage-Transition Validation
- How the user reaches it: any stage-movement action (pipeline board move, stage table row action, lead-detail "Move to next stage" button, Won-to-Clients transfer).
- What they can do: attempt a transition even when the lead is not ready. The backend returns a structured `STAGE_TRANSITION_BLOCKED` response (`detail` object with `code`, `severity: warning`, `current_stage`, `target_stage`, `message`, `missing_fields`, `status_requirement`, `action_requirement`). The frontend classifies every blocker through the shared `classifyTransitionFailure` utility (`frontend/src/utils/salesTransition.js`) so every entry point behaves identically:
  - `MISSING_DETAILS` — opens the shared `StageRequirementsDialog` (`frontend/src/components/sales/StageRequirementsDialog.jsx`) with only the missing editable fields (budget, decision maker, timeline, discovery outcome, qualification status, negotiation status, won status, account manager). Save Details persists them through the existing lead-update API and keeps the lead on its current stage; Save and Move Forward persists and re-runs the transition. Proposal/Acceptance and Agreement/Signed are never editable in the popup (domain-owned / signature-verified) — they fall back to a safe warning list.
  - `STATUS_REQUIREMENT` or `ACTION_REQUIREMENT` — shows an amber warning toast with action-oriented copy (e.g. "The proposal must be Accepted before moving to Negotiation"). The status is never auto-changed and no stage is skipped.
  - `PERMISSION_DENIED` — access warning without exposing security details.
  - `TECHNICAL_ERROR` — regular error toast (network/server/database failures).
- Business validation blockers (HTTP 400 with structured or legacy detail) surface as warnings, never red errors, and never produce duplicate toasts alongside the popup.
- What happens after every action: a successful save refreshes the lead and pipeline queries; the lead moves only after the backend confirms every rule.
- Backend APIs called:
  - `PATCH /api/v1/crm/pipeline/{lead_id}/stage` (returns structured blocker details on 400)
  - `POST /api/v1/crm/pipeline/{lead_id}/transfer` (structured blockers for handoff requirements)
  - `PUT /api/v1/sales/prospects/{lead_id}` (popup saves)
  - `PATCH /api/v1/crm/pipeline/{lead_id}/conversion` (account-manager assignment + `create_client` from the popup)
- Timeline events created: only for successful status/stage changes; a failed transition is not recorded as a move.
- Notifications sent: none directly.
- Related modules updated: Pipeline, Lead Workspace, Clients transfer.

## Record Contact Attempt (Acquire)
- How the user reaches it: a "Record contact" button on Acquire-stage table rows / board cards (shown only while the lead has no contact evidence), or the same action in the card's "More actions" menu.
- What they can do: pick a method (Call / Email / WhatsApp / Other), add optional notes, and save. The action creates a real call/email activity (`POST /api/v1/crm/activities`) and backfills `last_contacted_at` through `PUT /api/v1/sales/prospects/{lead_id}` — the backend auto-fills `first_contact_at` from `last_contacted_at`, so no fake history is created.
- First-contact gate: a lead may move Acquire → Qualify when `first_contact_at` OR `last_contacted_at` is set, or when a completed/in-progress call, email, follow-up, or meeting activity exists on the lead. Leads that already carry contact history are therefore never blocked by a missing gate field.
- Timeline events created: the activity record and the pipeline history entry on the eventual move.
- Related modules updated: Pipeline, Activities, Lead Workspace.

## Won → Clients Inline Completion
- How the user reaches it: attempting to transfer a Won lead without all handoff records opens the required-details popup with a "Create Client" one-click action (plus the Account Manager selector) instead of only a warning list.
- What they can do: complete the handoff inline — `create_client` re-runs the idempotent won-deal automation (existing Client/Project refs are reused, never duplicated), then the transfer is re-attempted automatically; the popup closes only when every rule passes. Non-manager transfers still require `won_status = Ready`.
- Backend APIs called: `PATCH /api/v1/crm/pipeline/{lead_id}/conversion` (action `create_client`), `POST /api/v1/crm/pipeline/{lead_id}/transfer`.
- Related modules updated: Pipeline, Clients, Projects, Invoices, Lead Workspace.

## Pipeline load resilience (dirty legacy data)
- How it affects the user: previously one legacy lead with an invalid `email` value (e.g. `vghygcvghgv`) made the whole pipeline board return 500, because the model validated `email` as `EmailStr` at read time.
- What changed: `SalesProspect.email` is now a plain optional string, and `load_pipeline` fetches documents through a resilient per-document validation (`_fetch_prospects_resilient`) that skips invalid legacy records instead of crashing the board (a warning log names the cleanup script). Write paths (create, update, CSV import) sanitize email via `LeadEngine._sanitize_email`, so invalid values are stored as `None`.
- Cleanup: run `backend/scripts/cleanup_invalid_lead_emails.py` once to clear existing dirty values (it only clears invalid emails, never deletes leads or other fields).
- Related modules updated: Pipeline, Leads API, import.

