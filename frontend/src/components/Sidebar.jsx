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
  Bot,
  Briefcase,
  FileText,
  X,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

const COLLAPSE_KEY = "syntask-sidebar-collapsed";

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const userRole = user?.role === "admin" ? "company_admin" : user?.role;
  const hasModule = (module) =>
    !module || user?.modules?.includes(module) || userRole === "super_admin";

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

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      roles: ["super_admin", "company_admin", "lead", "employee", "manager"],
    },
    {
      name: "Projects",
      href: "/projects",
      icon: FolderKanban,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Requests",
      href: "/tickets",
      icon: Ticket,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Chat",
      href: "/chat",
      icon: MessageCircle,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Meetings",
      href: "/meetings",
      icon: Video,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Calendar",
      href: "/calendar",
      icon: CalendarIcon,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Timesheet",
      href: "/timesheet",
      icon: Clock,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Reports",
      href: "/reports",
      icon: BarChart3,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "AI Copilot",
      href: "/ai-prioritization",
      icon: Sparkles,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "AI Assistant",
      href: "/ai-assistant",
      icon: Bot,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "task",
    },
    {
      name: "Sales",
      href: "/sales",
      icon: TrendingUp,
      roles: ["company_admin", "lead", "employee", "manager"],
      module: "sales",
    },
    {
      name: "Clients",
      href: "/clients",
      icon: Briefcase,
      roles: ["company_admin"],
      module: "task",
    },
    {
      name: "Invoices",
      href: "/invoices",
      icon: FileText,
      roles: ["company_admin"],
      module: "task",
    },
    {
      name: "MSA",
      href: "/msa",
      icon: FileText,
      roles: ["company_admin", "lead"],
      module: "task",
    },
    {
      name: "Ledger",
      href: "/ledger",
      icon: DollarSign,
      roles: ["company_admin"],
      module: "task",
    },
    {
      name: "Users",
      href: "/users",
      icon: Users,
      roles: ["company_admin", "super_admin"],
    },
    {
      name: "Departments",
      href: "/departments",
      icon: Building2,
      roles: ["company_admin"],
    },
    {
      name: "My Team",
      href: "/my-team",
      icon: Users,
      roles: ["lead"],
      module: "task",
    },
    {
      name: "Companies",
      href: "/companies",
      icon: Building2,
      roles: ["super_admin"],
    },
    {
      name: "Subscriptions",
      href: "/subscriptions",
      icon: CreditCard,
      roles: ["company_admin"],
    },
    {
      name: "Activity Log",
      href: "/activity",
      icon: Clock,
      roles: ["company_admin", "lead"],
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
      roles: ["super_admin", "company_admin", "lead", "employee", "manager"],
    },
  ];

  const filteredNavigation = navigation.filter(
    (item) => item.roles.includes(userRole) && hasModule(item.module),
  );

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
      <div className="relative flex h-full flex-col overflow-visible bg-white border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800">   
          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3.5 top-[22px] z-10 hidden h-8 w-8 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-gray-600 shadow-md transition-all hover:scale-105 hover:border-primary-400 hover:text-primary-600 lg:flex dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          {/* Logo */}
          <div
            className={`h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-800 ${
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
              <h1
                className={`text-base font-bold text-primary-600 ${collapsed ? "lg:hidden" : ""}`}
              >
                SynTask
              </h1>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg dark:hover:bg-gray-800"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          {/* Navigation */}
          <nav
  className={`flex-1 px-3 py-4 space-y-1 ${
    collapsed
      ? "overflow-visible"
      : "overflow-y-auto"
  }`}
>  
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.name}
                  onClick={onClose}
                  className={`group relative flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
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
              );
            })}
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
                        : `${import.meta.env.VITE_API_URL?.replace("/api/v1", "") || "http://localhost:8000"}${user.avatar}`
                    }
                    alt={user?.first_name}
                    className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                    onError={(e) => {
                      // Fallback to initials if image fails to load
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className={`h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center ${user?.avatar ? "hidden" : ""}`}
                >
                  <span className="text-primary-600 font-semibold text-sm">
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
                  {user?.role?.replace("_", " ")}
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
