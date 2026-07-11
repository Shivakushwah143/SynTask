# Domain ownership refactor

## Domain ownership map

| Entity | Canonical owner | Compatibility boundary |
|---|---|---|
| Lead | CRM | `SalesProspect`, `sales_prospects`, Prospect API names remain |
| Client | CRM | Existing `app.models.client` path remains |
| Project | Projects | Existing `app.models.project` path remains |
| Task | Tasks | Existing `app.models.task` path remains |
| Campaign | Marketing | No concrete model found; ownership reserved |
| Content | Marketing | `ContentCalendarItem` and existing API remain |
| Publication | Marketing | No concrete model found; ownership reserved |
| Invoice | Finance | Existing model, collection, and API remain |
| Agreement | Finance | `Agreement` aliases existing `MSA`; MSA API/collection remain |
| Attendance | Attendance | Existing model and API remain |
| AI | AI Platform | Existing `app.ai` package remains |
| Notifications | Notification Center | Existing model and API remain |
| Timeline | Timeline | CRM timeline module remains compatibility adapter |
| Reports | Reporting | Existing reporting APIs remain |

Backend registry: `app/domains/ownership.py`.
Frontend registry and entitlement adapter: `frontend/src/config/domainOwnership.js`.

## Adapters and facades added

- `app.crm.models`: canonical Lead and Client facade over unchanged documents.
- `app.projects.models`: canonical Project facade.
- `app.tasks.models`: canonical Task facade.
- `app.marketing.models`: canonical Content facade.
- `app.finance.models`: canonical Invoice/Agreement facade; `Agreement = MSA`.
- `app.notification_center.models`: canonical Notification facade.
- `app.attendance_domain.models`: canonical Attendance facade.
- `app.timeline.publisher`: canonical timeline event implementation.
- `app.crm.timeline`: backward-compatible Timeline re-export.
- Frontend `canAccessOwner`: owner-aware access using legacy `task`/`sales`
  entitlements until owner-specific entitlements exist.

All facades re-export original classes. No duplicate Beanie models are created.

## Files changed

### Ownership metadata and adapters

- `backend/app/domains/__init__.py`
- `backend/app/domains/ownership.py`
- `backend/app/crm/models.py`
- `backend/app/projects/__init__.py`
- `backend/app/projects/models.py`
- `backend/app/tasks/__init__.py`
- `backend/app/tasks/models.py`
- `backend/app/marketing/__init__.py`
- `backend/app/marketing/models.py`
- `backend/app/finance/__init__.py`
- `backend/app/finance/models.py`
- `backend/app/notification_center/__init__.py`
- `backend/app/notification_center/models.py`
- `backend/app/attendance_domain/__init__.py`
- `backend/app/attendance_domain/models.py`
- `backend/app/timeline/__init__.py`
- `backend/app/timeline/publisher.py`
- `backend/app/crm/timeline.py`
- `frontend/src/config/domainOwnership.js`
- `frontend/src/config/businessWorkflow.js`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/workflow/WorkflowJourney.jsx`
- `frontend/src/components/workflow/WorkflowStepNavigation.jsx`

### Imports moved to canonical owners

- CRM package: `activities.py`, `client_workspace.py`, `companies.py`, `contacts.py`,
  `company_timeline.py`, `context_builder.py`, `deal_automation.py`, `deals.py`,
  `lead_engine.py`, `lead_files.py`, `lead_notes.py`, `lead_timeline.py`,
  `lost_workflow.py`, `pipeline.py`.
- API/services: `api/v1/endpoints/attendance.py`, `clients.py`, `crm.py`, `invoices.py`,
  `ledger.py`, `msa.py`, `notifications.py`, `sales_prospects.py`, `sales_reports.py`,
  `services/content_calendar_service.py`, `crm_dashboard_service.py`,
  `dashboard_service.py`, `invoice_pdf.py`, `notification_service.py`.
- AI: `ai/tools/registry.py`.

## Remaining ownership conflicts

- Legacy Lead implementation and routes remain Sales-named for DB/API compatibility.
- `crm.py` still imports helper functions from legacy Sales endpoint; helper extraction
  needs a dedicated CRM query service plus regression coverage.
- CRM deal automation still constructs Project and Task documents directly. Replace
  with Projects provisioning and Tasks creation ports after transaction semantics are specified.
- CRM client workspace and context builders directly query Project/Task/Finance models.
  Replace with read-only query ports after response-shape contracts are documented.
- Marketing Content service still composes CRM, Projects, and Tasks models through
  canonical facades; dedicated read ports remain future work.
- Notification producers still construct Notification documents directly in several
  core, project, task, and AI modules. Notification publisher migration remains.
- Reporting directly queries Task models; Reporting read adapters remain.
- Campaign and Publication have no concrete models. Ownership is reserved only.
- Module entitlements currently expose only legacy `task` and `sales` keys. Owner-aware
  frontend metadata uses compatibility fallback; changing authorization requires data migration.
- Database registration and global search/dashboard aggregators retain direct model imports
  as composition roots, not domain owners.

## Compatibility preserved

- No API routes, payloads, response keys, or guards changed.
- No database models, collections, fields, indexes, or schemas changed.
- No business operations changed.
- Legacy import paths remain valid.
