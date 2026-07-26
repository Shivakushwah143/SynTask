# Client Management Sidebar Section Design

## Status

Approved design. Implementation pending.

## Goal

Make the existing client-management area discoverable from the main sidebar by giving it a dedicated navigation section.

## User experience

The main sidebar will contain a new expandable section named **Client Management**. The section will contain one item, **Clients**, using the existing briefcase icon and linking to the existing `/clients` route. The item will receive the sidebar's existing active-route styling when the user is on `/clients` or a nested client workspace route.

## Architecture and scope

The change is limited to the frontend sidebar configuration in `frontend/src/components/Sidebar.jsx`:

- Add a `client-management` navigation group.
- Populate it from the already-defined `Clients` navigation item.
- Add a section-header color and dot color consistent with the sidebar's existing visual system.

No new page, route, API, database model, or backend behavior is required. Existing client and client-workspace screens remain unchanged.

## Access control and tenant isolation

The existing `Clients` item remains restricted to the `ADMIN` role and the `task` module. The sidebar continues filtering items through the existing role, module, capability, and department checks before building groups.

The change does not alter tenant data access. Client APIs continue enforcing `company_id` tenant scoping and existing authorization dependencies. Cross-tenant behavior is therefore unchanged.

## Error handling

No new runtime error path is introduced. If the current user is not eligible to see Clients, the filtered item is absent and the empty Client Management group is automatically omitted by the existing group filter.

## Testing and acceptance criteria

- An eligible Admin sees a separate **Client Management** sidebar section.
- The section contains a **Clients** item linking to `/clients`.
- The item is active on `/clients` and `/clients/:clientId/workspace`.
- A user who does not pass the existing Clients role/module gates does not see the item or an empty section.
- Existing sidebar groups and navigation behavior remain unchanged.

## Documentation impact

No product, API, schema, architecture, deployment, or README updates are required because this exposes an existing feature through navigation and does not change product scope or system behavior. This design record documents the navigation decision.
