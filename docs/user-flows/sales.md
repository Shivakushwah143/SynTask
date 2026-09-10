**# Sales User Flows**

**## Sales Overview**

\`\`\`mermaid

flowchart TD

  A[Authenticated user with sales access] --> B[/sales/dashboard]

  B --> C[/sales/contacts]

  B --> D[/sales/prospects]

  B --> E[/sales/pipeline]

  B --> F[/sales/reports]

  B --> G[/sales/settings]

\`\`\`

**## Sales Overview Dashboard (**\`/sales-overview\`**)**

\- How the user reaches it: the sidebar **\*\*Sales\*\*** link and the in-page Sales Overview tab (see \`sidebar-overview\.md\`) — \`frontend/src/pages/sales/SalesOverview\.jsx\`.

\- What they can do: see a compact daily brief (high-priority leads, proposals pending, calls/meetings, follow-ups due), a Stage Momentum strip at the top with one card per pipeline stage (stage name + live lead count, linking to that stage's board), a KPI grid (today's leads/calls/meetings, follow-ups, proposals, revenue closed, conversion rate, monthly target), follow-ups due today, today's activity, quick actions, and a spotlight of won-deal highlights. Every metric is computed from live data; unavailable values render as "—".

\- Layout: compact by design — slim hero, stage cards (one per journey stage) and a 2×4 KPI grid (4 tiles per row, 2 columns on small screens) with every label and value kept fully visible, and the content grid stacks on narrow viewports so the dashboard fits without excessive scrolling.

\- Backend APIs called: \`GET /api/v1/crm/dashboard\` (sales overview), \`GET /api/v1/crm/pipeline\` (board), \`GET /api/v1/crm/activities\`.

**## Sales Dashboard**

\- How the user reaches it: \`/sales\` or module navigation.

\- What they can do: inspect sales overview and jump to sales workspaces.

\- What happens after every action: route navigation or filter changes trigger the corresponding list/dashboard fetch.

\- Backend APIs called: \`GET /api/v1/sales/dashboard\`

\- Timeline events created: none directly.

\- Notifications sent: none directly.

\- Related modules updated: Prospect, Contact, Pipeline, Reports.

**## Sales Contacts**

\- How the user reaches it: sales dashboard/sidebar or \`/sales/contacts\`.

\- What they can do: list, create, edit, delete contacts; open contact detail.

\- What happens after every action: CRUD mutations refresh the list/detail.

\- Backend APIs called: \`GET/POST/PUT/DELETE /api/v1/sales/contacts\`

\- Timeline events created: contact updates may be reflected in CRM timeline if the backend emits activity events.

\- Notifications sent: none explicitly in the frontend.

\- Related modules updated: CRM Contacts, Company Workspace.

**## Sales Prospects**

\- How the user reaches it: sales dashboard/sidebar or \`/sales/prospects\`.

\- What they can do: list prospects, create prospects, edit prospects, bulk upload, open detail.

\- What happens after every action: list updates, stage updates, and detail screens refresh the prospect record. Manual create requires a phone number but allows duplicate phones so duplicate management can review and merge them later.

\- Role access: creating and bulk-importing leads is open to **\*\*every authenticated role\*\*** (including Employee) — the backend no longer gates \`POST /sales/prospects\`, \`POST /sales/prospects/bulk-upload\`, \`POST /sales/prospects/bulk-upload/preview\`, or \`POST /sales/prospects/imports/{id}/retry\` by role; the UI exposes the Add Lead/Import buttons and the \`/bulk-leads\` page to all roles (module gate \`sales\_crm\` still applies, and company/tenant scoping is preserved).

\- Backend APIs called: \`GET/POST/PUT /api/v1/sales/prospects\`, bulk upload, search/contact helpers.

\- Timeline events created: prospect lifecycle events should flow into CRM activity/timeline if backend emits them.

\- Notifications sent: none explicitly in the frontend.

\- Related modules updated: CRM Pipeline, Lead Workspace, Activities.

**## Sales Pipeline**

\- How the user reaches it: sales sidebar or \`/sales/pipeline\`.

\- What they can do: drag prospects between stages and schedule follow-ups for active sales-stage leads.

\- What happens after every action: the board updates and the prospect stage is persisted.

\- Follow-up assignment: \`POST/PATCH /api/v1/sales/prospects/{lead\_id}/follow-ups\` accepts active same-company Admin, Sub Admin, Manager, Lead, and Employee assignees. Employee users can schedule only self-assigned follow-ups on leads they own. Changing the follow-up assignee also updates the lead owner (\`assigned\_to\`), the scheduled task payload, and the linked CRM activity owner.

\- Backend APIs called: sales prospect read/update APIs, stage data, and sales follow-up APIs.

\- Timeline events created: stage updates and scheduled follow-up activity should be surfaced in activity/timeline where configured.

\- Lead notes: every pipeline row and board card exposes a **Notes** button that opens a popover listing all comments for that lead. Comments are lead-scoped, never stage-scoped, so every stage shows the same full thread for the lead. Each entry shows the author and a creation date/time label, long comments collapse to a single line with an ellipsis and a **Show more**/**Show less** toggle, and the popover composer adds new comments via \`GET/POST /api/v1/crm/leads/{lead\_id}/notes\`. Notes added from the pipeline also appear in the lead workspace Notes tab.

\- Notifications sent: none directly.

\- Related modules updated: CRM Pipeline, Lead Timeline, Reports.

**## Discovery & Audit Workspace**

\- How the user reaches it: open an existing lead from the CRM pipeline or lead list, then use the lead workspace tabs **\*\*Discovery\*\*** and **\*\*Audit\*\***. Sales navigation, lead header, journey tracker, follow-up action, and Documents/Proposal tabs remain in place.

\- Data ownership: the existing \`SalesProspect\` remains the Sales lead source of truth. Large pre-conversion workspace data is stored once per tenant+lead in \`sales\_discoveries\` and \`sales\_audits\`; numeric budget, primary decision-maker name, and primary timeline sync back to the existing lead fields so quotation gates and pipeline validation keep one authoritative value.

\- Discovery behavior: supports draft/in-progress/completed status, partial saves, an editable checklist with selectable default items plus user-added/removable custom items, business information, current marketing, pain points, goals, budget context, decision maker, competitors, timeline, and summary. Completing Discovery returns structured \`DISCOVERY\_COMPLETION\_BLOCKED\` validation if business information, primary problem, primary goal, budget status, or decision-maker data is missing; the workspace keeps the summary warning and highlights the specific missing fields in red with inline helper text. When Discovery completes, the lead's Discovery outcome and visible stage status automatically become \`need\_audit\`.

\- Audit behavior: supports draft/in-progress/completed status, manual \`audit\_source\` with future \`ai\`/\`hybrid\` compatibility, visible quotation prerequisite fields for business/customer identity, primary problem, and primary business goal, website/GBP/social/SEO/competitor/SWOT sections, an editable findings checklist with selectable default items plus user-added/removable custom items behind an Edit control, and recommendation cards. Audit action buttons show a clear "Complete Discovery first" popup while Discovery is not completed; backend completion and quotation-generation endpoints enforce the same rule when a Discovery workspace exists. Completing Audit also requires at least one recommendation marked \`include\_in\_proposal\`; when Audit completes, the lead's Discovery outcome and visible stage status automatically become \`need\_proposal\`.

\- Quotation generation: **\*\*Generate Quotation Draft\*\*** appears in the lead **\*\*Audit\*\*** tab after the recommendation section, and lead-list/pipeline actions expose a **\*\*Quotation\*\*** shortcut for leads in Discovery or Proposal stages that opens the same Audit tab. The frontend saves the current Audit draft and the visible quotation prerequisite fields before calling \`POST /api/v1/crm/leads/{lead\_id}/quotation-drafts/from-discovery-audit\`, so changed problem, goal, and recommendation values are used immediately. The backend verifies tenant/lead access, loads Discovery and Audit, validates minimum business identity/problem/goal/recommendation data, falls back to existing lead identity/problem/goal/product selections when the Discovery/Audit workspace is incomplete, maps included recommendations and selected lead products to existing \`sales\_products\`, and creates a normal \`crm\_documents\` quotation with status \`draft\`. Generating the draft records the Discovery outcome as \`need\_proposal\`; if the lead is still in Discovery, the UI shows a success modal with **\*\*Move to Proposal\*\*** and **\*\*Stay in Audit\*\*** instead of navigating into a locked Proposal tab. Adjacent previous-stage movement stays in the lead stage controller/sidebar, where it uses the same backend transition validation and required-details popup as the normal lead movement controls. Unmapped recommendations are returned with "Recommended service is not mapped to a Sales Product" and are treated as pricing-required lines; a quotation with unresolved required pricing cannot be sent or shared. Pricing starts at the matched Sales Product rate or \`0\` for unmapped services; budget is stored as context only and never becomes price automatically.

\- Proposal, Negotiation, and Agreement workspaces: Lead workspace navigation has two bars: always-available sections (Overview, Documents, Activity, Notes, Tasks, Meetings, Emails, Files, Calls, Stage History, AI) and stage-specific workspaces (Discovery, Audit, Proposal, Negotiation, Agreement). Stage-specific future workspaces stay visible but locked with a user-safe message until the lead reaches the required sales stage. The **\*\*Proposal\*\*** workspace manages quotation documents directly, and quotation status changes synchronize \`proposal\_status\` on the server. Once \`proposal\_status = accepted\`, moving to **\*\*Negotiation\*\*** unlocks and focuses the Negotiation tab, leaves Proposal accessible as history, and keeps Agreement locked. The **\*\*Negotiation\*\*** workspace appears between Proposal and Agreement, unlocks only when the lead reaches \`negotiation\`, shows accepted quotation/commercial context when available, and lets authorized users manually edit \`negotiation\_status\`, counter offer, final amount, discount, final scope, payment terms, delivery timeline, client conditions, notes, and next follow-up through \`GET/PATCH /api/v1/crm/leads/{lead\_id}/negotiation\`. Existing equivalent fields stay on \`SalesProspect\` (\`negotiation\_status\`, \`negotiation\_notes\`, \`won\_amount\` for final agreed amount, \`timeline\` for delivery timeline, \`next\_follow\_up\_at\` for next follow-up); negotiation-only terms use first-class lead fields (\`customer\_counter\_offer\`, \`discount\`, \`final\_scope\`, \`payment\_terms\`, \`client\_conditions\`, \`accepted\_quotation\_reference\`). Negotiation saves write normal lead activity events such as Negotiation started, Counter offer recorded, Final offer recorded, Negotiation accepted/rejected, and Moved to Agreement; status suggestions may set \`waiting\_internal\` or \`final\_offer\` for obvious saves, but authorized users can still manually select any valid Negotiation inner status. Tenant isolation is preserved through \`company\_id\`, and ownership access is enforced. The **\*\*Agreement\*\*** workspace manages contract documents directly; it opens only after \`negotiation\_status = accepted\`, and its contract builder prefills from the accepted quotation plus Negotiation final terms, with negotiated amount, discount, scope, payment terms, delivery timeline, and client conditions overriding stale quotation values where the existing contract form supports them. Contract acceptance synchronizes \`agreement\_status = signed\` on the server. Salespeople do not manually mark Proposal Accepted or Agreement Signed through the generic stage-status selector.

\- Documents repository: The **\*\*Documents\*\*** tab remains the lead's central document history for quotations, revisions, contracts, and uploaded PDFs. Workflow creation normally starts in Proposal or Agreement, while Documents provides artifact review, PDF preview/download, secure link generation/revocation, and history. Uploaded PDFs require an explicit type (\`quotation\` or \`contract\`); the original uploaded PDF is preserved and is not replaced by generated PDF actions.

\- Snapshot rules: generated quotation documents include \`content\_snapshot.source\_snapshot.generated\_from\` with Discovery/Audit ids, versions, and update timestamps plus the captured Discovery/Audit data. Later Discovery/Audit changes do not mutate sent, accepted, or historical quotation documents. Contracts continue to be created from the accepted quotation document snapshot through the existing CRM document contract action.

\- Activity timeline: Discovery started/updated/completed, Audit started/updated/completed, Recommendation added, Quotation draft generated, Negotiation started, counter/final offer updates, Negotiation accepted/rejected, and Agreement movement events are written through the existing CRM activity path.

\- Tenant and permission rules: APIs enforce lead access using the existing ownership fields (\`assigned\_to\`, \`assigned\_by\`, \`created\_by\`) and same-company document/product queries. Public quotation/contract tokens store only secure hashes server-side, respect expiry/revocation, and record document events with IP/user-agent where available. Super Admin, Admin, Sub Admin, Manager, Lead, and Employee users follow existing Sales access conventions; Employees remain constrained by lead ownership access.

\- Related modules updated: CRM Lead Workspace, CRM Documents, Sales Products, Lead Activity Timeline, Follow-ups/Calendar via the existing schedule follow-up action.

**## Sales Reports**

\- How the user reaches it: \`/sales/reports\`.

\- What they can do: inspect report views and review analytics.

\- What happens after every action: report filters refetch data.

\- Backend APIs called: sales report endpoints.

\- Timeline events created: none directly.

\- Notifications sent: none directly.

\- Related modules updated: CRM Reports.

**## Sales Settings**

\- How the user reaches it: \`/sales/settings\`.

\- What they can do: manage stages, tags, channels, categories, products. Admin, Sub Admin, Manager, Lead, and Super Admin users with sales module access can create and update categories and products for their permitted tenant scope.

\- What happens after every action: configuration lists refresh after CRUD mutations.

\- Backend APIs called:

  - \`GET/POST /api/v1/sales/masters/stages\`

  - \`GET/POST /api/v1/sales/masters/tags\`

  - \`GET/POST /api/v1/sales/masters/channels\`

  - \`GET/POST /api/v1/sales/categories\`

  - \`GET/POST /api/v1/sales/products\`

\- Timeline events created: generally not yet consistent.

\- Notifications sent: none directly.

\- Related modules updated: CRM Settings, Pipeline, Reports.

**## Guided Stage-Transition Validation**

\- How the user reaches it: any stage-movement action (pipeline board move, stage table row action, lead-detail "Move to next stage" button, Won-to-Clients transfer).

\- What they can do: attempt a transition even when the lead is not ready. The backend returns a structured \`STAGE\_TRANSITION\_BLOCKED\` response (\`detail\` object with \`code\`, \`severity: warning\`, \`current\_stage\`, \`target\_stage\`, \`message\`, \`missing\_fields\`, \`status\_requirement\`, \`action\_requirement\`). The frontend classifies every blocker through the shared \`classifyTransitionFailure\` utility (\`frontend/src/utils/salesTransition.js\`) so every entry point behaves identically:

  - \`MISSING\_DETAILS\` — opens the shared \`StageRequirementsDialog\` (\`frontend/src/components/sales/StageRequirementsDialog.jsx\`) with only the missing editable fields (budget, decision maker, timeline, discovery outcome, qualification status, negotiation status, won status, account manager). The pipeline page refreshes the lead from the API before opening the popup, and the popup itself drops any field the lead already carries — so it never re-asks for a value that is already saved (e.g. only Budget is asked when Decision Maker already exists). Save Details persists them through the existing lead-update API and keeps the lead on its current stage; Save and Move Forward persists and re-runs the transition. Proposal/Acceptance and Agreement/Signed are never editable in the popup (domain-owned / signature-verified) — they fall back to a safe warning list.

  - \`STATUS\_REQUIREMENT\` or \`ACTION\_REQUIREMENT\` — opens the same popup with the amber warning plus context actions. Proposal, Negotiation, Agreement, and Discovery blockers link directly to the matching lead workspace tab; first-contact blockers open the contact-attempt dialog; stage-sequence blockers link to the required pipeline stage. The backend requirement is still enforced; the popup only routes the user to the correct completion surface and never auto-changes domain-owned statuses or skips stages.

  - \`PERMISSION\_DENIED\` — access warning without exposing security details.

  - \`TECHNICAL\_ERROR\` — regular error toast (network/server/database failures).

\- Sequential stage gates (enforced in \`backend/app/crm/pipeline.py\`, mirrored by the lead-detail checklist): Acquire → Qualify needs a first contact or mobile number; Qualify → Discovery needs an Interested/Qualified status plus budget and decision maker — a recorded deal value (\`won\_amount\` — the lead-detail header "Deal value" edit — or legacy \`deal\_value\`) also satisfies the budget requirement, so a lead with a deal size entered through either edit surface is never asked to fill a separate Budget field; the pipeline board also reads \`budget\` directly for the Value column, skips zero-valued deal fields so an empty "Deal value" save (\`won\_amount = 0\`) can never shadow a real Budget, refreshes the board on a 30s staleTime instead of 5 minutes, and invalidates its cache when the lead workspace saves, so edits appear immediately; Discovery → Proposal needs a Discovery outcome of \`need\_proposal\` **\*\*or\*\*** \`qualified\` (both earn a proposal — a \`qualified\` outcome is never blocked, the reported regression); Proposal → Negotiation needs \`proposal\_status = accepted\`; Negotiation → Agreement needs \`negotiation\_status = accepted\`; Agreement → Won needs \`agreement\_status = signed\`. When a status is missing, the blocker returns \`status\_requirement.allowed\_values\` listing every accepted value (e.g. \`["need\_proposal", "qualified"]\`) and the frontend shows an amber warning listing them.

\- Business validation blockers (HTTP 400 with structured or legacy detail) surface as warnings, never red errors, and never produce duplicate toasts alongside the popup.

\- What happens after every action: a successful save refreshes the lead and pipeline queries; the lead moves only after the backend confirms every rule.

\- Backend APIs called:

  - \`PATCH /api/v1/crm/pipeline/{lead\_id}/stage\` (returns structured blocker details on 400)

  - \`POST /api/v1/crm/pipeline/{lead\_id}/transfer\` (structured blockers for handoff requirements)

  - \`PUT /api/v1/sales/prospects/{lead\_id}\` (popup saves)

  - \`PATCH /api/v1/crm/pipeline/{lead\_id}/conversion\` (account-manager assignment + \`create\_client\` from the popup)

\- Timeline events created: only for successful status/stage changes; a failed transition is not recorded as a move.

\- Notifications sent: none directly.

\- Related modules updated: Pipeline, Lead Workspace, Clients transfer.

**## Record Contact Attempt (Acquire)**

\- How the user reaches it: a "Record contact" button on Acquire-stage table rows / board cards (shown only while the lead has no contact evidence), or the same action in the card's "More actions" menu.

\- What they can do: pick a method (Call / Email / WhatsApp / Other), add optional notes, and save. The action creates a real call/email activity (\`POST /api/v1/crm/activities\`) and backfills \`last\_contacted\_at\` through \`PUT /api/v1/sales/prospects/{lead\_id}\` — the backend auto-fills \`first\_contact\_at\` from \`last\_contacted\_at\`, so no fake history is created.

\- First-contact gate: a lead may move Acquire → Qualify when \`first\_contact\_at\` OR \`last\_contacted\_at\` is set, when a completed/in-progress call, email, follow-up, or meeting activity exists on the lead, OR when the lead already carries a mobile number (\`phone\`). Imported/CSV leads with a number are therefore never blocked by a missing gate field — the recorded phone is treated as contact evidence.

\- If the lead has no phone and no contact evidence, the blocker returns \`missing\_fields: [phone]\` (plus the first-contact action requirement), so the shared required-details popup opens with a Mobile Number field and a separate Country Code selector (defaulting to +91, select-only so digits can never be typed into it by mistake). The phone input is clamped to 10 digits and splits pasted numbers with a country prefix (\`parsePhonePaste\`); Save/Save-and-Move are blocked with an inline error while the phone is empty or invalid, so a misleading "Details saved" toast is never shown for an unsaved number. Saving the phone through the popup records it via \`PUT /api/v1/sales/prospects/{lead\_id}\` — which also persists \`country\_code\` — and the lead may then move to Qualify.

\- Timeline events created: the activity record and the pipeline history entry on the eventual move.

\- Related modules updated: Pipeline, Activities, Lead Workspace.

**## Acquire inner status: an assigned lead is Assigned**

\- How the user sees it: the Acquire stage list / board Status column (and the lead-detail "Inner status" pill) must read \`Assigned\` whenever the lead has an owner — never the generic \`New\`/\`Imported\` intake defaults (the reported bug: assigned leads showing "New").

\- What enforces it:

  - Read-time: \`resolved\_stage\_status\` (\`backend/app/crm/pipeline.py\`) resolves an owned Acquire lead whose stored status is empty, \`new\`, or \`imported\` to \`assigned\` — covering pre-existing leads without a migration.

  - Write-time: \`LeadEngine.\_promote\_assignment\_status\` (\`backend/app/crm/lead\_engine.py\`) persists \`assigned\` when a lead is created or CSV/Excel-imported with an owner (creation always assigns through the least-loaded strategy); the existing lead-update path already promotes on owner reassignment.

\- Explicit non-default statuses (\`duplicate\`, \`spam\`) are preserved — ownership never overrides a deliberate flag.

\- Acquire also exposes the intake contact progression — \`Not Contacted\`, \`Contacted\`, \`Wrong Number\`, and \`No Response\` (added to \`STAGE\_INNER\_STATUSES["acquire"]\` per user feedback while Qualify keeps the same contact-outcome labels; config in \`backend/app/crm/pipeline.py\`, mirrored in \`frontend/src/pages/crm/pipeline/utils.js\`) — so intake leads can be marked contacted, wrong-number, or unresponsive without moving them to Qualify first.

\- The stage list Owner column resolves the assigned user from the live users list by id (same as the board cards), so a stale serialized \`owner\_name\` or an id-shaped value can never surface as wrong Owner detail.

**## Budget / Deal value stays in sync with the lead detail page**

\- How the user sees it: the pipeline Value column must always match the Budget shown on the lead-detail overview — no more sporadic "Rs 0" next to a lead that clearly has a budget saved (the reported bug: value looked right sometimes and 0 other times, and the move popup re-asked for Budget already saved on the detail page).

\- What changed:

  - Zero-shadowing: \`getLeadDealValue\` (\`frontend/src/pages/crm/pipeline/utils.js\`) skips zero-valued deal fields for open leads. The lead-detail header "Deal value" edit writes \`won\_amount\` (an empty save stores \`0\`), while the overview writes \`budget\` — so a real Budget can never be hidden by a stray \`won\_amount = 0\`. Once a lead closes (Won/Lost), \`won\_amount\` is authoritative even at \`0\` (a deal that closed at 0 reports 0, never the pre-close budget).

  - Cache freshness: the pipeline board query uses a 30s \`staleTime\` (was 5 minutes) and is invalidated on lead-workspace saves, so an edit made on the detail page shows on the board without manual re-navigation.

  - CSV/Excel import: the \`budget\`, \`timeline\`, \`decision\_maker\`, \`industry\`, \`requirement\`, \`location\`, \`pain\_points\`, and deal-size columns (\`won amount\` / \`deal value\` / \`value\` / \`amount\` → \`won\_amount\`) map onto the real lead fields (\`LeadEngine.normalize\_import\_row\` + the import constructor) instead of being dumped into \`custom\_fields\` — imported budgets and deal values now appear in the Value column and satisfy the Qualify → Discovery gate like any manually entered value.

**## Won → Clients: Two-Step Conversion with Inline Completion**

**Won** and **Transferred** are separate states. Moving a lead to Won closes the sales deal and keeps the lead permanently visible in Sales → Won. Client handoff is a subsequent, explicit transfer action, but the transfer UI can complete missing handoff records inline so the user does not have to leave the flow.

**### Won stage (sales closed)**

\- How the user reaches it: the pipeline stage move (Agreement → Won), the lead-detail "Move to Won" button, or `PUT /api/v1/sales/prospects` with `status=won` / `current_stage=won` for compatibility.

\- What the backend does: sets `current_stage=Won`, `status=won`, `closed_date`, `won_amount`, and `converted_at`, then runs the idempotent won-deal automation to create or reuse the same-tenant Client and Project. Existing Client/Project references are reused rather than duplicated, stale Client links can be repaired, generated Projects are linked to the actual lead id, and a pre-existing onboarding Project with the generated `ONB-{lead-prefix}` id is reused when applicable.

\- Conversion readiness: when Client/Project provisioning succeeds, `client_id` and `project_id` are stored and the Won lead becomes ready for handoff. When provisioning is incomplete or fails, the lead remains Won with a pending/failed transfer state so the user can retry rather than losing the closed Sales record.

\- **Won leads remain visible in Sales → Won at all times**, before and after Client transfer. The Won stage shows the handoff state through badges such as `Transfer Pending`, `Transfer Failed`, `Ready`, or `Transferred` as supported by the current backend/UI status mapping.

**### Transfer to Clients (handoff)**

\- How the user reaches it: the **Transfer to Client** action on a Won lead, the guided Won-to-Clients transfer popup, or `POST /api/v1/crm/pipeline/{lead_id}/transfer`.

\- What they can do: complete the Client handoff as a separate idempotent action. The transfer path validates tenant/company ownership and Won state, creates or reuses the Client through the canonical conversion service when required, and records the transfer on the lead with `won_status=transferred`, `transferred_at`, and `transferred_by`.

\- Inline completion: if the transfer is blocked because handoff records are incomplete, the required-details popup exposes the Account Manager selector and a **Create Client** / **Retry Transfer** action instead of only showing a warning. The create/retry action re-runs the idempotent won-deal conversion, reuses existing Client/Project references, refreshes the lead, and re-evaluates the transfer requirements. Because the user already initiated Transfer, the same flow may immediately re-attempt the transfer after the missing Client relationship is repaired; the popup closes only after the transfer succeeds or remains open with the exact blocker/error.

\- Existing Client reuse: if the Won lead already has a valid same-tenant `client_id`, the transfer path reuses it. If the Client is recoverable through `source_lead_id` or another canonical same-tenant relationship, the relationship is repaired without creating a duplicate.

\- Retry behavior: when the transfer is pending/failed or `client_id` is missing/stale, the UI shows **Retry Transfer**. Retrying uses the canonical conversion/transfer service and is safe to repeat because Client and Project creation are idempotent.

\- Non-manager and prerequisite rules remain backend-owned. Where the current transfer policy requires a ready Won state, Account Manager, or other handoff data, the frontend cannot bypass it; it only guides the user to complete the missing requirement.

\- **The lead remains in Sales → Won after transfer** — it is never removed, archived, or hidden merely because a Client was created. The same business relationship legitimately appears in two perspectives: Sales → Won as the closed-deal/history record, and Clients as the post-sales operational relationship.

**### Compatibility path**

\- If an older sales form or bulk edit marks a lead with `status=won` or `current_stage=won` through the Sales Prospect update API instead of the pipeline stage API, the backend still normalizes the lead into Won and runs the same Client conversion/provisioning logic. The lead remains visible in Won regardless of whether Client handoff is already complete.

\- A compatibility-path conversion error must be surfaced clearly to the caller/UI and must never silently leave the user believing transfer succeeded. The closed Won record and its transfer state remain recoverable so **Retry Transfer** can complete the handoff.

\- Missing or stale lead `client_id` references are repaired by the conversion service; generated Projects are linked to the actual lead id; pre-existing onboarding Projects with the generated `ONB-{lead-prefix}` id are reused instead of duplicated.

**### Backend APIs called**

\- `PATCH /api/v1/crm/pipeline/{lead_id}/stage` (move to Won)

\- `PATCH /api/v1/crm/pipeline/{lead_id}/conversion` (actions such as `create_client`, Won-status preparation, and `transfer_to_clients` where supported)

\- `POST /api/v1/crm/pipeline/{lead_id}/transfer` (perform/confirm Client handoff and mark transferred)

**### Related modules updated**

Pipeline, Clients, Projects, Invoices, Lead Workspace.


**## Pipeline load resilience (dirty legacy data)**

\- How it affects the user: previously one legacy lead with an invalid \`email\` value (e.g. \`vghygcvghgv\`) made the whole pipeline board return 500, because the model validated \`email\` as \`EmailStr\` at read time.

\- What changed: \`SalesProspect.email\` is now a plain optional string, and \`load\_pipeline\` fetches documents through a resilient per-document validation (\`\_fetch\_prospects\_resilient\`) that skips invalid legacy records instead of crashing the board (a warning log names the cleanup script). Write paths (create, update, CSV import) sanitize email via \`LeadEngine.\_sanitize\_email\`, so invalid values are stored as \`None\`.

\- Cleanup: run \`backend/scripts/cleanup\_invalid\_lead\_emails.py\` once to clear existing dirty values (it only clears invalid emails, never deletes leads or other fields).

\- Related modules updated: Pipeline, Leads API, import.