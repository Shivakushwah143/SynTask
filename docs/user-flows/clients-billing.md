# Clients and Billing User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Authenticated user] --> B[/clients]
  A --> C[/invoices]
  A --> D[/ledger]
  A --> E[/subscriptions]
  B --> F[Client detail / related projects]
  C --> G[Invoice detail / actions]
```

## Clients
- How the user reaches it: main navigation or sales/CRM adjacent links.
- What they can do: manage clients, inspect details, open related records.
- What happens after every action:
  - Create/edit opens a guided modal sequence with two steps: Contact setup for required identity fields, then Client details for ownership, budget, schedule, address, tags, and notes.
  - Required name and email format validation run before the user can continue to Details or submit.
  - Create/update operations refresh the list/detail. The create/edit modal does not close on accidental outside clicks; explicit Cancel or Close still exits. In edit mode, Save Details stores the filled fields without changing lifecycle stage, while Update Client saves and continues the lifecycle action when one is pending. When a lifecycle blocker opens the edit form, a successful Update retries the original stage move with the updated client data instead of forcing the user to click the same stage action again. If Kickoff Meeting is missing, the warning popup includes an inline kickoff scheduler; after scheduling succeeds, the original activation retry runs automatically, and the saved kickoff meeting appears in the client workspace Meetings tab. The workspace overview shows saved primary contact email and phone details.
  - Draft preservation: partially filled values in the create form are kept as a draft when the modal is closed by the cross button, Escape, backdrop, or Cancel, and are restored the next time the form opens, so the user does not need to re-enter them. The draft is cleared only after a successful client creation.
- Backend APIs called: clients APIs and linked document/project endpoints.
- Timeline events created: client lifecycle should be reflected where backend events exist.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Projects, Invoices, CRM Companies.

### Client lifecycle transitions
```mermaid
flowchart LR
  N[New] --> O[Onboarding] --> A[Active]
  A --> R[At Risk]
  A --> H[On Hold]
  A --> Y[Renewal Due]
  A --> C[Churned]
  A --> X[Archived]
  R --> A
  R --> H
  R --> C
  R --> X
  H --> A
  H --> Y
  H --> C
  H --> X
  Y --> A
  Y --> C
  Y --> X
  C --> A
  C --> X
```
`New -> Onboarding -> Active` is sequential. After `Active`, transitions are conditional and are read from the backend lifecycle rules endpoint. Activation requires the backend-calculated onboarding items for payment terms, primary contact, requirements, project creation, team/account owner assignment, kickoff completion, and initial start readiness. The activation response identifies each missing item, its current status, reason, destination tab, and action label; the Client UI opens that secondary tab directly. Configured operational or terminal transitions require a reason; archived clients have no destination unless a future authorized restore flow is added.

### Client onboarding workspace
When a Client is in `onboarding`, its workspace exposes secondary tabs for Overview, Commercial, Contacts, Requirements, Documents, Assets & Access, Project & Team, and Kickoff. Existing CRM Contacts, CRM Documents, Projects, Meetings, and Client files are linked as source records; onboarding items do not duplicate them. Contact, contract, project, team, and kickoff statuses synchronize from those records. Agreement, requirements, brand/assets, and access layers support tenant-scoped manual notes/status updates through `PATCH /api/v1/clients/{client_id}/onboarding/items/{item_key}`. Each item stores required/optional state, layer status, completion percentage, owner/link metadata, timestamps, validation data, and audit entries.

The onboarding list view shows compact progress and the next required action beside onboarding-stage Clients. Required progress is calculated as completed required items divided by total required items; optional layers never block activation. Tenant isolation is enforced by the Client and linked-record company key, and onboarding edits use the existing company-admin/lead permission gate.

## Invoices
- How the user reaches it: main navigation.
- What they can do: create and manage invoices.
- What happens after every action: invoice creation/update refreshes billing data.
- Backend APIs called: invoice CRUD/billing endpoints.
- Timeline events created: invoice-related activity may be logged through billing/audit systems.
- Notifications sent: billing notifications may be emitted by backend rules.
- Related modules updated: Ledger, Subscriptions, Clients.

## Ledger
- How the user reaches it: main navigation.
- What they can do: review accounting-like ledger entries.
- What happens after every action: filters or refreshes requery the ledger feed.
- Backend APIs called: ledger APIs.
- Timeline events created: not central.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Invoices, Billing analytics.

## Subscriptions
- How the user reaches it: main navigation.
- What they can do: review plans, upgrade, confirm payment.
- What happens after every action: plan selection or payment actions update subscription state.
- Backend APIs called: plan list, current subscription, payment intent, payment confirmation.
- Timeline events created: subscription state changes may be logged by billing/admin systems.
- Notifications sent: payment/subscription status notifications may be produced by backend.
- Related modules updated: Super Admin plans, Billing Revenue.
