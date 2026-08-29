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
| GET | `/api/v1/changelog/tasks/{task_id}/changelog` | `get_task_changelog` | Uses router/endpoint dependencies where configured. |

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
| DELETE | `/api/v1/clients/{client_id}` | `delete_client` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/clients/{client_id}` | `get_client` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/clients/{client_id}/workspace` | `get_client_workspace` | Loads the tenant-scoped Client Workspace for one client. Client payloads retain legacy fields and add canonical `crm_company_id`, `source_lead_id`, `account_owner_id`, and `sales_owner_id`. Projects are resolved from the client's explicit `project_ids` and existing `Project.client_id`; tasks are returned only for those projects, so clients with zero projects return zero tasks. Contacts come from the linked CRM Company through existing `SalesContact` records. Meetings are limited to existing kickoff/project context instead of account-owner-wide meetings. Lead and timeline context uses the lead's `client_id` or actual CRM Company (`SalesProspect.crm_company_id` to `CRMCompany.id`), never `Client.id` as a CRM company id. The response includes backend-calculated `onboarding` progress/items while the client is in onboarding. |
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
| PATCH | `/api/v1/clients/{client_id}/onboarding/data` | `update_client_onboarding_data` | Updates structured onboarding metadata for commercial, requirements, assets, access, and start readiness. Start readiness confirmations are stamped with the current user and timestamp. Plaintext credentials must not be sent; access rows store status/reference only. |
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
| GET | `/api/v1/debug` | `debug_backend` | Uses router/endpoint dependencies where configured. |

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
| GET | `/api/v1/meetings/` | `list_meetings` | Authenticated users can list meetings where they are host or participant; supports `status` and `upcoming` filters. `upcoming=true` returns future meetings ordered soonest first and is not hidden behind the `meetings_calendar` module gate. |
| POST | `/api/v1/meetings/` | `create_meeting` | Admin, Manager, Lead, or Super Admin only; duration must be 1-60 minutes; participant IDs must be same-tenant junior users available to the creator role. |
| PATCH | `/api/v1/meetings/{meeting_id}` | `update_meeting` | Host/Admin/Super Admin update or reschedule meeting details and participants. |
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
| GET | `/api/v1/scheduled-jobs/` | `list_scheduled_jobs` | Company-scoped list with status/search pagination. Admin, Sub Admin, Manager, Lead, and Super Admin can view jobs; jobs expose payload summaries and creator names. |
| POST | `/api/v1/scheduled-jobs/` | `create_scheduled_job` | Schedules `CREATE_PROJECT` or `CREATE_TASK`. Project scheduling is limited to Admin, Sub Admin, Manager, and Super Admin; task scheduling also allows Sub Admin, Manager, Lead, and project-scoped Leads for their own project. `run_at` must be a future datetime and is stored as UTC. |
| PATCH | `/api/v1/scheduled-jobs/{job_id}` | `update_scheduled_job` | Edits `run_at` for pending jobs only; same-tenant access required and past datetimes are rejected. |
| POST | `/api/v1/scheduled-jobs/{job_id}/cancel` | `cancel_scheduled_job` | Cancels pending or failed jobs and notifies the creator. |
| POST | `/api/v1/scheduled-jobs/{job_id}/retry` | `retry_failed_job` | Moves failed or cancelled jobs back to pending and clears the stored error/retry count. |
| DELETE | `/api/v1/scheduled-jobs/{job_id}` | `delete_scheduled_job` | Deletes completed, failed, or cancelled jobs only. |

### Projects

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/v1/projects/` | `list_projects` | Company-scoped. Admin/Super Admin and Manager list company projects; Employee list includes projects where they are the project leader, project member, or have assigned tasks. Pending scheduled `CREATE_PROJECT` jobs are also returned as `scheduled` placeholders only to the scheduling creator, with `is_scheduled_placeholder=true`, `scheduled_job_id`, and `scheduled_run_at`; they are not visible to other tenant users before publish. |
| POST | `/api/v1/projects/` | `create_project` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/projects/for-task-creation` | `get_projects_for_task_creation` | Returns non-archived projects where the authenticated user has `create_task`. Employees assigned as that project's `lead_id` are treated as project-scoped Lead only for that project. |
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
| PUT | `/api/v1/sales/prospects/{prospect_id}` | `update_prospect` | Updates only the form fields the client actually sent; omitted fields are left untouched (a partial update never clears budget, decision maker, phone, or other stored values). Fields sent as explicit empty strings still clear their stored value. `custom_fields` (JSON string) replaces the complete custom-field set, so the overview Add-field flow and the sidebar editor both persist. The pipeline stage and inner status are not mutated by this endpoint except when the request explicitly marks `status=won` or `current_stage=won`; that Won request runs the same idempotent Won lead automation, creates or reuses the same-tenant Client, repairs stale/missing lead `client_id`, links the generated Project by the actual lead id, and initializes the Client lifecycle status as `new`. |

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
| GET | `/api/v1/tasks/` | `list_tasks` | Company-scoped. Admin/Super Admin and Manager list company tasks; Employee list includes tasks assigned to them or created by them, so employee project leads keep visibility of tasks they assign to others. Pending scheduled `CREATE_TASK` jobs are returned as `scheduled` placeholders only to the scheduling creator, with `is_scheduled_placeholder=true`, `scheduled_job_id`, and UTC `scheduled_run_at`; they are not visible to assignees or other tenant users before publish. Response includes `assigned_to_name` for assigned task display. |
| POST | `/api/v1/tasks/` | `create_task` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/tasks/{task_id}` | `get_task` | Uses router/endpoint dependencies where configured. |
| PUT | `/api/v1/tasks/{task_id}` | `update_task` | Admin/Super Admin manage company tasks; Manager detail edits/assignment are limited to matching `department_id`; Employees cannot edit details through this endpoint. |
| POST | `/api/v1/tasks/{task_id}/attachments` | `add_task_attachment` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/tasks/{task_id}/comments` | `get_task_comments` | Uses router/endpoint dependencies where configured. |
| POST | `/api/v1/tasks/{task_id}/comments` | `add_task_comment` | Uses router/endpoint dependencies where configured. |
| PATCH | `/api/v1/tasks/{task_id}/status` | `update_task_status` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/tasks/{task_id}/subtasks` | `get_task_subtasks` | Uses router/endpoint dependencies where configured. |

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
| POST | `/api/v1/time-tracking/tasks/{task_id}/log-time` | `log_time` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/time-tracking/tasks/{task_id}/time-logs` | `get_task_time_logs` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/time-tracking/tasks/{task_id}/time-summary` | `get_task_time_summary` | Uses router/endpoint dependencies where configured. |
| DELETE | `/api/v1/time-tracking/time-logs/{log_id}` | `delete_time_log` | Uses router/endpoint dependencies where configured. |
| GET | `/api/v1/time-tracking/users/{user_id}/time-logs` | `get_user_time_logs` | Uses router/endpoint dependencies where configured. |

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
