import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  CreditCard,
  Clock,
  Calendar as CalendarIcon,
  BarChart3,
  TrendingUp,
  Video,
  FolderKanban,
  Ticket,
  MessageCircle,
  Sparkles,
  Wand2,
  Briefcase,
  FileText,
  Bell,
  X,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Star,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { ROLE, getRoleLabel, isSuperAdminRole, normalizeRole } from "../utils/roles";

const COLLAPSE_KEY = "syntask-sidebar-collapsed";

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const userRole = normalizeRole(user?.role);
  const hasModule = (module) =>
    !module || user?.modules?.includes(module) || isSuperAdminRole(userRole);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('syntask-sidebar-favorites') || '[]')
    } catch {
      return []
    }
  });
  const [crmOpen, setCrmOpen] = useState(true);

  // Desktop-only "rail" mode: shrinks to icons, expands on toggle.
  // Mobile drawer (isOpen/onClose) is unaffected by this and always shows the full sidebar.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "true";
    } catch {
      return false;
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
    } catch {}
  }, [favorites]);

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
      name: "Requests",
      href: "/tickets",
      icon: Ticket,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Chat",
      href: "/chat",
      icon: MessageCircle,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Meetings",
      href: "/meetings",
      icon: Video,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Calendar",
      href: "/calendar",
      icon: CalendarIcon,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Timesheet",
      href: "/timesheet",
      icon: Clock,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Attendance",
      href: "/attendance",
      icon: Clock,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Live Monitor",
      href: "/live-monitor",
      icon: Video,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
    },
    {
      name: "Attendance Reports",
      href: "/attendance-reports",
      icon: BarChart3,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
    },

    {
      name: "Notifications",
      href: "/notifications",
      icon: Bell,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "Reports",
      href: "/reports",
      icon: BarChart3,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Leads",
      href: "/crm/leads",
      icon: Users,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    },
    {
      name: "AI Hub",
      href: "/ai-hub",
      icon: Sparkles,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Creative AI",
      href: "/creative-director",
      icon: Wand2,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Marketing Support",
      href: "/marketing-support",
      icon: BarChart3,
      roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER, ROLE.SUPER_ADMIN],
      module: "task",
    },
    {
      name: "Marketing Calendar",
      href: "/marketing/calendar",
      icon: CalendarIcon,
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
      name: "Bulk Leads",
      href: "/bulk-leads",
      icon: TrendingUp,
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
      icon: FileText,
      roles: [ROLE.ADMIN],
      module: "task",
    },
    {
      name: "MSA",
      href: "/msa",
      icon: FileText,
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
      icon: Users,
      roles: [ROLE.ADMIN, ROLE.SUPER_ADMIN],
    },
    {
      name: "Departments",
      href: "/departments",
      icon: Building2,
      roles: [ROLE.ADMIN],
    },
    {
      name: "My Team",
      href: "/my-team",
      icon: Users,
      roles: [ROLE.LEAD],
      module: "task",
    },
    {
      name: "Companies",
      href: "/companies",
      icon: Building2,
      roles: [ROLE.SUPER_ADMIN],
    },
    {
      name: "Subscriptions",
      href: "/subscriptions",
      icon: CreditCard,
      roles: [ROLE.ADMIN],
    },
    {
      name: "Activity Log",
      href: "/activity",
      icon: Clock,
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
    (item) => item.roles.includes(userRole) && hasModule(item.module),
  );
  const toggleFavorite = (href) => {
    setFavorites((current) => (
      current.includes(href) ? current.filter((item) => item !== href) : [...current, href]
    ))
  };
  const favoriteItems = filteredNavigation.filter((item) => favorites.includes(item.href));

  const crmNavigation = [
    {
      name: "Pipeline",
      href: "/crm/pipeline",
      icon: TrendingUp,
    },
    {
      name: "Dashboard",
      href: "/crm/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Leads",
      href: "/crm/leads",
      icon: Users,
    },
    {
      name: "Companies",
      href: "/crm/companies",
      icon: Building2,
    },
    {
      name: "Contacts",
      href: "/crm/contacts",
      icon: Users,
    },
    {
      name: "Activities",
      href: "/crm/activities",
      icon: Clock,
    },
    {
      name: "Calendar",
      href: "/crm/calendar",
      icon: CalendarIcon,
    },
    {
      name: "Reports",
      href: "/crm/reports",
      icon: BarChart3,
    },
    {
      name: "Settings",
      href: "/crm/settings",
      icon: Settings,
    },
  ];

  const filteredCrmNavigation = crmNavigation
    .filter((item) => item && (item.roles ? item.roles.includes(userRole) : true))
    .filter((item) => ['Pipeline', 'Dashboard', 'Leads', 'Activities', 'Calendar'].includes(item.name));

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 ${collapsed ? "lg:w-[76px]" : "lg:w-52"}
          transform transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="relative flex h-full flex-col overflow-visible border-r border-surface-border/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-950/95">
          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3.5 top-[22px] z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-white text-gray-600 shadow-md transition-all hover:scale-105 hover:border-primary-400 hover:text-primary-600 lg:flex dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          {/* Logo */}
          <div
            className={`flex h-16 items-center border-b border-surface-border/80 px-4 dark:border-gray-800 ${
              collapsed ? "lg:justify-center lg:px-0" : "justify-between"
            }`}
          >
            <div className="flex items-center space-x-2">
              <img
                src="/logo.svg"
                alt="SynTask Logo"
                className="h-8 w-8 object-contain flex-shrink-0"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
              <h1 className={`text-base font-bold text-primary-700 ${collapsed ? "lg:hidden" : ""}`}>
                SynTask
              </h1>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          {/* Navigation */}
          <nav
            className={`flex-1 space-y-1 px-3 py-4 ${
              collapsed ? "overflow-visible" : "overflow-y-auto"
            }`}
          >
            {filteredNavigation.map((item) => {
              const isActive =
                location.pathname === item.href ||
                (item.match && location.pathname.startsWith(item.match));
              return (
                <div
                  key={item.name}
                  className="group flex items-center gap-1"
                >
                <Link
                  to={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.name}
                  onClick={onClose}
                  className={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    collapsed ? "lg:justify-center lg:px-0" : ""
                  } ${
                    isActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200"
                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 flex-shrink-0 mr-2.5 ${collapsed ? "lg:mr-0" : ""}`}
                  />
                  <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>
                    {item.name}
                  </span>

                  {/* Tooltip shown only in collapsed desktop rail mode */}
                {collapsed && (
  <div
    className="
      absolute
      left-full
      top-1/2
      -translate-y-1/2
      ml-2
      px-2
      py-1
      bg-slate-800
      text-white
      text-xs
      rounded
      opacity-0
      invisible
      group-hover:opacity-100
      group-hover:visible
      transition-all
      duration-200
      whitespace-nowrap
      z-[9999]
      pointer-events-none
    "
  >
    {item.name}

    <div
      className="
        absolute
        left-0
        top-1/2
        -translate-y-1/2
        -translate-x-1
        w-1.5
        h-1.5
        bg-slate-800
        rotate-45
      "
    />
  </div>
)}
                </Link>
                <button
                  type="button"
                  onClick={() => toggleFavorite(item.href)}
                  className={`hidden lg:inline-flex rounded-lg p-1 text-gray-400 hover:text-amber-500 ${collapsed ? 'lg:hidden' : ''}`}
                  aria-label={favorites.includes(item.href) ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
                >
                  <Star className={`h-4 w-4 ${favorites.includes(item.href) ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
                </div>
              );
            })}

            {favoriteItems.length ? (
              <div className="mt-4 space-y-2">
                <div className={`px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400 ${collapsed ? "lg:hidden" : ""}`}>
                  Favorites
                </div>
                <div className="space-y-1">
                  {favoriteItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onClose}
                      className="flex items-center rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
                    >
                      <Star className="mr-2 h-4 w-4 text-amber-400" />
                      <span className={collapsed ? "lg:hidden" : ""}>{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {filteredCrmNavigation.length ? (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setCrmOpen((open) => !open)}
                  className={`flex w-full items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400 ${collapsed ? "lg:hidden" : ""}`}
                >
                  <span>CRM</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${crmOpen ? '' : '-rotate-90'}`} />
                </button>
                <div className={`space-y-1 ${crmOpen ? '' : 'hidden'}`}>
                  {filteredCrmNavigation.map((item) => {
                    const isActive =
                      location.pathname === item.href ||
                      location.pathname.startsWith(`${item.href}/`);

                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={item.name}
                        onClick={onClose}
                        className={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          collapsed ? "lg:justify-center lg:px-0" : "ml-2"
                        } ${
                          isActive
                            ? "bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200"
                            : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
                        }`}
                      >
                        <item.icon
                          className={`h-4 w-4 flex-shrink-0 mr-2.5 ${collapsed ? "lg:mr-0" : ""}`}
                        />
                        <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>
                          {item.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <Link
              to="/settings"
              title={
                collapsed
                  ? `${user?.first_name || ""} ${user?.last_name || ""}`.trim()
                  : undefined
              }
              className={`group relative flex items-center hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors cursor-pointer dark:hover:bg-gray-900 ${
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
                    className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                    onError={(e) => {
                      // Fallback to initials if image fails to load
                      e.target.style.display = "none";
                      const fallback = e.target.nextSibling;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 ${user?.avatar ? "hidden" : ""}`}
                >
                  <span className="text-sm font-semibold text-primary-600">
                    {user?.first_name?.[0]}
                    {user?.last_name?.[0]}
                  </span>
                </div>
              </div>
              <div
                className={`ml-3 flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}
              >
                <p className="text-sm font-medium text-gray-700 truncate dark:text-gray-100">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-gray-500 capitalize truncate dark:text-gray-400">
                  {getRoleLabel(user?.role)}
                </p>
              </div>

              {/* Tooltip shown only in collapsed desktop rail mode */}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                  {user?.first_name} {user?.last_name}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
