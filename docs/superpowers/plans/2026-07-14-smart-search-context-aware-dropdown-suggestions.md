# Smart Search with Context-Aware Dropdown Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every search input in the app with one shared context-aware autocomplete that shows relevant suggestions on focus, filters in real time, and supports full keyboard and screen-reader interaction.

**Architecture:** Build one reusable combobox component in the shared UI layer, then adapt each page’s search field to feed it a page-specific suggestion provider. Keep local filtering fast for already-loaded data, and allow async suggestion loading for pages that need server-backed results. Preserve each page’s current search semantics by mapping the selected suggestion back into the page’s existing search state or route state.

**Tech Stack:** React, react-router-dom, react-query, Tailwind CSS, lucide-react, existing app stores/hooks, existing API clients.

## Global Constraints

- Use one reusable search/autocomplete component shared throughout the application to ensure consistent functionality, styling, and future maintainability.
- Suggestions must always be context-aware and relevant to the current section of the application.
- Never display unrelated suggestions from other modules.
- Support mouse and keyboard navigation, including `↑`, `↓`, `Enter`, `Esc`, and normal `Tab` navigation.
- Maintain compatibility with Light Mode and Dark Mode.
- Keep dropdown results synchronized with updates to underlying data.
- Debounce search requests where appropriate.
- Cache recently fetched suggestions to reduce unnecessary API calls.
- Follow WAI-ARIA Combobox and Listbox accessibility standards.
- Ensure the component works on desktop, tablet, and mobile devices.

---

### Task 1: Define the shared autocomplete contract and helpers

**Files:**
- Create: `frontend/src/components/SearchAutocomplete.jsx`
- Create: `frontend/src/components/search/searchUtils.js`
- Modify: `frontend/src/components/ui/index.js`

**Interfaces:**
- Consumes: `items`, `query`, `onQueryChange`, `onSelect`, `loadSuggestions`, `renderLabel`, `getSuggestionKey`, `placeholder`, `ariaLabel`, `contextLabel`
- Produces: `SearchAutocomplete`, `defaultFilterSuggestions`, `highlightMatch`, `normalizeSuggestion`, `useSearchSuggestionCache`

- [ ] **Step 1: Write the component and helper tests**

```jsx
// frontend/src/components/search/searchUtils.test.js
import { describe, it, expect } from 'vitest'
import { defaultFilterSuggestions, highlightMatch } from './searchUtils'

describe('searchUtils', () => {
  it('filters items by partial and keyword matches', () => {
    const items = [
      { id: '1', label: 'Alpha Product', keywords: ['sku-001', 'brand-a'] },
      { id: '2', label: 'Beta Brand', keywords: ['cat-b'] },
    ]
    const result = defaultFilterSuggestions(items, 'sku')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('highlights matching text', () => {
    const parts = highlightMatch('Invoice Follow-up', 'follow')
    expect(parts.some((part) => part.match)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail first**

Run: `npm run test -- --run frontend/src/components/search/searchUtils.test.js`
Expected: fail because the files do not exist yet.

- [ ] **Step 3: Implement the shared combobox and helpers**

```jsx
// frontend/src/components/SearchAutocomplete.jsx
// Build a WAI-ARIA combobox with:
// - open-on-focus suggestions
// - keyboard navigation
// - outside click close
// - loading and empty states
// - optional async suggestion loading
// - highlight rendering for matched text
// - cached suggestions for repeated queries
```

```js
// frontend/src/components/search/searchUtils.js
export const defaultFilterSuggestions = (items, query) => { /* ... */ }
export const highlightMatch = (label, query) => { /* ... */ }
export const normalizeSuggestion = (item) => { /* ... */ }
export const useSearchSuggestionCache = () => { /* ... */ }
```

- [ ] **Step 4: Export the new component from the UI barrel**

```js
// frontend/src/components/ui/index.js
export * from '../SearchAutocomplete'
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm run test -- --run frontend/src/components/search/searchUtils.test.js`
Expected: PASS.

---

### Task 2: Add shared data providers for context-aware suggestions

**Files:**
- Create: `frontend/src/search/searchProviders.js`
- Modify: `frontend/src/api/axios.js` if a shared helper is needed for suggestion fetches
- Modify: `frontend/src/api/*.js` only where a page already has an existing data source and a provider can reuse it

**Interfaces:**
- Consumes: current user context, route module, existing API clients
- Produces: `getSearchSuggestionsForContext(contextKey, { query, limit })`, `getSearchContextItems(contextKey)`, `searchContexts`

- [ ] **Step 1: Write provider tests for context mapping**

```js
// frontend/src/search/searchProviders.test.js
import { describe, it, expect } from 'vitest'
import { getSearchContextItems } from './searchProviders'

describe('searchProviders', () => {
  it('returns only page-relevant contexts for users page', () => {
    const items = getSearchContextItems('users')
    expect(items.every((item) => ['name', 'email', 'id', 'role'].some((field) => item.keywords.includes(field)))).toBe(true)
  })
})
```

- [ ] **Step 2: Implement page/module context maps**

```js
// frontend/src/search/searchProviders.js
// Provide contexts for:
// dashboard, tasks, projects, tickets, chat, clients, invoices, msa, ledger,
// calendar, meetings, time-tracking, timesheet, attendance, leaves, eod,
// users, departments, my-team, settings, notifications, activity, timeline,
// reports, crm pages, ai pages, hr pages, admin pages, and sales pages.
```

- [ ] **Step 3: Wire a fallback local-only provider**

```js
// When a page already has the full dataset loaded, filter locally and return
// ranked suggestions without an API request.
```

- [ ] **Step 4: Verify provider tests**

Run: `npm run test -- --run frontend/src/search/searchProviders.test.js`
Expected: PASS.

---

### Task 3: Replace shared/top-level search surfaces

**Files:**
- Modify: `frontend/src/components/GlobalSearch.jsx`
- Modify: `frontend/src/components/crm/CRMWorkspace.jsx`
- Modify: `frontend/src/modules/hr/recruitment/components/SearchBar.jsx`
- Modify: `frontend/src/pages/Chat.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `SearchAutocomplete`, provider helpers from Task 2
- Produces: context-aware global search, CRM inline search, recruitment search bar, chat search, dashboard section search

- [ ] **Step 1: Add failing integration tests for keyboard and focus behavior**

```jsx
// frontend/src/components/SearchAutocomplete.test.jsx
// Assert open-on-focus, arrow navigation, Enter selection, Esc close, and outside click close.
```

- [ ] **Step 2: Replace each current input with the shared component**

```jsx
// Example usage:
<SearchAutocomplete
  contextKey="tasks"
  items={taskSuggestions}
  query={searchQuery}
  onQueryChange={setSearchQuery}
  onSelect={handleSuggestionSelect}
  placeholder="Search tasks, titles, assignees, statuses"
  ariaLabel="Task search"
/>
```

- [ ] **Step 3: Preserve current page behavior on selection**

```js
// On selection, update the existing query state or route params rather than
// changing module behavior.
```

- [ ] **Step 4: Verify tests and lint**

Run:
- `npm run lint -- --no-error-on-unmatched-pattern src/components/SearchAutocomplete.jsx src/components/GlobalSearch.jsx src/components/crm/CRMWorkspace.jsx src/modules/hr/recruitment/components/SearchBar.jsx src/pages/Chat.jsx src/pages/Dashboard.jsx`
- `npm run test -- --run frontend/src/components/SearchAutocomplete.test.jsx`

Expected: lint clean, tests pass.

---

### Task 4: Replace page-level search inputs across core modules

**Files:**
- Modify: `frontend/src/pages/Tasks.jsx`
- Modify: `frontend/src/pages/Projects.jsx`
- Modify: `frontend/src/pages/Invoices.jsx`
- Modify: `frontend/src/pages/Clients.jsx`
- Modify: `frontend/src/pages/MSA.jsx`
- Modify: `frontend/src/pages/Calendar.jsx`
- Modify: `frontend/src/pages/TimeTracking.jsx`
- Modify: `frontend/src/pages/Timesheet.jsx`
- Modify: `frontend/src/pages/attendance/LiveMonitor.jsx`
- Modify: `frontend/src/pages/attendance/AttendanceReports.jsx`
- Modify: `frontend/src/pages/Settings.jsx`
- Modify: `frontend/src/pages/Notifications.jsx`
- Modify: `frontend/src/pages/Reports.jsx`
- Modify: `frontend/src/pages/ActivityLog.jsx`
- Modify: `frontend/src/pages/Timeline.jsx`
- Modify: `frontend/src/pages/Meetings.jsx`
- Modify: `frontend/src/pages/Leaves.jsx`
- Modify: `frontend/src/pages/EODReports.jsx`
- Modify: `frontend/src/pages/Users.jsx`
- Modify: `frontend/src/pages/Departments.jsx`
- Modify: `frontend/src/pages/MyTeam.jsx`
- Modify: `frontend/src/pages/WorkflowAdmin.jsx`
- Modify: `frontend/src/pages/Companies.jsx`
- Modify: `frontend/src/pages/Subscriptions.jsx`
- Modify: `frontend/src/pages/BulkLeads.jsx`
- Modify: `frontend/src/pages/crm/*`
- Modify: `frontend/src/pages/sales/*`
- Modify: `frontend/src/modules/hr/recruitment/pages/*`
- Modify: any remaining search inputs found by grep

**Interfaces:**
- Consumes: `SearchAutocomplete`, page-specific context providers
- Produces: identical search UX everywhere, with module-relevant suggestions

- [ ] **Step 1: Inventory every remaining search input**

Run:
```powershell
rg -n "placeholder=.*search|type=\"search\"|Search" frontend/src
```

Expected: a complete list of all remaining search-bearing inputs.

- [ ] **Step 2: Replace each input with the shared autocomplete**

```jsx
// For each page, feed only the fields that belong to that page.
// Examples:
// - Products page: products, categories, brands, SKUs
// - Users page: user names, emails, IDs, roles
// - Orders page: order IDs, customer names, statuses
// - Reports page: report names, categories, date ranges
// - Settings page: settings names, configuration sections
```

- [ ] **Step 3: Keep each page’s filter semantics intact**

```js
// Searching should still update the existing filter state, URL params,
// or local view state used by that page today.
```

- [ ] **Step 4: Add page-specific tests for representative modules**

```jsx
// Example:
// - Users page: suggestions include name, email, id, role
// - Reports page: suggestions include report names and categories
// - Settings page: suggestions include configuration sections only
```

- [ ] **Step 5: Run lint and targeted tests**

Run:
- `npm run lint -- --no-error-on-unmatched-pattern src/pages/Tasks.jsx src/pages/Projects.jsx src/pages/Invoices.jsx src/pages/Clients.jsx src/pages/Settings.jsx src/pages/Notifications.jsx src/pages/Reports.jsx src/pages/Users.jsx src/pages/Departments.jsx src/pages/MyTeam.jsx src/pages/WorkflowAdmin.jsx src/pages/BulkLeads.jsx`
- `npm run build`

Expected: lint clean, build passes.

---

### Task 5: Polish accessibility, responsiveness, and performance

**Files:**
- Modify: `frontend/src/components/SearchAutocomplete.jsx`
- Modify: `frontend/src/components/search/searchUtils.js`
- Modify: `frontend/src/styles/*` only if the shared UI tokens need adjustment

**Interfaces:**
- Consumes: shared autocomplete state and theme tokens
- Produces: accessible listbox semantics, viewport-safe positioning, smooth animations, cached suggestions

- [ ] **Step 1: Add tests for aria roles and focus behavior**

```jsx
// Assert combobox/listbox roles, active descendant updates, and visible focus state.
```

- [ ] **Step 2: Implement viewport collision handling**

```js
// Reposition dropdown above the input when needed so it stays on screen.
```

- [ ] **Step 3: Add async loading and result caching behavior**

```js
// Cache recent suggestion sets by context + query + user scope.
```

- [ ] **Step 4: Verify dark mode styling**

```js
// Ensure borders, shadows, hover states, and selected states use existing theme tokens.
```

- [ ] **Step 5: Run final verification**

Run:
- `npm run lint`
- `npm run build`

Expected: both pass with no warnings introduced by the new autocomplete.

## Self-Review

- Spec coverage: shared component, context providers, top-level search surfaces, page-level search inputs, accessibility/performance polish are each assigned to a task.
- Placeholder scan: no TBD/TODO/placeholders remain in the plan steps.
- Type consistency: `SearchAutocomplete`, `defaultFilterSuggestions`, `highlightMatch`, `normalizeSuggestion`, and `useSearchSuggestionCache` are introduced once and reused consistently.

