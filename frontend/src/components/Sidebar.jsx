import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlarmClockCheck,
  BellRing,
  Bot,
  Briefcase,
  CalendarCheck2,
  CalendarDays,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  Contact,
  CreditCard,
  DollarSign,
  Factory,
  FileBarChart2,
  FileCheck2,
  FolderKanban,
  Gauge,
  GitBranch,
  Headphones,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MonitorCheck,
  Network,
  Palette,
  Receipt,
  Settings,
  Star,
  TimerReset,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRoundSearch,
  X,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { ROLE, getRoleLabel, isSuperAdminRole, normalizeRole } from "../utils/roles";
import { HR_MODULES, HR_ROLES } from "../config/hrModules";
const COLLAPSE_KEY = "syntask-sidebar-collapsed";
const FAVORITES_OPEN_KEY = "syntask-sidebar-favorites-open";
const NAV_GROUPS_OPEN_KEY = "syntask-sidebar-groups-open";
const WIDTH_KEY = "syntask-sidebar-width";
const WIDTH_OPTIONS = [240, 280, 320];

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const userRole = normalizeRole(user?.role);
  const hasModule = (module) =>
    !module || user?.modules?.includes(module) || isSuperAdminRole(userRole);
  const userCapabilities = new Set(user?.capabilities || user?.permissions || []);
  const userDepartment = String(user?.department || user?.department_key || '').toLowerCase();
  const hasCapability = (capability) =>
    !capability || userCapabilities.has(capability) || isSuperAdminRole(userRole);
  const hasDepartment = (department) =>
    !department || !userDepartment || String(department).toLowerCase() === userDepartment || isSuperAdminRole(userRole);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('syntask-sidebar-favorites') || '[]')
    } catch {
      return []
    }
  });
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NAV_GROUPS_OPEN_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [favoritesOpen, setFavoritesOpen] = useState(() => {
    try {
      return localStorage.getItem(FAVORITES_OPEN_KEY) !== "false";
    } catch {
      return true;
    }
  });

  // Desktop-only "rail" mode: shrinks to icons, expands on toggle.
  // Mobile drawer (isOpen/onClose) is unaffected by this and always shows the full sidebar.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(WIDTH_KEY));
      return WIDTH_OPTIONS.includes(stored) ? stored : WIDTH_OPTIONS[1];
    } catch {
      return WIDTH_OPTIONS[1];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore (e.g. storage disabled)
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('syntask-sidebar-favorites', JSON.stringify(favorites))
    } catch {
      // ignore storage write failures
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_OPEN_KEY, String(favoritesOpen));
    } catch {
      // ignore storage write failures
    }
  }, [favoritesOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_GROUPS_OPEN_KEY, JSON.stringify(openGroups));
    } catch {
      // ignore storage write failures
    }
  }, [openGroups]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
    } catch {
      // ignore storage write failures
    }
  }, [sidebarWidth]);

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Projects",
      href: "/projects",
      icon: FolderKanban,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Service Requests",
      href: "/tickets",
      icon: ClipboardList,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Workspace Calendar",
      href: "/calendar",
      icon: CalendarDays,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Timesheet",
      href: "/timesheet",
      icon: TimerReset,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Attendance",
      href: "/attendance",
      icon: UserCheck,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Live Attendance",
      href: "/live-monitor",
      icon: MonitorCheck,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
    },
    {
      name: "Attendance Reports",
      href: "/attendance-reports",
      icon: FileBarChart2,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
    },

    {
      name: "Notifications",
      href: "/notifications",
      icon: BellRing,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Timeline",
      href: "/timeline",
      icon: CalendarClock,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Leaves",
      href: "/leaves",
      icon: CalendarCheck2,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Daily EOD",
      href: "/eod",
      icon: ClipboardCheck,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Workspace Reports",
      href: "/reports",
      icon: LineChart,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Leads",
      href: "/leads",
      icon: Contact,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "AI Command Center",
      href: "/ai-hub",
      icon: Bot,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Creative Studio",
      href: "/creative-director",
      icon: Palette,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Marketing Assistant",
      href: "/marketing-support",
      icon: Headphones,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER, ROLE.SUPER_ADMIN],
      module: "task",
    },
    {
      name: "Marketing Calendar",
      href: "/marketing/calendar",
      icon: CalendarCheck2,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER, ROLE.SUPER_ADMIN],
      module: "task",
    },
    {
      name: "CRM",
      href: "/crm/pipeline",
      match: "/crm",
      icon: TrendingUp,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "HR",
      href: "/hr",
      match: "/hr",
      icon: UserCog,
      roles: HR_ROLES,
    },
    {
      name: "Bulk Lead Import",
      href: "/bulk-leads",
      icon: Megaphone,
      roles: [ROLE.ADMIN, ROLE.SUPER_ADMIN],
      module: "sales",
    },
    {
      name: "Clients",
      href: "/clients",
      icon: Briefcase,
      roles: [ROLE.ADMIN],
      module: "task",
    },
    {
      name: "Invoices",
      href: "/invoices",
      icon: Receipt,
      roles: [ROLE.ADMIN],
      module: "task",
    },
    {
      name: "Agreements",
      href: "/msa",
      icon: FileCheck2,
      roles: [ROLE.ADMIN, ROLE.LEAD],
      module: "task",
    },
    {
      name: "Ledger",
      href: "/ledger",
      icon: DollarSign,
      roles: [ROLE.ADMIN],
      module: "task",
    },
    {
      name: "Users",
      href: "/users",
      icon: UserCog,
      roles: [ROLE.ADMIN, ROLE.SUPER_ADMIN],
    },
    {
      name: "Workflows",
      href: "/workflows",
      icon: GitBranch,
      roles: [ROLE.ADMIN],
      module: "task",
    },
    {
      name: "Departments",
      href: "/departments",
      icon: Network,
      roles: [ROLE.ADMIN],
    },
    {
      name: "My Team",
      href: "/my-team",
      icon: HeartHandshake,
      roles: [ROLE.LEAD],
      module: "task",
    },
    {
      name: "Company Directory",
      href: "/companies",
      icon: Landmark,
      roles: [ROLE.SUPER_ADMIN],
    },
    {
      name: "Subscriptions",
      href: "/subscriptions",
      icon: CreditCard,
      roles: [ROLE.ADMIN],
    },
    {
      name: "Audit Log",
      href: "/activity",
      icon: AlarmClockCheck,
      roles: [ROLE.ADMIN, ROLE.LEAD],
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
  ];

  const filteredNavigation = navigation.filter(
    (item) => item.roles.includes(userRole) && hasModule(item.module) && hasCapability(item.capability) && hasDepartment(item.department),
  );
  const toggleFavorite = (href) => {
    setFavorites((current) => (
      current.includes(href) ? current.filter((item) => item !== href) : [...current, href]
    ))
  };
  const favoriteItems = filteredNavigation.filter((item) => favorites.includes(item.href));
  const widthIndex = WIDTH_OPTIONS.indexOf(sidebarWidth);
  const prevWidth = WIDTH_OPTIONS[Math.max(0, widthIndex - 1)];
  const nextWidth = WIDTH_OPTIONS[Math.min(WIDTH_OPTIONS.length - 1, widthIndex + 1)];

  const crmNavigation = [
    {
      name: "CRM Pipeline",
      href: "/crm/pipeline",
      icon: GitBranch,
    },
    {
      name: "CRM Dashboard",
      href: "/crm/dashboard",
      icon: Gauge,
    },
    {
      name: "Leads",
      href: "/crm/leads",
      icon: UserRoundSearch,
    },
    {
      name: "CRM Companies",
      href: "/crm/companies",
      icon: Factory,
    },
    {
      name: "CRM Contacts",
      href: "/crm/contacts",
      icon: UserCheck,
    },
    // {
    //   name: "CRM Activities",
    //   href: "/crm/activities",
    //   icon: CalendarClock,
    // },
    {
      name: "CRM Calendar",
      href: "/crm/calendar",
      icon: CalendarRange,
    },
    {
      name: "CRM Reports",
      href: "/crm/reports",
      icon: LineChart,
    },
    {
      name: "CRM Configuration",
      href: "/crm/settings",
      icon: Settings,
    },
  ];

  const filteredCrmNavigation = crmNavigation
    .filter((item) => item && !['/crm/pipeline', '/crm/leads'].includes(item.href) && (item.roles ? item.roles.includes(userRole) : true) && hasCapability(item.capability) && hasDepartment(item.department));

  const hrNavigation = HR_MODULES
    .filter((module) => module.roles.includes(userRole) && (hasModule(module.module) || module.key === "recruitment") && hasCapability(module.capability) && hasDepartment(module.department))
    .flatMap((module) => module.navigation.map((item) => ({ ...item, match: item.href === module.basePath ? module.basePath : undefined })));

  const itemByName = filteredNavigation.reduce((acc, item) => {
    acc[item.name] = item;
    return acc;
  }, {});

  const dashboardNavigation = filteredNavigation.filter((item) => item.name === "Dashboard");

  const navigationGroups = [
    {
      key: "workspace",
      label: "Workspace Tools",
      items: ["Service Requests", "Workspace Calendar", "Timesheet", "My Team", "Workflows"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "communication",
      label: "Communication",
      items: ["Notifications", "Timeline", "Leaves", "Daily EOD"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "crm",
      label: "CRM Tools",
      items: filteredCrmNavigation,
    },
    {
      key: "hr",
      label: "HR Department",
      items: hrNavigation,
    },
    {
      key: "ai-marketing",
      label: "AI & Marketing",
      items: ["AI Command Center", "Creative Studio", "Marketing Assistant", "Marketing Calendar"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "finance",
      label: "Finance Tools",
      items: ["Agreements", "Subscriptions"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "administration",
      label: "Administration",
      items: ["Users", "Departments", "Attendance", "Live Attendance", "Attendance Reports", "Company Directory", "Bulk Lead Import", "Audit Log", "Settings"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
  ].filter((group) => group.items.length);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/55 z-40 lg:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 lg:w-[var(--sidebar-width)]
          transform transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ '--sidebar-width': `${collapsed ? 76 : sidebarWidth}px` }}
      >
        <div className="relative flex h-full flex-col overflow-visible border-r border-black/10 bg-[linear-gradient(180deg,rgba(12,10,8,1)_0%,rgba(24,19,15,1)_100%)] text-[#f6eadb] shadow-[0_22px_50px_rgba(0,0,0,0.18)] dark:border-[#3b3026]">
          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3.5 top-[22px] z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-[#fffaf3] text-[#7a6f61] shadow-none transition-all hover:scale-105 hover:border-primary-500 hover:text-primary-600 lg:flex dark:border-[#4a3d31] dark:bg-[#201912] dark:text-[#d9cdbc] dark:hover:border-primary-500 dark:hover:text-primary-200"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          {/* Logo */}
          <div className={`flex h-18 items-center border-b border-white/10 px-4 ${collapsed ? "lg:justify-center lg:px-0" : "justify-between"}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fffaf4] text-primary-600 shadow-none dark:bg-[#241c14] dark:ring-1 dark:ring-white/10">
                <img
                  src="/logo.svg"
                  alt="SynTask Logo"
                  className="h-6 w-6 object-contain flex-shrink-0"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
              <div className={collapsed ? "lg:hidden" : ""}>
                <h1 className="text-base font-bold tracking-tight text-[#fffaf4]">
                  SynTask
                </h1>
                <p className="text-xs text-[#d4c6b5]">Workspace OS</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSidebarWidth(prevWidth)}
                className="hidden min-h-7 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d9cdbc] transition-colors hover:bg-white/10 lg:inline-flex dark:bg-[#241c14]/70"
                aria-label="Decrease sidebar width"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setSidebarWidth(nextWidth)}
                className="hidden min-h-7 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d9cdbc] transition-colors hover:bg-white/10 lg:inline-flex dark:bg-[#241c14]/70"
                aria-label="Increase sidebar width"
              >
                +
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-[#d9cdbc] transition-colors hover:bg-white/10 lg:hidden"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5 text-[#d9cdbc]" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 space-y-3 px-3 py-4 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
            {favoriteItems.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-2 shadow-none dark:bg-[#241c14]/45">
                <button
                  type="button"
                  onClick={() => setFavoritesOpen((open) => !open)}
                  aria-expanded={favoritesOpen}
                  className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d4c6b5] transition-colors hover:bg-white/10 hover:text-[#fffaf4] ${collapsed ? "lg:hidden" : ""}`}
                >
                  <span>Favorites</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] text-primary-600 shadow-none dark:bg-primary-500 dark:text-white">
                      {favoriteItems.length}
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${favoritesOpen ? '' : '-rotate-90'}`} />
                  </span>
                </button>
                <div className={`space-y-1 ${favoritesOpen ? '' : 'hidden'}`}>
                  {favoriteItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onClose}
                    className="flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-medium text-[#f6eadb] transition-colors hover:bg-white/10 hover:text-white"
                    >
                    <Star className="mr-2 h-4 w-4 text-primary-400" />
                      <span className={collapsed ? "lg:hidden" : ""}>{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {dashboardNavigation.map((item) => (
              <SidebarNavItem
                key={item.name}
                item={item}
                location={location}
                collapsed={collapsed}
                onClose={onClose}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                showFavorite
              />
            ))}

            {navigationGroups.map((group) => (
              <SidebarNavGroup
                key={group.key}
                group={group}
                location={location}
                collapsed={collapsed}
                onClose={onClose}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                isOpen={openGroups[group.key] ?? true}
                onToggle={() => setOpenGroups((current) => ({ ...current, [group.key]: !(current[group.key] ?? true) }))}
              />
            ))}
          </nav>

          {/* User Info */}
          <div className="border-t border-white/10 p-4">
            <Link
              to="/settings"
              title={
                collapsed
                  ? `${user?.first_name || ""} ${user?.last_name || ""}`.trim()
                  : undefined
              }
              className={`group relative flex items-center rounded-3xl border border-white/10 bg-white/[0.06] p-3 transition-all hover:border-white/20 hover:bg-white/[0.12] cursor-pointer ${
                collapsed ? "lg:justify-center" : ""
              }`}
              onClick={onClose}
            >
              <div className="flex-shrink-0">
                {user?.avatar ? (
                  <img
                    src={
                      user.avatar.startsWith("http")
                        ? user.avatar
                        : user.avatar.startsWith("/uploads/avatars/")
                        ? `${import.meta.env.VITE_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}/api/v1${user.avatar}`
                        : `${import.meta.env.VITE_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.avatar}`
                    }
                    alt={user?.first_name}
                    className="h-10 w-10 rounded-full object-cover border border-white/10 shadow-none"
                    onError={(e) => {
                      // Fallback to initials if image fails to load
                      e.target.style.display = "none";
                      const fallback = e.target.nextSibling;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                ) : null}
                <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-[#fff4eb] shadow-none ${user?.avatar ? "hidden" : ""} dark:bg-[#241c14] dark:ring-1 dark:ring-white/10`}>
                  <span className="text-sm font-semibold text-primary-600">
                    {user?.first_name?.[0]}
                    {user?.last_name?.[0]}
                  </span>
                </div>
              </div>
              <div
                className={`ml-3 flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}
              >
                <p className="text-sm font-medium text-[#fffaf4] truncate">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-[#cfc2b2] capitalize truncate">
                  {getRoleLabel(user?.role)}
                </p>
              </div>

              {/* Tooltip shown only in collapsed desktop rail mode */}
              {collapsed && <SidebarTooltip label={`${user?.first_name || ''} ${user?.last_name || ''}`.trim()} />}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

function SidebarNavGroup({
  group,
  location,
  collapsed,
  onClose,
  favorites,
  onToggleFavorite,
  isOpen,
  onToggle,
}) {
  const isGroupActive = group.items.some((item) => isNavItemActive(item, location))

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-2 shadow-none dark:bg-[#241c14]/45">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors hover:bg-white/10 hover:text-white ${collapsed ? "lg:hidden" : ""} ${isGroupActive ? "text-[#fffaf4]" : "text-[#d4c6b5]"}`}
      >
        <span>{group.label}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] text-primary-600 shadow-none dark:bg-primary-500 dark:text-white">
            {group.items.length}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        </span>
      </button>
      <div className={`space-y-1 ${isOpen || collapsed ? '' : 'hidden'}`}>
        {group.items.map((item) => (
          <SidebarNavItem
            key={`${group.key}-${item.name}`}
            item={item}
            location={location}
            collapsed={collapsed}
            onClose={onClose}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            showFavorite={group.key !== "crm"}
            nested={!collapsed}
          />
        ))}
      </div>
    </div>
  )
}

function SidebarNavItem({
  item,
  location,
  collapsed,
  onClose,
  favorites,
  onToggleFavorite,
  showFavorite = false,
  nested = false,
}) {
  const isActive = isNavItemActive(item, location)

  return (
    <div className="group flex items-center gap-1">
      <Link
        to={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.name}
        onClick={onClose}
        className={`group relative flex min-h-10 flex-1 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          collapsed ? "lg:justify-center lg:px-0" : nested ? "ml-1" : ""
        } ${
          isActive
            ? "bg-primary-500 text-white shadow-none"
            : "text-[#eee1d0] hover:bg-white/10 hover:text-white"
        }`}
      >
        <item.icon className={`h-5 w-5 flex-shrink-0 ${collapsed ? "" : "mr-2.5"} ${isActive ? "text-white" : ""}`} />
        <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.name}</span>
        {isActive && !collapsed ? <span className="ml-auto h-2 w-2 rounded-full bg-white/90" /> : null}
        {collapsed && <SidebarTooltip label={item.name} />}
      </Link>
      {showFavorite ? (
        <button
          type="button"
          onClick={() => onToggleFavorite(item.href)}
          className={`hidden min-h-8 min-w-8 rounded-full p-1.5 text-[#b9ad9e] transition hover:bg-white/10 hover:text-primary-300 ${collapsed ? 'lg:hidden' : 'lg:inline-flex'}`}
          aria-label={favorites.includes(item.href) ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        >
          <Star className={`h-4 w-4 ${favorites.includes(item.href) ? 'fill-primary-400 text-primary-400' : ''}`} />
        </button>
      ) : null}
    </div>
  )
}

function isNavItemActive(item, location) {
  const [itemPath, itemSearch = ''] = item.href.split('?')
  if (itemSearch) {
    const expected = new URLSearchParams(itemSearch)
    const actual = new URLSearchParams(location.search)
    return location.pathname === itemPath && [...expected].every(([key, value]) => actual.get(key) === value)
  }
  if (item.key === 'qualification' && new URLSearchParams(location.search).has('stage')) return false
  return (
    location.pathname === itemPath ||
    (item.match && location.pathname.startsWith(item.match)) ||
    location.pathname.startsWith(`${itemPath}/`)
  )
}

function SidebarTooltip({ label }) {
  if (!label) return null
  return (
    <div
      className="
        absolute
        left-full
        top-1/2
        z-[9999]
        ml-2
        -translate-y-1/2
        whitespace-nowrap
        rounded-xl
        border
        border-white/10
        bg-[#201912]
        px-3
        py-1.5
        text-xs
        text-[#fffaf4]
        opacity-0
        shadow-none
        invisible
        transition-all
        duration-200
        group-hover:visible
        group-hover:opacity-100
        pointer-events-none
      "
    >
      {label}
    </div>
  )
}
