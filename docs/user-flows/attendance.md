# Attendance User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Authenticated user] --> B[/attendance]
  A --> C[/live-monitor]
  A --> D[/attendance-reports]
```

## Attendance, Live Monitor, Reports
- How the user reaches it: main navigation.
- What they can do: view attendance, monitor live presence, inspect reports.
- What happens after every action: check-in/live/report views refresh according to their query state.
- Backend APIs called: attendance today/live/history/reports/dashboard endpoints.
- Timeline events created: attendance events may be logged by backend systems.
- Notifications sent: if present, attendance alerts are backend-driven.
- Related modules updated: none direct, except any workforce dashboards.
