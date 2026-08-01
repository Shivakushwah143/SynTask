import { useEffect, useState } from "react";
import { useDefaultAvatar } from "../utils/avatar";
import { getAvatarUrl } from "../utils/avatarUrl";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getRoleLabel } from "../utils/roles";
import { useOrgDepartments } from "../hooks/useOrgDepartments";
import { useFavorites } from "../hooks/useFavorites";
import {
  ITEM_COLORS,
  SECTION_COLORS,
  SECTION_ICONS,
  SECTIONS,
  getSectionItems,
  isNavItemActive,
} from "../config/navigation";

const COLLAPSE_KEY = "syntask-sidebar-collapsed";
const FAVORITES_OPEN_KEY = "syntask-sidebar-favorites-open";
const WIDTH_KEY = "syntask-sidebar-width";
const WIDTH_OPTIONS = [240, 280, 320];

// Tab sub-nav plan (D1): clicking a section opens its landing page at /sections/:key.
const SECTION_LANDING_PREFIX = "/sections/";

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const orgDepartments = useOrgDepartments();
  const { favorites } = useFavorites();

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

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_OPEN_KEY, String(favoritesOpen));
    } catch {
      // ignore
    }
  }, [favoritesOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarWidth]);

  // ── Phase A: shared section resolution — identical output to the SectionTabs bar. ──
  const sectionLinks = SECTIONS.map((section) => ({
    ...section,
    icon: SECTION_ICONS[section.key],
    href: `${SECTION_LANDING_PREFIX}${section.key}`,
    items: getSectionItems(section.key, user, orgDepartments),
  })).filter((section) => section.items.length);

  const isSectionLinkActive = (section) =>
    location.pathname === section.href ||
    section.items.some((item) => isNavItemActive(item, location));

  // Favorites pool: every gated config/HR item across sections (dynamic department tabs excluded).
  const favoriteItems = SECTIONS.flatMap((section) =>
    getSectionItems(section.key, user, orgDepartments).filter(
      (item) => !item.href.startsWith("/admin-permissions?department="),
    ),
  ).filter((item) => favorites.includes(item.href));

  const widthIndex = WIDTH_OPTIONS.indexOf(sidebarWidth);
  const prevWidth = WIDTH_OPTIONS[Math.max(0, widthIndex - 1)];
  const nextWidth = WIDTH_OPTIONS[Math.min(WIDTH_OPTIONS.length - 1, widthIndex + 1)];

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

          {/* Navigation - 12 link-only sections */}
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
                      <Star className={`mr-2 h-4 w-4 ${ITEM_COLORS[item.name] || ITEM_COLORS.default}`} />
                      <span className={collapsed ? "lg:hidden" : ""}>{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {sectionLinks.map((section) => (
              <SidebarSectionLink
                key={section.key}
                section={section}
                isActive={isSectionLinkActive(section)}
                collapsed={collapsed}
                onClose={onClose}
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

// A single 12-section link. Icons/colors come from the shared config so the sidebar
// and the SectionTabs bar always agree.
function SidebarSectionLink({ section, isActive, collapsed, onClose }) {
  const Icon = section.icon || section.items[0]?.icon;
  const color = SECTION_COLORS[section.key] || SECTION_COLORS.default;

  return (
    <Link
      to={section.href}
      aria-current={isActive ? "page" : undefined}
      aria-label={section.label}
      onClick={onClose}
      className={`group relative flex min-h-9 w-full items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${collapsed ? "lg:justify-center lg:px-0" : ""} ${
        isActive
          ? "bg-gradient-to-r from-primary-500/15 to-transparent text-white shadow-sm"
          : "text-gray-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {Icon ? (
        <Icon className={`h-4 w-4 flex-shrink-0 transition-colors duration-200 ${collapsed ? "" : "mr-2.5"} ${isActive ? "text-primary-400" : color}`} />
      ) : null}
      <span className={`flex-1 truncate ${collapsed ? "lg:hidden" : ""}`}>{section.label}</span>
      {isActive ? (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-400 shadow-lg shadow-primary-400/50 animate-pulse"></span>
      ) : null}
      {collapsed && <SidebarTooltip label={section.label} />}
    </Link>
  );
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
