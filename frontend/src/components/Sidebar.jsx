import { useEffect, useMemo, useState } from "react";
import { useDefaultAvatar } from "../utils/avatar";
import { getAvatarUrl } from "../utils/avatarUrl";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Network,
  Star,
  X,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { DEPARTMENTS_CHANGED_EVENT, departmentsAPI } from "../api/departments";
import { ROLE, getRoleLabel, hasCompanyAdminAccess, isManagerRole, isSuperAdminRole, normalizeRole } from "../utils/roles";
import { HR_MODULES } from "../config/hrModules";
import { useInboxUnreadCounts } from "../hooks/useInboxUnreadCounts";
import {
  crmNavigation,
  HR_ITEM_RENAMES,
  HR_ITEM_SKIP,
  ITEM_COLORS,
  metaNavigation,
  NAV_GROUPS_OPEN_KEY,
  navigation,
  SECTION_COLORS,
  SECTION_DOT_COLORS,
  SECTION_ICONS,
  SECTIONS,
  STANDARD_ROLES,
} from "../config/navigation";

const COLLAPSE_KEY = "syntask-sidebar-collapsed";
const FAVORITES_OPEN_KEY = "syntask-sidebar-favorites-open";
const WIDTH_KEY = "syntask-sidebar-width";
const WIDTH_OPTIONS = [240, 280, 320];

// Phase 6: Inbox item name → unread-count key from useInboxUnreadCounts().
const INBOX_COUNT_KEYS = {
  WhatsApp: "whatsapp",
  Instagram: "instagram",
  Messenger: "messenger",
  "Meta Messages": "metaTotal",
  Notifications: "notifications",
};

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const userRole = normalizeRole(user?.role);
  const hasModule = (module) => {
    if (!module) return true;
    // Super admins and company admins always see everything
    if (isSuperAdminRole(userRole)) return true;
    if (userRole === ROLE.ADMIN || userRole === ROLE.SUB_ADMIN || userRole === ROLE.MANAGER || userRole === ROLE.LEAD || userRole === ROLE.EMPLOYEE) return true;
    const userModules = user?.modules || [];

    if (module === "sales_crm") {
      return userModules.includes("sales_crm") || userModules.includes("sales");
    }
    if (module === "sales") {
      return userModules.includes("sales") || userModules.includes("sales_crm");
    }
    return userModules.includes(module);
  };
  const canSeeDepartments = (hasCompanyAdminAccess(user?.role) && hasModule("tasks_projects")) || isSuperAdminRole(userRole);
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

  // ── Phase 6: Inbox unread badges (spec §10.3) ──────────────────────────────
  const inboxCounts = useInboxUnreadCounts();

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

  // ── Gate: every item passes the SAME role/module/capability/department rules as before ────────
  const gateItem = (item) => {
    const roleAllowed = !item.roles ||
      item.roles.includes(userRole) ||
      (userRole === ROLE.SUB_ADMIN && item.roles.includes(ROLE.ADMIN))
    if (!roleAllowed) return false
    if (!hasModule(item.module)) return false
    if (!hasCapability(item.capability)) return false
    return hasDepartment(item.department)
  };

  const filteredNavigation = navigation.filter(gateItem);
  const filteredCrmNavigation = crmNavigation.filter(gateItem);
  const filteredMetaNavigation = metaNavigation.filter(gateItem);

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
  const favoriteItems = [...filteredNavigation, ...filteredCrmNavigation, ...filteredMetaNavigation].filter((item) => favorites.includes(item.href));
  const widthIndex = WIDTH_OPTIONS.indexOf(sidebarWidth);
  const prevWidth = WIDTH_OPTIONS[Math.max(0, widthIndex - 1)];
  const nextWidth = WIDTH_OPTIONS[Math.min(WIDTH_OPTIONS.length - 1, widthIndex + 1)];

  // ── HR items: same role/module/department gate as the old HR group, renamed for People ────────
  const canSeeHrItems = isManagerRole(userRole) || userDepartment === 'hr' || userRole === ROLE.ADMIN || userRole === ROLE.SUB_ADMIN;

  const hrNavigation = HR_MODULES
    .filter((module) => canSeeHrItems && module.roles.includes(userRole) && (hasModule(module.module) || module.key === "recruitment") && hasCapability(module.capability) && hasDepartment(module.department))
    .flatMap((module) => module.navigation
      .filter((item) => !HR_ITEM_SKIP.has(item.name))
      .map((item) => ({
        ...item,
        name: HR_ITEM_RENAMES[item.name] || item.name,
        match: item.href === module.basePath ? module.basePath : undefined,
      })));

  const itemByName = [...filteredNavigation, ...filteredCrmNavigation, ...filteredMetaNavigation].reduce((acc, item) => {
    acc[item.name] = item;
    return acc;
  }, {});

  // ── Phase 4: section-level role gate (spec §9) on top of item-level gating. ──
  // Standard roles are restricted by each section's `roles` list. Non-standard roles (hr_manager,
  // recruiter, ...) are not listed in SECTIONS.roles, so they fall through to the item-level gates
  // (which already restrict by module/capability/department). A section renders only if BOTH the
  // section gate AND at least one item pass — so this can restrict but never broaden access.
  const sectionVisible = (section) => {
    if (!section.roles) return true;
    if (!STANDARD_ROLES.includes(userRole)) return true; // non-standard role: item gates decide
    return section.roles.includes(userRole) || (userRole === ROLE.SUB_ADMIN && section.roles.includes(ROLE.ADMIN));
  };

  // ── Build the 12 sections from config. People gets HR items + dynamic departments appended. ──
  const navigationGroups = SECTIONS
    .map((section) => {
      const items = section.items.map((name) => itemByName[name]).filter(Boolean);
      if (section.key === "people") {
        const deptIndex = items.findIndex((item) => item.name === "Departments");
        if (deptIndex !== -1) items.splice(deptIndex + 1, 0, ...departmentItems);
        items.push(...hrNavigation);
      }
      const group = { ...section, icon: SECTION_ICONS[section.key], items };
      // Phase 6: attach per-channel unread counts to Inbox items + header total.
      if (section.key === "inbox") {
        group.headerCount = inboxCounts.total;
        group.items = group.items.map((item) => {
          const countKey = INBOX_COUNT_KEYS[item.name];
          return countKey ? { ...item, unreadCount: inboxCounts[countKey] || 0 } : item;
        });
      }
      return group;
    })
    .filter((group) => sectionVisible(group) && group.items.length);

  const getIconColor = (itemName) => ITEM_COLORS[itemName] || ITEM_COLORS.default;
  const getGroupColor = (groupKey) => SECTION_COLORS[groupKey] || SECTION_COLORS.default;

  // Default collapsed: only the section containing the current page (and Home) starts expanded.
  // NOTE: Home renders as a collapsible group (Home + Calendar sub-items). The spec's §8 "opens
  // directly, no sub-menu" conflicts with §4 (Workspace Calendar -> Home); the plan resolves it by
  // keeping Calendar reachable under Home. Do not "simplify" this back into a bare link.
  const isGroupActive = (group) => group.items.some((item) => isNavItemActive(item, location));
  const defaultGroupOpen = (group) => group.key === "home" || isGroupActive(group);

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
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-lg shadow-black/5">
                <img
                  src="/logo.svg"
                  alt="SynTask Logo"
                  className="h-6 w-6 flex-shrink-0 object-contain"
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

            {navigationGroups.map((group) => (
              <SidebarNavGroup
                key={group.key}
                group={group}
                location={location}
                collapsed={collapsed}
                onClose={onClose}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                isOpen={openGroups[group.key] ?? defaultGroupOpen(group)}
                onToggle={() => setOpenGroups((current) => ({ ...current, [group.key]: !(current[group.key] ?? defaultGroupOpen(group)) }))}
                getIconColor={getIconColor}
                groupColor={getGroupColor(group.key)}
                groupKey={group.key}
                headerCount={group.headerCount}
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
              className={`group relative flex items-center rounded-lg p-2 transition-all hover:bg-white/5 ${collapsed ? "lg:justify-center" : ""
                }`}
              onClick={onClose}
            >
              <div className="flex-shrink-0">
                {user?.avatar ? (
                  <img
                    src={getAvatarUrl(user.avatar, user.avatar_version)}
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
  headerCount,
}) {
  const isGroupActive = group.items.some((item) => isNavItemActive(item, location))
  const GroupIcon = group.icon

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors hover:bg-white/5 hover:text-white ${collapsed ? "lg:hidden" : ""} ${isGroupActive ? "text-white" : groupColor}`}
      >
        <span className="flex items-center gap-2">
          {GroupIcon ? <GroupIcon className={`h-3.5 w-3.5 ${groupColor}`} /> : <span className={`w-1.5 h-1.5 rounded-full ${getGroupDotColor(groupKey)}`} />}
          {group.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {typeof headerCount === 'number' ? (
            headerCount > 0 ? (
              <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                {headerCount > 99 ? '99+' : headerCount}
              </span>
            ) : null
          ) : (
            <span className={`rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] ${groupColor}`}>
              {group.items.length}
            </span>
          )}
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
            showFavorite
            nested={!collapsed}
            iconColor={getIconColor ? getIconColor(item.name) : 'text-gray-400'}
          />
        ))}
      </div>
    </div>
  )
}

// Fallback only used if a future section is added without an icon in SECTION_ICONS.
// All 12 current sections have icons, so this is effectively a safety net.
function getGroupDotColor(groupKey) {
  return SECTION_DOT_COLORS[groupKey] || SECTION_DOT_COLORS.default;
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
}) {
  const isActive = isNavItemActive(item, location)

  return (
    <div className="group flex items-center gap-0.5">
      <Link
        to={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.name}
        onClick={onClose}
        className={`group relative flex min-h-8 flex-1 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${collapsed ? "lg:justify-center lg:px-0" : nested ? "ml-1" : ""
          } ${isActive
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
        {item.unreadCount > 0 && !collapsed ? (
          <span className="ml-2 shrink-0 whitespace-nowrap rounded-full border border-rose-400/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
            {item.unreadCount > 99 ? '99+' : item.unreadCount}
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
