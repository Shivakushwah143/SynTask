import { useEffect, useMemo, useState } from "react";
import { useDefaultAvatar } from "../utils/avatar";
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
  CheckSquare,
  Contact,
  CreditCard,
  DollarSign,
  Factory,
  FileBarChart2,
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
  ShieldCheck,
  Star,
  TimerReset,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRoundSearch,
  X,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { DEPARTMENTS_CHANGED_EVENT, departmentsAPI } from "../api/departments";
import { ROLE, getRoleLabel, hasCompanyAdminAccess, isManagerRole, isSuperAdminRole, normalizeRole } from "../utils/roles";
import { HR_MODULES, HR_ROLES } from "../config/hrModules";

const COLLAPSE_KEY = "syntask-sidebar-collapsed";
const FAVORITES_OPEN_KEY = "syntask-sidebar-favorites-open";
const NAV_GROUPS_OPEN_KEY = "syntask-sidebar-groups-open";
const WIDTH_KEY = "syntask-sidebar-width";
const WIDTH_OPTIONS = [240, 280, 320];

const getApiAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const apiOrigin = import.meta.env.VITE_API_URL?.replace("/api/v1", "") || "";
  if (path.startsWith("/uploads/avatars/")) {
    return `${apiOrigin}/api/v1${path}`;
  }
  return `${apiOrigin}${path}`;
};

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const userRole = normalizeRole(user?.role);
  const canSeeDepartments = hasCompanyAdminAccess(user?.role) || isSuperAdminRole(userRole);
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
  const [orgDepartments, setOrgDepartments] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('syntask-sidebar-favorites', JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_OPEN_KEY, String(favoritesOpen));
    } catch {
      // ignore
    }
  }, [favoritesOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_GROUPS_OPEN_KEY, JSON.stringify(openGroups));
    } catch {
      // ignore
    }
  }, [openGroups]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (!canSeeDepartments) {
      setOrgDepartments([])
      return undefined
    }

    let cancelled = false

    const loadDepartments = async () => {
      try {
        const data = await departmentsAPI.listDepartments()
        if (cancelled) return
        setOrgDepartments(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) {
          setOrgDepartments([])
        }
      }
    }

    const handleDepartmentsChanged = () => {
      if (!cancelled) {
        void loadDepartments()
      }
    }

    void loadDepartments()
    window.addEventListener(DEPARTMENTS_CHANGED_EVENT, handleDepartmentsChanged)

    return () => {
      cancelled = true
      window.removeEventListener(DEPARTMENTS_CHANGED_EVENT, handleDepartmentsChanged)
    }
  }, [canSeeDepartments, userRole])

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
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Tasks",
      href: "/tasks",
      icon: CheckSquare,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
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
      module: "task",
    },
    {
      name: "Live Attendance",
      href: "/live-monitor",
      icon: MonitorCheck,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Attendance Reports",
      href: "/attendance-reports",
      icon: FileBarChart2,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Notifications",
      href: "/notifications",
      icon: BellRing,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Scheduled Jobs",
      href: "/scheduled-jobs",
      icon: CalendarClock,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Timeline",
      href: "/timeline",
      icon: CalendarClock,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Leaves",
      href: "/leaves",
      icon: CalendarCheck2,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
    {
      name: "Daily EOD",
      href: "/eod",
      icon: ClipboardCheck,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
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
      name: "Content Calendar",
      href: "/content-calendar",
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
      module: "sales",
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
      roles: [ROLE.ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN],
      module: "task",
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
      module: "task",
    },
    {
      name: "Admin Permissions",
      href: "/admin-permissions",
      icon: ShieldCheck,
      roles: [ROLE.ADMIN],
      module: "task",
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
      module: "task",
    },
    {
      name: "Subscriptions",
      href: "/subscriptions",
      icon: CreditCard,
      roles: [ROLE.ADMIN],
      module: "task",
    },
    {
      name: "Audit Log",
      href: "/activity",
      icon: AlarmClockCheck,
      roles: [ROLE.ADMIN, ROLE.LEAD],
      module: "task",
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
      roles: [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
      module: "task",
    },
  ];

  const filteredNavigation = navigation.filter(
    (item) => item.roles.includes(userRole) && hasModule(item.module) && hasCapability(item.capability) && hasDepartment(item.department),
  );
  const departmentItems = useMemo(() => orgDepartments.map((department) => ({
    name: department.name,
    href: `/admin-permissions?department=${encodeURIComponent(department.id)}`,
    icon: Network,
  })), [orgDepartments]);
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

  const metaOmnichannelNavigation = [
    {
      name: "Meta Command Center",
      href: "/crm/settings?meta=command-center",
      icon: Gauge,
    },
    {
      name: "WhatsApp Inbox",
      href: "/crm/settings?meta=whatsapp",
      icon: Headphones,
    },
    {
      name: "Instagram DMs",
      href: "/crm/settings?meta=instagram",
      icon: Megaphone,
    },
    {
      name: "Messenger Inbox",
      href: "/crm/settings?meta=messenger",
      icon: BellRing,
    },
    {
      name: "AI Reply Drafts",
      href: "/crm/settings?meta=ai-drafts",
      icon: Bot,
    },
    {
      name: "Human Approval Queue",
      href: "/crm/settings?meta=approval-queue",
      icon: ShieldCheck,
      badge: "Soon",
    },
    {
      name: "Identity Linking",
      href: "/crm/settings?meta=identity",
      icon: Network,
    },
    {
      name: "Omnichannel Analytics",
      href: "/crm/settings?meta=analytics",
      icon: LineChart,
      badge: "Soon",
    },
    {
      name: "Partner Readiness",
      href: "/crm/settings?meta=readiness",
      icon: ClipboardCheck,
      badge: "Soon",
    },
    {
      name: "Customer Meta Connect",
      href: "/crm/settings?meta=connect",
      icon: Settings,
      badge: "Soon",
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
      key: "operations",
      label: "Core Operations",
      items: ["Service Requests", "Workspace Calendar", "Scheduled Jobs", "Timesheet"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "delivery",
      label: "Project Delivery",
      items: ["Projects", "Tasks"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "people",
      label: "People & Activity",
      items: ["My Team", "Users", "Departments", "Attendance", "Live Attendance", "Attendance Reports"]
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
      key: "meta-omnichannel",
      label: "Meta Omnichannel",
      items: metaOmnichannelNavigation,
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
      items: ["Subscriptions"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "administration",
      label: "Administration",
      items: ["Users", "Departments", "Admin Permissions", "Workflows", "Company Directory", "Bulk Lead Import", "Audit Log", "Settings", "Subscriptions", "Ledger", "Invoices"]
        .map((name) => itemByName[name])
        .filter(Boolean),
    },
    {
      key: "your-departments",
      label: "Your Departments",
      items: departmentItems,
    },
  ]
    .filter((group) => group.items.length);

  // Enhanced color mapping for icons with more vibrant colors
  const getIconColor = (itemName) => {
    const colorMap = {
      // Dashboard - Cyan/Blue
      'Dashboard': 'text-cyan-400',
      
      // Project Management - Indigo/Purple
      'Projects': 'text-indigo-400',
      'Tasks': 'text-violet-400',
      'Service Requests': 'text-purple-400',
      'Workspace Calendar': 'text-fuchsia-400',
      
      // Time & Attendance - Orange/Yellow
      'Timesheet': 'text-amber-400',
      'Attendance': 'text-orange-400',
      'Live Attendance': 'text-amber-400',
      'Attendance Reports': 'text-yellow-400',
      
      // Communications - Pink/Rose
      'Notifications': 'text-rose-400',
      'Timeline': 'text-pink-400',
      'Leaves': 'text-emerald-400',
      'Daily EOD': 'text-teal-400',
      
      // Reports - Lime/Green
      'Workspace Reports': 'text-lime-400',
      
      // CRM - Blue/Cyan
      'Leads': 'text-sky-400',
      'CRM': 'text-cyan-400',
      'CRM Pipeline': 'text-cyan-300',
      'CRM Companies': 'text-blue-400',
      'CRM Contacts': 'text-indigo-400',
      'CRM Calendar': 'text-fuchsia-400',
      'CRM Reports': 'text-lime-400',
      'CRM Configuration': 'text-gray-400',
      'Meta Command Center': 'text-blue-400',
      'WhatsApp Inbox': 'text-emerald-400',
      'Instagram DMs': 'text-pink-400',
      'Messenger Inbox': 'text-sky-400',
      'AI Reply Drafts': 'text-purple-400',
      'Human Approval Queue': 'text-amber-400',
      'Identity Linking': 'text-cyan-400',
      'Omnichannel Analytics': 'text-lime-400',
      'Partner Readiness': 'text-orange-400',
      'Customer Meta Connect': 'text-indigo-400',
      
      // AI & Marketing - Purple/Pink
      'AI Command Center': 'text-purple-400',
      'Creative Studio': 'text-pink-400',
      'Marketing Assistant': 'text-rose-400',
      'Content Calendar': 'text-indigo-300',
      
      // HR - Emerald/Green
      'HR': 'text-emerald-400',
      'Recruitment Dashboard': 'text-green-400',
      'Jobs': 'text-emerald-300',
      'Inbox': 'text-blue-300',
      'Candidates': 'text-purple-300',
      'Resume Pool': 'text-amber-300',
      'Interviews': 'text-pink-300',
      'Recruitment Reports': 'text-lime-300',
      
      // Finance - Gold/Green
      'Bulk Lead Import': 'text-orange-400',
      'Clients': 'text-blue-400',
      'Invoices': 'text-emerald-400',
      'Ledger': 'text-yellow-400',
      'Subscriptions': 'text-teal-400',
      
      // Administration - Red/Gray
      'Users': 'text-gray-400',
      'Workflows': 'text-purple-400',
      'Departments': 'text-indigo-400',
      'Admin Permissions': 'text-red-400',
      'My Team': 'text-pink-400',
      'Company Directory': 'text-blue-400',
      'Audit Log': 'text-orange-400',
      'Settings': 'text-gray-400',
      
      // Default
      'default': 'text-gray-400'
    };
    return colorMap[itemName] || colorMap['default'];
  };

  // Group color mapping for section headers
  const getGroupColor = (groupKey) => {
    const groupColors = {
      'operations': 'text-cyan-400',
      'delivery': 'text-indigo-400',
      'people': 'text-orange-400',
      'communication': 'text-pink-400',
      'crm': 'text-blue-400',
      'meta-omnichannel': 'text-sky-400',
      'hr': 'text-emerald-400',
      'ai-marketing': 'text-purple-400',
      'finance': 'text-yellow-400',
      'administration': 'text-red-400',
      'your-departments': 'text-teal-400',
    };
    return groupColors[groupKey] || 'text-gray-400';
  };

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

      {/* Sidebar - Enhanced with more colors */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 lg:w-[var(--sidebar-width)]
          transform transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ '--sidebar-width': `${collapsed ? 76 : sidebarWidth}px` }}
      >
        <div className="relative flex h-full flex-col overflow-visible border-r border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] via-[#0d0d0d] to-[#0a0a0a] text-white shadow-2xl">
          
          {/* Animated gradient border top - Rainbow effect */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-400 via-emerald-400 via-yellow-400 via-rose-400 to-purple-500 animate-gradient-x"></div>

          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3.5 top-5 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#1a1a1a] text-gray-400 shadow-lg transition-all hover:scale-105 hover:border-primary-500 hover:text-primary-400 lg:flex"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Logo with colorful gradient */}
          <div className={`flex h-16 items-center border-b border-[#1a1a1a] px-4 ${collapsed ? "lg:justify-center lg:px-0" : "justify-between"}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-blue-500/20">
                <img
                  src="/logo.svg"
                  alt="SynTask Logo"
                  className="h-6 w-6 flex-shrink-0 object-contain invert"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
              <div className={collapsed ? "lg:hidden" : ""}>
                <h1 className="text-sm font-bold tracking-tight text-white">
                  SynTask
                </h1>
                <p className="text-[10px] text-gray-400">Workspace OS</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSidebarWidth(prevWidth)}
                className="hidden min-h-6 rounded border border-[#1a1a1a] bg-[#0f0f0f] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 transition-colors hover:border-primary-500/30 hover:bg-primary-500/10 hover:text-primary-400 lg:inline-flex"
                aria-label="Decrease sidebar width"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setSidebarWidth(nextWidth)}
                className="hidden min-h-6 rounded border border-[#1a1a1a] bg-[#0f0f0f] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 transition-colors hover:border-primary-500/30 hover:bg-primary-500/10 hover:text-primary-400 lg:inline-flex"
                aria-label="Increase sidebar width"
              >
                +
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-2 text-gray-400 transition-colors hover:bg-white/10 lg:hidden"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Navigation with colorful items */}
          <nav className={`flex-1 space-y-2 px-2 py-3 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
            {favoriteItems.length ? (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setFavoritesOpen((open) => !open)}
                  aria-expanded={favoritesOpen}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400 transition-colors hover:bg-white/5 hover:text-yellow-400 ${collapsed ? "lg:hidden" : ""}`}
                >
                  <span>⭐ Favorites</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[9px] text-yellow-400">
                      {favoriteItems.length}
                    </span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${favoritesOpen ? '' : '-rotate-90'}`} />
                  </span>
                </button>
                <div className={`space-y-0.5 ${favoritesOpen ? '' : 'hidden'}`}>
                  {favoriteItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onClose}
                      className="flex min-h-8 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-yellow-400"
                    >
                      <Star className={`mr-2 h-4 w-4 ${getIconColor(item.name)}`} />
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
                iconColor={getIconColor(item.name)}
                groupKey="dashboard"
              />
            ))}
            
            {navigationGroups
              .filter((group) => !(isManagerRole(userRole) && group.key === 'hr'))
              .map((group) => (
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
                  getIconColor={getIconColor}
                  groupColor={getGroupColor(group.key)}
                  groupKey={group.key}
                />
              ))}
          </nav>

          {/* User Info with colored accent */}
          <div className="border-t border-[#1a1a1a] p-3">
            <Link
              to="/settings"
              title={
                collapsed
                  ? `${user?.first_name || ""} ${user?.last_name || ""}`.trim()
                  : undefined
              }
              className={`group relative flex items-center rounded-lg p-2 transition-all hover:bg-white/5 ${
                collapsed ? "lg:justify-center" : ""
              }`}
              onClick={onClose}
            >
              <div className="flex-shrink-0">
                {user?.avatar ? (
                  <img
                    src={getApiAssetUrl(user.avatar)}
                    alt={user?.first_name}
                    className="h-8 w-8 rounded-full object-cover border-2 border-primary-500/30"
                    onError={useDefaultAvatar}
                  />
                ) : null}
                <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-primary-500/20 ${user?.avatar ? "hidden" : ""}`}>
                  <span className="text-xs font-semibold">
                    {user?.first_name?.[0]}
                    {user?.last_name?.[0]}
                  </span>
                </div>
              </div>
              <div
                className={`ml-2.5 flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}
              >
                <p className="text-sm font-medium text-white truncate">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-[10px] text-gray-400 capitalize truncate">
                  {getRoleLabel(user?.role)}
                </p>
              </div>
              <div className={`h-1.5 w-1.5 rounded-full bg-green-400 shadow-lg shadow-green-400/30 ${collapsed ? "lg:hidden" : ""}`}></div>

              {collapsed && <SidebarTooltip label={`${user?.first_name || ''} ${user?.last_name || ''}`.trim()} />}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

// Updated SidebarNavGroup with colorful headers
function SidebarNavGroup({
  group,
  location,
  collapsed,
  onClose,
  favorites,
  onToggleFavorite,
  isOpen,
  onToggle,
  getIconColor,
  groupColor = 'text-gray-400',
  groupKey,
}) {
  const isGroupActive = group.items.some((item) => isNavItemActive(item, location))
  
  // Get group-specific dot color
  const getGroupDotColor = (key) => {
    const dotColors = {
      'operations': 'bg-cyan-400',
      'delivery': 'bg-indigo-400',
      'people': 'bg-orange-400',
      'communication': 'bg-pink-400',
      'crm': 'bg-blue-400',
      'meta-omnichannel': 'bg-sky-400',
      'hr': 'bg-emerald-400',
      'ai-marketing': 'bg-purple-400',
      'finance': 'bg-yellow-400',
      'administration': 'bg-red-400',
      'your-departments': 'bg-teal-400',
    };
    return dotColors[key] || 'bg-gray-400';
  };

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors hover:bg-white/5 hover:text-white ${collapsed ? "lg:hidden" : ""} ${isGroupActive ? "text-white" : groupColor}`}
      >
        <span className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${getGroupDotColor(groupKey)}`}></span>
          {group.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] ${groupColor}`}>
            {group.items.length}
          </span>
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        </span>
      </button>
      <div className={`space-y-0.5 ${isOpen || collapsed ? '' : 'hidden'}`}>
        {group.items.map((item) => (
          <SidebarNavItem
            key={`${group.key}-${item.name}`}
            item={item}
            location={location}
            collapsed={collapsed}
            onClose={onClose}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            showFavorite={!["crm", "meta-omnichannel"].includes(group.key)}
            nested={!collapsed}
            iconColor={getIconColor ? getIconColor(item.name) : 'text-gray-400'}
            groupKey={group.key}
          />
        ))}
      </div>
    </div>
  )
}

// Updated SidebarNavItem with colored icons and hover effects
function SidebarNavItem({
  item,
  location,
  collapsed,
  onClose,
  favorites,
  onToggleFavorite,
  showFavorite = false,
  nested = false,
  iconColor = 'text-gray-400',
  groupKey,
}) {
  const isActive = isNavItemActive(item, location)

  return (
    <div className="group flex items-center gap-0.5">
      <Link
        to={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.name}
        onClick={onClose}
        className={`group relative flex min-h-8 flex-1 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
          collapsed ? "lg:justify-center lg:px-0" : nested ? "ml-1" : ""
        } ${
          isActive
            ? "bg-gradient-to-r from-primary-500/15 to-transparent text-primary-400 shadow-sm"
            : "text-gray-300 hover:bg-white/5 hover:text-white"
        }`}
      >
        <item.icon className={`h-4 w-4 flex-shrink-0 transition-colors duration-200 ${collapsed ? "" : "mr-2.5"} ${isActive ? "text-primary-400" : iconColor} group-hover:scale-110`} />
        <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.name}</span>
        {item.badge && !collapsed ? (
          <span className="ml-2 shrink-0 whitespace-nowrap rounded-full border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-sky-300">
            {item.badge}
          </span>
        ) : null}
        {isActive && !collapsed ? (
          <span className={`${item.badge ? "ml-2" : "ml-auto"} flex items-center gap-1`}>
            <span className="h-1.5 w-1.5 rounded-full bg-primary-400 shadow-lg shadow-primary-400/50 animate-pulse"></span>
          </span>
        ) : null}
        {collapsed && <SidebarTooltip label={item.name} />}
      </Link>
      {showFavorite ? (
        <button
          type="button"
          onClick={() => onToggleFavorite(item.href)}
          className={`hidden min-h-7 min-w-7 rounded p-1 text-gray-400 transition hover:bg-white/5 hover:text-yellow-400 ${collapsed ? 'lg:hidden' : 'lg:inline-flex'}`}
          aria-label={favorites.includes(item.href) ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        >
          <Star className={`h-3.5 w-3.5 transition-colors ${favorites.includes(item.href) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
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
        rounded-lg
        border
        border-[#2a2a2a]
        bg-[#1a1a1a]
        px-3
        py-1.5
        text-xs
        text-white
        opacity-0
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
