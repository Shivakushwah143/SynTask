# SOP Library User Flow

Status: Implemented
Last reviewed: 2026-08-12

## Purpose

The SOP Library is SynTask's in-app user manual. Every authenticated user can open it from the sidebar and learn how to use the SynTask modules available to them.

## Access

- Tenant key: inherited from the authenticated user's company session.
- Authorization rule: the `/sop-library` route is authenticated-only and does not require any normal business module.
- Sidebar rule: `SOP Library` is a core navigation section with no module gate.
- Article visibility: general onboarding SOPs are visible to all authenticated users. Module-specific SOPs are filtered with the same frontend navigation permission helper used by the sidebar, so hidden module docs do not imply module access.
- Negative cross-tenant expectation: SOP content is local static user-manual content and does not fetch tenant records. Reading an SOP cannot expose another tenant's records or grant application access.

## Primary Flow

1. User signs in.
2. User clicks `SOP Library` in the sidebar.
3. SynTask opens `/sop-library`.
4. User searches SOPs or browses module categories.
5. User opens an article such as `/sop-library/work/create-project`.
6. Article shows overview, who can use it, where to find it, before-you-start items, steps, expected result, common issues, and related SOPs.

## Alternate Flows

- Search with no matches shows a safe empty state.
- Unknown category or article route shows a safe not found state.
- Users without module permissions still see the SOP Library, but module categories that match hidden modules are omitted.

## Tests

- `frontend/src/components/Sidebar.test.jsx` verifies SOP Library appears for Employee, Admin, Sub Admin, and a user with no normal modules.
- `frontend/src/pages/SOPLibrary.test.jsx` verifies page load, search, direct article routes, not found state, and that hidden module SOPs are not shown to users without the module.
