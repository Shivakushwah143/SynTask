# CRM Product Audit

## Scope
CRM workspace, pipeline, lead workspace, company workspace, contact directory, activities, calendar, reports, and settings.

## Screens

### CRM Dashboard
- Purpose: Central CRM entry point with sales snapshots and navigation.
- Route: `/crm/dashboard`

- Backend APIs used: `GET /api/v1/crm/dashboard`
- Actions available: refresh, navigate to pipeline, open related CRM areas.
- Data displayed: revenue, KPIs, pipeline breakdown, leaderboard, recent activity.
- Navigation flow: CRM shell -> dashboard -> pipeline/leads/companies/contacts/activities/calendar.
- Related screens: Pipeline, Activities, Reports.
- Empty state: dashboard cards render fallback values when arrays are empty.
- Loading state: skeleton cards and sections.
- Error state: dashboard-level error handling is present in layout flow; surface can be improved.
- Permissions: Sales module access via backend and CRM module guard in frontend.
- Current implementation status: Functional.
- Missing functionality: true CRM-specific filters, deeper drilldowns, export.
- UX issues: repeated summary blocks, some crowded sections on smaller screens.
- Technical debt: dashboard is also the aggregation source for reports, creating coupling.
- Production readiness: 8/10

### CRM Pipeline
- Purpose: Kanban-style deal progression board.
- Route: `/crm/pipeline`
- Backend APIs used: `GET /api/v1/crm/pipeline`, `PATCH /api/v1/crm/pipeline/{leadId}/stage`, `GET /api/v1/crm/pipeline/history/{leadId}`
- Actions available: search, filter, drag/drop move, quick stage move, open lead workspace.
- Data displayed: stages, lead cards, counts, deal values, owners, tags, days in stage.
- Navigation flow: pipeline -> lead workspace or related CRM surfaces.
- Related screens: Lead Workspace, Activities, Calendar.
- Empty state: empty stage cards and no-board states.
- Loading state: board skeletons.
- Error state: retryable board error state.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: richer transition analytics, advanced stage metadata editing.
- UX issues: horizontal scrolling on smaller screens, dense cards.
- Technical debt: filter/query state logic is non-trivial and duplicated in places.
- Production readiness: 9/10

### Lead Workspace
- Purpose: Primary single-record CRM workspace for a lead.
- Route: `/crm/leads/:leadId`
- Backend APIs used: `GET /api/v1/crm/leads/{leadId}/timeline`, `GET /api/v1/crm/pipeline/history/{leadId}`, `GET /api/v1/crm/leads/{leadId}/deal`, `GET/POST/PATCH/DELETE /api/v1/crm/leads/{leadId}/notes`, `GET/POST/DELETE /api/v1/crm/leads/{leadId}/files`, `GET /api/v1/crm/leads/{leadId}/proposals`
- Actions available: stage history view, timeline search/filter, notes CRUD, files CRUD, deal/proposal actions where available.
- Data displayed: lead summary, company/contact, owner, stage, priority, deal, notes, files, timeline, history.
- Navigation flow: pipeline -> lead workspace; calendar/activities/company/contact can link in.
- Related screens: Pipeline, Company Workspace, Contact Workspace, Activities, Calendar.
- Empty state: per-tab placeholders or empty lists.
- Loading state: section-specific loading.
- Error state: access denied and data fetch failure handling.
- Permissions: Sales module access enforced by backend.
- Current implementation status: Functional foundation.
- Missing functionality: full proposal/deal lifecycle polish, some tab sections remain placeholder-only or partial.
- UX issues: many tab sections create long page scroll; some tabs are read-only placeholders.
- Technical debt: lead workspace aggregates many modules and risks becoming a monolith.
- Production readiness: 8/10

### Companies
- Purpose: Company list and company workspace.
- Routes: `/crm/companies`, `/crm/companies/:companyId`
- Backend APIs used: `GET/POST/PATCH/DELETE /api/v1/crm/companies`, `GET /api/v1/crm/companies/{companyId}`, `GET /api/v1/crm/contacts`, `GET /api/v1/crm/leads/{leadId}/deal`, `GET /api/v1/crm/leads/{leadId}/proposals`
- Actions available: create/edit/delete company, create/edit/delete contacts, open related lead/workspace links.
- Data displayed: company details, contacts, related leads, timeline, deal/proposal summary where supported.
- Navigation flow: dashboard/pipeline -> companies -> company workspace -> contacts/leads.
- Related screens: Contacts, Lead Workspace, Activities.
- Empty state: empty company/contact sections.
- Loading state: query-driven skeletons/section loading.
- Error state: access denied / fetch failures.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: broader CRM-side company relationship modeling beyond current fields.
- UX issues: some sections still feel like separate modules inside one page.
- Technical debt: over-reliance on shared CRM aggregation and mixed record shapes.
- Production readiness: 8/10

### Contacts
- Purpose: CRM contact directory and detail access.
- Routes: `/crm/contacts`
- Backend APIs used: `GET/POST/PATCH/DELETE /api/v1/crm/contacts`, `GET /api/v1/crm/contacts/{contactId}`
- Actions available: list, create, edit, delete, open contact detail.
- Data displayed: contact name, company, phone, email, tags, created/updated.
- Navigation flow: CRM navigation -> contacts -> contact detail.
- Related screens: Company Workspace, Lead Workspace.
- Empty state: empty directory state.
- Loading state: table skeletons / list loading.
- Error state: query failure states.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: deeper workspace parity with company/lead workspaces.
- UX issues: directory is utilitarian and not yet a high-density CRM control center.
- Technical debt: contact data model still appears inconsistent across sales/crm surfaces.
- Production readiness: 7/10

### Activities Hub
- Purpose: Unified CRM activity aggregation and composer.
- Route: `/crm/activities`
- Backend APIs used: `GET/POST/PATCH/DELETE /api/v1/crm/activities`, `GET /api/v1/crm/leads/{leadId}/timeline`, task APIs for task queue.
- Actions available: create/edit/delete/complete/snooze activities, filter, search, jump to related entity.
- Data displayed: activities, grouped timeline feed, task queue, summary stats, contextual links.
- Navigation flow: CRM nav -> activities -> lead/company/contact surfaces.
- Related screens: Lead Workspace, Company Workspace, Calendar.
- Empty state: no activities and no-match filter states.
- Loading state: skeleton feed and task queue.
- Error state: retry states.
- Permissions: backend enforced Sales module access.
- Current implementation status: Functional.
- Missing functionality: some activity types may not yet be fully mirrored from all domains.
- UX issues: composer is tall; secondary actions can be dense.
- Technical debt: activity feed merges multiple sources with mixed shapes.
- Production readiness: 8/10

### Calendar
- Purpose: CRM scheduling view over meetings, tasks, and activities.
- Route: `/crm/calendar`
- Backend APIs used: existing meetings, tasks, and activity timeline APIs.
- Actions available: change view, filter by owner/type/search, open related records.
- Data displayed: unified agenda/calendar cards.
- Navigation flow: CRM nav -> calendar -> lead/company/contact.
- Related screens: Activities, Lead Workspace, Company Workspace.
- Empty state: no events / today / upcoming sections.
- Loading state: skeleton cards.
- Error state: implicit fetch failures through query states.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: true month/week/day grid interactions and external sync.
- UX issues: currently list-first rather than a full calendar grid.
- Technical debt: event normalization sits in the UI layer.
- Production readiness: 7/10

### Reports
- Purpose: CRM reporting workspace.
- Route: `/crm/reports`
- Backend APIs used: `GET /api/v1/crm/dashboard`
- Actions available: date filters, CSV export.
- Data displayed: revenue, pipeline, conversion, performance, leaderboards, segment rollups.
- Navigation flow: CRM nav -> reports.
- Related screens: Dashboard, Pipeline.
- Empty state: per-report empty states.
- Loading state: skeleton cards/sections.
- Error state: query failure surfaces via loading handling.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: server-side report filters and dedicated analytics endpoints.
- UX issues: report meaning is limited by dashboard aggregation shape.
- Technical debt: reports are derived client-side from dashboard payload.
- Production readiness: 8/10

### Settings
- Purpose: CRM configuration workspace.
- Route: `/crm/settings`
- Backend APIs used: Sales masters endpoints for stages, tags, channels, categories, products.
- Actions available: add editable configuration values, switch configuration areas.
- Data displayed: pipeline stages, lead sources, industries, services, teams, automation presets, preferences.
- Navigation flow: CRM nav -> settings.
- Related screens: Pipeline, Sales Settings.
- Empty state: empty configuration sections.
- Loading state: master data loading.
- Error state: query failure states.
- Permissions: Sales module access.
- Current implementation status: Functional but partly local-persisted.
- Missing functionality: dedicated backend settings persistence for CRM-specific config groups.
- UX issues: some controls are local-only rather than centrally managed.
- Technical debt: localStorage-backed settings are not enterprise-grade.
- Production readiness: 6/10

## Audit Findings
- Broken navigation: none critical in CRM route map.
- Dead routes: `/crm/leads` remains a valid placeholder entry and should be treated as intentional entrypoint for workspace fallback.
- Placeholder pages: Calendar, Reports, Settings were placeholders; Reports and Settings now have workspace implementations, calendar remains list-based.
- Duplicate features: sales and CRM share masters/configuration concepts; some duplication is intentional for compatibility.
- Unused components: several CRM primitives are reusable across pages; no critical dead component risk identified.
- Inconsistent UI: yes, especially between CRM workspace screens and legacy sales screens.
- Missing CRUD operations: some placeholder CRM sub-sections still lack full CRUD.
- Missing validation: some UI forms rely on backend validation only.
- Missing authorization: backend guards exist for Sales module; frontend sometimes relies on access-denied rendering after fetch.
- Missing tenant isolation: backend is the source of truth, but some client-side derived views assume tenant-safe payloads.
- Missing audit trail: mostly present through timeline/activity surfaces; some configuration areas lack audit events.
- Missing timeline integration: some settings/config actions do not yet emit timeline events.
