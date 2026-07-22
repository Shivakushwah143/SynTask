# Remove the shared CRM workspace header

## Goal

Remove the large header block shown at the top of every CRM page. The removed block includes the breadcrumb, CRM eyebrow, page title, description, and header actions rendered by `CRMHeader`.

## Design

Remove the `CRMHeader` render from the shared `CRMWorkspace` component. Delete the now-unused `CRMHeader` and `CRMPageTitle` component definitions and their unused icon import. Keep the existing CRM navigation, toolbar, filters, sections, cards, and page content unchanged.

This centralized change applies consistently to every route that uses `CRMWorkspace` without duplicating edits across individual CRM pages.

## Verification

- Confirm no `CRMHeader` or `CRMPageTitle` references remain.
- Run the relevant frontend tests or build.
- Confirm the diff does not alter unrelated CRM workspace elements.
