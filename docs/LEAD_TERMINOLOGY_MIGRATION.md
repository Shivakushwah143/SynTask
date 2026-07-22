# Lead terminology migration

Canonical business term: **Lead**.

## Files changed

- `docs/LEAD_TERMINOLOGY_MIGRATION.md`
- `backend/app/api/v1/router.py`
- `backend/app/models/sales_prospect.py`
- `backend/app/services/crm_dashboard_service.py`
- `frontend/src/api/sales.js`
- `frontend/src/components/BulkImportProspectsModal.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/layouts/MainLayout.jsx`
- `frontend/src/pages/BulkLeads.jsx`
- `frontend/src/pages/ClientWorkspace.jsx`
- `frontend/src/pages/crm/dashboard/page.jsx`
- `frontend/src/pages/crm/leads/components.jsx`
- `frontend/src/pages/crm/leads/page.jsx`
- `frontend/src/pages/crm/leads/workspace.jsx`
- `frontend/src/pages/crm/pipeline/components.jsx`
- `frontend/src/pages/sales/ProspectDetail.jsx`
- `frontend/src/pages/sales/SalesDashboard.jsx`
- `frontend/src/pages/sales/SalesPipeline.jsx`
- `frontend/src/pages/sales/SalesProspects.jsx`
- `frontend/src/pages/sales/SalesReports.jsx`
- `frontend/src/utils/seo.js`

## Compatibility aliases added

- Backend model module: `Lead` aliases `SalesProspect`; `LeadStatus` aliases `ProspectStatus`.
- Frontend sales API: `getLeads`, `getLead`, `createLead`, `bulkUploadLeads`,
  `previewBulkUploadLeads`, `updateLead`, `updateLeadForm`, `getDuplicateLeads`,
  `mergeLeads`, and `getLeadReport` alias existing Prospect-named methods.
- Existing Prospect-named imports and methods remain available temporarily.

## Preserved compatibility contracts

These names remain intentionally unchanged because changing them would alter DB schema,
API behavior, persisted events, URLs, or client cache behavior:

- MongoDB collection `sales_prospects` and field `prospect_name`.
- REST paths under `/api/v1/sales/prospects` and legacy frontend `/sales/prospects` routes.
- Response keys including `prospects`, `prospect_name`, `prospect_count`, and related metrics.
- Persisted event identifiers including `sales_prospect`, `crm_prospect`, and `crm_lead`.
- Existing query-cache keys, CSV import field names, filenames, and Python import paths.

## Manual review

- Plan a versioned API migration before introducing `/sales/leads` or Lead-named response keys.
- Plan a data migration before renaming `sales_prospects`, `prospect_name`, or event discriminators.
- Decide deprecation window for Prospect-named frontend API methods and backend model aliases.
- Review API error text, OpenAPI tags, CSV export headings/filenames, generated API/schema docs,
  historical audits, seed scripts, and tests when a versioned contract migration is approved.
- `app.models` already exports `Lead` as a user-role model, so the business-entity alias is
  intentionally scoped to `app.models.sales_prospect` until that namespace collision is resolved.
