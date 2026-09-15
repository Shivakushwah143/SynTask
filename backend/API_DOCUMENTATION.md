# API Documentation - SynTask

Base URL: `https://task.synzent.ai/api/v1`  
Development: `http://localhost:8000/api/v1`

Interactive Swagger docs are available only outside production at `GET /api/docs`.

When MongoDB or Beanie initialization fails, protected API routes under `/api/v1` return `503` with `{"success":false,"message":"Database unavailable. Check MongoDB connection and restart the backend."}`. Background database workers are skipped until the backend is restarted with a healthy database connection.

## Authentication

Most endpoints require `Authorization: Bearer <access_token>`. Public exceptions include login, refresh, forgot/reset password flows, company registration, public MSA signing links, selected subscription/payment webhook endpoints, and health/debug endpoints.

### Meta webhook inbox

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/integrations/meta/webhook` | Meta verification token | Validates `hub.mode` and the deployment verify token, then returns the exact `hub.challenge`. |
| POST | `/api/v1/integrations/meta/webhook` | Meta HMAC | Reads a maximum 1 MiB raw body, validates `X-Hub-Signature-256` before JSON parsing, persists tenant-mapped events idempotently, and returns a fast acknowledgement. |
| GET | `/api/v1/integrations/meta/inbox/conversations` | Bearer token | Lists tenant-scoped Meta conversations across WhatsApp, Instagram, and Messenger. Supports `channel`, `status`, `assigned_to`, `unread`, `linked`, `limit`, `skip`, and super-admin `company_id`. |
| GET | `/api/v1/integrations/meta/inbox/conversations/{conversation_id}/messages` | Bearer token | Lists tenant-scoped messages for one Meta conversation after verifying the conversation belongs to the selected tenant. |

Invalid signatures return `401` without persistence. A valid duplicate returns `200` without duplicate dispatch. The endpoint remains inactive until the global Meta feature flag and the mapped tenant setting are enabled.

### Core Auth Endpoints

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | No | 10/minute | Authenticate with email/password and receive access and refresh JWTs. |
| POST | `/api/v1/auth/refresh` | No | 30/minute | Exchange a refresh token for a new access token. |
| POST | `/api/v1/auth/logout` | Yes | Default | Blacklist the current access token and optional refresh token. |
| POST | `/api/v1/auth/forgot-password` | No | 5/minute | Create a password reset token and send email when SMTP is configured. |
| POST | `/api/v1/auth/reset-password` | No | 10/minute | Set a new password using a valid reset token. |
| GET | `/api/v1/auth/me` | Yes | Default | Return current authenticated user. |

### Login Request

```json
{"email":"user@example.com","password":"password","remember_me":false}
```

### Login Response

```json
{"access_token":"...","refresh_token":"...","token_type":"bearer","user":{"id":"...","email":"...","role":"admin"}}
```

## Time Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/time/settings` | Yes | Return authenticated user's timezone, clock mode, display format, seconds preference, and server UTC time. |
| PUT | `/api/v1/time/settings` | Admin/Super Admin | Update authenticated user's timezone, automatic/manual time, display format, and seconds preference. |

First-login browser timezone detection can call `PUT /api/v1/time/settings` with `detected: true` only when the current user has no saved timezone. The endpoint mutates only `current_user`; it accepts no target user or tenant ID.

## Endpoints by Module

### Unified AI Assistant

Routes require authentication and the `ai_agents` module gate. The unified workspace endpoint uses backend-derived tenant, user, role, department, module, and record authorization; client payloads cannot provide authoritative `company_id`, `tenant_id`, `user_id`, `role`, permission sets, or specialist IDs. Routing is deterministic from the user request, current workspace, and backend role capability pack. Unsupported role/capability combinations are rejected before an agent run is created.

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/ai-assistant/chat` | `unified_assistant_chat` | Creates or validates a server-owned `AIConversation`, creates or reuses a tenant/user-scoped Redis Working Memory session, validates current workspace project/task context, builds a sectioned Personal ContextPackage, routes through the existing governed Agent Orchestrator, and returns a normalized response. |
| GET | `/api/v1/ai-assistant/memory` | `list_personal_memory` | Returns the authenticated user's optional personal AI memory state and policy. Disabled memory returns no saved memories. |
| PUT | `/api/v1/ai-assistant/memory/preferences` | `upsert_personal_memory_preference` | Creates or updates a user-owned professional preference memory. Secrets, protected HR/payroll terms, profiling, and employment-decision content are rejected. |
| PUT | `/api/v1/ai-assistant/memory/settings` | `update_personal_memory_settings` | Enables or disables optional personal AI memory for the authenticated user. |
| DELETE | `/api/v1/ai-assistant/memory/{memory_id}` | `delete_personal_memory` | Deletes one user-owned personal AI memory record. Setting records cannot be deleted through this route. |
| DELETE | `/api/v1/ai-assistant/memory` | `clear_personal_memory` | Deletes all user-owned optional personal AI memory records except the enable/disable setting. |

Request body:

```json
{
  "message": "What needs my attention today?",
  "conversation_id": "optional-server-issued-id",
  "session_id": "optional-server-issued-id",
  "idempotency_key": "client-retry-key",
  "workspace": {
    "page": "dashboard",
    "project_id": "optional",
    "task_id": "optional",
    "client_id": "optional",
    "lead_id": "optional",
    "selected_record_type": "optional",
    "selected_record_id": "optional",
    "filters": {}
  },
  "preferences": {
    "response_detail": "optional",
    "language": "optional"
  }
}
```

Response body:

```json
{
  "conversation_id": "...",
  "session_id": "...",
  "message_id": "...",
  "run_id": "...",
  "state": "completed",
  "agent": {"agent_id": "project_agent", "version": "1.0.0", "routing_reason": "project_workspace"},
  "answer": {"summary": "...", "sections": [], "facts": [], "missing_data": [], "warnings": [], "confidence": 0.0},
  "citations": [],
  "proposed_actions": [],
  "memory": {"saved": false, "candidate_ids": []},
  "usage": {"provider": "...", "model": "...", "token_usage": {}, "estimated_cost": 0.0}
}
```

Personal memory preference request:

```json
{
  "memory_id": "optional-existing-id",
  "title": "Response style",
  "content": "Prefer concise summaries with blockers first.",
  "preference_key": "response_style"
}
```

Personal memory is tenant/user-owned through `UserMemory`. Saved preferences are advisory context only: they cannot override current workspace facts, permissions, policies, verified metrics, or action approval rules.

### AI Security & Governance

Admin-only endpoints for AI tool governance visibility. All endpoints require authentication, the `ai_agents` module gate, and Admin or Super Admin role. Records are tenant-scoped and contain no sensitive tool result payloads.

| Method | Path | Handler | Description |
|---|---|---|---|
| GET | `/api/v1/ai-security/summary` | `get_security_summary` | Governance status overview: policy count, event counts (allow/deny/approval), top denied tools and reasons, injection detection counts. |
| GET | `/api/v1/ai-security/events` | `get_security_events` | Recent security events with filtering by decision, agent, and capability. Returns safe metadata only (no raw prompts or tool results). |
| GET | `/api/v1/ai-security/tool-policies` | `get_tool_policies` | Current tool policy registry snapshot: all registered governance policies with capability requirements, risk levels, and agent assignments. |

Query parameters:

| Endpoint | Parameter | Default | Description |
|---|---|---|---|
| `/summary` | `days` | `7` | Lookback window (1–90 days) |
| `/events` | `days` | `7` | Lookback window (1–90 days) |
| `/events` | `decision` | — | Filter by decision: `ALLOW`, `DENY`, `REQUIRE_APPROVAL` |
| `/events` | `agent` | — | Filter by agent ID (e.g. `hr_operations`, `executive_operations`, `fast_fact`) |
| `/events` | `capability` | — | Filter by capability/tool name (case-insensitive partial match) |
| `/events` | `limit` | `50` | Max events to return (1–200) |
| `/tool-policies` | `agent` | — | Filter policies by agent ID |
| `/tool-policies` | `domain` | — | Filter policies by domain (e.g. `hr`, `projects`, `finance`) |

Security principle: Every AI-originated business-data access passes through the governance boundary at execution time. These admin endpoints provide read-only operational visibility into that boundary's decisions.

### 2FA

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/2fa/disable-2fa` | `disable_2fa` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/2fa/enable-2fa` | `enable_2fa` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/2fa/verify-2fa` | `verify_2fa` | Uses router/endpoint dependencies where configured. |

### Activity

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/activity/timeline` | `get_activity_timeline` | Uses router/endpoint dependencies where configured. |

### Authentication

| Method | Path | Handler | Notes |
|---|---|---|---|
| DELETE | `/api/v1/auth/avatar` | `delete_avatar` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/change-password` | `change_password` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/forgot-password` | `forgot_password` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/login` | `login` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/logout` | `logout` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/auth/me` | `get_current_user_info` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/auth/notification-preferences` | `update_notification_preferences` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/refresh` | `refresh_token` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/reset-password` | `reset_password` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/auth/upload-avatar` | `upload_avatar` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/auth/verify-reset-token` | `verify_reset_token` | Uses router/endpoint dependencies where configured. |

### Automation

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/automation/` | `list_automation_rules` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/automation/` | `create_automation_rule` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/automation/{rule_id}` | `delete_automation_rule` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/automation/{rule_id}` | `get_automation_rule` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/automation/{rule_id}` | `update_automation_rule` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/automation/{rule_id}/activate` | `toggle_automation_rule` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/automation/{rule_id}/executions` | `get_automation_executions` | Uses router/endpoint dependencies where configured. |

### Backlog

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/backlog/projects/{project_id}/backlog` | `get_project_backlog` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/backlog/projects/{project_id}/backlog/{task_id}/move-to-sprint` | `move_task_to_sprint` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/backlog/projects/{project_id}/backlog/{task_id}/remove-from-sprint` | `remove_task_from_sprint` | Uses router/endpoint dependencies where configured. |

### Calendar

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/calendar/events` | `get_calendar_events` | Returns date-windowed meetings and tasks. `my_calendar` includes only the current user's hosted/participating meetings and assigned tasks; assigned tasks are scheduled by `due_date` or `created_at` fallback. Task project names resolve from the logical project key such as `PROJ-101` or MongoDB `_id`. |

### Changelog

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/changelog/tasks/{task_id}/changelog` | `get_task_changelog` | Requires authenticated task view access, not company membership alone; hidden task history is not returned across project, assignment, hierarchy, or tenant boundaries. |

### Chat

Chat endpoints require authentication, active user status, same-tenant access, and either `chat`, `task`, or `tasks_projects` module access. User search returns same-company users only and excludes the requester. Group creation validates every participant is in the same company and adds the creator as group admin.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/chat/conversations` | `list_conversations` | Lists conversations where the current user is a participant. |
| POST | `/api/v1/chat/conversations` | `create_or_get_conversation` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/chat/conversations/{conversation_id}/messages` | `get_messages` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/chat/conversations/{conversation_id}/messages` | `send_message` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/chat/groups` | `create_group` | Creates a same-tenant group conversation and makes the creator group admin. |
| GET | `/api/v1/chat/groups/{group_id}` | `get_group_details` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/chat/groups/{group_id}/admins/{user_id}` | `remove_group_admin` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/chat/groups/{group_id}/admins/{user_id}` | `add_group_admin` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/chat/groups/{group_id}/members` | `get_group_members` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/chat/groups/{group_id}/members` | `add_members_to_group` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/chat/groups/{group_id}/members/{user_id}` | `remove_member_from_group` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/chat/messages/{message_id}` | `delete_message` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/chat/messages/{message_id}/read` | `mark_message_read` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/chat/users/search` | `search_users_for_chat` | Searches same-company users by first name, last name, or email for chat/group selection. |

### Clients

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/clients/` | `list_clients` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/clients/` | `create_client` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/clients/overview/dashboard` | `get_client_overview_dashboard` | Returns server-side tenant-scoped Client Overview KPIs, Needs Attention, Client Insights, and daily actions using existing Client, Project, Task, Deliverable, Invoice, Service, Health, Renewal, and Activity data. |
| GET | `/api/v1/clients/insights/summary` | `get_client_insights_summary` | Returns Client-focused insights separate from Sales pipeline reports: new/active/churned, renewals, churn rate/reasons, revenue/MRR, outstanding, risk/critical health, delayed delivery, and top clients by value. |
| POST | `/api/v1/clients/automation/run` | `run_client_automation_actions` | Runs built-in Client automation over existing Task and Notification systems for overdue invoices, renewal reminders, health escalation, approval delays, and inactivity. Uses `AutomationExecution` idempotency keys to avoid duplicate actions. |
| GET | `/api/v1/clients/saved-views` | `get_client_saved_views` | Lists built-in and user-saved Client filter views. Saved views store filters only, not Client records. |
| POST | `/api/v1/clients/saved-views` | `create_client_saved_view` | Creates a user-owned same-tenant Client saved view with filter JSON. |
| PATCH | `/api/v1/clients/saved-views/{view_id}` | `update_client_saved_view` | Updates the current user's same-tenant Client saved view filters. |
| DELETE | `/api/v1/clients/saved-views/{view_id}` | `delete_client_saved_view` | Deletes the current user's same-tenant Client saved view. |
| DELETE | `/api/v1/clients/{client_id}` | `delete_client` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/clients/{client_id}` | `get_client` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/clients/{client_id}/workspace` | `get_client_workspace` | Loads the tenant-scoped Client Workspace for one client. Client payloads retain legacy fields and add canonical `crm_company_id`, `source_lead_id`, `account_owner_id`, and `sales_owner_id`. Projects are resolved from the client's explicit `project_ids` and existing `Project.client_id`; tasks are returned only for those projects, so clients with zero projects return zero tasks. Contacts come from the linked CRM Company through existing `SalesContact` records. Meetings resolve through explicit `client_id`, `project_id`, or `contact_id` plus legacy kickoff/project context and are not account-owner-wide. Lead and timeline context uses the lead's `client_id` or actual CRM Company (`SalesProspect.crm_company_id` to `CRMCompany.id`), never `Client.id` as a CRM company id. The response includes backend-calculated `onboarding`, client-facing `communication`, separate `internal_notes`, aggregated file references from Client documents, Deliverables, same-tenant Sales lead uploads, and CRM document PDF/source links, plus a chronological `activity` summary. |
| GET | `/api/v1/clients/{client_id}/health` | `get_client_health` | Calculates explainable same-tenant Client Health from existing Tasks, Projects, Deliverables, approvals, Meetings, Communication, Invoices, Finance aggregation, and Renewal metadata. Health is stored separately from lifecycle status with score, level, reasons, next action, escalation, and history. |
| GET | `/api/v1/clients/{client_id}/ai/brief` | `get_client_ai_brief` | Returns a grounded Client AI Brief from the same tenant-scoped Client Workspace context. The compact context includes lifecycle, Health, services, projects, pending deliverables, finance aggregates, recent communication, meetings, renewal, and next action. Internal-note bodies, file contents, secrets, and credential-like text are excluded or redacted. |
| POST | `/api/v1/clients/{client_id}/ai/ask` | `ask_client_ai` | Answers authorized user questions about one Client using only compact workspace context and source references. Recommendations are advisory only and do not create Tasks, notifications, approvals, or other actions. |
| GET | `/api/v1/clients/{client_id}/ai/cleanup-audit` | `get_client_ai_cleanup_audit` | Admin/lead-only non-destructive Phase 10 cleanup audit. Reports whether canonical Phase 0-9 Client systems are being used and whether duplicate Client Contact, Project, or file stores are required. |
| POST | `/api/v1/clients/{client_id}/next-action/status` | `update_client_next_action_status` | Completes or reopens the generated Client next action stored under `Client.lifecycle_metadata.client_next_action`; completing it also closes the matching open health escalation metadata. |
| GET | `/api/v1/clients/{client_id}/activity` | `get_client_activity` | Returns a tenant-scoped chronological Client Activity feed using existing Client, CRM Activity, Meta Inbox messages where linked by CRM Contact, Meetings, Projects, Tasks, Deliverables, file references, Services, onboarding/lifecycle metadata, and Invoices. Supports `category=all|communication|meetings|work|files|finance`, `skip`, and `limit`. |
| GET | `/api/v1/clients/{client_id}/finance` | `get_client_finance` | Returns aggregated same-tenant Client Finance from existing Invoices, payments embedded on Invoice records, Client Services, and completed/signed MSAs. No invoice or payment data is copied into the Client. |
| PATCH | `/api/v1/clients/{client_id}/renewal` | `update_client_renewal` | Creates or updates lightweight renewal metadata on the Client, including renewal date, contract end date, owner, status, value, payment terms, billing frequency, notes, and history. |
| POST | `/api/v1/clients/{client_id}/renewal/start` | `start_client_renewal` | Starts renewal discussion metadata and moves the Client to `renewal_due` when action is required. |
| POST | `/api/v1/clients/{client_id}/renewal/renewed` | `renew_client` | Marks the Client renewed, preserves previous renewal history, updates new value/dates where supplied, and returns the Client to `active`. |
| POST | `/api/v1/clients/{client_id}/churn` | `churn_client` | Marks a Client churned without deleting history. Requires churn reason and end date, records revenue lost where provided/calculable, and can safely end active Client Services. |
| POST | `/api/v1/clients/{client_id}/archive` | `archive_client_record` | Archives a churned Client as historical/read-mostly data without deleting Contacts, Services, Projects, Tasks, Deliverables, Communication, Files, Finance, or Activity. |
| PATCH | `/api/v1/clients/{client_id}/profile` | `update_client_profile` | Updates profile-only relationship/commercial notes in `Client.lifecycle_metadata.profile`. Core company, owner, address, industry, start date, type, and value fields continue to use `PUT /clients/{client_id}` and existing Client fields. |
| PATCH | `/api/v1/clients/{client_id}/contacts/{contact_id}/roles` | `update_client_contact_roles` | Assigns Client relationship roles to an existing same-tenant CRM Contact. Roles are stored as lightweight metadata under `Client.lifecycle_metadata.contact_roles`; the Contact identity remains `SalesContact`. Allowed roles are Primary Contact, Decision Maker, Finance Contact, Project Contact, Technical Contact, and Approver. |
| GET | `/api/v1/clients/{client_id}/services` | `list_client_services` | Lists tenant-scoped `ClientService` records for the Client. |
| POST | `/api/v1/clients/{client_id}/services` | `create_client_service` | Creates a Client Service with name/type/status, pricing, billing cycle, dates, owner/team, linked existing Projects, and notes. Projects remain canonical delivery records. |
| PATCH | `/api/v1/clients/{client_id}/services/{service_id}` | `update_client_service` | Edits a Client Service and validates owner/team/project tenant membership. |
| POST | `/api/v1/clients/{client_id}/services/{service_id}/projects` | `link_project_to_client_service` | Links an existing same-tenant Project to a Client Service and sets `Project.client_id` when unassigned. |
| DELETE | `/api/v1/clients/{client_id}/services/{service_id}/projects/{project_id}` | `unlink_project_from_client_service` | Safely unlinks a Project from a Client Service only when no Deliverables depend on that service/project pair. |
| POST | `/api/v1/clients/{client_id}/services/{service_id}/{action}` | `change_client_service_status` | Changes service status with `activate`, `pause`, or `end`; activation sets a missing start date and ending stamps the end date. |
| GET | `/api/v1/clients/{client_id}/deliverables` | `list_client_deliverables` | Lists Client Deliverables scoped to one tenant Client, with optional `service_id`, `project_id`, `status`, and `approval_status` filters. |
| POST | `/api/v1/clients/{client_id}/deliverables` | `create_client_deliverable` | Creates a Deliverable under an existing same-tenant Client Service and Project. Linked tasks are existing Work `Task` ids from that Project. |
| PATCH | `/api/v1/clients/{client_id}/deliverables/{deliverable_id}` | `update_client_deliverable` | Edits Deliverable metadata, owner, due date, linked files, service/project, and linked existing Work tasks with tenant and relationship validation. |
| POST | `/api/v1/clients/{client_id}/deliverables/{deliverable_id}/tasks` | `link_tasks_to_deliverable` | Links multiple existing Work Tasks to the Deliverable. Tasks must belong to the Deliverable Project. |
| POST | `/api/v1/clients/{client_id}/deliverables/{deliverable_id}/status` | `change_deliverable_status` | Moves a Deliverable through `planned`, `in_production`, `internal_review`, `client_review`, `revision_required`, `approved`, and `delivered`. Invalid transitions are rejected. |
| POST | `/api/v1/clients/{client_id}/deliverables/{deliverable_id}/send-review` | `send_deliverable_for_client_review` | Starts Client Review, prefers a Client contact with role `Approver`, stores sent timestamp/history, and issues a secure review token. |
| POST | `/api/v1/clients/{client_id}/deliverables/{deliverable_id}/approve` | `approve_client_deliverable` | Records client approval and moves the Deliverable to approved. |
| POST | `/api/v1/clients/{client_id}/deliverables/{deliverable_id}/request-revision` | `request_deliverable_revision` | Records a revision request, stores revision note/history, increments revision count, and moves the Deliverable to revision required. |
| GET | `/api/v1/clients/public-review/{token}` | `view_public_deliverable_review` | Loads a Deliverable via hashed review token and records viewed state when first opened. |
| POST | `/api/v1/clients/public-review/{token}/approve` | `approve_public_deliverable_review` | Allows the token holder to approve the Deliverable without creating a separate sharing engine. |
| POST | `/api/v1/clients/public-review/{token}/request-revision` | `request_public_deliverable_revision` | Allows the token holder to request revision and records note/count/history. |
| PATCH | `/api/v1/clients/{client_id}/onboarding/data` | `update_client_onboarding_data` | Updates structured onboarding metadata for commercial, requirements, legacy-compatible assets, access, and start readiness. Start readiness confirmations are stamped with the current user and timestamp. Plaintext credentials must not be sent; access rows store status/reference only. |
| GET | `/api/v1/clients/{client_id}/onboarding/assets` | `get_client_onboarding_assets` | Returns same-tenant onboarding asset requirements, many-to-many asset submissions, and required-asset verification progress. |
| POST | `/api/v1/clients/{client_id}/onboarding/assets/submissions` | `create_client_asset_submission` | Adds an internal asset submission from WhatsApp, Email, Manual Upload, Drive, Client Portal, Physical, or Other. Uploaded files reuse existing Client file storage and one submission can map to multiple asset requirements. Received-from contacts must belong to the linked same-tenant CRM Company. |
| POST | `/api/v1/clients/{client_id}/onboarding/assets/requirements/{requirement_id}/files` | `upload_client_asset_requirement_files` | Uploads one or more files directly to one asset requirement. Files are stored through existing Client file storage and mark that requirement `received`. |
| POST | `/api/v1/clients/{client_id}/onboarding/assets/requirements/{requirement_id}/file-links` | `link_client_asset_requirement_file` | Links an existing same-client document to one asset requirement without duplicating the physical file. Other-client or cross-tenant file references are rejected. |
| POST | `/api/v1/clients/{client_id}/onboarding/assets/requirements/{requirement_id}/request-link` | `create_client_asset_request_link` | Generates/regenerates a secure per-asset upload request token, stores only its hash, stores optional `request_note` client-facing detail, marks the asset `requested`, and returns the raw token plus public app `upload_url` once for copy/share. |
| POST | `/api/v1/clients/{client_id}/onboarding/assets/requirements/{requirement_id}/request-link/revoke` | `revoke_client_asset_request_link` | Revokes the active secure upload request token for one asset requirement. |
| GET | `/api/v1/clients/asset-upload/{token}` | `get_asset_upload_request` | Public token endpoint used by `/clients/asset-upload/{token}` that returns only one asset requirement's upload metadata and client-facing request note after hash, expiry, and revoke validation. |
| POST | `/api/v1/clients/asset-upload/{token}` | `upload_asset_request_files` | Public token upload endpoint for one asset requirement. Uploaded files reuse Client file storage and mark only that requirement `received`. |
| PATCH | `/api/v1/clients/{client_id}/onboarding/assets/requirements/{requirement_id}` | `patch_client_asset_requirement` | Updates an asset requirement and moves it through `missing`, `requested`, `received`, `verified`, or `replacement_required`. Verification records actor/timestamp and required assets count as ready only when verified. |
| PATCH | `/api/v1/clients/{client_id}/onboarding/primary-contact` | `set_client_primary_contact` | Marks an existing same-tenant CRM Contact on the linked CRM Company as the Client primary contact and clears the prior primary marker among those contacts. Cross-tenant or unrelated contacts are rejected. |
| POST | `/api/v1/clients/{client_id}/onboarding/document/generate` | `generate_client_onboarding_document` | Generates or regenerates a client-facing onboarding PDF from current verified onboarding data. The document is stored as a client document with `category=onboarding_document`, `snapshot_hash`, and `freshness`; sensitive credentials and internal-only notes are excluded. |
| GET | `/api/v1/clients/lifecycle/rules` | `get_client_lifecycle_rules` | Returns the backend-owned transition type, allowed destinations, prerequisites, permission gate, destination reason requirements, and action label used by the Client stage controls. Legacy `inactive` metadata is included for readable existing records. |

Client list/detail responses expose the Client's own `budget`, `client_type`, and `start_date` when present. For CRM-converted Clients that were created before those fields were copied, responses fall back to the same-tenant source lead's `won_amount`/`budget` and conversion/closed date without overwriting stored Client values. Newly created Clients from Won lead automation start with lifecycle status `new`.

Client lifecycle statuses accepted by create/update/list responses are `new`, `onboarding`, `active`, `at_risk`, `on_hold`, `renewal_due`, `churned`, and `archived`. Legacy stored `inactive` clients remain readable and normalize to `on_hold` for lifecycle transitions. `new -> onboarding -> active` is strictly sequential; after `active`, the backend permits only the valid conditional destinations in its rule catalog. Status updates are validated centrally; invalid transitions return `400` with a clear transition error instead of being silently ignored. Destination changes to operational or terminal states require a lifecycle reason where configured, and activation blockers return structured `CLIENT_TRANSITION_BLOCKED` details with exact missing onboarding item, current status, reason, destination tab, and action label. Manual onboarding item status updates are limited to manual-only document/agreement layers; commercial, contact, requirements, asset, access, project, team, kickoff, and readiness statuses are derived from structured data or linked tenant-scoped records. Client list supports stage pages through `status_filter`, plus `search` and `client_type` query filters.
| PUT | `/api/v1/clients/{client_id}` | `update_client` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/clients/{client_id}/documents` | `upload_client_document` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/clients/{client_id}/documents/{document_index}` | `delete_client_document` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/clients/{client_id}/projects` | `add_project_to_client` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/clients/{client_id}/projects/{project_id}` | `remove_project_from_client` | Uses router/endpoint dependencies where configured. |

### Companies

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/companies/` | `list_companies` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/companies/register` | `register_company` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/companies/{company_id}` | `delete_company` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/companies/{company_id}` | `get_company` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/companies/{company_id}/approve` | `approve_company` | Canonical first-time approval. Validates pending company, prevents duplicate company admin/subscription, creates first Company Admin, assigns selected subscription/plan, provisions modules, sets `approved_by`/`approved_at`, activates company, and attempts existing welcome email. Partial admin/subscription creation is rolled back on provisioning failure. |
| PATCH | `/api/v1/companies/{company_id}/status` | `update_company_status` | Super Admin lifecycle status update. Valid transitions are pending to cancelled, active to suspended, and suspended to active. Invalid transitions return HTTP 409 with `invalid_company_status_transition`. |

### Components

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/components/projects/{project_id}/components` | `list_components` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/components/projects/{project_id}/components` | `create_component` | Uses router/endpoint dependencies where configured. |

### Dashboard

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/dashboard/stats` | `get_dashboard_stats` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/dashboard/super-admin/analytics` | `get_super_admin_analytics` | Uses router/endpoint dependencies where configured. |

### Files

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/files/clients/{filename}` | `get_client_file` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/files/msa/{filename}` | `get_msa_file` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/files/projects/{filename}` | `get_project_file` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/files/upload` | `upload_file` | General-purpose upload used by task/project attachments. Accepts **any file type** (images, videos, PDF, Excel, etc.) up to **200 MB** (`GENERAL_UPLOAD_MAX_SIZE`). Oversized files return `413` with a clear detail stating the actual size and the limit (e.g. `File is too large: 312.0 MB exceeds the maximum allowed size of 200 MB`). Avatar and other security-sensitive uploads keep their stricter type/size whitelists. |
| GET | `/api/v1/files/{filename}` | `get_file` | Uses router/endpoint dependencies where configured. |

### Health

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/debug` | `debug_backend` | Non-production debug endpoint. Now also returns a `release` block (`version`, `commit`, `commit_short`, `branch`, `built_at`, `environment`). Returns `404` in production. |

Root-level probes and observability endpoints (registered on the app, not under `/api/v1`):

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Legacy health check: `{status, version, environment, database}`; `503` when MongoDB is not ready. |
| GET | `/livez` | Liveness probe (no dependencies): `{status: "alive", uptime_seconds}`. |
| GET | `/readyz` | Readiness probe: MongoDB + Redis required, Qdrant optional/degraded. Includes a `release` block with the deployed release identity (`version`, `commit`, `commit_short`, `branch`, `built_at`, `environment`). |
| GET | `/metrics` | Prometheus metrics, including `syntask_build_info{version,commit,branch,environment}` and `syntask_release_deployed_timestamp_seconds`. |

### Invoices

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/invoices/` | `list_invoices` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/invoices/` | `create_invoice` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/invoices/{invoice_id}` | `delete_invoice` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/invoices/{invoice_id}` | `get_invoice` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/invoices/{invoice_id}` | `update_invoice` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/invoices/{invoice_id}/pdf` | `download_invoice_pdf` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/invoices/{invoice_id}/send-email` | `send_invoice_email` | Uses router/endpoint dependencies where configured. |

### Issue Links

| Method | Path | Handler | Notes |
|---|---|---|---|
| DELETE | `/api/v1/issue-links/links/{link_id}` | `delete_issue_link` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/issue-links/tasks/{task_id}/links` | `get_issue_links` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/issue-links/tasks/{task_id}/links` | `create_issue_link` | Uses router/endpoint dependencies where configured. |

### Issue Types

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/issue-types/` | `list_issue_types` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/issue-types/` | `create_issue_type` | Uses router/endpoint dependencies where configured. |

### Ledger

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/ledger/` | `get_ledger` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/ledger/{invoice_id}/payment` | `add_payment` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/ledger/{invoice_id}/tds` | `update_tds` | Uses router/endpoint dependencies where configured. |

### Leave Management

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/leaves/` | `create_leave_request` | Any authenticated company member (Employee/Manager/Lead) submits leave. Admin/Sub Admin/Super Admin do not submit. Reviewers are auto-assigned via the nearest manager, falling back to company admins (Admin + Sub Admin). Requires company membership and no overlapping leave. |
| GET | `/api/v1/leaves/` | `list_leave_requests` | Super Admin sees all company leaves except own; Admin, Sub Admin and Manager see all company leaves except their own (including forwarded leaves); Lead sees all company leaves except own; Employee sees only own leaves. The `employee_id` filter stays within the same visibility: any same-company employee (except self) is a valid filter target for Admin/Sub Admin/Manager/Lead, matching the unfiltered list. Seeing a request is not the same as acting on it: approve/reject actions are limited to the assigned reviewers (see approve/reject rows) — managers review employee/lead requests, and forwarded leaves are decided only by the reviewers the manager selected. Supports `status`, `leave_type`, `employee_id`, `start_date`, `end_date`, `skip`, `limit`. |
| GET | `/api/v1/leaves/availability` | `get_availability` | Returns leave-type balance/availability for the authenticated user. |
| GET | `/api/v1/leaves/calendar` | `get_leave_calendar` | Calendar view with the same role-based visibility as the list endpoint. |
| GET | `/api/v1/leaves/my` | `get_my_leave_requests` | Returns only the authenticated user's own leave requests. |
| GET | `/api/v1/leaves/forward-targets` | `get_leave_forward_targets` | Manager only (403 otherwise). Returns the same-company Admins and Sub Admins that a Manager may forward a leave request to. |
| POST | `/api/v1/leaves/{leave_id}/approve` | `approve_leave_request` | Managers approve employee/lead requests (forwarding a request replaces the manager with the reviewers they selected, who then decide); Admin/Sub Admin approve only leaves assigned to them via `pending_with_user_ids` (manager leaves and forwarded employee leaves, not unforwarded employee leaves). Super Admin is audit-only. Only pending/forwarded requests can be approved. |
| POST | `/api/v1/leaves/{leave_id}/reject` | `reject_leave_request` | Same approval scope as approve (managers on employee/lead requests, forwarded requests only by the reviewers the manager selected); rejection reason is required. |
| POST | `/api/v1/leaves/{leave_id}/forward` | `forward_leave_request` | Manager forwards a pending subordinate leave to one or more Admin/Sub Admin reviewers (`target_user_ids` list + reason). The selected reviewers replace the manager as the pending reviewers (`pending_with_user_ids`); only they receive approve/reject actions on the forwarded leave (everyone else can still view it). Each selected reviewer receives a notification. |
| POST | `/api/v1/leaves/{leave_id}/cancel` | `cancel_leave_request` | Only the requester can cancel their own pending/forwarded leave. |

### MSA

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/msa/` | `list_msas` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/` | `create_msa` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/msa/sign/{token}` | `get_msa_by_token` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/sign/{token}` | `client_sign_msa` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/msa/{msa_id}` | `delete_msa` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/msa/{msa_id}` | `get_msa` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/msa/{msa_id}` | `update_msa` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/msa/{msa_id}/download` | `download_msa` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/{msa_id}/save-as-template` | `save_as_template` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/{msa_id}/send` | `send_msa` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/{msa_id}/send-for-signature` | `send_for_signature` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/{msa_id}/staffing-signature` | `add_staffing_signature` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/msa/{msa_id}/stamp` | `upload_stamp` | Uses router/endpoint dependencies where configured. |

### Meetings

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/meetings/` | `list_meetings` | Authenticated users can list meetings where they are host or participant; supports `status`, `upcoming`, `client_id`, `project_id`, and `contact_id` filters. Relationship filters return explicit tenant-scoped client/project/contact meetings rather than account-owner-wide participation results. `upcoming=true` returns future meetings ordered soonest first and is not hidden behind the `meetings_calendar` module gate. |
| POST | `/api/v1/meetings/` | `create_meeting` | Admin, Manager, Lead, or Super Admin only; duration must be 1-60 minutes; participant IDs must be same-tenant junior users available to the creator role. Optional `client_id`, `project_id`, and `contact_id` form fields link the meeting to same-tenant Client, Project, and CRM Contact records. |
| PATCH | `/api/v1/meetings/{meeting_id}` | `update_meeting` | Host/Admin/Super Admin update or reschedule meeting details, participants, and optional same-tenant `client_id`, `project_id`, or `contact_id` relationships. |
| GET | `/api/v1/meetings/{meeting_id}` | `get_meeting` | Host or invited participant only; host start URL is returned only to host/Admin/Super Admin. |
| POST | `/api/v1/meetings/{meeting_id}/start` | `start_meeting` | Host/Admin/Super Admin marks a scheduled meeting ongoing. |
| POST | `/api/v1/meetings/{meeting_id}/complete` | `complete_meeting` | Host/Admin/Super Admin marks a meeting completed. |
| POST | `/api/v1/meetings/{meeting_id}/cancel` | `cancel_meeting` | Host/Admin/Super Admin marks a meeting cancelled and attempts Zoom deletion when configured. |
| DELETE | `/api/v1/meetings/{meeting_id}` | `delete_meeting` | Host/Admin/Super Admin deletes a meeting and publishes `MeetingDeleted`. |

### Notifications

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/notifications/` | `list_notifications` | Lists only the authenticated user's notifications. Reminder notifications include `priority`, `scheduled_for`, and reminder metadata. |
| GET | `/api/v1/notifications/reminder-toasts` | `list_pending_reminder_toasts` | Runs a duplicate-safe reminder catch-up, then returns today's due-tomorrow/due-today reminder notifications for the authenticated user's global in-app popup. Read or previously auto-acknowledged reminders can still be returned so users do not miss current due alerts. |
| POST | `/api/v1/notifications/reminder-toasts/ack` | `acknowledge_reminder_toasts` | Marks the authenticated user's reminder toast notifications as shown when the user clicks or cancels the popup. |
| POST | `/api/v1/notifications/mark-all-read` | `mark_all_notifications_as_read` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/notifications/{notification_id}` | `delete_notification` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/notifications/{notification_id}/read` | `mark_notification_as_read` | Uses router/endpoint dependencies where configured. |

### Scheduled Jobs

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/scheduled-jobs/` | `list_scheduled_jobs` | Company-scoped list with status/search/schedule_type/enabled pagination. Admin, Sub Admin, Manager, Lead, and Super Admin can view jobs; jobs expose schedule type, enabled state, recurrence, timezone, next/last run, occurrence count, payload summaries, and creator names. |
| POST | `/api/v1/scheduled-jobs/` | `create_scheduled_job` | Schedules `CREATE_PROJECT` or `CREATE_TASK` as `one_time` or `recurring`. Project scheduling is limited to Admin, Sub Admin, Manager, and Super Admin; task scheduling also allows Sub Admin, Manager, Lead, and project-scoped Leads for their own project. `run_at` must be a future datetime and is stored as UTC. Recurring jobs require a recurrence object and timezone. |
| PATCH | `/api/v1/scheduled-jobs/{job_id}` | `update_scheduled_job` | Edits future pending jobs. One-time jobs can update `run_at`; recurring jobs can update payload, notes, recurrence, timezone, and future `run_at` while preserving occurrence history. Past datetimes are rejected. |
| POST | `/api/v1/scheduled-jobs/{job_id}/cancel` | `cancel_scheduled_job` | Cancels pending or failed jobs and notifies the creator. |
| POST | `/api/v1/scheduled-jobs/{job_id}/retry` | `retry_failed_job` | Moves failed or cancelled jobs back to pending and clears the stored error/retry count. |
| GET | `/api/v1/scheduled-jobs/{job_id}/occurrences` | `list_scheduled_job_occurrences` | Returns same-tenant execution history for a scheduled job. Each occurrence has scheduled time, status, result reference, error, and timestamps. |
| POST | `/api/v1/scheduled-jobs/{job_id}/pause` | `pause_scheduled_job` | Disables a recurring pending/failed job without deleting schedule or occurrence history. |
| POST | `/api/v1/scheduled-jobs/{job_id}/resume` | `resume_scheduled_job` | Enables a recurring job and advances missed `run_at` values to the next future occurrence; no catch-up tasks are created for paused time. |
| DELETE | `/api/v1/scheduled-jobs/{job_id}` | `delete_scheduled_job` | Deletes completed, failed, or cancelled jobs only. |

### Payroll & Payslips

Phase 6 payroll endpoints manage monthly periods and employee records; Phase 7 payslip endpoints generate, preview, download, and version PDF payslips. **A payslip is a presentation artifact of an already PROCESSED payroll record — generation never recalculates payroll.** It reads the record's stored snapshots (employee, salary, attendance, earnings, deductions, gross/net) only.

Permission model (backend authoritative):

- `payroll.view` — view periods/records, preview and download payslips (company admins pass through).
- `payroll.manage` — create/calculate periods, generate and regenerate payslips.
- `payroll.approve` — approve/process periods.
- Employee self-ownership — a user may preview/download **only their own** payslips; employee A can never access employee B's payslip. Managers without payroll permission are denied (reporting relationship ≠ salary access).
- Company isolation — every operation is scoped to the actor's company; cross-company payslip IDs return `404`.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/payroll/periods` | `list_periods` | Lists company payroll periods (`status` filter optional). Requires `payroll.view`. |
| POST | `/api/v1/payroll/periods` | `create_period` | Creates a DRAFT payroll period (`year`, `month`). Requires `payroll.manage`. |
| GET | `/api/v1/payroll/periods/{period_id}` | `get_period` | Payroll period detail with lifecycle metadata. Requires `payroll.view`. |
| POST | `/api/v1/payroll/periods/{period_id}/calculate` | `calculate_period` | Runs the Phase 6 calculation (DRAFT→CALCULATED). Requires `payroll.manage`. |
| POST | `/api/v1/payroll/periods/{period_id}/review` | `review_period` | Moves CALCULATED → REVIEW. Requires `payroll.manage`. |
| POST | `/api/v1/payroll/periods/{period_id}/approve` | `approve_period` | Moves REVIEW → APPROVED (rejects when blocked records exist). Requires `payroll.approve`. |
| POST | `/api/v1/payroll/periods/{period_id}/process` | `process_period` | Moves APPROVED → PROCESSED (terminal; finalizes records) and **auto-generates missing payslips** for eligible records (idempotent — records with an existing payslip or in BLOCKED state are skipped; per-record failures never roll back the transition). Requires `payroll.approve`. |
| GET | `/api/v1/payroll/periods/{period_id}/records` | `list_records` | Employee payroll records for a period; each item includes `payslip` state and `can_generate`/`can_preview`/`can_download`/`can_regenerate` flags. Requires `payroll.view`. |
| GET | `/api/v1/payroll/records/{record_id}` | `get_payroll_record` | One employee payroll record with full snapshot + payslip state. Requires `payroll.view`. |
| POST | `/api/v1/payroll/records/{record_id}/payslip` | `create_record_payslip` | Generates the payslip for one record. Only allowed after the period is PROCESSED; idempotent (returns the existing payslip on repeat). Requires `payroll.manage`. |
| POST | `/api/v1/payroll/periods/{period_id}/payslips/generate` | `generate_period_payslips` | Bulk-generates payslips for all eligible records of a processed period. Idempotent: existing payslips are skipped unless `regenerate=true`. Returns `{ generated, already_existing, failed, skipped }` — one failing record never rolls back the rest. Requires `payroll.manage`. |
| GET | `/api/v1/payroll/records/{record_id}/payslips` | `get_record_payslips` | Payslip version history for one record (newest first). Requires `payroll.view`. |
| GET | `/api/v1/payroll/payslips/{payslip_id}` | `get_payslip_metadata` | Payslip metadata (version, file name, generated at/by, `can_*` flags). `payroll.view` OR the payslip's own employee. |
| GET | `/api/v1/payroll/payslips/{payslip_id}/preview` | `preview_payslip` | Inline PDF preview (authorized; local file stream or short-lived Cloudinary signed URL — never a raw public URL). `payroll.view` OR the payslip's own employee. |
| GET | `/api/v1/payroll/payslips/{payslip_id}/download` | `download_payslip` | Secure PDF download with attachment disposition. `payroll.view` OR the payslip's own employee. |
| POST | `/api/v1/payroll/payslips/{payslip_id}/regenerate` | `regenerate_payslip` | Creates the next payslip version (V2, V3, …) from the SAME processed snapshot; the previous version and file are preserved. Never alters payroll values. Requires `payroll.manage`. |
| GET | `/api/v1/payroll/me/payslips` | `my_payslips` | The caller's own payslips only (latest version per record) — Phase 8 self-service readiness. Any authenticated user. |

### Employee Self-Service (ESS)

Phase 8 surfaces the employee's **own** data from the existing modules through a `My HR` workspace (`/hr/me` in the frontend). ESS is secure employee access to existing HR modules — it never duplicates Employee / Attendance / Leave / Documents / Payroll logic. All self endpoints resolve the identity from the authenticated user; **no `employee_id` is accepted from the request** (manual-ID attacks are structurally impossible on self routes).

Identity & permission model:

- **Identity resolution** — the authenticated `User` is matched to their company-scoped `EmployeeProfile` (`company_id + user_id`). Availability depends on the Employee Profile existing, **not** on role string — MANAGER / LEAD / HR / ADMIN users who are also employees get My HR alongside their admin surfaces.
- **No profile** — platform super-admins / non-employee accounts receive `404` (`Employee profile is not available for this account.`) instead of a crash; the frontend shows a graceful state.
- **Self vs management** — self-access never requires the module management permission: viewing own attendance needs no `attendance.manage`, viewing own payslips needs no company `payroll.view`. Self-service never grants company-wide payroll/HR access.
- **Profile self-edit whitelist** — `PATCH /api/v1/employees/me` accepts `first_name`, `last_name`, `personal_email`, `personal_phone`, `address`, and `emergency_contact`. HR-controlled fields (department, designation, manager, employee number, employment type/status, joining date, work mode/location, salary-affecting fields, …) are **explicitly rejected with `400`**, never silently ignored. Address/emergency contact merge over stored values (partial updates never erase sibling fields). Self-changes are audited through the existing profile event bus.
- **Ownership** — documents: only own + `EMPLOYEE_VISIBLE` + ACTIVE (Phase 2 service; HR-only/confidential records omitted entirely, even filenames). Payslips: `payroll.view` OR the payslip's own employee (Phase 7 service). Salary: own user only. Cross-employee access is denied backend-side.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/employees/me` | `my_employee_profile` | The current user's own Employee Profile detail DTO (Phase 1); legacy company `ADMIN`/`SUB_ADMIN` accounts are provisioned a minimal profile shell first. |
| PATCH | `/api/v1/employees/me` | `update_my_employee_profile` | Self-edit of the whitelisted personal fields only (see above); HR-controlled fields rejected with `400`. |
| GET | `/api/v1/employees/{employee_id}` | `get_employee_endpoint` | Normalized detail DTO for one employee. Requires employee-directory access (same rule as the list endpoint): company admins, managers, and HR-department staff holding `employee_management.view` may open any employee's profile; other roles may only open their own (`403` otherwise). Company-scoped — cross-company ids return `404`. This is how managers/HR open an employee's Documents tab to see pending submissions. |
| GET | `/api/v1/attendance/me/today` | `get_my_today_attendance` | Today's attendance for the caller (Phase 4). |
| GET | `/api/v1/attendance/me/today-enhanced` | `get_my_today_enhanced` | Today's attendance with policy-aware HR status, expected hours, late flags (Phase 4). |
| GET | `/api/v1/attendance/me/history` | `get_my_attendance_history` | The caller's own attendance history — **strictly self-scoped for every role** (managers/admins never receive team/company rows here), one row per date (Phase 4). |
| GET | `/api/v1/attendance/corrections/me` | `get_my_corrections` | The caller's attendance correction requests (Phase 4). |
| GET | `/api/v1/leaves/balances/me` | `get_my_leave_balances` | The caller's leave balances across active leave types, backend-computed (Phase 3). |
| GET | `/api/v1/leaves/my` | `get_my_leave_requests` | The caller's leave requests (Phase 3). |
| GET | `/api/v1/hr/employees/{employee_id}/documents` | `list_employee_documents_endpoint` | The caller's own documents when called with their own Employee Profile id and no HR directory permission: server-side restricted to own + `EMPLOYEE_VISIBLE` + ACTIVE (Phase 2 service; HR-only/confidential omitted; other employee ids return `403`). |
| GET | `/api/v1/salary/me` | `get_my_salary` | The caller's own current + upcoming Salary Structure (Phase 5 data, ownership by construction — keyed by user). |
| GET | `/api/v1/payroll/me/payslips` | `my_payslips` | The caller's own generated payslips (Phase 7; see Payroll & Payslips above). |
| GET | `/api/v1/hr/me/summary` | `my_hr_summary` | Lightweight My HR overview aggregate (profile essentials, today's attendance, leave balance summary + pending count, employee-visible document alerts incl. `pending_review`/`rejected` counts, latest payslip, ESS capability flags incl. `can_upload_document: true`). Summaries only — module pages use their own APIs for full histories. `404` when the caller has no Employee Profile. |

### Employee Detail Change Requests

Non-admin employees (Manager, Lead, Employee) cannot directly edit HR-controlled fields on their profile. Instead they submit **change requests** that go through an approval queue. Admin and SubAdmin roles can bypass this and edit directly via the existing PATCH endpoints.

**Permission model:**
- **Create / list own / cancel** — any authenticated user with an Employee Profile (self only).
- **Review queue / approve / reject** — Admin, SubAdmin, Manager, and Lead roles only (`_can_review` gate).
- **Self-approval blocked** — a user cannot approve their own change request.
- **Atomic approval** — approval uses `find_one` with `status: pending` as the filter (compare-and-swap) to prevent double-approval races.
- **Stale-data detection** — on approval, `original_values` are compared against current snapshot; mismatches auto-reject with `409 Conflict`.
- **Protected fields** — `employment_status`, `exit_info`, `role`, `status`, `company_id` cannot be changed via this workflow.

**Lifecycle:** `pending` → `approved` (applies changes atomically via the canonical mutation service) / `rejected` (with reason) / `cancelled` (requester only).

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/employees/me/change-requests` | `create_my_change_request` | Submit a change request for the caller's own profile. Body: `{ "changes": { ... }, "reason": "..." }`. Rejects if a pending request already exists (`409`). Rejects protected/unknown fields (`400`). Any authenticated user with a profile. |
| GET | `/api/v1/employees/me/change-requests` | `list_my_change_requests` | The caller's own change requests. Query params: `status`, `page`, `page_size`. Any authenticated user with a profile. |
| POST | `/api/v1/employees/me/change-requests/{request_id}/cancel` | `cancel_change_request_endpoint` | Cancel a pending request. Only the requester can cancel (`403`). Returns `400` if not pending. |
| GET | `/api/v1/employees/change-requests` | `list_change_requests_for_review` | Review queue. Admin/SubAdmin/Manager/Lead see company-wide requests; Employees get `403`. Query params: `status`, `page`, `page_size`. |
| GET | `/api/v1/employees/change-requests/{request_id}` | `get_change_request` | Full detail of a single change request. Requesters see their own; reviewers see company-wide. |
| POST | `/api/v1/employees/change-requests/{request_id}/approve` | `approve_change_request_endpoint` | Approve a pending request. Atomic claim prevents double-approval. Stale-data check auto-rejects if fields changed (`409`). Self-approval blocked (`403`). Body: `{ "comment": "..." }`. |
| POST | `/api/v1/employees/change-requests/{request_id}/reject` | `reject_change_request_endpoint` | Reject a pending request with a reason. Self-rejection of own request blocked (`403`). Body: `{ "reason": "...", "comment": "..." }`. |

### HR Documents (Phase 2) & Employee Submissions

The HR document system stores metadata over the existing file service; every row is company-scoped and owned by exactly one employee or candidate. Review state is **separate from the stored `active`/`archived` lifecycle**:

- `review_status`: `pending` | `approved` | `rejected` — only `approved` satisfies a required document type.
- `submission_source`: `hr` (uploaded by HR, always approved) | `employee` (self-service submission awaiting review).
- `reviewed_by` / `reviewed_at` / `review_note` — who reviewed, when, and the rejection reason surfaced to the employee.
- Each `HRDocumentVersion` keeps its own copy of the review outcome, so a resubmission history like V1 rejected → V2 pending → V2 approved is preserved forever (resubmission never duplicates the document record).
- Legacy documents (pre-review-flow) read back as `approved`/`hr`; the `scripts/migrate_hr_document_review_flow.py` migration backfills them.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/document-types` | `list_document_types_endpoint` | Company document types (idempotently seeded). Requires HR document view. Types now carry `employee_upload_allowed`. |
| POST | `/api/v1/hr/document-types` | `create_document_type_endpoint` | Create a document type incl. `employee_upload_allowed`. Requires HR document manage. |
| PATCH | `/api/v1/hr/document-types/{id}` | `update_document_type_endpoint` | Update a document type incl. `employee_upload_allowed`. Requires HR document manage. |
| GET | `/api/v1/hr/documents` | `list_all_documents_endpoint` | Company-wide HR document list; filters incl. `review_status` (`pending`/`approved`/`rejected`). Requires HR document view. |
| GET | `/api/v1/hr/employees/{employee_id}/documents` | `list_employee_documents_endpoint` | HR directory view of one employee's documents (HR-only docs included for HR). Without HR directory permission the caller is restricted to their own + `EMPLOYEE_VISIBLE` + ACTIVE records (`403` for any other employee id). |
| POST | `/api/v1/hr/employees/{employee_id}/documents` | `upload_employee_document_endpoint` | HR upload (manage required). Stored as `submission_source=hr`, `review_status=approved` — existing behavior unchanged. |
| POST | `/api/v1/hr/candidates/{candidate_id}/documents` | `upload_candidate_document_endpoint` | HR candidate upload — always approved, no review flow for candidates. |
| GET | `/api/v1/hr/employees/{employee_id}/documents/missing-required` | `missing_required_endpoint` | Required types without an approved document; items carry `status` `missing`/`rejected`. Pending submissions are excluded (not missing — awaiting review). Requires HR directory view. |
| GET | `/api/v1/hr/documents/{document_id}` | `get_document_endpoint` | Document detail incl. review fields + `can_review`/`can_resubmit` capability flags. |
| POST | `/api/v1/hr/documents/{document_id}/replace` | `replace_document_endpoint` | HR file replacement — new version keeps the current review state. Manage required. |
| POST | `/api/v1/hr/documents/{document_id}/review` | `review_document_endpoint` | HR approves (`action=approve`) or rejects (`action=reject` + required `note`) a **pending employee submission** only. Rejection reason is stored on the document and current version and shown to the employee. Manage required — normal employees (including the owner) can never approve/reject. |
| GET | `/api/v1/hr/documents/{document_id}/versions` | `list_document_versions_endpoint` | Version history with each version's review outcome (`review_status`, `review_note`, reviewer). |
| GET | `/api/v1/hr/documents/{document_id}/preview` `/download`, `/versions/{version_id}/download` | — | Authorized file access with backend-controlled delivery (re-authorizes company + ownership + visibility on every call). The stored bytes are streamed back through SynTask — local files via `FileResponse`, Cloudinary files are fetched server-side and streamed with correct `Content-Type` and `Content-Disposition` (`inline` for preview, `attachment; filename=…` for download). The browser never follows a cross-origin redirect to Cloudinary, and signed Cloudinary URLs/credentials are never exposed. Missing storage returns a controlled `404` with a clear detail message. |

**Employee self-service endpoints (My HR → My Documents)** — identity is resolved from the authenticated user; **no `employee_id` is accepted**, so an employee can only ever touch their own documents and can never act as HR:

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/me/documents` | `list_my_documents_endpoint` | The authenticated employee's own ACTIVE + `EMPLOYEE_VISIBLE` documents at any review state (a new submission is visible immediately). No HR permission required. |
| GET | `/api/v1/hr/me/documents/status` | `my_document_status_endpoint` | Per-type overview: `required` rows (Missing / Pending Review / Approved / Rejected with rejection note) and `uploadable` rows (only types with `employee_upload_allowed`, employee scope + employee-visible), each with `can_upload` and, when a stored employee-visible document exists, `can_preview`/`can_download` (never for `hr_only` documents). |
| POST | `/api/v1/hr/me/documents` | `submit_employee_document_endpoint` | Submit a new document (creates V1 `pending`) or resubmit a rejected one (creates the next version on the **same** document, `pending`). Document type must be active + `employee_upload_allowed` + employee-visible; `visibility`/review fields are never client-supplied. A type already pending/approved returns `409`. `expiry_date` is an optional field the employee uses to declare the expiry of the particular document being submitted — it is accepted for any employee-visible type (not gated by the type's `expiry_supported` flag), and resubmitting refreshes the stored expiry (an empty value clears it). |

**Document Request Lifecycle** — HR requests specific documents from employees. Each request links to an employee and document type (or free-form name); the employee uploads against the request, advancing its status through the lifecycle:

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/document-requests` | `list_document_requests_endpoint` | List all document requests for the company. HR sees all; employees see only their own. Filters: `employee_id`, `status`, `page`, `page_size`. Requires HR document view (for HR) or is employee self-service. |
| POST | `/api/v1/hr/document-requests` | `create_document_request_endpoint` | HR creates a request for an employee to provide a document. Fields: `employee_id` (required), `document_type_id` (optional), `document_type_name` (required), `requirement_level` (`mandatory`/`optional`), `priority` (`low`/`normal`/`high`/`urgent`), `instructions` (optional), `due_date` (optional). Duplicate prevention: same employee + same type + active request returns `409`. Notifies the employee. Requires HR document manage. |
| GET | `/api/v1/hr/document-requests/{request_id}` | `get_document_request_endpoint` | Single request detail. HR sees any; employee only their own (`403` otherwise). |
| POST | `/api/v1/hr/document-requests/{request_id}/cancel` | `cancel_document_request_endpoint` | HR cancels a pending or submitted request. Returns `400` for approved/rejected/cancelled requests. Notifies the employee. Requires HR document manage. |
| PATCH | `/api/v1/hr/document-requests/{request_id}` | `cancel_document_request_endpoint` | Alias for cancel (PATCH method). |
| GET | `/api/v1/hr/me/document-requests` | `list_my_document_requests_endpoint` | Employee self-service list of their own document requests at any status. No HR permission required. |
| POST | `/api/v1/hr/me/document-requests/{request_id}/upload` | `upload_for_document_request_endpoint` | Employee uploads a document against a specific request. The request must be `pending` or `rejected`. Creates (or resubmits to) an `HRDocument` and links it via `fulfilled_document_id`. Request status advances to `submitted`. Notifies the requesting HR person. |

**Request lifecycle statuses:** `pending` → `submitted` (employee uploaded) → `approved` (HR approved linked document) / `rejected` (HR rejected) / `cancelled` (HR cancelled). Rejection returns to a state where the employee can re-upload.

### eTimeOffice Biometric Attendance Integration (Attendance module)

The Attendance module can sync biometric attendance from the company's
**eTimeOffice** portal into the normal per-employee-per-day Attendance records
so HR sees device punches inside the existing attendance experience with
`source: "etimeoffice"`. The provider runs **server-side only** — React never
talks to eTimeOffice and never receives provider credentials, cookies, CSRF
tokens, or session ids.

- Provider authentication is HTTP Basic against `https://api.etimeoffice.com/api`
  with the compound username `<CorporateID>:<Username>:<Password>:true` (the
  Basic password field is empty) — confirmed against the live service.
- Read-only: the provider only downloads punches (`DownloadInOutPunchData`);
  it never writes to eTimeOffice.
- **Explicit mapping only.** An eTimeOffice `Empcode` resolves to a SynTask
  employee exclusively through the company-scoped `etimeoffice_employee_mappings`
  table — HR confirms each mapping in the Attendance UI (see `/mappings`
  endpoints below). There is **no inference** from `EmployeeProfile.employee_number`
  numeric suffixes and no name-based runtime assignment; the earlier suffix
  matching was removed because it attached punches to the wrong employees.
  The provider directory (`Empcode` + `Name`) is persisted as external
  identity metadata on every fetch and is used only to *suggest* a likely
  SynTask employee in the mapping UI (a suggestion is never an assignment,
  and placeholder names such as `Empname0005` are never suggested). Unmapped
  external employees are counted and reported; they never fail a sync and no
  Attendance is created for them.
- Sync is idempotent: re-running the same window updates changed days and
  skips identical ones (`duplicates_skipped`). It never overwrites attendance
  created by the SynTask app check-in and never deletes attendance.
- Biometric Attendance rows store the source code (`source: "etimeoffice"` +
  `external_employee_code`) so HR reports can display the actual eTimeOffice
  code next to the employee. Reassignment of historical rows is a deliberate,
  audited operation (see `scripts/reconcile_etimeoffice_mappings.py`).
- Biometric rows are first-class attendance: they drive the employee's
  Today/Recent Attendance, navbar status, activity feed, and HR reports exactly
  like manual rows, and carry `source: "etimeoffice"` for the UI's
  `Biometric` badge.
- Manual flows never mutate biometric rows. A day written by the biometric
  sync hides the Check In / Break / Check Out actions in the employee UI, and
  the server returns `409` on `POST /attendance/check-in`, `check-out`, and
  `/break/start|end` when today's row is biometric — corrections remain the
  sanctioned change path.
- Wall-clock times from the device are interpreted in `ETIMEOFFICE_TIMEZONE`
  and stored as naive UTC like all other Attendance instants; late/early flags
  are recomputed through SynTask attendance policy rules (not vendor values).

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/attendance/integrations/etimeoffice/sync` | `etimeoffice_sync` | Manual sync for the caller's company. Optional `from_date`/`to_date` (`YYYY-MM-DD`, window ≤ 62 days, default: last 7 days). Company admin / sub-admin only. Returns only safe metadata: `success`, `employees_received`, `mapped`, `unmapped`, `attendance_updated`, `duplicates_skipped`, `skipped_app_attendance`, `errors`, `last_sync` — never credentials. `409` while another sync runs; `502` with "eTimeOffice synchronization failed. Existing attendance data remains available." on provider failure. |
| GET | `/api/v1/attendance/integrations/etimeoffice/status` | `etimeoffice_status` | Company-scoped integration status for the Attendance UI: `enabled`, `configured`, `connected`, `syncing`, `last_attempted_at`, `last_successful_at`, `last_error`, `last_summary`, cadence settings. Safe metadata only. Any authenticated company user. |
| GET | `/api/v1/attendance/integrations/etimeoffice/mappings?refresh=` | `etimeoffice_mappings` | List the company's eTimeOffice directory with mapping status: `rows` (code, provider name, mapped SynTask employee, `status` mapped/unmapped, `suggestion`), plus `employees` (selectable company employees) and counts. `refresh=true` first downloads the current directory from the provider (read-only). Company admin / sub-admin / manager only. Provider outage → `502` with the safe sync message. |
| PUT | `/api/v1/attendance/integrations/etimeoffice/mappings/{code}` | `etimeoffice_upsert_mapping` | Confirm/change which SynTask employee (`employee_id`) owns an eTimeOffice code; `employee_id: null` removes the mapping (code stays listed unmapped). Tenancy + active-role validated; a SynTask employee already mapped to another code → `400`. Company admin / sub-admin / manager only. |
| DELETE | `/api/v1/attendance/integrations/etimeoffice/mappings/{code}` | `etimeoffice_remove_mapping` | Remove the mapping for a code (row remains listed). Company admin / sub-admin / manager only. |

**Mapping access:** Company Admins, Sub Admins, Super Admins, and Managers may
list, create, change, or remove mappings for their own `company_id`. Managers
cannot run an eTimeOffice sync. Leads and Employees are denied mapping access;
the mapping service validates that every selected employee belongs to the same
company, including when a caller supplies an employee id from another tenant.

A leader-gated background loop (default every 3 minutes) re-runs the same sync
when `ETIMEOFFICE_ENABLED=true`; overlapping sync jobs are prevented both by
the Redis leader lease and a per-company in-flight guard. A failed external
connection never breaks SynTask — existing attendance remains available and
the run can simply be retried.

### HR Dashboard & Reports

Phase 10 provides an operational HR Dashboard and categorized reporting workspace. **Dashboard / Reports = read existing domain truth** — they never recalculate HR business logic independently. All metrics are computed backend-side from existing Employee, Attendance, Leave, Document, Recruitment, Lifecycle, and Payroll services.

Permission model:

- Dashboard is available to all company users (HR, managers, admins, employees) — sections are permission-aware.
- Payroll summary on the dashboard is visible only to users with `payroll.view` or company admin role.
- Payroll report endpoints require `payroll.view` capability.
- Recruitment summary is visible to admins/managers.
- All report queries are company-scoped. Cross-company data access is impossible.
- Platform super-admins without a company see `403` on the dashboard.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/dashboard` | `get_hr_dashboard` | Aggregated HR dashboard: employee summary, attendance today, leave summary, document summary, lifecycle summary, recruitment summary (if authorized), payroll summary (if authorized), attention items (incl. `document_review_pending` — employee uploads awaiting HR review, routed to `/hr/documents`). |
| GET | `/api/v1/hr/reports/employees/directory` | `employee_directory_report` | Paginated employee directory with department/status/type filters. |
| GET | `/api/v1/hr/reports/employees/headcount` | `headcount_report` | Headcount aggregated by department with overall summary. |
| GET | `/api/v1/hr/reports/employees/joining-exit` | `joining_exit_report` | Joining/exit trend data for chart visualization (configurable months). |
| GET | `/api/v1/hr/reports/attendance/summary` | `attendance_summary_report` | Per-employee attendance summary for a date range (present, leave, absent, late, overtime). |
| GET | `/api/v1/hr/reports/attendance/late` | `late_arrival_report` | Late arrival report with expected vs actual check-in. |
| GET | `/api/v1/hr/reports/attendance/absence` | `absence_report` | Absence report (excludes holidays, week-offs, and approved leaves). |
| GET | `/api/v1/hr/reports/leave/balances` | `leave_balance_report` | Leave balances per employee per leave type. |
| GET | `/api/v1/hr/reports/leave/usage` | `leave_usage_report` | Leave usage by type (approved, pending, rejected units). |
| GET | `/api/v1/hr/reports/documents/expiry` | `document_expiry_report` | Document expiry report with status (expired, expiring soon, valid). |
| GET | `/api/v1/hr/reports/lifecycle/events` | `lifecycle_events_report` | Lifecycle events with before/after state summaries. |
| GET | `/api/v1/hr/reports/lifecycle/probation` | `probation_report` | Employees on probation with confirmation due dates. |
| GET | `/api/v1/hr/reports/lifecycle/notice` | `notice_period_report` | Employees in notice period with exit details. |
| GET | `/api/v1/hr/reports/payroll/summary` | `payroll_summary_report` | Payroll history by period. **Requires `payroll.view`.** |
| GET | `/api/v1/hr/reports/payroll/employees` | `employee_payroll_report` | Per-employee payroll records. **Requires `payroll.view`.** |
| GET | `/api/v1/hr/reports/employees/directory/export` | `export_employee_directory` | CSV export of employee directory. |
| GET | `/api/v1/hr/reports/attendance/summary/export` | `export_attendance_summary` | CSV export of attendance summary. |
| GET | `/api/v1/hr/reports/leave/balances/export` | `export_leave_balances` | CSV export of leave balances. |
| GET | `/api/v1/hr/reports/payroll/summary/export` | `export_payroll_summary` | CSV export of payroll summary. **Requires `payroll.view`.** |
| GET | `/api/v1/hr/reports/documents/expiry/export` | `export_document_expiry` | CSV export of document expiry report. |

### Work Requests

Work Request endpoints require the Tasks module gate and same-company access. They coordinate operational work requests and approvals without replacing Support Tickets.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/work-requests/` | `list_work_requests` | Company-scoped list with status, type, project, client, requester, priority, search, `mine`, and `needs_my_review` filters. |
| POST | `/api/v1/work-requests/` | `create_work_request` | Creates a request for new work, change, approval, deadline extension, resource, blocker, leave/availability, client request, or other. Context fields are validated against same-tenant project/task/client records. |
| GET | `/api/v1/work-requests/{request_id}` | `get_work_request` | Loads by logical request id or Mongo `_id`, then applies request visibility rules. |
| POST | `/api/v1/work-requests/{request_id}/start-review` | `start_review` | Reviewer/manager action that moves `submitted` to `under_review`. |
| POST | `/api/v1/work-requests/{request_id}/approve` | `approve_work_request` | Reviewer/manager action that approves with optional reason/result metadata. Deadline-extension approval invokes the existing Task Extension workflow exactly once; rejection leaves the task deadline unchanged. |
| POST | `/api/v1/work-requests/{request_id}/reject` | `reject_work_request` | Reviewer/manager action that rejects with required reason. |
| POST | `/api/v1/work-requests/{request_id}/cancel` | `cancel_work_request` | Requester or authorized reviewer/manager action for open requests. |
| POST | `/api/v1/work-requests/{request_id}/convert` | `convert_work_request` | Converts an approved or under-review request into a Task or Project through an atomic conversion claim, preserves source linkage, and makes repeated/concurrent conversion return or link the existing converted record. |

### Projects

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/projects/` | `list_projects` | Company-scoped. Admin/Super Admin and Manager list company projects; Employee list includes projects where they are the project leader, project member, or have assigned tasks. Pending scheduled `CREATE_PROJECT` jobs are also returned as `scheduled` placeholders only to the scheduling creator, with `is_scheduled_placeholder=true`, `scheduled_job_id`, and `scheduled_run_at`; they are not visible to other tenant users before publish. |
| POST | `/api/v1/projects/` | `create_project` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/for-task-creation` | `get_projects_for_task_creation` | Returns non-archived projects where the authenticated user has `create_task`. Employees assigned as that project's `lead_id` are treated as project-scoped Lead only for that project. |
| GET | `/api/v1/projects/{project_id}/completion-readiness` | `get_completion_readiness` | Returns server-derived readiness, blocking reasons, required/completed task counts, incomplete tasks, pending review tasks, dependency blockers, active timers, and open blocker Work Requests. |
| POST | `/api/v1/projects/{project_id}/complete` | `complete_project` | Completes only when centralized readiness passes; records `completed_at` and `completed_by`. Direct status updates use the same readiness gate. |
| POST | `/api/v1/projects/{project_id}/archive` | `archive_completed_project` | Archives reporting projects without deleting tasks, files, time logs, requests, scheduled work, or history. |
| POST | `/api/v1/projects/{project_id}/reopen` | `reopen_project` | Reopens a completed project to review and requires a reason plus manage permission. |
| DELETE | `/api/v1/projects/{project_id}` | `delete_project` | Deletes the project and cascade-deletes all of its tasks and dependent records (task comments, watchers, time logs, epics, sprints, pages, notifications, scheduled jobs that would recreate it, etc.) in a transaction when supported, falling back to an ordered idempotent cascade. Accepts the logical `project_id` or Mongo `_id`. Requires an org management role (Super Admin/Admin/Sub Admin/Manager) with `manage_project`; 404 when the project does not exist in the caller's organization, 403 without permission. Tasks no longer block deletion. |
| GET | `/api/v1/projects/{project_id}` | `get_project` | Loads the real project by logical ID or MongoDB ID, enforces project-scoped access, and returns `effective_project_role` plus permission flags. |
| PUT | `/api/v1/projects/{project_id}` | `update_project` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/board` | `get_project_board` | Loads the real project, enforces project-scoped access, and returns board data with `effective_project_role` plus permission flags. Tasks are matched by logical `project_id`, Mongo `_id`, or `project_object_id` so tasks created through any integration flow appear. Project-scoped Leads see all project tasks; Employees who are involved in the project (a project member, or assigned to any project task) also see all project tasks on the board, while unrelated Employees see only their own tasks. This board-only visibility does not change the Tasks list page. |
| GET | `/api/v1/projects/{project_id}/board-columns` | `get_board_columns` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/projects/{project_id}/board-columns` | `create_board_column` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/projects/{project_id}/board-columns/{column_id}` | `delete_board_column` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/projects/{project_id}/board-columns/{column_id}` | `update_board_column` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/epics` | `list_epics` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/projects/{project_id}/epics` | `create_epic` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/files` | `list_project_files` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/projects/{project_id}/files` | `upload_project_file` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/projects/{project_id}/files/{file_id}` | `delete_project_file` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/pages` | `list_pages` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/projects/{project_id}/pages` | `create_page` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/projects/{project_id}/pages/{page_id}` | `delete_page` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/pages/{page_id}` | `get_page` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/projects/{project_id}/pages/{page_id}` | `update_page` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/sprints` | `list_sprints` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/projects/{project_id}/sprints` | `create_sprint` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/projects/{project_id}/sprints/{sprint_id}/state` | `update_sprint_state` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/{project_id}/summary` | `get_project_summary` | Uses router/endpoint dependencies where configured. |

### Reports

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/reports/analytics/charts` | `get_analytics_charts` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/reports/tasks/export` | `export_tasks_report` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/reports/tickets/export` | `export_tickets_report` | Uses router/endpoint dependencies where configured. |

### Sales

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/dashboard` | `sales_dashboard` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/health` | `sales_health` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/me` | `sales_me` | Uses router/endpoint dependencies where configured. |

### CRM Negotiation

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/crm/leads/{lead_id}/negotiation` | `get_lead_negotiation` | Loads the Negotiation workspace after the lead reaches Negotiation. Enforces existing lead company and ownership access. |
| PATCH | `/api/v1/crm/leads/{lead_id}/negotiation` | `patch_lead_negotiation` | Saves negotiation terms, keeps `negotiation_status` manually editable, syncs accepted/final amount to existing Sales lead fields where applicable, and records a CRM lead activity event. Agreement entry remains gated by `negotiation_status = accepted`. |

### CRM Lead Notes

Lead-scoped comments for a prospect. Notes are tenant-scoped (`company_id`) and follow the lead across pipeline stages; ownership access matches the lead workspace Notes tab (same-company for Admin/Sub Admin/Manager/Lead, assigned/created-by only for Employees).

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/crm/leads/{lead_id}/notes` | `list_lead_notes` | Lists non-deleted notes for a lead, newest-updated first, with author display names resolved from the tenant's users. |
| POST | `/api/v1/crm/leads/{lead_id}/notes` | `create_lead_note` | Creates a note (`content` required) and publishes a `LeadNoteCreated` timeline event. |
| PATCH | `/api/v1/crm/leads/{lead_id}/notes/{note_id}` | `update_lead_note` | Edits a note, marks it `is_edited`, and publishes a `LeadNoteUpdated` timeline event. |
| DELETE | `/api/v1/crm/leads/{lead_id}/notes/{note_id}` | `delete_lead_note` | Soft-deletes a note (recorded `deleted_by`) and publishes a `LeadNoteDeleted` timeline event. |

### Sales Categories

Sales category list/create/update/delete are tenant-scoped and require the canonical `sales_crm` module. Create is allowed for Admin, Manager, Lead, and Super Admin; delete is allowed for Admin, Manager, and Super Admin.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/categories/` | `list_categories` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/categories/` | `create_category` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/categories/bulk-upload` | `bulk_upload_categories` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/categories/{category_id}` | `delete_category` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/categories/{category_id}` | `update_category` | Uses router/endpoint dependencies where configured. |

### Sales Contacts

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/contacts/` | `list_contacts` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/contacts/` | `create_contact` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/contacts/bulk-upload` | `bulk_upload_contacts` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/contacts/search` | `search_contact` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/contacts/share` | `share_contacts` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/contacts/shared-with-me` | `list_shared_contacts` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/contacts/{contact_id}` | `delete_contact` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/contacts/{contact_id}` | `get_contact` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/contacts/{contact_id}` | `update_contact` | Uses router/endpoint dependencies where configured. |

### Sales Masters

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/masters/business-categories` | `list_business_categories` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/masters/business-categories` | `create_business_category` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/business-categories/{category_id}` | `delete_business_category` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/business-categories/{category_id}` | `update_business_category` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/masters/channels` | `list_channels` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/masters/channels` | `create_channel` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/channels/{channel_id}` | `delete_channel` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/channels/{channel_id}` | `update_channel` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/masters/greetings` | `list_greetings` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/masters/greetings` | `create_greeting` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/greetings/{greeting_id}` | `delete_greeting` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/greetings/{greeting_id}` | `update_greeting` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/masters/nationalities` | `list_nationalities` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/masters/nationalities` | `create_nationality` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/nationalities/{nationality_id}` | `delete_nationality` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/nationalities/{nationality_id}` | `update_nationality` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/masters/reasons-for-lost` | `list_reasons` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/masters/reasons-for-lost` | `create_reason` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/reasons-for-lost/{reason_id}` | `delete_reason` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/reasons-for-lost/{reason_id}` | `update_reason` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/masters/stages` | `list_stages` | Returns `{ total, items }`. When a company has no configured `SalesStage` rows, falls back to the fixed CRM pipeline catalog (`New, Contacted, Qualified, Discovery, Proposal, Negotiation, Won, Lost`) with `source: "fixed"` and `id: null` so stage selectors are never empty. |
| POST | `/api/v1/sales/masters/stages` | `create_stage` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/stages/{stage_id}` | `delete_stage` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/stages/{stage_id}` | `update_stage` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/masters/tags` | `list_tags` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/masters/tags` | `create_tag` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/masters/tags/{tag_id}` | `delete_tag` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/masters/tags/{tag_id}` | `update_tag` | Uses router/endpoint dependencies where configured. |

### Sales Products

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/products/` | `list_products` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/products/` | `create_products` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/products/bulk-upload` | `bulk_upload_products` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/sales/products/{product_id}` | `delete_product` | Uses router/endpoint dependencies where configured. |

### Sales Prospects

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/prospects/` | `list_prospects` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/sales/prospects/` | `create_prospect` | Creates a tenant-scoped lead. Open to every authenticated company user (any role, including Employee). Phone is optional for manual entry - a lead may be captured with only a name, only a phone, or both (it falls back to `Unknown Lead`); the backend performs no phone-format enforcement (the +country-code + 10-digit format check is frontend-side). Phone duplicates are allowed and remain visible through duplicate review/merge flows. Owner resolution never blocks creation: if `assigned_to` is provided it must be an active assignable user in the actor's company (Admin, Sub Admin, and Super Admin checks are company-wide rather than actor-department-limited), and when no valid assignable user can be found (e.g. an Employee whose department has no other assignable members) the lead falls back to its creator so it stays visible on their dashboard instead of failing with a 400. Optional form field `referred_by` stores the user ID of the employee/manager who referred the lead; it is never validated against assignable users and has no effect on ownership or visibility. |
| POST | `/api/v1/sales/prospects/bulk-upload` | `bulk_upload_prospects` | Accepts any file type (CSV, XLSX, or text). Unknown columns stored as `custom_fields`. **No validation is applied** — every row imports even when a mobile number is missing (phone is optional). Rows whose email already exists in the company still import; the colliding email is dropped (email has a unique per-company index). `allow_duplicates` is accepted for backward compatibility but no longer gates anything. Form fields: `file`, `strategy` (`round-robin`\|`evenly`\|`least-loaded`\|`manual`), optional `target_user_id`, `target_department_id`. |
| POST | `/api/v1/sales/prospects/bulk-upload/preview` | `preview_bulk_upload_prospects` | Returns preview rows, failed rows, detected columns, and field mapping recommendations. |
| GET | `/api/v1/sales/prospects/search/contact` | `search_contact_for_prospect` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/prospects/{prospect_id}` | `get_prospect` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/sales/prospects/{prospect_id}` | `update_prospect` | Updates only the form fields the client actually sent; omitted fields are left untouched (a partial update never clears budget, decision maker, phone, or other stored values). Fields sent as explicit empty strings still clear their stored value. `custom_fields` (JSON string) replaces the complete custom-field set, so the overview Add-field flow and the sidebar editor both persist. The pipeline stage and inner status are not mutated by this endpoint except when the request explicitly marks `status=won` or `current_stage=won`; that Won request runs the same idempotent Won lead automation, creates or reuses the same-tenant Client, links `client_id` on the lead, and initializes the Client lifecycle status as `new`. |

### Sales Reports

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/sales/reports/inventory` | `inventory_report` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/reports/lost` | `lost_prospect_report` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/reports/prospect` | `prospect_report` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/reports/sales` | `sales_report` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/reports/target` | `team_target_report` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/sales/reports/team-activity` | `team_activity_report` | Uses router/endpoint dependencies where configured. |

### Subscriptions

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/subscriptions/confirm-payment` | `confirm_payment` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/subscriptions/current` | `get_current_subscription` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/subscriptions/payment-intent` | `create_payment_intent` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/subscriptions/plans` | `get_subscription_plans` | Uses router/endpoint dependencies where configured. |

### Super Admin - Billing

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/superadmin/billing/export` | `export_billing_data` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/superadmin/billing/invoices/generate` | `generate_invoice` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/superadmin/billing/razorpay/webhook` | `razorpay_webhook` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/superadmin/billing/revenue/analytics` | `get_revenue_analytics` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/superadmin/billing/transactions` | `list_transactions` | Uses router/endpoint dependencies where configured. |

### Super Admin - Plans

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/superadmin/plans/` | `list_plans` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/superadmin/plans/` | `create_plan` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/superadmin/plans/count` | `get_plans_count` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/superadmin/plans/{plan_id}` | `delete_plan` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/superadmin/plans/{plan_id}` | `get_plan` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/superadmin/plans/{plan_id}` | `update_plan` | Uses router/endpoint dependencies where configured. |

### Departments

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/departments/` | `list_departments` | Company-scoped department list for Admin, Sub Admin, Manager, Lead, and Super Admin. Super Admin sessions without a selected company return an empty list instead of a company-resolution error. |
| GET | `/api/v1/departments/{department_ref}` | `get_department` | Company-scoped single department lookup by Mongo id or exact department name. Cross-company access is rejected as not found; Super Admin without company context gets 404 instead of an unhandled error. |
| POST | `/api/v1/departments/` | `create_department` | Company admin only; requires `company_id` on the actor. |
| PUT | `/api/v1/departments/{department_id}` | `update_department` | Company admin only and same-company department only. |
| DELETE | `/api/v1/departments/{department_id}` | `delete_department` | Company admin only and same-company department only; blocks deletion while active users or tasks still reference the department. |

### Super Admin - Tenants

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/superadmin/tenants/` | `list_tenants` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/superadmin/tenants/{company_id}` | `delete_tenant` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/superadmin/tenants/{company_id}` | `get_tenant` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/superadmin/tenants/{company_id}/activate` | `activate_tenant` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/superadmin/tenants/{company_id}/approve` | `approve_tenant` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/superadmin/tenants/{company_id}/modules` | `update_tenant_modules` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/superadmin/tenants/{company_id}/subscription` | `update_subscription` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/superadmin/tenants/{company_id}/suspend` | `suspend_tenant` | Uses router/endpoint dependencies where configured. |

### Super Admin - Usage

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/superadmin/usage/analytics` | `get_usage_analytics` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/superadmin/usage/company/{company_id}` | `get_company_usage` | Uses router/endpoint dependencies where configured. |

### Tasks

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/tasks/` | `list_tasks` | Company-scoped. Admin/Super Admin and Manager list company tasks; Employee list includes tasks assigned to them or created by them, so employee project leads keep visibility of tasks they assign to others. Supports `status_filter`, `priority`, `assigned_to`, `reviewer_id`, `review_required`, `blocked`, `overdue`, `due_today`, `critical`, `awaiting_review`, `created_by`, `project_id`, `department_id`, `search` (Mongo `$text`), `due_from`, `due_to`, `exclude_follow_up`, `skip`, and `limit`. Lifecycle (`status_filter`) and attention conditions (`blocked`/`overdue`/`due_today`/`critical`) are independent dimensions: a task can be `in_progress` AND blocked AND overdue at the same time. Filtering order is company/RBAC scope -> lifecycle status -> attention -> advanced filters -> search -> sort -> pagination. Pending scheduled `CREATE_TASK` jobs are returned as `scheduled` placeholders only to the scheduling creator, with `is_scheduled_placeholder=true`, `scheduled_job_id`, and UTC `scheduled_run_at`; they are not visible to assignees or other tenant users before publish. Response includes review metadata, `allowed_actions`, `is_blocked`, and `blocking_dependencies`. |
| GET | `/api/v1/tasks/status-summary` | `task_status_summary` | Task lifecycle + attention counts for the Tasks workspace. Without `project_id` it is global; with `project_id` it scopes to one Project Workspace (resolves the Project and matches tasks by logical `project_id`, Mongo `_id`, or `project_object_id`, exactly like the `project_id` filter on `list_tasks`, so tab counts and list totals agree). Applies the SAME company isolation, RBAC, manager/team/project scope, and employee visibility as `list_tasks` (so Company A counts never include Company B tasks). Returns `all`, `todo`, `assigned`, `in_progress`, `in_review`, `revision_required`, `approved`, `completed`, `cancelled`, `blocked`, `overdue`, `due_today`, and `critical`. `blocked` counts tasks with at least one incomplete same-tenant dependency; Sales follow-up items (`source_type=sales_follow_up`) are excluded to match the Tasks page; Scheduled placeholders are not Task documents and never appear here. Counts are backend/global-scope, never current-page totals. |
| POST | `/api/v1/tasks/` | `create_task` | Creates an unassigned task as `todo` or an assigned task as `assigned`. Accepts optional `review_required` and `reviewer_id`; project tasks default to review-required except `source_type=sales_follow_up`, which remains non-review for CRM compatibility. Assignee and reviewer must be active same-company users authorized by role/project rules. |
| GET | `/api/v1/tasks/{task_id}` | `get_task` | Returns a task after task view authorization with normalized checklist, dependencies, review metadata, allowed workflow actions, and blocking dependency details. |
| PUT | `/api/v1/tasks/{task_id}` | `update_task` | Admin/Super Admin manage company tasks; Manager detail edits/assignment are limited to matching `department_id`; project-scoped Leads can manage assigned project tasks. Employees cannot edit details through this endpoint. Reassignment changes `todo` tasks to `assigned`; started tasks cannot be unassigned. Optional `review_required` and `reviewer_id` use the same validation as creation. |
| POST | `/api/v1/tasks/{task_id}/attachments` | `add_task_attachment` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/tasks/{task_id}/comments` | `get_task_comments` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/tasks/{task_id}/comments` | `add_task_comment` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/tasks/{task_id}/status` | `update_task_status` | Legacy status endpoint. Maps requested statuses to semantic workflow actions and enforces the same transition rules as action routes. Valid statuses are `todo`, `assigned`, `in_progress`, `in_review`, `revision_required`, `approved`, `completed`, and `cancelled`. |
| POST | `/api/v1/tasks/{task_id}/start` | `start_task` | Assignee or task manager moves `assigned`/legacy assigned `todo`/`revision_required` work to `in_progress` when dependencies are complete. |
| POST | `/api/v1/tasks/{task_id}/submit-review` | `submit_task_for_review` | Assignee or manager submits `in_progress` work to `in_review`; review-required tasks need a reviewer and all required checklist items complete. |
| POST | `/api/v1/tasks/{task_id}/request-revision` | `request_task_revision` | Reviewer or task manager moves `in_review`/`approved` work to `revision_required`; `reason` is required. |
| POST | `/api/v1/tasks/{task_id}/approve` | `approve_task` | Reviewer, who cannot be the assignee, approves `in_review` work. |
| POST | `/api/v1/tasks/{task_id}/complete` | `complete_task` | Task manager completes approved review-required work; assignee can complete non-review work from `in_progress`. |
| POST | `/api/v1/tasks/{task_id}/reopen` | `reopen_task` | Task manager reopens `completed` work to `assigned`. |
| POST | `/api/v1/tasks/{task_id}/cancel` | `cancel_task` | Task manager cancels non-cancelled work; cancelled tasks are terminal. |
| GET | `/api/v1/tasks/{task_id}/execution` | `get_task_execution` | Returns task execution metadata, normalized checklist, dependencies, time logs, workload, and blocker state. |
| PATCH | `/api/v1/tasks/{task_id}/execution` | `update_task_execution` | Updates progress, expected completion time, checklist, dependencies, and time logs after task view authorization. |
| POST | `/api/v1/tasks/{task_id}/checklist` | `add_task_checklist_item` | Task manager adds a checklist item. |
| PATCH | `/api/v1/tasks/{task_id}/checklist/{item_id}` | `update_task_checklist_item` | Viewer/assignee can mark completion; task manager is required to edit text or required flag. |
| DELETE | `/api/v1/tasks/{task_id}/checklist/{item_id}` | `delete_task_checklist_item` | Task manager deletes a checklist item. |
| POST | `/api/v1/tasks/{task_id}/dependencies` | `add_task_dependency` | Task manager adds a same-tenant, same-project dependency; self-dependency and cycles are rejected. |
| DELETE | `/api/v1/tasks/{task_id}/dependencies/{dependency_id}` | `delete_task_dependency` | Task manager removes a dependency. |
| GET | `/api/v1/tasks/{task_id}/subtasks` | `get_task_subtasks` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/tasks/health/dashboard` | `dashboard_task_health` | Combined Task Health payload for the Dashboard: `summary` (health-status counts), `team_completion` (`employees` with performance metrics), and `extension_summary` (status counts). Replaces the three separate `health/summary` + `health/team-completion` + `health/extensions` calls the Dashboard made — each previously scanned the same task dataset — with ONE task scan. Admin/Sub Admin/Manager/Lead/Super Admin only; 403 for Employees. Same company/RBAC scoping as the individual endpoints it consolidates. |
| GET | `/api/v1/tasks/health/summary` | `task_health_summary` | Unchanged; kept for other consumers. Dashboard now uses the combined endpoint above. |
| GET | `/api/v1/tasks/health/team-completion` | `team_completion_summary` | Unchanged; kept for other consumers. |
| GET | `/api/v1/tasks/health/extensions` | `extension_request_summary` | Unchanged; kept for other consumers. |
| GET | `/api/v1/tasks/health/me` | `my_task_health` | Employee self-service task health; unchanged. |

### Tickets

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/tickets/` | `list_tickets` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/tickets/` | `create_ticket` | Only Employees and Leads can create tickets. If `assigned_to` is provided the assignee must belong to the same company; an Employee may only assign to a Lead, Sub Admin, or Admin (403 for disallowed roles, 400 for cross-company). |
| DELETE | `/api/v1/tickets/{ticket_id}` | `delete_ticket` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/tickets/{ticket_id}` | `get_ticket` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/tickets/{ticket_id}` | `update_ticket` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/tickets/{ticket_id}/assign` | `assign_ticket` | Assigns a ticket to a same-company user. An Employee may only assign to a Lead, Sub Admin, or Admin; Leads, Sub Admins, and Admins may assign to any user in the company (403 for disallowed roles, 400 for cross-company). |
| GET | `/api/v1/tickets/{ticket_id}/comments` | `get_ticket_comments` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/tickets/{ticket_id}/comments` | `add_ticket_comment` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/tickets/{ticket_id}/status` | `update_ticket_status` | Uses router/endpoint dependencies where configured. |

### Time Tracking

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/time-tracking/active` | `get_active_timer` | Returns the authenticated user's backend-authoritative active timer, if any, with server time and elapsed seconds. |
| POST | `/api/v1/time-tracking/start` | `start_time_tracking` | Starts one active timer for an assigned actionable task. Assigned tasks move to `in_progress` through Phase 2 workflow. Existing active timer returns 409. |
| POST | `/api/v1/time-tracking/pause` | `pause_time_tracking` | Pauses the active timer and stores elapsed time in `accumulated_seconds`; no TimeLog is created. |
| POST | `/api/v1/time-tracking/resume` | `resume_time_tracking` | Resumes the same paused session without creating a new session. |
| POST | `/api/v1/time-tracking/stop` | `stop_time_tracking` | Finalizes the active timer into a canonical `TimeLog` with `source=timer`, then removes the active session. |
| POST | `/api/v1/time-tracking/manual` | `create_manual_entry` | Creates a canonical `TimeLog` with `source=manual`; validates duration, task/project/company scope, and maximum per-entry duration. |
| GET | `/api/v1/time-tracking/reports/summary` | `get_time_report` | Server-side company-scoped aggregation by employee, task, project, client, and source. Employees see their own logs; management roles can filter. |
| POST | `/api/v1/time-tracking/tasks/{task_id}/log-time` | `log_time` | Backward-compatible manual time entry route; now routes through the same validation/source logic as `/manual`. |
| GET | `/api/v1/time-tracking/tasks/{task_id}/time-logs` | `get_task_time_logs` | Same-tenant task time logs, excluding voided logs. |
| GET | `/api/v1/time-tracking/tasks/{task_id}/time-summary` | `get_task_time_summary` | Task estimated/actual/tracked time summary. |
| DELETE | `/api/v1/time-tracking/time-logs/{log_id}` | `delete_time_log` | Voids a finalized TimeLog and updates summaries instead of hard-deleting the record. |
| GET | `/api/v1/time-tracking/users/{user_id}/time-logs` | `get_user_time_logs` | User logs by date range; employees can view self, admin roles can view scoped users. |

### Timesheet

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/timesheet/entries` | `create_timesheet_entry` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/timesheet/entries/{entry_id}` | `delete_timesheet_entry` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/timesheet/list` | `get_timesheet_list` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/timesheet/my-timesheet` | `get_my_timesheet` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/timesheet/team-timesheet` | `get_team_timesheet` | Uses router/endpoint dependencies where configured. |

### Users

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/users/` | `list_users` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/users/assignable` | `get_assignable_users` | Returns active company users eligible for assignment, including admins, managers, leads, and employees; `project_id` still narrows the list to project members. |
| GET | `/api/v1/users/creatable-roles` | `get_creatable_roles` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/users/create-employee` | `create_employee` | Accepts an optional `modules` form param (comma-separated catalog ids, e.g. `tasks_projects,chat,attendance_leaves`) that sets the member's sidebar-module permissions. Omitted → legacy defaults (`task,attendance_leaves`). Creators can only grant modules they themselves can access (privilege-escalation guard). |
| POST | `/api/v1/users/create-lead` | `create_lead` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/users/create-user` | `create_user_hierarchical` | Accepts an optional `modules` form param. Non-admin creators can only grant modules they can access; admins are unrestricted. |
| DELETE | `/api/v1/users/detail/{user_id}` | `delete_user` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/users/detail/{user_id}` | `get_user` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/users/detail/{user_id}` | `update_user` | Accepts an optional `modules` form param to update a member's sidebar-module permissions. The same creator-privilege guard applies (non-admin creators can only grant modules they can access). |

**Module enforcement (`require_module`):** members whose stored `modules` list is a pre-permission-system default (`task` / `task,attendance_leaves` / empty) keep the legacy role auto-grants (sales/tickets/recruitment for Manager/Lead/Employee). Members with any other explicit list — including a single `tasks_projects` (the new permission-system id) — are governed strictly by that list, so a module deselected in the Permissions selector is truly withheld. Super Admin / Admin / Sub Admin have full module access regardless of the list.
| PATCH | `/api/v1/users/detail/{user_id}/status` | `update_user_status` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/users/my-team` | `get_my_team` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/users/reporting-options` | `get_reporting_options` | Uses router/endpoint dependencies where configured. |

### Admin Permissions

Centralized permission administration. All endpoints require company-admin or super-admin authentication.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/admin/permissions/overview` | `get_permissions_overview` | Returns all users with module counts, role summary, permission catalog, and module catalog. |
| GET | `/api/v1/admin/permissions/catalog` | `get_permission_catalog` | Returns the full `PERMISSION_CATALOG` (module → action → effect/scope metadata). |
| GET | `/api/v1/admin/permissions/users/{user_id}` | `get_user_permissions` | Returns one user's `modules`, `capability_grants`, `permission_overrides`, and `effective_permissions`. |
| PUT | `/api/v1/admin/permissions/users/{user_id}/modules` | `update_user_modules` | Replaces the user's `modules` list. Request body: `{ "modules": ["projects", "tasks"] }`. |
| PUT | `/api/v1/admin/permissions/users/{user_id}` | `update_user_overrides` | Replaces the user's `permission_overrides`. Request body: `{ "overrides": [{ "permission": "projects.create", "effect": "deny" }] }`. |
| POST | `/api/v1/admin/permissions/users/{user_id}/promote` | `promote_to_sub_admin` | Promotes a user to `sub_admin`. |
| POST | `/api/v1/admin/permissions/users/{user_id}/demote` | `demote_from_sub_admin` | Demotes a `sub_admin` back to their previous role. |
| PUT | `/api/v1/admin/permissions/departments/{dept_id}/modules` | `update_department_modules` | Updates the department default modules. |
| POST | `/api/v1/admin/permissions/departments/{dept_id}/apply` | `apply_department_modules` | Applies department default modules to all users in the department. |

**Frontend integration:** The `UserAccessEditor` component (shared by `/users` Edit modal and `/admin-permissions` page) uses these endpoints via `frontend/src/api/permissions.js`. Effective permissions are resolved server-side by `authorization_service.py` through: protected role bypass → `capability_grants` → department defaults → user overrides.

### Versions

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/versions/projects/{project_id}/versions` | `list_versions` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/versions/projects/{project_id}/versions` | `create_version` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/versions/versions/{version_id}/release` | `release_version` | Uses router/endpoint dependencies where configured. |

### Watchers

| Method | Path | Handler | Notes |
|---|---|---|---|
| DELETE | `/api/v1/watchers/tasks/{task_id}/watchers` | `remove_watcher` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/watchers/tasks/{task_id}/watchers` | `get_watchers` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/watchers/tasks/{task_id}/watchers` | `add_watcher` | Uses router/endpoint dependencies where configured. |

### Webhooks

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/webhooks/` | `list_webhooks` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/webhooks/` | `create_webhook` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/webhooks/{webhook_id}` | `delete_webhook` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/webhooks/{webhook_id}` | `get_webhook` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/webhooks/{webhook_id}/activate` | `toggle_webhook` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/webhooks/{webhook_id}/deliveries` | `get_webhook_deliveries` | Uses router/endpoint dependencies where configured. |

### Workflows

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/workflows/` | `list_workflows` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/workflows/` | `create_workflow` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/workflows/statuses` | `list_workflow_statuses` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/workflows/statuses` | `create_workflow_status` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/workflows/transitions` | `list_workflow_transitions` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/workflows/transitions` | `create_workflow_transition` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/workflows/{workflow_id}` | `get_workflow` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/workflows/{workflow_id}/activate` | `activate_workflow` | Uses router/endpoint dependencies where configured. |

### Meta Integration

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/v1/integrations/meta/sync` | `sync_meta_insights` | Requires company-admin or super-admin authentication. A super-admin must provide `company_id`; the run is persisted before Celery receives only its run ID. The tenant must have Meta integration and insights sync enabled with an ad account configured. No token is accepted or returned. |

The existing Celery beat schedule evaluates enabled tenant configurations hourly and re-dispatches due persisted runs every minute. Marketing API calls are read-only Graph `GET` requests; campaign, ad-set, ad, budget, bid, publish, pause, resume, create, update, and delete operations are not exposed. Phase 4 adds only optional run lifecycle fields and additive indexes (`active_key` and pending-dispatch) through `scripts/migrate_meta_insights_runs.py`; this safety deviation prevents concurrent tenant runs and recovers broker-dispatch failures without placing tokens in task payloads.

### Super Admin Platform Operations

All routes require `get_current_super_admin`.

The Super Admin UI exposes three distinct sidebar entries: `/super-admin/companies` for the existing platform Companies page and Add Company form, `/super-admin/tenants` for tenant operations backed by the superadmin tenant APIs below, and `/super-admin/clients` for the existing CRM Clients page. The Tenants page also links Add Company to the existing Companies form. These routes do not merge platform Company records with CRM Client records.

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/superadmin/tenants/subscription-overview` | `subscription_overview` | Lists tenant plan, purchase date, next billing date, amount, status, and user count. |
| GET | `/api/v1/superadmin/tenants/{company_id}/users` | `list_company_users` | Lists users for one tenant company. |
| POST | `/api/v1/superadmin/tenants/{company_id}/users/{user_id}/reset-password` | `reset_user_password` | Stores a hashed reset token, sends reset email, and writes audit log. |
| POST | `/api/v1/superadmin/tenants/{company_id}/approve` | `approve_tenant` | Deprecated. Returns HTTP 410; use `/api/v1/companies/{company_id}/approve` for first-time approval and admin provisioning. |
| POST | `/api/v1/superadmin/tenants/{company_id}/suspend` | `suspend_tenant` | Suspends active tenants only; invalid current statuses return HTTP 409 without changing status. |
| POST | `/api/v1/superadmin/tenants/{company_id}/activate` | `activate_tenant` | Reactivates suspended tenants only and clears subscription suspension state; invalid current statuses return HTTP 409 without changing status. |
| POST | `/api/v1/superadmin/tenants/{company_id}/assign-plan` | `assign_plan_to_tenant` | Assigns a plan and billing cycle, with optional custom user limit. |
| GET | `/api/v1/superadmin/billing/revenue/analytics` | `get_revenue_analytics` | Supports `period=7d\|30d\|90d\|1y` plus legacy date range query. |
| GET | `/api/v1/superadmin/billing/invoices` | `list_invoices` | Lists invoice-like billing transactions with company name and sent status. |
| POST | `/api/v1/superadmin/billing/invoices/generate` | `generate_invoice` | Creates pending billing transaction invoice and audit log. |
| POST | `/api/v1/superadmin/billing/invoices/{invoice_id}/send` | `send_invoice_email` | Sends invoice notice to tenant admin/company email and audits action. |
| GET | `/api/v1/superadmin/features/available` | `get_available_features` | Lists supported feature toggle keys. |
| GET | `/api/v1/superadmin/features/{company_id}` | `get_company_features` | Lists a tenant's feature flag states. |
| PUT | `/api/v1/superadmin/features/{company_id}/toggle` | `toggle_feature` | Enables/disables one feature for one tenant and audits action. |
| GET | `/api/v1/superadmin/usage/all-companies-summary` | `all_companies_usage_summary` | Lists company, plan, users, projects, status, and limits. |
| GET | `/api/v1/superadmin/usage/company/{company_id}/detailed` | `get_company_detailed_usage` | Returns active users, total users, monthly API requests, storage, projects, and tasks. |

Suspended tenant enforcement occurs in `get_current_user`: non-superadmin users whose company status is `suspended` receive HTTP 403 with `code=account_suspended`.

## Error Responses

| Status | Meaning | Typical Cause |
|---|---|---|
| 400 | Bad request | Invalid business input or failed upload validation |
| 401 | Unauthorized | Missing, invalid, expired, or blacklisted token |
| 403 | Forbidden | Role/module/company access denied |
| 404 | Not found | Missing resource or public reset flow hides unavailable account |
| 413 | Payload too large | Upload exceeds configured maximum |
| 422 | Validation error | Request body/query does not match Pydantic schema |
| 429 | Rate limited | SlowAPI auth limits exceeded |
| 500 | Internal error | Unhandled server-side failure |

## Public Careers

Public recruitment career endpoints do not require authentication. `GET /api/v1/careers` returns companies that currently have published, public jobs and links visitors to `/careers/track` for existing applications. `GET /api/v1/careers/{company_slug}` returns one company's career portal settings, and `GET /api/v1/careers/{company_slug}/jobs` plus `GET /api/v1/careers/{company_slug}/jobs/{job_slug}` return only that company's jobs where `lifecycle_status=published`, `visibility=public`, and `deleted_at=null`. Anonymous applications post multipart form data to `/api/v1/careers/{company_slug}/jobs/{job_id}/apply`; the form includes `full_name`, `email`, `date_of_birth`, optional profile fields, and `resume`. The backend resolves the company from the slug and rejects cross-company, draft, paused, closed, archived, deleted, private, or expired jobs.

Successful anonymous applications return `tracking_code`, `temporary_user_id`, and a one-time random `tracking_pin` shown on screen for printing. The `application_id` and `temporary_user_id` fields in this public response are tracking identifiers, not MongoDB ids. The server stores only hashes for temporary tracking secrets in `recruitment_candidate_portal_credentials` and `recruitment_applications`; predictable DOB-derived passwords are not used. Candidates track progress with `POST /api/v1/careers/applications/track` and body `{ "tracking_code": "...", "tracking_pin": "..." }`. The response is public-safe: company/job basics, candidate-owned profile fields, current resume metadata, current status label, human-readable timeline, public-safe stage detail feed, scheduled interview summaries, and offer status summaries. Sent offer summaries include an `offer_url` only when a valid tenant-scoped public offer token exists; candidates open that URL without employee login to view/download the offer letter and accept or reject it. Candidates can update their public profile with `PATCH /api/v1/careers/applications/track/profile` using the same tracking credentials, and can replace the application resume with multipart `POST /api/v1/careers/applications/track/resume`. Private HR notes, internal database ids, scores, recruiter-only data, and cross-tenant data are not exposed. Temporary portal credential documents are removed when the candidate reaches terminal lifecycle states such as rejected, withdrawn, archived, joined, or employee. `GET /api/v1/careers/applications/{tracking_code}` is retained for compatibility but requires `tracking_pin` as a query parameter.

Authenticated HR users can call `GET /api/v1/recruitment/career-page` to get their own company's public career route for verification. The endpoint is tenant-scoped by `current_user.company_id`; public listing/application endpoints never depend on `current_user`.

Authenticated HR users can call `GET /api/v1/recruitment/jobs/{job_id}/applications` to list applied candidates for a job. The endpoint uses `current_user.company_id`, requires recruitment candidate view permission, and returns candidate summary, application date/status, resume link, recruiter summary, score summary when available, all same-job interview rounds, the latest interview summary, and the latest offer summary when available. Candidate lifecycle actions continue to use existing `/api/v1/recruitment/candidates/{candidate_id}/move`, `/reject`, and `/archive` endpoints; interview scheduling/result and offer creation/send use existing `/api/v1/recruitment/interviews` and `/api/v1/recruitment/offers` workflow APIs. HR can upload an already prepared offer letter with multipart `POST /api/v1/recruitment/offers/{offer_id}/upload-letter`; accepted files are PDF, JPG, JPEG, and PNG, tenant-scoped to the offer's company, and stored on the existing immutable offer-file fields used by secure public offer viewing.

Recruitment resumes are stored in `recruitment_resumes` with `storage_url` plus Cloudinary metadata when Cloudinary is enabled. Resume upload accepts PDF, DOC, DOCX, TXT, JPG, JPEG, and PNG files; document/text formats can be parsed, while image resumes are stored and previewed without text extraction. The linked `recruitment_candidates.resume_url` mirrors the current resume document URL for candidate-detail consumers while `resume_id` remains the canonical relation. Recruitment resume uploads use browser-openable Cloudinary delivery URLs for PDF preview. HR resume links should open `GET /api/v1/recruitment/resumes/{resume_id}/file`, which re-checks tenant authorization and returns either the local uploaded file, the stored Cloudinary URL, or a correctly path-signed Cloudinary delivery URL for older authenticated assets. Add `?download=true` to force attachment/download behavior. Shared uploaded-file serving returns inline content disposition so local PDFs preview in-browser instead of always downloading.

## Pagination
List endpoints commonly use `skip` and `limit`; default page size is configured in `Settings.DEFAULT_PAGE_SIZE` and max size is `Settings.MAX_PAGE_SIZE`.

## Role and Module Access
Route groups for task-management features are protected with `require_module("task")`; `task` and `tasks_projects` are treated as aliases, and Manager, Lead, and Employee users may enter the Work module route group while endpoint-level company, hierarchy, assignment, project membership, and project-scoped Lead checks still constrain returned records and mutations. Chat also allows `task` or `tasks_projects` workspace access so global communication works for task workspace users. Sales routes rely on endpoint-level role checks. Recruitment routes require the recruitment module gate plus recruitment capability dependencies for non-admin HR users. Role helpers in `app/api/dependencies.py` enforce super admin, admin, lead/manager, and company access checks.

Role conventions:
- `SUB_ADMIN` is treated as a company admin for module and department capability checks: it can access company-scoped recruitment job dashboards and other admin module endpoints without an HR department assignment, it sees the full company leave list/dashboard/calendar like `ADMIN` (all company leaves except its own, including forwarded leaves); approve/reject is limited to leaves assigned to it via `pending_with_user_ids` (manager leaves and forwarded employee leaves); and it is eligible as a leave forward target.
- Leave forward targets are `ADMIN` and `SUB_ADMIN` users in the same company only.
- `SUPER_ADMIN` keeps audit-only leave access; it never weakens tenant/company isolation.
# Project Foundation Phase 1

Project APIs now treat `Project.client_id` as the canonical Client -> Project link and `Project.lead_id` as the Project Owner. New projects require an owner; non-internal projects require a same-company client. Project priority is business priority (`low`, `medium`, `high`, `critical`) and is separate from derived `deadline_urgency`.

`GET /api/v1/projects/` and `GET /api/v1/projects/{project_id}` include `client`, `owner`, `priority`, `deadline_urgency`, `project_health`, `progress_percentage`, `completed_task_count`, and overdue/open task counts. `PUT /api/v1/projects/{project_id}` updates project details but status changes continue to be validated by the lifecycle workflow.

Company-scoped project types are available through `GET /api/v1/projects/types` and can be created with `POST /api/v1/projects/types`.
# Project Resources and Optional Task Proof

- `GET/POST /api/v1/projects/{project_id}/resources` lists or creates dynamic
  resources. Read requires project view; create requires project management.
- `PUT/DELETE /api/v1/projects/{project_id}/resources/{resource_id}` updates or
  deletes a same-company resource belonging to that project.
- `GET/POST /api/v1/tasks/{task_id}/proofs` lists or adds optional task proof.
  The server derives `submitted_by`; all reads include task authorization and
  company isolation.
- `POST /api/v1/tasks/{task_id}/production-progress` accepts optional
  `proof_name`/`proof_value`; quantity succeeds without proof.
- `POST /api/v1/tasks/{task_id}/submit-review` accepts optional proof fields;
  review submission succeeds when proof is skipped.
