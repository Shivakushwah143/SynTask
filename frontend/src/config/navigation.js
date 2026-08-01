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
  Receipt,
  Settings,
  ShieldCheck,
  TimerReset,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRoundSearch,
  Users,
  Globe,
} from "lucide-react";
import { ROLE, isManagerRole, isSuperAdminRole, normalizeRole } from "../utils/roles";
import { HR_MODULES } from "./hrModules";

// NOTE: NAV_GROUPS_OPEN_KEY (collapsible-group expand state) was removed in the tab sub-nav plan
// (Phase D). The sidebar no longer has collapsible groups, so stale localStorage keys are ignored.

// ── Icon mapping for the 12 top-level sections (spec §10.4, mapped to the project's icon set) ──
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
  finance: DollarSign,
  insights: LineChart,
  settings: Settings,
};

// ── Section-level role gates (spec §9, mapped to the real role enum) ───────────────────────────
// Non-standard roles (hr_manager, recruiter, interviewer, department_manager, ...) are NOT listed
// here — they fall through to the existing item-level role/module/capability/department gates in
// Sidebar.jsx. Section-level gates only refine the six standard roles below.
// NOTE: a section only ever renders if at least one of its items survives the item-level gates too,
// so these lists can restrict but never broaden access.
export const STANDARD_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE];
// Visible to everyone except plain Employees (spec §9: Employee sees Home, Work, Inbox only).
const TEAM_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD];
// Settings: only admins / super admins (spec §9: Manager, Team Lead and Employee hide Settings).
const ADMIN_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN];

// ── Top-level section structure (spec §2 + §8). Items are resolved by name. ──
// Items listed here but with no existing route are intentionally omitted (hidden until the page
// is built) — see the Phase 0 hide/link/build decision table.
export const SECTIONS = [
  { key: "home", label: "Home", roles: STANDARD_ROLES, items: ["Home", "Calendar"] },
  { key: "sales", label: "Sales", roles: TEAM_ROLES, items: ["Leads", "Pipeline", "Import Leads"] },
  { key: "clients", label: "Clients", roles: TEAM_ROLES, items: ["All Clients", "Companies", "Contacts", "Client Calendar", "Client Insights"] },
  { key: "work", label: "Work", roles: STANDARD_ROLES, items: ["Projects", "Tasks", "Requests", "Scheduled Work", "Time Tracking"] },
  { key: "content", label: "Content", roles: TEAM_ROLES, items: ["Content Calendar", "Content Studio"] },
  { key: "publishing", label: "Publishing", roles: TEAM_ROLES, items: ["Publishing Centre", "Social Accounts", "Publishing Analytics", "Integrations"] },
  { key: "inbox", label: "Inbox", roles: STANDARD_ROLES, items: ["WhatsApp", "Instagram", "Messenger", "Meta Messages", "Notifications", "Activity Feed", "Daily Updates", "AI Replies", "Approval Queue"] },
  { key: "ai", label: "AI Workspace", roles: TEAM_ROLES, items: ["AI Assistant", "AI Content Assistant"] },
  { key: "people", label: "People", roles: TEAM_ROLES, items: ["Employees", "My People", "Attendance", "Live Attendance", "Attendance Reports", "Leave Management", "Departments", "Company Directory"] },
  { key: "finance", label: "Finance", roles: TEAM_ROLES, items: ["Invoices", "Transactions", "Subscriptions"] },
  { key: "insights", label: "Insights", roles: TEAM_ROLES, items: ["Workspace Reports", "Sales Reports"] },
  { key: "settings", label: "Settings", roles: ADMIN_ROLES, items: ["System Settings", "Roles & Permissions", "Automation Rules", "Connected Accounts", "Google Workspace", "Activity Logs", "Client Settings"] },
];

// ── Flat navigation items (renamed per spec §4, routes corrected to App.jsx) ──────────────────
export const navigation = [
  // Home
  { name: "Home", href: "/dashboard", icon: LayoutDashboard, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Calendar", href: "/calendar", icon: CalendarDays, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "tasks_projects" },

  // Sales (Pipeline/Leads live in crmNavigation; kept gated by sales_crm like the old "CRM" item)
  { name: "Import Leads", href: "/bulk-leads", icon: Megaphone, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.SUPER_ADMIN], module: "sales_crm" },

  // Clients
  { name: "All Clients", href: "/clients", icon: Briefcase, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN], module: "invoicing_ledger" },

  // Work
  { name: "Projects", href: "/projects", icon: FolderKanban, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "tasks_projects" },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "tasks_projects" },
  { name: "Requests", href: "/tickets", icon: ClipboardList, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "tickets" },
  { name: "Scheduled Work", href: "/scheduled-jobs", icon: CalendarClock, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.MANAGER], module: "tasks_projects" },
  { name: "Time Tracking", href: "/timesheet", icon: TimerReset, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "tasks_projects" },

  // Content
  { name: "Content Calendar", href: "/content-calendar", icon: CalendarCheck2, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER, ROLE.SUPER_ADMIN], module: "ai_agents" },
  { name: "Content Studio", href: "/creative-director", icon: Palette, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "ai_agents" },

  // Inbox (core items; channel items live in metaNavigation)
  { name: "Notifications", href: "/notifications", icon: BellRing, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Activity Feed", href: "/timeline", icon: CalendarClock, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "tasks_projects" },
  { name: "Daily Updates", href: "/eod", icon: ClipboardCheck, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },

  // AI Workspace
  { name: "AI Assistant", href: "/ai-hub", icon: Bot, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "ai_agents" },
  { name: "AI Content Assistant", href: "/marketing-support", icon: Headphones, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER, ROLE.SUPER_ADMIN], module: "ai_agents" },

  // People
  { name: "Employees", href: "/users", icon: UserCog, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN] },
  { name: "My People", href: "/my-team", icon: HeartHandshake, roles: [ROLE.LEAD] },
  { name: "Attendance", href: "/attendance", icon: UserCheck, roles: [ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Live Attendance", href: "/live-monitor", icon: MonitorCheck, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.MANAGER] },
  { name: "Attendance Reports", href: "/attendance-reports", icon: FileBarChart2, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Leave Management", href: "/leaves", icon: CalendarCheck2, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Departments", href: "/departments", icon: Network, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN] },
  { name: "Company Directory", href: "/companies", icon: Landmark, roles: [ROLE.SUPER_ADMIN] },

  // Finance
  { name: "Invoices", href: "/invoices", icon: Receipt, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN], module: "invoicing_ledger" },
  { name: "Transactions", href: "/ledger", icon: DollarSign, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN], module: "invoicing_ledger" },
  { name: "Subscriptions", href: "/subscriptions", icon: CreditCard, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN] },

  // Insights
  { name: "Workspace Reports", href: "/reports", icon: LineChart, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "reports" },
  { name: "Sales Reports", href: "/sales/reports", icon: TrendingUp, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "sales" },

  // Settings
  { name: "System Settings", href: "/settings", icon: Settings, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Roles & Permissions", href: "/admin-permissions", icon: ShieldCheck, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN] },
  { name: "Automation Rules", href: "/workflows", icon: GitBranch, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN] },
  { name: "Google Workspace", href: "/google-workspace", icon: Globe, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER] },
  { name: "Activity Logs", href: "/activity", icon: AlarmClockCheck, roles: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD] },
];

// ── CRM items (Sales + Clients). Was "CRM Tools" — split by team. ──────────────────────────────
export const crmNavigation = [
  { name: "Leads", href: "/crm/leads", icon: UserRoundSearch, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "sales_crm" },
  { name: "Pipeline", href: "/crm/pipeline", icon: GitBranch, roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER], module: "sales_crm" },
  { name: "Companies", href: "/crm/companies", icon: Factory },
  { name: "Contacts", href: "/crm/contacts", icon: UserCheck },
  { name: "Meta Messages", href: "/crm/inbox", icon: MessageSquareText },
  { name: "Client Calendar", href: "/crm/calendar", icon: CalendarRange },
  { name: "Client Insights", href: "/crm/reports", icon: LineChart },
  { name: "Client Settings", href: "/crm/settings", icon: Settings },
];

// ── Meta omnichannel items (Inbox + Publishing + Settings). Routes stay as the real panels. ─────
export const metaNavigation = [
  { name: "Publishing Centre", href: "/crm/settings?meta=command-center", icon: Gauge },
  { name: "WhatsApp", href: "/crm/settings?meta=whatsapp", icon: Headphones },
  { name: "Instagram", href: "/crm/settings?meta=instagram", icon: Megaphone },
  { name: "Messenger", href: "/crm/settings?meta=messenger", icon: BellRing },
  { name: "AI Replies", href: "/crm/settings?meta=ai-drafts", icon: Bot },
  { name: "Approval Queue", href: "/crm/settings?meta=approval-queue", icon: ShieldCheck, badge: "Soon" },
  { name: "Connected Accounts", href: "/crm/settings?meta=identity", icon: Network },
  { name: "Publishing Analytics", href: "/crm/settings?meta=analytics", icon: LineChart, badge: "Soon" },
  { name: "Integrations", href: "/crm/settings?meta=readiness", icon: ClipboardCheck, badge: "Soon" },
  { name: "Social Accounts", href: "/crm/settings?meta=connect", icon: Settings, badge: "Soon" },
];

// ── HR items: rename for plain business English (spec §8 People) and drop merged/hidden ones ───
export const HR_ITEM_RENAMES = {
  "Recruitment Dashboard": "Hiring Dashboard",
  "Jobs": "Job Openings",
  "Inbox": "Applications",
  "Resume Pool": "Talent Pool",
  "Reports": "Hiring Reports",
};
// "Employees" is merged into People → Employees (/users). "Candidate Interview Screen" is a
// workflow screen, not a navigation item — hidden per the exact-structure rule.
export const HR_ITEM_SKIP = new Set(["Employees", "Candidate Interview Screen"]);

// ── Item icon colours (extended map, keyed by NEW display names) ───────────────────────────────
export const ITEM_COLORS = {
  Home: "text-cyan-400",
  Calendar: "text-fuchsia-400",

  Leads: "text-sky-400",
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

  Employees: "text-gray-400",
  "My People": "text-pink-400",
  Attendance: "text-orange-400",
  "Live Attendance": "text-amber-400",
  "Attendance Reports": "text-yellow-400",
  "Leave Management": "text-emerald-400",
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
  finance: "text-yellow-400",
  insights: "text-lime-400",
  settings: "text-gray-400",
  default: "text-gray-400",
};

// NOTE: SECTION_DOT_COLORS (the old group-header dot swatches) was removed with the tab sub-nav
// plan — the sidebar now renders section links without sub-item groups.

// ── Route → section/item resolution (Phase 5 breadcrumbs, spec §10.5) ────────
// Lets the header breadcrumb reuse the SAME section labels + item names as the
// sidebar, so "Home → Section → Page" always matches what the user sees in nav.
const NAV_ITEM_BY_NAME = [...navigation, ...crmNavigation, ...metaNavigation].reduce((acc, item) => {
  acc[item.name] = item;
  return acc;
}, {});

const SECTION_ITEM_PAIRS = SECTIONS.flatMap((section) =>
  section.items.map((name) => ({ section, item: NAV_ITEM_BY_NAME[name] }))
).filter((pair) => pair.item);

// Returns { sectionLabel, itemName, itemPath, matchedExact } for the sidebar item
// that owns `pathname`, or null when the route is not present in the sidebar
// (chat, meetings, HR screens, ...). Query-string items (meta panels) match on
// pathname + full query so ?meta=whatsapp resolves to Inbox, not Settings.
export const getNavContextForPath = (pathname, search = "") => {
  for (const { section, item } of SECTION_ITEM_PAIRS) {
    const [itemPath, itemSearch = ""] = item.href.split("?");
    if (itemSearch) {
      const expected = new URLSearchParams(itemSearch);
      const actual = new URLSearchParams(search);
      if (pathname === itemPath && [...expected].every(([key, value]) => actual.get(key) === value)) {
        return { sectionKey: section.key, sectionLabel: section.label, itemName: item.name, itemPath, matchedExact: true };
      }
    } else if (pathname === itemPath) {
      return { sectionKey: section.key, sectionLabel: section.label, itemName: item.name, itemPath, matchedExact: true };
    } else if (pathname.startsWith(`${itemPath}/`)) {
      return { sectionKey: section.key, sectionLabel: section.label, itemName: item.name, itemPath, matchedExact: false };
    }
  }
  return null;
};

// ── Shared gating helpers (Phase A of the tab sub-nav plan) ──────────────────
// One source of truth for "which items does section X show for user U", used by BOTH the
// Sidebar (section visibility + favorites pool) and the SectionTabs bar, so the two can never
// drift apart. The rules below reproduce exactly what Sidebar.jsx computed inline before Phase A.

// Same module logic as the old Sidebar.hasModule closure.
export const hasModuleAccess = (user, module) => {
  if (!module) return true;
  const role = normalizeRole(user?.role);
  if (isSuperAdminRole(role)) return true;
  if ([ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE].includes(role)) return true;
  const userModules = user?.modules || [];
  if (module === "sales_crm") return userModules.includes("sales_crm") || userModules.includes("sales");
  if (module === "sales") return userModules.includes("sales") || userModules.includes("sales_crm");
  return userModules.includes(module);
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
  const userDepartment = String(user?.department || user?.department_key || "").toLowerCase();
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
  return section.roles.includes(role) || (role === ROLE.SUB_ADMIN && section.roles.includes(ROLE.ADMIN));
};

// HR items (renamed for People, merged/hidden items skipped) — same rules as the old Sidebar.
const getHrNavItems = (user) => {
  const role = normalizeRole(user?.role);
  const userDepartment = String(user?.department || user?.department_key || "").toLowerCase();
  const canSeeHr =
    isManagerRole(role) || userDepartment === "hr" || role === ROLE.ADMIN || role === ROLE.SUB_ADMIN;
  if (!canSeeHr) return [];
  return HR_MODULES.filter(
    (module) =>
      module.roles.includes(role) &&
      (hasModuleAccess(user, module.module) || module.key === "recruitment") &&
      hasCapabilityAccess(user, module.capability) &&
      hasDepartmentAccess(user, module.department)
  ).flatMap((module) =>
    module.navigation
      .filter((item) => !HR_ITEM_SKIP.has(item.name))
      .map((item) => ({
        ...item,
        name: HR_ITEM_RENAMES[item.name] || item.name,
        match: item.href === module.basePath ? module.basePath : undefined,
      }))
  );
};

// Final, gated, ordered items for a section — the single source both the sidebar and the
// SectionTabs bar render from. People appends dynamic "Your Departments" tabs + HR items.
export const getSectionItems = (sectionKey, user, orgDepartments = []) => {
  const section = SECTIONS.find((s) => s.key === sectionKey);
  if (!section || !isSectionVisible(section, user)) return [];
  const items = section.items
    .map((name) => NAV_ITEM_BY_NAME[name])
    .filter((item) => item && gateNavItem(user, item));
  if (sectionKey === "people") {
    const deptIndex = items.findIndex((item) => item.name === "Departments");
    const departmentItems = orgDepartments.map((department) => ({
      name: department.name,
      href: `/admin-permissions?department=${encodeURIComponent(department.id)}`,
      icon: Network,
    }));
    if (deptIndex !== -1) items.splice(deptIndex + 1, 0, ...departmentItems);
    items.push(...getHrNavItems(user));
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
  if (item.key === "qualification" && new URLSearchParams(location.search).has("stage")) return false;
  return (
    location.pathname === itemPath ||
    (item.match && location.pathname.startsWith(item.match)) ||
    location.pathname.startsWith(`${itemPath}/`)
  );
};
