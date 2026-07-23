# Client Management Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the existing Clients navigation item inside its own Client Management sidebar section.

**Architecture:** Extend the existing data-driven navigation groups in `Sidebar.jsx`; do not create a second route or client module. Verify the rendered sidebar using the existing Vitest/React Testing Library stack.

**Tech Stack:** React 18, React Router, Zustand, Vitest, React Testing Library, Tailwind CSS.

## Global Constraints

- Preserve the existing `/clients` route.
- Preserve the existing Admin-role and `task`-module visibility gates.
- Do not change backend APIs, schemas, tenant scoping, or client-workspace behavior.
- Preserve all unrelated working-tree changes.

---

### Task 1: Render the Client Management navigation group

**Files:**
- Create: `frontend/src/components/Sidebar.test.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: the existing `Clients` navigation item and `navigationGroups` rendering flow.
- Produces: an expandable `client-management` group labeled `Client Management`, containing the `/clients` link for eligible users.

- [ ] **Step 1: Write the failing test**

Create a focused render test that supplies an Admin with the `task` module, renders `Sidebar` in a memory router, and asserts that `Client Management` and the `/clients` link are present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/components/Sidebar.test.jsx`

Expected: FAIL because `Client Management` is absent from the rendered sidebar.

- [ ] **Step 3: Add the minimal navigation group**

Add this group to `navigationGroups`:

```jsx
{
  key: "client-management",
  label: "Client Management",
  items: ["Clients"].map((name) => itemByName[name]).filter(Boolean),
},
```

Add `client-management` entries to the existing group header and dot color maps.

- [ ] **Step 4: Run focused and related verification**

Run: `npm test -- --run src/components/Sidebar.test.jsx`

Expected: PASS.

Run: `npm run build`

Expected: the frontend production build completes successfully.

- [ ] **Step 5: Review documentation impact and commit**

Confirm that the design spec remains accurate and that no API, schema, deployment, or README behavior changed. Commit only the new test, sidebar change, and implementation plan.
