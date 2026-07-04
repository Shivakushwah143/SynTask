# Tickets and Chat User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Authenticated user] --> B[/tickets]
  A --> C[/chat]
  B --> D[/tickets/:ticketId]
  C --> E[Conversation / Group thread]
```

## Tickets
- How the user reaches it: main navigation or support-related deep links.
- What they can do: create, assign, comment, and update tickets.
- What happens after every action: the ticket list/detail refreshes or reroutes after creation.
- Backend APIs called: ticket CRUD/comment/assignment endpoints.
- Timeline events created: ticket actions should be logged if the backend emits them.
- Notifications sent: existing notifications may be used for assignments/comments if configured.
- Related modules updated: Notifications, Dashboard, Activity Log.

## Chat
- How the user reaches it: main navigation or direct chat URLs.
- What they can do: open conversations, send messages, create groups, add members.
- What happens after every action: the conversation thread updates and keeps local selection state.
- Backend APIs called: chat conversations/messages/groups/users APIs.
- Timeline events created: chat does not consistently create CRM timeline events.
- Notifications sent: chat messages typically rely on chat-internal notifications or unread indicators.
- Related modules updated: Notifications, Users, Teams.
