# Remove CRM Workspace Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the shared breadcrumb/title/description header from every CRM department page.

**Architecture:** Change the shared `CRMWorkspace` boundary so every CRM route inherits the removal. Preserve navigation, toolbar, filters, and content rendering, and delete the header-only code that becomes unreachable.

**Tech Stack:** React 18, React Router, Vitest, Testing Library, Vite

## Global Constraints

- Apply the change only to CRM pages using `CRMWorkspace`.
- Preserve CRM navigation, toolbar, filters, sections, cards, and page content.
- Do not change rounded corners elsewhere in the project.

---

### Task 1: Remove the shared CRM header

**Files:**
- Create: `frontend/src/components/crm/CRMWorkspace.test.jsx`
- Modify: `frontend/src/components/crm/CRMWorkspace.jsx`

**Interfaces:**
- Consumes: `CRMWorkspace({ title, description, breadcrumbs, children })`
- Produces: `CRMWorkspace` rendering CRM content without the shared header block

- [ ] **Step 1: Write the failing regression test**

```jsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CRMWorkspace } from './CRMWorkspace'

describe('CRMWorkspace', () => {
  it('does not render the shared CRM page header', () => {
    render(
      <MemoryRouter>
        <CRMWorkspace
          breadcrumbs={[{ label: 'CRM', href: '/crm' }, { label: 'Settings' }]}
          title="Settings"
          description="CRM settings placeholder for workspace configuration."
        >
          <div>CRM settings content</div>
        </CRMWorkspace>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
    expect(screen.queryByText('CRM settings placeholder for workspace configuration.')).not.toBeInTheDocument()
    expect(screen.getByText('CRM settings content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails for the existing header**

Run: `npm test -- src/components/crm/CRMWorkspace.test.jsx`

Expected: FAIL because the `Settings` heading, breadcrumb navigation, and description are currently rendered.

- [ ] **Step 3: Remove the shared header implementation**

In `frontend/src/components/crm/CRMWorkspace.jsx`:

- Change the icon import to `import { Search, Sparkles } from 'lucide-react'`.
- Delete `CRMPageTitle` and `CRMHeader`.
- Delete the `<CRMHeader ... />` render from `CRMWorkspace`.
- Keep the public `CRMWorkspace` props temporarily compatible so existing CRM page call sites require no unrelated edits.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/components/crm/CRMWorkspace.test.jsx`

Expected: PASS with one passing test.

- [ ] **Step 5: Verify no removed symbols remain**

Run: `rg -n "CRMHeader|CRMPageTitle|ChevronRight" frontend/src/components/crm/CRMWorkspace.jsx`

Expected: no output and exit code 1.

- [ ] **Step 6: Run the frontend build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 7: Review the scoped diff**

Run: `git diff --check && git diff -- frontend/src/components/crm/CRMWorkspace.jsx frontend/src/components/crm/CRMWorkspace.test.jsx`

Expected: no whitespace errors; the diff contains only the regression test and centralized header removal.
