// SynTask v3.0 — Navigation configuration (sidebar + in-page SectionTabs).
// Phase 0-3 deliverable of the navigation redesign (see sidebar-phase-implementation-plan.md);
// extended by the tab sub-navigation plan (tab-subnav-implementation-plan.md) with the shared
// gating helpers used by BOTH the sidebar and the SectionTabs bar.
// Ground rules: routes are corrected to the REAL app routes (App.jsx). Permissions are unchanged.
// Only labels, grouping, order, and icons change. No page/route/permission logic is touched.

import {
  AlarmClockCheck,
  BellRing,
  Bot,
  BookOpenText,
  Briefcase,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  Factory,
  FileBarChart2,
  FileText,
  FileWarning,
  FolderKanban,
  Gauge,
  GitBranch,
  Headphones,
  HeartHandshake,
  Home,
  Landmark,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MessageSquareText,
  MonitorCheck,
  Network,
  Palette,
  LayoutTemplate,
  Sparkles,
  Receipt,
  Settings,
  ShieldCheck,
  TimerReset,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRound,
  UserRoundSearch,
  Users,
  Globe,
  Command,
} from "lucide-react";
import {
  ROLE,
  isManagerRole,
  isSuperAdminRole,
  normalizeRole,
} from "../utils/roles";
import { hasModuleAccess as hasModuleAccessFromRbac } from "../utils/rbac";
import { HR_MODULES } from "./hrModules";

// NOTE: NAV_GROUPS_OPEN_KEY (collapsible-group expand state) was removed in the tab sub-nav plan
// (Phase D). The sidebar no longer has collapsible groups, so stale localStorage keys are ignored.

// ── Icon mapping for the top-level sections (spec §10.4, mapped to the project's icon set) ──
export const SECTION_ICONS = {
  home: Home,
  sales: Briefcase,
  clients: Users,
  work: FolderKanban,
  content: Palette,
  publishing: Megaphone,
  inbox: MessageSquareText,
  ai: Bot,
  people: UserCog,
  recruitment: UserRoundSearch,
  finance: DollarSign,
  insights: LineChart,
  settings: Settings,
  me: UserRound,
  sop: BookOpenText,
};

// ── Section-level role gates (spec §9, mapped to the real role enum) ───────────────────────────
// Non-standard roles (hr_manager, recruiter, interviewer, department_manager, ...) are NOT listed
// here — they fall through to the existing item-level role/module/capability/department gates in
// Sidebar.jsx. Section-level gates only refine the six standard roles below.
// NOTE: a section only ever renders if at least one of its items survives the item-level gates too,
// so these lists can restrict but never broaden access.
// Role groups. NOTE: SECTIONS below no longer carry a `roles` field — a section
// is only a grouping; it renders when at least one of its items passes the shared
// RBAC gates (utils/rbac.js). Per-item `roles` is the single role whitelist.
export const STANDARD_ROLES = [
  ROLE.SUPER_ADMIN,
  ROLE.ADMIN,
  ROLE.SUB_ADMIN,
  ROLE.MANAGER,
  ROLE.LEAD,
  ROLE.EMPLOYEE,
];
// Everyone except plain Employees (leads/managers/admins/super admins).
const TEAM_ROLES = [
  ROLE.SUPER_ADMIN,
  ROLE.ADMIN,
  ROLE.SUB_ADMIN,
  ROLE.MANAGER,
  ROLE.LEAD,
];
// Company admins only.
const ADMIN_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN];
// Client management is company-scoped and Managers have the same Client view.
const CLIENT_MANAGER_ROLES = [...ADMIN_ROLES, ROLE.MANAGER];
// Roles allowed in CRM settings (mirrors CRMSettingsGuard: company admin + manager).
const CRM_SETTINGS_ROLES = [
  ROLE.SUPER_ADMIN,
  ROLE.ADMIN,
  ROLE.SUB_ADMIN,
  ROLE.MANAGER,
];

// Guided sales journey stages (Overview | Acquire | Qualify | Discovery | Proposal |
// Negotiation | Agreement | Won). The in-page Sales section tabs render exactly these
// stages (SectionTabs prepends Overview); the sidebar keeps its unchanged section links.
export const CRM_PIPELINE_STAGE_ITEMS = [
  {
    name: "Acquire",
    href: "/crm/pipeline/acquire",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Qualify",
    href: "/crm/pipeline/qualify",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Discovery",
    href: "/crm/pipeline/discovery",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Proposal",
    href: "/crm/pipeline/proposal",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Negotiation",
    href: "/crm/pipeline/negotiation",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Agreement",
    href: "/crm/pipeline/agreement",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Won",
    href: "/crm/pipeline/won",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Lost",
    href: "/crm/pipeline/lost",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
];

// Exactly the journey tabs shown in the in-page Sales section bar (Overview is
// prepended by SectionTabs). "Clients" remains the destination after a Won lead
// is transferred to the existing Clients module.
export const SALES_JOURNEY_TAB_ITEMS = [
  "Acquire",
  "Qualify",
  "Discovery",
  "Proposal",
  "Negotiation",
  "Agreement",
  "Won",
];

// Legacy routes kept inside the sales section so /crm/pipeline and /crm/leads
// still resolve to the Sales section (tab bar + sidebar highlight). SectionTabs
// hides them from the in-page bar, so the visible tabs stay exactly the journey.
// Import Leads stays in the sidebar config (favorites/landing) but is hidden from
// the tab bar too — it is not part of the guided journey.
export const SALES_HIDDEN_TAB_ITEMS = [
  "Leads",
  "All Leads",
  "Pipeline",
  "Import Leads",
];

export const CLIENT_STAGE_ITEMS = [
  {
    name: "New",
    href: "/clients/new",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "Onboarding",
    href: "/clients/onboarding",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "Active",
    href: "/clients/active",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "At Risk",
    href: "/clients/at-risk",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "On Hold",
    href: "/clients/on-hold",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "Renewal Due",
    href: "/clients/renewal-due",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "Churned",
    href: "/clients/churned",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
  {
    name: "Archived",
    href: "/clients/archived",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
    module: "clients",
  },
];

// Route for the dedicated Sales Overview dashboard. Used as the Sales section's default
// destination: the sidebar section link and the in-page Overview tab both resolve here
// instead of the generic /sections/sales landing.
export const SALES_OVERVIEW_HREF = "/sales-overview";

// Home and Clients link straight to their real page (the Dashboard and the All Clients
// page) instead of the generic /sections/:key landing, and `hideOverviewTab` removes the
// redundant in-page Overview tab there — the dedicated page already IS the overview.

// ── Top-level section structure (spec §2 + §8). Items are resolved by name. ──
// Items listed here but with no existing route are intentionally omitted (hidden until the page
// is built) — see the Phase 0 hide/link/build decision table.
// A section renders iff at least one of its items passes canAccessNavItem().
export const SECTIONS = [
  {
    key: "home",
    label: "Home",
    items: ["Home", "Calendar"],
    overviewHref: "/dashboard",
    hideOverviewTab: true,
  },
  {
    key: "sales",
    label: "Sales",
    // In-page Sales section tabs: the guided journey. The main sidebar only renders
    // section links, so these items power the horizontal tab bar + section landing
    // cards, not a vertical stage menu.
    items: [...SALES_JOURNEY_TAB_ITEMS, ...SALES_HIDDEN_TAB_ITEMS],
    overviewHref: SALES_OVERVIEW_HREF,
  },
  {
    key: "clients",
    label: "Clients",
    items: [
      "All Clients",
      ...CLIENT_STAGE_ITEMS.map((item) => item.name),
      "Companies",
      "Contacts",
      "Client Calendar",
      "Client Insights",
    ],
    overviewHref: "/clients",
    hideOverviewTab: true,
  },

  {
    key: "work",
    label: "Work",
    items: [
      "Overview",
      "Projects",
      "Tasks",
      "Requests",
      "Scheduled Work",
      "Time Tracking",
      "Daily Updates",
      "Work Reports",
      "Project Templates",
    ],
    overviewHref: "/work/overview",
  },

  {
    key: "content",
    label: "Content",
    items: ["Content Overview", "Content", "Content Calendar", "Content Studio"],
    overviewHref: "/content/overview",
  },
  {
    key: "publishing",
    label: "Publishing",
    items: [
      "Publishing Centre",
      "Social Accounts",
      "Publishing Analytics",
      "Integrations",
    ],
  },
  {
    key: "inbox",
    label: "Inbox",
    items: [
      "WhatsApp",
      "Instagram",
      "Messenger",
      "Meta Messages",
      "Notifications",
      "Activity Feed",
      "AI Replies",
      "Approval Queue",
    ],
  },
  {
    key: "ai",
    label: "AI Workspace",
    items: ["AI Assistant", "AI Content Assistant"],
  },
  {
    key: "people",
    label: "People",
    items: [
      "HR Dashboard",
      "Employees",
      "My People",
      "Attendance",
      "Live Attendance",
      "Attendance Reports",
      "Leave Management",
      "HR Documents",
      "Payroll",
      "Departments",
      "HR Reports",
      "Users",
    ],
  },
  {
    key: "recruitment",
    label: "Recruitment",
    items: [
      "Hiring Dashboard",
      "Job Openings",
      "Recruitment Inbox",
      "Candidates",
      "Talent Pool",
      "Interviews",
      "Offers",
      "Hiring Reports",
    ],
    overviewHref: "/hr/recruitment",
    hideOverviewTab: true,
  },
  {
    key: "finance",
    label: "Finance",
    items: ["Invoices", "Transactions", "Subscriptions"],
  },
  {
    key: "insights",
    label: "Insights",
    items: ["Workspace Reports", "Sales Reports"],
  },
  {
    key: "settings",
    label: "Settings",
    items: [
      "System Settings",
      "Roles & Permissions",
      "Automation Rules",
      "Connected Accounts",
      "Google Workspace",
      "Activity Logs",
      "Client Settings",
    ],
  },
  // Phase 8 — My HR (Employee Self-Service): the employee's own HR workspace.
  // Visible to every authenticated company user with an Employee Profile; the
  // layout itself shows the graceful "profile not set up" state otherwise.
  {
    key: "me",
    label: "My HR",
    items: ["My Profile", "My Attendance", "My Leave", "My Documents", "My Payslips"],
    overviewHref: "/hr/me",
  },
  {
    key: "sop",
    label: "SOP Library",
    items: ["SOP Library"],
    overviewHref: "/sop-library",
    hideOverviewTab: true,
  },
];

// ── Flat navigation items (renamed per spec §4, routes corrected to App.jsx) ──────────────────
export const navigation = [
  // Home
  {
    name: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: STANDARD_ROLES,
  },
  // /calendar has no backend router module gate → no module field (roles only).
  {
    name: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    roles: STANDARD_ROLES,
  },

  // Sales (Pipeline/Leads/All Leads live in crmNavigation; kept gated by sales_crm like the old "CRM" item)
  // Import Leads is open to every role (anyone may bulk-import leads); it stays hidden from the
  // in-page tab bar — SectionTabs filters it out for the sales section (tab bar only).
  {
    name: "Import Leads",
    href: "/bulk-leads",
    icon: Megaphone,
    roles: STANDARD_ROLES,
    module: "import_leads",
  },

  // Clients — Managers have the same company-scoped Client view as admins.
  {
    name: "All Clients",
    href: "/clients",
    icon: Briefcase,
    roles: CLIENT_MANAGER_ROLES,
  },
  ...CLIENT_STAGE_ITEMS,

  // Work
  {
    name: "Overview",
    href: "/work/overview",
    icon: Gauge,
    roles: STANDARD_ROLES,
    module: "tasks",
  },
  {
    name: "Projects",
    href: "/projects",
    icon: FolderKanban,
    roles: STANDARD_ROLES,
    module: "projects",
  },
  {
    name: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    roles: STANDARD_ROLES,
    module: "tasks",
  },
  // /tickets is auto-granted to Manager/Lead/Employee in backend require_module → all roles.
  {
    name: "Requests",
    href: "/work-requests",
    icon: ClipboardList,
    roles: STANDARD_ROLES,
    module: "tasks",
  },
  {
    name: "Work Reports",
    href: "/work/reports",
    icon: FileBarChart2,
    roles: STANDARD_ROLES,
    module: "projects",
  },
  {
    name: "Project Templates",
    href: "/project-templates",
    icon: ClipboardCheck,
    roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD],
    module: "projects",
  },
  {
    name: "Support Tickets",
    href: "/tickets",
    icon: ClipboardList,
    roles: STANDARD_ROLES,
    module: "tickets",
  },
  // /scheduled-jobs has no backend module gate; team roles only.
  {
    name: "Scheduled Work",
    href: "/scheduled-jobs",
    icon: CalendarClock,
    roles: TEAM_ROLES,
    module: "scheduled_work",
  },
  {
    name: "Time Tracking",
    href: "/timesheet",
    icon: TimerReset,
    roles: STANDARD_ROLES,
    module: "time_tracking",
  },

  // Content — /content is gated by the content_calendar module on the backend.
  // The section's default destination: a Work-style overview page showing
  // overall lifecycle progress and today's queues.
  {
    name: "Content Overview",
    href: "/content/overview",
    icon: Gauge,
    roles: STANDARD_ROLES,
    module: "content_calendar",
  },
  {
    name: "Content",
    href: "/content",
    icon: Palette,
    roles: STANDARD_ROLES,
    module: "content_calendar",
  },
  {
    name: "Content Templates",
    href: "/content/templates",
    icon: LayoutTemplate,
    roles: STANDARD_ROLES,
    module: "content_calendar",
  },
  {
    name: "Content Calendar",
    href: "/content-calendar",
    icon: CalendarCheck2,
    roles: STANDARD_ROLES,
    module: "content_calendar",
  },
  {
    name: "Content Studio",
    href: "/creative-director",
    icon: Sparkles,
    roles: STANDARD_ROLES,
    module: "ai_content_assistant",
  },

  // Inbox (core items; channel items live in metaNavigation)
  {
    name: "Notifications",
    href: "/notifications",
    icon: BellRing,
    roles: STANDARD_ROLES,
  },
  // /timeline has no backend module gate → roles only.
  {
    name: "Activity Feed",
    href: "/timeline",
    icon: CalendarClock,
    roles: STANDARD_ROLES,
  },

  // AI Workspace — /ai-hub and /marketing-support are gated by ai_agents on the backend.
  {
    name: "AI Assistant",
    href: "/ai-hub",
    icon: Bot,
    roles: STANDARD_ROLES,
    module: "ai_assistant",
  },
  {
    name: "Executive Operations",
    href: "/executive-assistant",
    icon: Command,
    roles: STANDARD_ROLES,
  },
  {
    name: "AI Content Assistant",
    href: "/marketing-support",
    icon: Headphones,
    roles: STANDARD_ROLES,
    module: "ai_content_assistant",
  },

  // People. Employee Profiles are supplied by HR_MODULES; /users remains
  // account administration and is intentionally labelled separately.
  { name: "User Accounts", href: "/users", icon: UserCog, roles: TEAM_ROLES },
  { name: "Users", href: "/users", icon: Users, roles: TEAM_ROLES },
  {
    name: "My People",
    href: "/my-team",
    icon: HeartHandshake,
    roles: [ROLE.LEAD],
  },
  // /attendance has no backend module gate — Attendance must be visible to every role.
  {
    name: "Attendance",
    href: "/attendance",
    icon: UserCheck,
    roles: STANDARD_ROLES,
    module: "attendance",
  },
  {
    name: "Live Attendance",
    href: "/live-monitor",
    icon: MonitorCheck,
    roles: TEAM_ROLES,
    module: "live_attendance",
  },
  {
    name: "Attendance Reports",
    href: "/attendance-reports",
    icon: FileBarChart2,
    roles: STANDARD_ROLES,
    module: "attendance_reports",
  },
  {
    name: "Attendance Corrections",
    href: "/attendance/corrections",
    icon: FileWarning,
    roles: TEAM_ROLES,
  },
  {
    name: "Leave Management",
    href: "/leaves",
    icon: CalendarCheck2,
    roles: STANDARD_ROLES,
    module: "leave_management",
  },
  // Backend _can_read_departments: admin, sub_admin, manager, lead, super_admin.
  {
    name: "Departments",
    href: "/departments",
    icon: Network,
    roles: [
      ROLE.SUPER_ADMIN,
      ROLE.ADMIN,
      ROLE.SUB_ADMIN,
      ROLE.MANAGER,
      ROLE.LEAD,
    ],
  },
  {
    name: "Company Directory",
    href: "/companies",
    icon: Landmark,
    roles: [ROLE.SUPER_ADMIN],
  },
  {
    name: "Daily Updates",
    href: "/eod",
    icon: ClipboardCheck,
    roles: STANDARD_ROLES,
    module: "daily_updates",
  },

  // Finance — /invoices and /ledger are gated by invoicing_ledger on the backend.
  {
    name: "Invoices",
    href: "/invoices",
    icon: Receipt,
    roles: ADMIN_ROLES,
    module: "invoices",
  },
  {
    name: "Transactions",
    href: "/ledger",
    icon: DollarSign,
    roles: ADMIN_ROLES,
    module: "transactions",
  },
  {
    name: "Subscriptions",
    href: "/subscriptions",
    icon: CreditCard,
    roles: ADMIN_ROLES,
  },

  // Insights — /reports has no backend module gate; /sales/reports is gated by sales_crm.
  {
    name: "Workspace Reports",
    href: "/reports",
    icon: LineChart,
    roles: STANDARD_ROLES,
  },
  {
    name: "Sales Reports",
    href: "/sales/reports",
    icon: TrendingUp,
    roles: STANDARD_ROLES,
    module: "sales_reports",
  },

  // Settings
  {
    name: "System Settings",
    href: "/settings",
    icon: Settings,
    roles: STANDARD_ROLES,
  },
  {
    name: "Roles & Permissions",
    href: "/admin-permissions",
    icon: ShieldCheck,
    roles: ADMIN_ROLES,
  },
  {
    name: "Automation Rules",
    href: "/workflows",
    icon: GitBranch,
    roles: ADMIN_ROLES,
    module: "automation_rules",
  },
  {
    name: "Google Workspace",
    href: "/google-workspace",
    icon: Globe,
    roles: STANDARD_ROLES,
  },
  {
    name: "Activity Logs",
    href: "/activity",
    icon: AlarmClockCheck,
    roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD],
    module: "activity_logs",
  },
  // Phase 8 — My HR (Employee Self-Service) sub-pages. The section link itself
  // opens /hr/me (the Overview); the SectionTabs bar renders these as tabs.
  { name: "My Profile", href: "/hr/me/profile", icon: UserRound, roles: STANDARD_ROLES },
  { name: "My Attendance", href: "/hr/me/attendance", icon: UserCheck, roles: STANDARD_ROLES },
  { name: "My Leave", href: "/hr/me/leave", icon: CalendarCheck2, roles: STANDARD_ROLES },
  { name: "My Documents", href: "/hr/me/documents", icon: FileText, roles: STANDARD_ROLES },
  { name: "My Payslips", href: "/hr/me/payslips", icon: Receipt, roles: STANDARD_ROLES },
  { name: "SOP Library", href: "/sop-library", icon: BookOpenText },
];

// ── CRM items (Sales + Clients). Was "CRM Tools" — split by team. ──────────────────────────────
// Client pages sit under the sales_crm module (auto-granted to Manager/Lead/Employee by backend
// require_module); roles limit them to the team. Client Settings matches CRMSettingsGuard.
export const crmNavigation = [
  {
    name: "Leads",
    href: "/crm/leads",
    icon: UserRoundSearch,
    roles: STANDARD_ROLES,
    module: "leads",
  },
  {
    name: "All Leads",
    href: "/crm/leads/all",
    icon: Users,
    roles: STANDARD_ROLES,
    module: "leads",
  },
  ...CRM_PIPELINE_STAGE_ITEMS,
  {
    name: "Pipeline",
    href: "/crm/pipeline",
    icon: GitBranch,
    roles: STANDARD_ROLES,
    module: "sales_pipeline",
  },
  {
    name: "Companies",
    href: "/crm/companies",
    icon: Factory,
    roles: TEAM_ROLES,
    module: "companies",
  },
  {
    name: "Contacts",
    href: "/crm/contacts",
    icon: UserCheck,
    roles: TEAM_ROLES,
    module: "contacts",
  },
  {
    name: "Meta Messages",
    href: "/crm/inbox",
    icon: MessageSquareText,
    roles: STANDARD_ROLES,
    module: "meta_messages",
  },
  {
    name: "Client Calendar",
    href: "/crm/calendar",
    icon: CalendarRange,
    roles: TEAM_ROLES,
    module: "client_calendar",
  },
  {
    name: "Client Insights",
    href: "/crm/reports",
    icon: LineChart,
    roles: TEAM_ROLES,
    module: "client_insights",
  },
  {
    name: "Client Settings",
    href: "/crm/settings",
    icon: Settings,
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
];

// ── Meta omnichannel items (Inbox + Publishing + Settings). Routes stay as the real panels. ─────
// Every meta panel lives behind /crm/settings, which is guarded by CRMSettingsGuard
// (company admin + manager) — so all of them share CRM_SETTINGS_ROLES.
export const metaNavigation = [
  {
    name: "Publishing Centre",
    href: "/crm/settings?meta=command-center",
    icon: Gauge,
    roles: CRM_SETTINGS_ROLES,
    module: "publishing_centre",
  },
  {
    name: "WhatsApp",
    href: "/crm/settings?meta=whatsapp",
    icon: Headphones,
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
  {
    name: "Instagram",
    href: "/crm/settings?meta=instagram",
    icon: Megaphone,
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
  {
    name: "Messenger",
    href: "/crm/settings?meta=messenger",
    icon: BellRing,
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
  {
    name: "AI Replies",
    href: "/crm/settings?meta=ai-drafts",
    icon: Bot,
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
  {
    name: "Approval Queue",
    href: "/crm/settings?meta=approval-queue",
    icon: ShieldCheck,
    badge: "Soon",
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
  {
    name: "Connected Accounts",
    href: "/crm/settings?meta=identity",
    icon: Network,
    roles: CRM_SETTINGS_ROLES,
    module: "meta_settings",
  },
  {
    name: "Publishing Analytics",
    href: "/crm/settings?meta=analytics",
    icon: LineChart,
    badge: "Soon",
    roles: CRM_SETTINGS_ROLES,
    module: "publishing_analytics",
  },
  {
    name: "Integrations",
    href: "/crm/settings?meta=readiness",
    icon: ClipboardCheck,
    badge: "Soon",
    roles: CRM_SETTINGS_ROLES,
    module: "integrations",
  },
  {
    name: "Social Accounts",
    href: "/crm/settings?meta=connect",
    icon: Settings,
    badge: "Soon",
    roles: CRM_SETTINGS_ROLES,
    module: "social_accounts",
  },
];

// ── HR items: rename for plain business English (spec §8 People) and drop merged/hidden ones ───
export const HR_ITEM_RENAMES = {
  "HR Dashboard": "HR Dashboard",
  "HR Reports": "HR Reports",
  "Recruitment Dashboard": "Hiring Dashboard",
  Jobs: "Job Openings",
  Inbox: "Recruitment Inbox",
  "Resume Pool": "Talent Pool",
  Reports: "Hiring Reports",
  Documents: "HR Documents",
};
// "Candidate Interview Screen" is a workflow screen, not a navigation item —
// hidden per the exact-structure rule.
export const HR_ITEM_SKIP = new Set(["Candidate Interview Screen"]);

// ── Item icon colours (extended map, keyed by NEW display names) ───────────────────────────────
export const ITEM_COLORS = {
  Home: "text-cyan-400",
  Calendar: "text-fuchsia-400",

  Leads: "text-sky-400",
  "All Leads": "text-indigo-400",
  Acquire: "text-sky-400",
  Qualify: "text-amber-400",
  Discovery: "text-violet-400",
  Proposal: "text-indigo-400",
  Negotiation: "text-orange-400",
  Agreement: "text-purple-400",
  Won: "text-green-400",
  Lost: "text-rose-400",
  Pipeline: "text-cyan-300",
  "Import Leads": "text-orange-400",

  "All Clients": "text-blue-400",
  Companies: "text-blue-400",
  Contacts: "text-indigo-400",
  "Client Calendar": "text-fuchsia-400",
  "Client Insights": "text-lime-400",

  Projects: "text-indigo-400",
  Tasks: "text-violet-400",
  Requests: "text-purple-400",
  "Scheduled Work": "text-amber-400",
  "Time Tracking": "text-amber-400",

  "Content Overview": "text-rose-400",
  "Content": "text-pink-400",
  "Content Calendar": "text-indigo-300",
  "Content Studio": "text-pink-400",

  "Publishing Centre": "text-blue-400",
  "Social Accounts": "text-indigo-400",
  "Publishing Analytics": "text-lime-400",
  Integrations: "text-orange-400",

  WhatsApp: "text-emerald-400",
  Instagram: "text-pink-400",
  Messenger: "text-sky-400",
  "Meta Messages": "text-blue-300",
  Notifications: "text-rose-400",
  "Activity Feed": "text-pink-400",
  "Daily Updates": "text-teal-400",
  "AI Replies": "text-purple-400",
  "Approval Queue": "text-amber-400",

  "AI Assistant": "text-purple-400",
  "AI Content Assistant": "text-rose-400",

  Employees: "text-emerald-400",
  "User Accounts": "text-gray-400",
  Documents: "text-sky-400",
  "Document Types": "text-amber-400",
  "My People": "text-pink-400",
  Attendance: "text-orange-400",
  "Live Attendance": "text-amber-400",
  "Attendance Reports": "text-yellow-400",
  "Attendance Corrections": "text-orange-400",
  "Leave Management": "text-emerald-400",
  "Attendance Policy": "text-blue-400",
  Holidays: "text-rose-400",
  "Salary Components": "text-emerald-400",
  "Leave Types": "text-violet-400",
  "Leave Allocations": "text-indigo-400",
  Payroll: "text-yellow-400",
  Departments: "text-indigo-400",
  "Company Directory": "text-blue-400",

  "Hiring Dashboard": "text-green-400",
  "Job Openings": "text-emerald-300",
  Applications: "text-blue-300",
  Candidates: "text-purple-300",
  "Talent Pool": "text-amber-300",
  Interviews: "text-pink-300",
  "Hiring Reports": "text-lime-300",

  Invoices: "text-emerald-400",
  Transactions: "text-yellow-400",
  Subscriptions: "text-teal-400",

  "Workspace Reports": "text-lime-400",
  "Sales Reports": "text-sky-400",

  "System Settings": "text-gray-400",
  "Roles & Permissions": "text-red-400",
  "Automation Rules": "text-purple-400",
  "Connected Accounts": "text-cyan-400",
  "Google Workspace": "text-blue-400",
  "Activity Logs": "text-orange-400",
  "Client Settings": "text-gray-400",

  // Phase 8 — My HR
  "My Profile": "text-indigo-400",
  "My Attendance": "text-orange-400",
  "My Leave": "text-emerald-400",
  "My Documents": "text-sky-400",
  "My Payslips": "text-yellow-400",

  default: "text-gray-400",
};

// ── Section header colours, keyed by section key ───────────────────────────────────────────────
export const SECTION_COLORS = {
  home: "text-cyan-400",
  sales: "text-sky-400",
  clients: "text-blue-400",
  work: "text-indigo-400",
  content: "text-pink-400",
  publishing: "text-amber-400",
  inbox: "text-sky-400",
  ai: "text-purple-400",
  people: "text-orange-400",
  recruitment: "text-emerald-400",
  finance: "text-yellow-400",
  insights: "text-lime-400",
  settings: "text-gray-400",
  me: "text-emerald-400",
  sop: "text-teal-400",
  default: "text-gray-400",
};

// NOTE: SECTION_DOT_COLORS (the old group-header dot swatches) was removed with the tab sub-nav
// plan — the sidebar now renders section links without sub-item groups.

// ── Route → section/item resolution (Phase 5 breadcrumbs, spec §10.5) ────────
// Lets the header breadcrumb reuse the SAME section labels + item names as the
// sidebar, so "Home → Section → Page" always matches what the user sees in nav.

// Build renamed HR nav items so they can be looked up by their display name
// (e.g. "Hiring Dashboard", "Job Openings") inside SECTION_ITEM_PAIRS.
const hrNavItemsByName = HR_MODULES.flatMap((mod) =>
  mod.navigation
    .filter((item) => !HR_ITEM_SKIP.has(item.name))
    .map((item) => {
      const displayName = HR_ITEM_RENAMES[item.name] || item.name;
      return {
        ...item,
        name: displayName,
        match: item.href === mod.basePath ? mod.basePath : undefined,
      };
    }),
).reduce((acc, item) => {
  acc[item.name] = item;
  return acc;
}, {});

const NAV_ITEM_BY_NAME = {
  ...[...navigation, ...crmNavigation, ...metaNavigation].reduce(
    (acc, item) => {
      acc[item.name] = item;
      return acc;
    },
    {},
  ),
  ...hrNavItemsByName,
};

const SECTION_ITEM_PAIRS = SECTIONS.flatMap((section) =>
  section.items.map((name) => ({ section, item: NAV_ITEM_BY_NAME[name] })),
).filter((pair) => pair.item);

// HR paths that should NOT render the tab bar (workflow-only screens).
export const HR_EXCLUDED_PATHS = ["/hr/recruitment/interview-screen"];

// Returns { sectionLabel, itemName, itemPath, matchedExact } for the sidebar item
// that owns `pathname`, or null when the route is not present in the sidebar
// (chat, meetings, HR screens, ...). Query-string items (meta panels) match on
// pathname + full query so ?meta=whatsapp resolves to Inbox, not Settings.
export const getNavContextForPath = (pathname, search = "") => {
  // Two passes: exact matches win over prefix matches, so a sibling page such as
  // /crm/leads/all resolves to "All Leads", not to the /crm/leads prefix of "Leads".
  // For prefix matches, track the longest matching prefix so that /hr/recruitment/jobs/123
  // resolves to "Job Openings" (prefix /hr/recruitment/jobs) and not "Hiring Dashboard"
  // (prefix /hr/recruitment).
  let prefixMatch = null;
  let maxPrefixLen = 0;
  for (const { section, item } of SECTION_ITEM_PAIRS) {
    const [itemPath, itemSearch = ""] = item.href.split("?");
    if (itemSearch) {
      const expected = new URLSearchParams(itemSearch);
      const actual = new URLSearchParams(search);
      if (
        pathname === itemPath &&
        [...expected].every(([key, value]) => actual.get(key) === value)
      ) {
        return {
          sectionKey: section.key,
          sectionLabel: section.label,
          itemName: item.name,
          itemPath,
          matchedExact: true,
        };
      }
    } else if (pathname === itemPath) {
      return {
        sectionKey: section.key,
        sectionLabel: section.label,
        itemName: item.name,
        itemPath,
        matchedExact: true,
      };
    } else if (
      pathname.startsWith(`${itemPath}/`) &&
      itemPath.length > maxPrefixLen
    ) {
      maxPrefixLen = itemPath.length;
      prefixMatch = {
        sectionKey: section.key,
        sectionLabel: section.label,
        itemName: item.name,
        itemPath,
        matchedExact: false,
      };
    }
  }
  return prefixMatch;
};

// ── Centralized HR route ownership resolver ─────────────────────────────────
// Single source of truth for "which section owns this /hr/* path?".
// Used by SectionTabs, breadcrumbs, and any other consumer that needs to map
// an HR route to its owning section ("people" or "recruitment").
//
// Returns { sectionKey, itemName, matchedExact } or null for excluded/unknown paths.
//   sectionKey   — "people" | "recruitment"
//   itemName     — The display name of the matched nav item (e.g. "Employees")
//   matchedExact — true when pathname equals the item's href exactly
//
// Pre-computed once from HR_MODULES so every call is O(n) with a small constant.
const _HR_ROUTE_LIST = HR_MODULES.flatMap((mod) =>
  mod.navigation
    .filter((item) => !HR_ITEM_SKIP.has(item.name))
    .map((item) => ({
      name: HR_ITEM_RENAMES[item.name] || item.name,
      href: (item.href || "").split("?")[0],
      basePath: mod.basePath,
      moduleKey: mod.key,
    })),
);

export const resolveHrSection = (pathname) => {
  if (!pathname?.startsWith("/hr")) return null;

  const hrPath = (item) => (item.href || "").split("?")[0];

  // Excluded paths — intentionally return null so the caller shows no section context.
  if (pathname === "/hr" || pathname === "/hr/recruitment/interview-screen") return null;

  // Exact match — the pathname equals an HR nav item's href.
  const hrExact = _HR_ROUTE_LIST.find((item) => pathname === item.href);
  if (hrExact) {
    const sectionKey = hrExact.moduleKey === "recruitment" ? "recruitment" : "people";
    return { sectionKey, itemName: hrExact.name, matchedExact: true };
  }

  // Longest prefix match — /hr/employees/:id → "Employees", /hr/recruitment/jobs/123 → "Job Openings".
  let bestMatch = null;
  let bestLen = 0;
  for (const item of _HR_ROUTE_LIST) {
    const base = item.href;
    if (pathname.startsWith(`${base}/`) && base.length > bestLen) {
      bestLen = base.length;
      bestMatch = item;
    }
  }
  if (bestMatch) {
    const sectionKey = bestMatch.moduleKey === "recruitment" ? "recruitment" : "people";
    return { sectionKey, itemName: bestMatch.name, matchedExact: false };
  }

  return null;
};

// ── Shared gating helpers (Phase A of the tab sub-nav plan) ──────────────────
// One source of truth for "which items does section X show for user U", used by BOTH the
// Sidebar (section visibility + favorites pool) and the SectionTabs bar, so the two can never
// drift apart. The rules below reproduce exactly what Sidebar.jsx computed inline before Phase A.

// Single source of truth: delegates to utils/rbac.js `hasModuleAccess` (the
// canonical mirror of backend `require_module`). That version honors the member's
// explicit `modules` list — a deselected module (e.g. sales_crm) is truly hidden
// for non-admin roles, while legacy (pre-permission-system) lists keep the role
// auto-grants. People/HR modules use `module: "hr"`, Recruitment uses
// `module: "recruitment"` — the two permission domains are independent.
export const hasModuleAccess = (user, module) => {
  if (!module) return true;
  return hasModuleAccessFromRbac(user?.role, user?.modules, module);
};

export const hasCapabilityAccess = (user, capability) => {
  if (!capability) return true;
  const role = normalizeRole(user?.role);
  if (isSuperAdminRole(role)) return true;
  const capabilities = new Set(user?.capabilities || user?.permissions || []);
  return capabilities.has(capability);
};

export const hasDepartmentAccess = (user, department) => {
  if (!department) return true;
  const role = normalizeRole(user?.role);
  if (isSuperAdminRole(role)) return true;
  const userDepartment = String(
    user?.department || user?.department_key || "",
  ).toLowerCase();
  if (!userDepartment) return true;
  return String(department).toLowerCase() === userDepartment;
};

// Role + module + capability + department gate for a single nav item.
export const gateNavItem = (user, item) => {
  const role = normalizeRole(user?.role);
  const roleAllowed =
    !item.roles ||
    item.roles.includes(role) ||
    (role === ROLE.SUB_ADMIN && item.roles.includes(ROLE.ADMIN));
  if (!roleAllowed) return false;
  if (!hasModuleAccess(user, item.module)) return false;
  if (!hasCapabilityAccess(user, item.capability)) return false;
  return hasDepartmentAccess(user, item.department);
};

// Phase 4 section-level gate (spec §9). Non-standard roles fall through to item gates.
export const isSectionVisible = (section, user) => {
  if (!section.roles) return true;
  const role = normalizeRole(user?.role);
  if (!STANDARD_ROLES.includes(role)) return true;
  return (
    section.roles.includes(role) ||
    (role === ROLE.SUB_ADMIN && section.roles.includes(ROLE.ADMIN))
  );
};

// HR items (renamed for People, merged/hidden items skipped) — same rules as the old Sidebar.
// ownerFilter: "people" | "recruitment" | undefined (all)
const getHrNavItems = (user, ownerFilter) => {
  const role = normalizeRole(user?.role);
  // Company admins (incl. SUB_ADMIN) + managers + HR-department staff. Super
  // admins are granted too — the backend treats them as full HR access.
  const userDepartment = String(
    user?.department || user?.department_key || "",
  ).toLowerCase();
  const canSeeHr =
    isManagerRole(role) ||
    userDepartment === "hr" ||
    role === ROLE.ADMIN ||
    role === ROLE.SUB_ADMIN ||
    isSuperAdminRole(role);
  if (!canSeeHr) return [];
  return HR_MODULES.filter(
    (module) =>
      module.roles.includes(role) &&
      // Filter by owner section if specified
      (!ownerFilter || module.owner === ownerFilter) &&
      // Each module is gated by its own permission domain:
      // People/HR modules use `module: "hr"`, Recruitment uses `module: "recruitment"`.
      hasModuleAccess(user, module.module) &&
      hasCapabilityAccess(user, module.capability) &&
      hasDepartmentAccess(user, module.department),
  ).flatMap((module) =>
    module.navigation
      .filter((item) => !HR_ITEM_SKIP.has(item.name))
      .map((item) => ({
        ...item,
        name: HR_ITEM_RENAMES[item.name] || item.name,
        match: item.href === module.basePath ? module.basePath : undefined,
        moduleKey: module.key,
      })),
  );
};

// Final, gated, ordered items for a section — the single source both the sidebar and the
// SectionTabs bar render from. People appends dynamic "Your Departments" tabs + HR items.
export const getSectionItems = (sectionKey, user, orgDepartments = []) => {
  const section = SECTIONS.find((s) => s.key === sectionKey);
  if (!section || !isSectionVisible(section, user)) return [];

  if (sectionKey === "recruitment") {
    // Only return Recruitment-owned HR modules.
    return getHrNavItems(user, "recruitment");
  }

  const items = section.items
    .map((name) => NAV_ITEM_BY_NAME[name])
    .filter((item) => item && gateNavItem(user, item));

  if (sectionKey === "people") {
    // Append People-owned HR items from HR_MODULES (employees, documents,
    // payroll, attendance, leave, settings). These use HR gating logic.
    const hrPeopleItems = getHrNavItems(user, "people");
    // Deduplicate: only add HR items not already in the static list
    const existingHrefs = new Set(items.map((i) => i.href));
    for (const item of hrPeopleItems) {
      if (!existingHrefs.has(item.href)) {
        items.push(item);
      }
    }
    // Dynamic department sub-items
    const deptIndex = items.findIndex((item) => item.name === "Departments");
    const departmentItems = orgDepartments.map((department) => ({
      name: department.name,
      href: `/admin-permissions?department=${encodeURIComponent(department.id)}`,
      icon: Network,
      departmentItem: true,
    }));
    if (deptIndex !== -1) items.splice(deptIndex + 1, 0, ...departmentItems);
  }
  return items;
};

// Active-state check for a single item against the current location (shared by sidebar + tabs).
export const isNavItemActive = (item, location) => {
  const [itemPath, itemSearch = ""] = (item.href || "").split("?");
  if (itemSearch) {
    const expected = new URLSearchParams(itemSearch);
    const actual = new URLSearchParams(location.search);
    return (
      location.pathname === itemPath &&
      [...expected].every(([key, value]) => actual.get(key) === value)
    );
  }
  if (
    item.key === "qualification" &&
    new URLSearchParams(location.search).has("stage")
  )
    return false;
  return (
    location.pathname === itemPath ||
    (item.match && location.pathname.startsWith(item.match)) ||
    location.pathname.startsWith(`${itemPath}/`)
  );
};
