export const SECTION_OVERVIEWS = {
  home: {
    title: "Workspace Home",
    description: "Start from your dashboard, calendar, and daily work signals without hunting through modules.",
    stats: ["Visible pages", "Upcoming work", "Active workspace", "Recent updates"],
    actions: ["Open dashboard", "Review calendar", "Check updates"],
  },
  sales: {
    title: "Sales Workspace",
    description: "Manage lead capture, pipeline movement, imports, and sales follow-up from one focused workspace.",
    stats: ["Lead queues", "Pipeline stages", "Imports", "Recently touched"],
    actions: ["Create lead", "Import leads", "Open pipeline", "View reports"],
  },
  clients: {
    title: "Client Relationship Management",
    description: "Track client organizations, contacts, account work, communication context, calendars, and insights.",
    stats: ["Client records", "Contacts", "Company workspaces", "Account signals"],
    actions: ["Open clients", "Review companies", "Check contacts", "View insights"],
  },
  work: {
    title: "Work Management",
    description: "Plan projects, assign tasks, handle requests, schedule future work, and track effort across teams.",
    stats: ["Projects", "Tasks", "Requests", "Tracked time"],
    actions: ["Create work", "Open tasks", "Review requests", "Track time"],
  },
  content: {
    title: "Content Operations",
    description: "Coordinate content calendars, production workflows, creative drafting, and publishing preparation.",
    stats: ["Calendar items", "Drafts", "Planned content", "Creative work"],
    actions: ["Open calendar", "Draft content", "Review schedule"],
  },
  publishing: {
    title: "Publishing Center",
    description: "Prepare social channels, publishing readiness, connected accounts, analytics, and automation checks.",
    stats: ["Channels", "Connected accounts", "Analytics", "Readiness checks"],
    actions: ["Open command center", "Connect account", "Review analytics"],
  },
  inbox: {
    title: "Unified Inbox",
    description: "Monitor notifications, social messages, activity, AI replies, and approval queues.",
    stats: ["Messages", "Notifications", "Updates", "Approvals"],
    actions: ["Open inbox", "Review alerts", "Check activity", "Approve replies"],
  },
  ai: {
    title: "AI Workspace",
    description: "Use AI assistants for task support, content help, productivity guidance, and workflow drafting.",
    stats: ["Assistants", "Drafts", "Context tools", "Recent sessions"],
    actions: ["Open assistant", "Draft content", "Review suggestions"],
  },
  people: {
    title: "People Operations",
    description: "Manage employee profiles, HR documents, teams, departments, attendance, leave, and people reporting.",
    stats: ["Employees", "Documents", "Attendance", "Leave"],
    actions: ["Open employees", "Review documents", "Review attendance", "Manage leave"],
  },
  recruitment: {
    title: "Recruitment Center",
    description: "Manage job openings, candidates, interviews, offers, and the full hiring pipeline from one focused workspace.",
    stats: ["Job Openings", "Candidates", "Interviews", "Offers"],
    actions: ["Create job", "Review candidates", "Schedule interviews", "Manage offers"],
  },
  },
  finance: {
    title: "Finance Workspace",
    description: "Review invoices, transactions, subscriptions, payment records, and financial operations.",
    stats: ["Invoices", "Transactions", "Payments", "Subscriptions"],
    actions: ["Create invoice", "Open ledger", "Review plans"],
  },
  insights: {
    title: "Insights and Reports",
    description: "Understand workspace health, sales performance, team throughput, and operational signals.",
    stats: ["Reports", "Sales trends", "Workspace metrics", "Exports"],
    actions: ["Open reports", "Review sales", "Export data"],
  },
  settings: {
    title: "Administration and Settings",
    description: "Control user settings, permissions, automation, connected accounts, and system activity.",
    stats: ["Settings", "Permissions", "Automation", "Connections"],
    actions: ["Open settings", "Manage roles", "Connect apps", "Review logs"],
  },
  me: {
    title: "My HR",
    description: "Your personal HR workspace: own profile, attendance, leave, documents, and salary & payslips — with the same business rules as the HR modules behind them.",
    stats: ["My profile", "My attendance", "My leave", "My payslips"],
    actions: ["Open overview", "View profile", "Check attendance", "See payslips"],
  },
};

export const ITEM_OVERVIEWS = {
  Home: {
    description: "See personal work, deadlines, reminders, and quick workspace signals in one place.",
    examples: ["Review workload", "Check alerts", "Jump to modules"],
    badges: ["Dashboard", "Daily"],
  },
  Calendar: {
    description: "View scheduled work, meetings, deadlines, and team timing across the workspace.",
    examples: ["Scan schedule", "Find deadlines", "Plan day"],
    badges: ["Time", "Planning"],
  },
  Leads: {
    description: "Capture and qualify prospects, assign owners, manage details, and merge duplicates.",
    examples: ["Create leads", "Assign owners", "Merge duplicates", "Track follow-up"],
    badges: ["CRM", "Pipeline"],
  },
  "All Leads": {
    description: "Browse every lead in the account in one full, searchable list.",
    examples: ["See all leads", "Filter by stage", "Export the list"],
    badges: ["CRM", "List"],
  },
  Pipeline: {
    description: "Move leads through stages and understand deal progress from first touch to close.",
    examples: ["Drag stages", "Review deal flow", "Spot blockers"],
    badges: ["Kanban", "Sales"],
  },
  "Import Leads": {
    description: "Bring leads from files into CRM with mapping, assignment strategies, and import history.",
    examples: ["Upload CSV/XLSX", "Map columns", "Assign in bulk"],
    badges: ["Import", "Bulk"],
  },
  "All Clients": {
    description: "Manage client accounts, ownership, projects, files, billing context, and workspace links.",
    examples: ["Add client", "Open workspace", "Track relationship"],
    badges: ["Clients", "Admin"],
  },
  Companies: {
    description: "Store client organizations, related contacts, account notes, deals, and relationship history.",
    examples: ["Create company", "Link contacts", "Review account"],
    badges: ["Accounts", "CRM"],
  },
  Contacts: {
    description: "Maintain people records tied to companies, clients, leads, and communication history.",
    examples: ["Add contact", "Update details", "Link company"],
    badges: ["People", "CRM"],
  },
  "Meta Messages": {
    description: "Review Meta conversations, assignments, priority, and customer message handling.",
    examples: ["Open thread", "Assign owner", "Reply from inbox"],
    badges: ["Inbox", "Meta"],
  },
  "Client Calendar": {
    description: "See client-related tasks, activities, meetings, and scheduled follow-ups by date.",
    examples: ["Review follow-ups", "Find tasks", "Plan account work"],
    badges: ["Calendar", "Clients"],
  },
  "Client Insights": {
    description: "Measure account activity, pipeline health, client workload, and reporting signals.",
    examples: ["View charts", "Compare accounts", "Spot trends"],
    badges: ["Reports", "Analytics"],
  },
  "Client Settings": {
    description: "Configure CRM fields, Meta settings, lead routing, and client workspace preferences.",
    examples: ["Manage masters", "Connect Meta", "Set defaults"],
    badges: ["Settings", "Admin"],
  },
  Projects: {
    description: "Plan delivery work, manage boards, assign owners, and track project progress.",
    examples: ["Create projects", "Open boards", "Review milestones"],
    badges: ["Delivery", "Boards"],
  },
  Tasks: {
    description: "Create, assign, prioritize, and monitor tasks, subtasks, status, and deadlines.",
    examples: ["Create tasks", "Assign members", "Track progress", "Manage deadlines"],
    badges: ["Tasks", "Execution"],
  },
  Requests: {
    description: "Handle support and internal requests with priority, assignment, comments, and status.",
    examples: ["Create request", "Assign owner", "Update status"],
    badges: ["Tickets", "Support"],
  },
  "Scheduled Work": {
    description: "Schedule future task or project creation and review pending or completed scheduled jobs.",
    examples: ["Schedule task", "Review runs", "Retry failed jobs"],
    badges: ["Automation", "Queue"],
  },
  "Time Tracking": {
    description: "Log work time, review timesheets, and understand effort across tasks and users.",
    examples: ["Log time", "Review timesheet", "Track effort"],
    badges: ["Time", "Reports"],
  },
  "Content Calendar": {
    description: "Plan campaigns, deadlines, publication dates, owners, and content status.",
    examples: ["Schedule content", "Assign owner", "Track due dates"],
    badges: ["Calendar", "Content"],
  },
  "Content Studio": {
    description: "Draft creative content, refine copy, and prepare campaign assets with AI support.",
    examples: ["Generate draft", "Review copy", "Prepare asset"],
    badges: ["AI", "Creative"],
  },
  "Publishing Centre": {
    description: "Coordinate publishing readiness, commands, account state, and channel operations.",
    examples: ["Review readiness", "Open channels", "Check command center"],
    badges: ["Publishing", "Meta"],
  },
  "Social Accounts": {
    description: "Prepare social account connections and publishing channel setup.",
    examples: ["Connect account", "Review status", "Manage channels"],
    badges: ["Social", "Setup"],
  },
  "Publishing Analytics": {
    description: "Review publishing performance, campaign signals, and social analytics.",
    examples: ["View metrics", "Compare channels", "Spot trends"],
    badges: ["Analytics", "Soon"],
  },
  Integrations: {
    description: "Check integration readiness, provider status, and connected workflow health.",
    examples: ["Run readiness", "Review failures", "Check setup"],
    badges: ["Ops", "Soon"],
  },
  WhatsApp: {
    description: "Manage WhatsApp channel setup, message flow, and customer communication readiness.",
    examples: ["Open channel", "Review messages", "Check setup"],
    badges: ["Messaging", "Meta"],
  },
  Instagram: {
    description: "Review Instagram messaging, channel status, and social lead communication.",
    examples: ["Open channel", "Review messages", "Check account"],
    badges: ["Social", "Meta"],
  },
  Messenger: {
    description: "Handle Messenger setup and conversations from connected Meta accounts.",
    examples: ["Open thread", "Assign owner", "Review queue"],
    badges: ["Messaging", "Meta"],
  },
  Notifications: {
    description: "Review alerts, reminders, system notices, and recent workspace notifications.",
    examples: ["Read alerts", "Open reminders", "Clear notices"],
    badges: ["Alerts", "Inbox"],
  },
  "Activity Feed": {
    description: "See timeline activity across updates, changes, assignments, and workflow events.",
    examples: ["Review changes", "Audit movement", "Track updates"],
    badges: ["Timeline", "Audit"],
  },
  "Daily Updates": {
    description: "Submit or review end-of-day updates, progress notes, blockers, and summaries.",
    examples: ["Write update", "Review reports", "Track blockers"],
    badges: ["EOD", "Team"],
  },
  "AI Replies": {
    description: "Review AI-assisted message drafts and response support before sending.",
    examples: ["Draft reply", "Review suggestion", "Approve text"],
    badges: ["AI", "Drafts"],
  },
  "Approval Queue": {
    description: "Review pending communication approvals, suggested replies, and gated actions.",
    examples: ["Review queue", "Approve item", "Reject draft"],
    badges: ["Approvals", "Soon"],
  },
  "AI Assistant": {
    description: "Ask for project, task, writing, and operational help grounded in permitted workspace context.",
    examples: ["Ask question", "Draft plan", "Summarize work"],
    badges: ["Assistant", "AI"],
  },
  "AI Content Assistant": {
    description: "Generate marketing and content ideas, drafts, and campaign support with AI.",
    examples: ["Draft copy", "Brainstorm", "Refine content"],
    badges: ["Content", "AI"],
  },
  Employees: {
    description: "Manage employee HR profiles, employment information, departments, designations, and joining details.",
    examples: ["Search employees", "Open profile", "Edit employment", "Convert candidate"],
    badges: ["HR", "Profiles"],
  },
  "User Accounts": {
    description: "Manage company users, roles, reporting structure, account status, and user access.",
    examples: ["Create user", "Update role", "Review team"],
    badges: ["People", "Admin"],
  },
  Documents: {
    description: "Review employee and candidate HR documents company-wide: uploads, expiry, versions, and visibility.",
    examples: ["Preview document", "Filter by type", "Check expiry", "Download file"],
    badges: ["HR", "Documents"],
  },
  "Document Types": {
    description: "Configure the HR document types available for employee and candidate uploads.",
    examples: ["Create type", "Set required", "Deactivate type", "Manage visibility"],
    badges: ["HR", "Settings"],
  },
  "My People": {
    description: "Review direct team members, their work context, and people you lead.",
    examples: ["Open team", "Review members", "Check workload"],
    badges: ["Team", "Lead"],
  },
  Attendance: {
    description: "Clock in, track attendance, and review personal or team attendance state.",
    examples: ["Mark attendance", "Check status", "Review logs"],
    badges: ["Attendance", "Daily"],
  },
  "Live Attendance": {
    description: "Monitor active attendance sessions and live workforce availability.",
    examples: ["View live users", "Check status", "Monitor shifts"],
    badges: ["Live", "Admin"],
  },
  "Attendance Reports": {
    description: "Analyze attendance history, summaries, trends, and workforce presence data.",
    examples: ["Open report", "Filter dates", "Export data"],
    badges: ["Reports", "People"],
  },
  "Attendance Corrections": {
    description: "Review and approve employee attendance correction requests.",
    examples: ["Review corrections", "Approve requests", "Check history"],
    badges: ["Corrections", "Admin"],
  },
  "Attendance Policy": {
    description: "Configure company attendance rules, work schedule, timezone, grace periods, and overtime.",
    examples: ["Set work hours", "Configure grace period", "Enable overtime"],
    badges: ["Policy", "HR Settings"],
  },
  Holidays: {
    description: "Manage company holiday calendar that affects attendance status and payroll.",
    examples: ["Add holiday", "Edit holiday", "View calendar"],
    badges: ["Calendar", "HR Settings"],
  },
  "Salary Components": {
    description: "Configure earning and deduction components used in salary structures.",
    examples: ["Create component", "Set type", "Manage defaults"],
    badges: ["Salary", "HR Settings"],
  },
  Payroll: {
    description: "Manage monthly payroll periods, calculate salaries, review, approve, process payroll, and generate secure employee payslip PDFs.",
    examples: ["Create period", "Calculate payroll", "Approve payroll", "Generate payslips", "Preview / download payslip"],
    badges: ["Payroll", "Finance"],
  },
  "Leave Management": {
    description: "Request, review, approve, forward, and track employee leave workflows.",
    examples: ["Request leave", "Approve leave", "Check balances"],
    badges: ["Leave", "Workflow"],
  },
  Departments: {
    description: "Organize company departments, permissions, ownership, and team structure.",
    examples: ["Create department", "Assign users", "Review access"],
    badges: ["Org", "Access"],
  },
  "Company Directory": {
    description: "Super Admin view of tenant companies and platform-level company records.",
    examples: ["Review companies", "Open tenant", "Audit account"],
    badges: ["Platform", "Super Admin"],
  },
  "Hiring Dashboard": {
    description: "Track hiring funnel health, open jobs, candidates, interviews, and recruitment activity.",
    examples: ["Review funnel", "Open hiring", "Check status"],
    badges: ["Recruitment", "HR"],
  },
  "Job Openings": {
    description: "Create and manage roles, requirements, openings, and public career listings.",
    examples: ["Create job", "Edit opening", "Publish role"],
    badges: ["Jobs", "Hiring"],
  },
  Applications: {
    description: "Process candidate applications, inbox items, mail sync results, and inbound resumes.",
    examples: ["Review inbox", "Link candidate", "Move application"],
    badges: ["Inbox", "Hiring"],
  },
  Candidates: {
    description: "Manage candidate records, status, skills, application history, and screening context.",
    examples: ["Open candidate", "Update status", "Review profile"],
    badges: ["Talent", "CRM"],
  },
  "Talent Pool": {
    description: "Store resumes and searchable candidate profiles for future hiring needs.",
    examples: ["Upload resume", "Parse profile", "Search talent"],
    badges: ["Resume", "Talent"],
  },
  Interviews: {
    description: "Schedule interviews, manage interviewer notes, and track candidate evaluation steps.",
    examples: ["Schedule interview", "Review feedback", "Move stage"],
    badges: ["Calendar", "Hiring"],
  },
  Offers: {
    description: "Generate, send, track, and manage candidate offer workflows and approvals.",
    examples: ["Create offer", "Generate PDF", "Track response"],
    badges: ["Offers", "HR"],
  },
  "Hiring Reports": {
    description: "Review recruitment metrics, pipeline health, source performance, and hiring outcomes.",
    examples: ["View metrics", "Filter roles", "Export report"],
    badges: ["Reports", "Hiring"],
  },
  Invoices: {
    description: "Create, send, and download invoices tied to clients, billing items, and payments.",
    examples: ["Create invoice", "Send invoice", "Download PDF"],
    badges: ["Billing", "Finance"],
  },
  Transactions: {
    description: "Track ledger entries, payments, balances, income, expenses, and financial history.",
    examples: ["Review ledger", "Add entry", "Check balance"],
    badges: ["Ledger", "Money"],
  },
  Subscriptions: {
    description: "Manage subscription plans, billing state, tenant subscriptions, and renewal context.",
    examples: ["Review plan", "Update billing", "Check status"],
    badges: ["Plans", "Billing"],
  },
  "Workspace Reports": {
    description: "Review workspace-level reports for tasks, operations, people, and delivery health.",
    examples: ["Open report", "Filter data", "Export summary"],
    badges: ["Reports", "Workspace"],
  },
  "Sales Reports": {
    description: "Analyze sales pipeline, lead inventory, conversion signals, and revenue trends.",
    examples: ["View funnel", "Export report", "Review inventory"],
    badges: ["Sales", "Analytics"],
  },
  "System Settings": {
    description: "Adjust profile, preferences, security settings, notifications, and workspace defaults.",
    examples: ["Update profile", "Set timezone", "Review preferences"],
    badges: ["Settings", "Account"],
  },
  "Roles & Permissions": {
    description: "Manage role access, module permissions, department capabilities, and admin controls.",
    examples: ["Grant access", "Review modules", "Audit roles"],
    badges: ["RBAC", "Admin"],
  },
  "Automation Rules": {
    description: "Configure workflows, statuses, transitions, and automation behavior for work items.",
    examples: ["Edit workflow", "Add transition", "Activate rule"],
    badges: ["Workflow", "Automation"],
  },
  "Connected Accounts": {
    description: "Connect identity and messaging providers used by Meta and external communication flows.",
    examples: ["Connect account", "Review status", "Refresh setup"],
    badges: ["Integration", "Identity"],
  },
  "Google Workspace": {
    description: "Access Gmail, Drive-linked files, Calendar, Meet, and Google connection diagnostics.",
    examples: ["Open Gmail", "Check Calendar", "Create Meet"],
    badges: ["Google", "Workspace"],
  },
  "Activity Logs": {
    description: "Inspect administrative activity, user actions, and audit history across the workspace.",
    examples: ["Review logs", "Filter actor", "Audit change"],
    badges: ["Audit", "History"],
  },
  "My Profile": {
    description: "View your employment information and update your personal contact and address details.",
    examples: ["View employment", "Edit contact", "Update address"],
    badges: ["Self-Service", "Profile"],
  },
  "My Attendance": {
    description: "Check in, take breaks, check out, review your attendance history, and request corrections.",
    examples: ["Check in", "Take break", "Review history", "Request correction"],
    badges: ["Self-Service", "Attendance"],
  },
  "My Leave": {
    description: "See your leave balances, request leave, and track or cancel your requests.",
    examples: ["View balance", "Request leave", "Track status", "Cancel request"],
    badges: ["Self-Service", "Leave"],
  },
  "My Documents": {
    description: "Preview and download your employee-visible HR documents.",
    examples: ["Preview document", "Download file", "Check expiry"],
    badges: ["Self-Service", "Documents"],
  },
  "My Payslips": {
    description: "View your current salary summary and preview or download your generated payslips.",
    examples: ["View salary", "Preview payslip", "Download payslip"],
    badges: ["Self-Service", "Payroll"],
  },
  "HR Dashboard": {
    description: "Operational HR overview: employee headcount, attendance today, leave status, document alerts, lifecycle signals, and recruitment summary.",
    examples: ["View metrics", "Check attention items", "Navigate to reports"],
    badges: ["Dashboard", "HR"],
  },
  "HR Reports": {
    description: "Filterable operational HR reports across employees, attendance, leave, documents, lifecycle, and payroll with CSV export.",
    examples: ["Filter report", "Export CSV", "View department data"],
    badges: ["Reports", "HR"],
  },
};

export const getItemOverview = (item) => ITEM_OVERVIEWS[item.name] || {
  description: `${item.name} helps your team manage this workspace area with the same access rules as the sidebar.`,
  examples: ["Open page", "Review records", "Continue work"],
  badges: ["Workspace"],
};

export const ITEM_INSIGHTS = {
  Leads: {
    metrics: ["Total leads", "New today", "Follow-ups", "Hot leads"],
    alerts: ["Follow-ups pending", "Hot leads need owner"],
    actions: ["Add Lead", "Import", "Pipeline"],
    queryHints: ["leads", "prospects", "crm"],
  },
  "All Leads": {
    metrics: ["Total leads", "Visible", "Hot leads", "Pipeline value"],
    alerts: ["Leads need follow-up"],
    actions: ["Open All Leads", "Export", "Add Lead"],
    queryHints: ["leads", "all-leads", "prospects"],
  },
  Pipeline: {
    metrics: ["Open deals", "Won month", "Lost", "Pipeline value"],
    alerts: ["Stage movement stalled", "Deals need next step"],
    actions: ["View Pipeline", "Add Lead", "Reports"],
    queryHints: ["pipeline", "deals", "leads"],
  },
  "Import Leads": {
    metrics: ["Imports", "Processed", "Failed rows", "Duplicates"],
    alerts: ["Import failures", "Duplicate leads"],
    actions: ["Import", "View Leads", "Settings"],
    queryHints: ["bulk-leads", "imports", "leads"],
  },
  Companies: {
    metrics: ["Active companies", "New accounts", "No contacts", "Active projects"],
    alerts: ["Companies without contacts", "Accounts need follow-up"],
    actions: ["Add Company", "Contacts", "Insights"],
    queryHints: ["companies", "crm"],
  },
  Contacts: {
    metrics: ["Contacts", "New this week", "Unlinked", "Recently updated"],
    alerts: ["Contacts missing company", "Records need update"],
    actions: ["Add Contact", "Companies", "Leads"],
    queryHints: ["contacts", "crm"],
  },
  Projects: {
    metrics: ["Active projects", "Delayed", "Done month", "High priority"],
    alerts: ["Delayed projects", "Deadlines near"],
    actions: ["New Project", "Boards", "Reports"],
    queryHints: ["projects"],
  },
  Tasks: {
    metrics: ["Assigned today", "Overdue", "Due today", "Blocked"],
    alerts: ["Tasks overdue", "Blocked work"],
    actions: ["New Task", "My Tasks", "View All"],
    queryHints: ["tasks"],
  },
  Calendar: {
    metrics: ["Today", "Deadlines", "Meetings", "Leave events"],
    alerts: ["Deadline tomorrow", "Meetings today"],
    actions: ["Open Calendar", "Create Event", "Today"],
    queryHints: ["calendar", "events", "meetings"],
  },
  "Client Calendar": {
    metrics: ["Today", "Follow-ups", "Meetings", "Deadlines"],
    alerts: ["Client follow-ups due", "Meeting prep needed"],
    actions: ["Open Calendar", "Leads", "Companies"],
    queryHints: ["calendar", "events", "crm"],
  },
  Employees: {
    metrics: ["Employees", "Active", "Probation", "Onboarding"],
    alerts: ["Profiles missing", "Probation ending"],
    actions: ["Add Employee", "Directory", "Attendance"],
    queryHints: ["employees"],
  },
  "User Accounts": {
    metrics: ["Users", "Active", "Managers", "Leads"],
    alerts: ["Inactive users", "Access changes pending"],
    actions: ["Add User", "Directory", "Roles"],
    queryHints: ["users"],
  },
  Documents: {
    metrics: ["Documents", "Expiring soon", "Expired", "Versions"],
    alerts: ["Documents expiring", "Required docs missing"],
    actions: ["Upload", "Preview", "Settings"],
    queryHints: ["hr-documents", "documents"],
  },
  Attendance: {
    metrics: ["Present", "Late arrivals", "Missing punches", "Attendance %"],
    alerts: ["Missing punches", "Late arrivals"],
    actions: ["Mark Attendance", "Reports", "Live"],
    queryHints: ["attendance"],
  },
  "Live Attendance": {
    metrics: ["Live now", "Idle", "Missing punches", "Teams online"],
    alerts: ["Missing punch-outs", "Shift anomalies"],
    actions: ["Live Monitor", "Reports", "Attendance"],
    queryHints: ["attendance", "live"],
  },
  "Attendance Reports": {
    metrics: ["Reports", "Late", "Absent", "Attendance %"],
    alerts: ["Attendance anomalies", "Report gaps"],
    actions: ["Open Reports", "Export", "Attendance"],
    queryHints: ["attendance", "reports"],
  },
  "Leave Management": {
    metrics: ["Pending requests", "Approved today", "Rejected", "Emergency"],
    alerts: ["Leave approvals pending", "Coverage gaps"],
    actions: ["Request Leave", "Approve", "Balances"],
    queryHints: ["leaves", "leave"],
  },
  Invoices: {
    metrics: ["Pending payment", "Paid", "Overdue", "Drafts"],
    alerts: ["Invoice overdue", "Payment follow-up"],
    actions: ["Create Invoice", "Send", "Ledger"],
    queryHints: ["invoices"],
  },
  Transactions: {
    metrics: ["Income", "Expenses", "Pending", "Monthly spend"],
    alerts: ["Approval pending", "Ledger review"],
    actions: ["Open Ledger", "Add Entry", "Export"],
    queryHints: ["ledger", "transactions"],
  },
  "Google Workspace": {
    metrics: ["Unread", "Drafts", "Today meetings", "Recent files"],
    alerts: ["Unread client emails", "Meetings soon"],
    actions: ["Open Gmail", "Calendar", "Meet"],
    queryHints: ["google", "gmail", "calendar"],
  },
  Notifications: {
    metrics: ["Unread", "Critical", "Today", "Resolved"],
    alerts: ["Unread notifications", "Critical alerts"],
    actions: ["Open Alerts", "Clear", "Activity"],
    queryHints: ["notifications"],
  },
};

export const getItemInsights = (item) => ITEM_INSIGHTS[item.name] || {
  metrics: ["Open items", "Pending", "Active", "Recently updated"],
  alerts: ["Items need review"],
  actions: ["Open", "View All", "Reports"],
  queryHints: [item.name, item.href],
};
