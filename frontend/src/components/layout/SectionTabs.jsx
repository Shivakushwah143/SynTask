// SynTask v3.0 — In-page section tabs (tab sub-nav plan, Phase B).
// Renders a horizontal Chrome-style tab bar for the section that owns the current route.
// The active tab follows the URL (deep-link / refresh safe), gating matches the sidebar
// exactly (shared getSectionItems), and Inbox channels carry their unread counts.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useOrgDepartments } from "../../hooks/useOrgDepartments";
import { useInboxUnreadCounts } from "../../hooks/useInboxUnreadCounts";
import { useFavorites } from "../../hooks/useFavorites";
import {
  HR_ITEM_RENAMES,
  HR_ITEM_SKIP,
  SECTIONS,
  getNavContextForPath,
  getSectionItems,
  isNavItemActive,
} from "../../config/navigation";
import { HR_MODULES } from "../../config/hrModules";

const SECTION_LANDING_RE = /^\/sections\/([^/]+)/;
const SCROLL_STEP_PX = 240;

// Inbox item name → unread-count key from useInboxUnreadCounts().
const INBOX_COUNT_KEYS = {
  WhatsApp: "whatsapp",
  Instagram: "instagram",
  Messenger: "messenger",
  "Meta Messages": "metaTotal",
  Notifications: "notifications",
};

// Items kept in the shared navigation config (sidebar favorites, section landing cards)
// but intentionally hidden from this in-page tab bar. User request: Import Leads stays
// in the sidebar, it is only removed from the Sales section tabs.
const TAB_HIDDEN_ITEM_NAMES = new Set(["Import Leads"]);

// Exact pathname + query match (no prefix / match-based activation), used so only ONE tab is
// ever active — prefix matches would otherwise light up several tabs on detail/HR pages.
const isExactNavMatch = (item, location) => {
  const [itemPath, itemSearch = ""] = (item.href || "").split("?");
  if (itemSearch) {
    const expected = new URLSearchParams(itemSearch);
    const actual = new URLSearchParams(location.search);
    return (
      location.pathname === itemPath &&
      [...expected].every(([key, value]) => actual.get(key) === value)
    );
  }
  return location.pathname === itemPath;
};

// Resolve the section owning the current route, or null when the page has no tabs
// (chat, meetings, auth, ...). Section landing pages resolve via their URL param.
// `itemName` is the resolved active item so the tab bar can highlight exactly one tab.
const resolveSectionContext = (location) => {
  const landing = location.pathname.match(SECTION_LANDING_RE);
  if (landing) return { sectionKey: landing[1], isLanding: true };

  const ctx = getNavContextForPath(location.pathname, location.search);
  if (ctx) return { sectionKey: ctx.sectionKey, isLanding: false, itemName: ctx.itemName };

  // HR recruitment screens belong to the People section (they were moved out of the
  // sidebar config, but their tabs live under People). Exact-match only: the interview
  // screen and /hr landing deliberately show no tab bar.
  const hrItems = HR_MODULES.flatMap((mod) =>
    mod.navigation
      .filter((item) => !HR_ITEM_SKIP.has(item.name))
      .map((item) => ({
        name: HR_ITEM_RENAMES[item.name] || item.name,
        href: item.href,
        match: item.href === mod.basePath ? mod.basePath : undefined,
      })),
  );
  const hrExact = hrItems.find((item) => isExactNavMatch(item, location));
  if (hrExact) return { sectionKey: "people", isLanding: false, itemName: hrExact.name };

  return null;
};

const SectionTabs = () => {
  const location = useLocation();
  const context = resolveSectionContext(location);
  if (!context) return null;
  return <SectionTabsInner location={location} context={context} />;
};

function SectionTabsInner({ location, context }) {
  const { user } = useAuthStore();
  const orgDepartments = useOrgDepartments();
  const inboxCounts = useInboxUnreadCounts();
  const { toggleFavorite, isFavorite } = useFavorites();

  const scrollRef = useRef(null);
  const tabRefs = useRef([]);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const section = SECTIONS.find((s) => s.key === context.sectionKey);

  const items = useMemo(
    () => (section ? getSectionItems(section.key, user, orgDepartments) : []),
    [section, user, orgDepartments],
  );

  // ── All hooks above; early returns only after every hook has run. ──────────
  const tabs = useMemo(() => {
    if (!section) return [];
    let list = items.filter((item) => !TAB_HIDDEN_ITEM_NAMES.has(item.name));
    // Phase 6: per-channel unread counts on the Inbox tabs.
    if (section.key === "inbox") {
      list = list.map((item) => {
        const countKey = INBOX_COUNT_KEYS[item.name];
        return countKey ? { ...item, unreadCount: inboxCounts[countKey] || 0 } : item;
      });
    }
    return [{ name: "Overview", href: `/sections/${section.key}`, icon: null, overview: true }, ...list];
  }, [items, section, inboxCounts, context.isLanding]);

  useEffect(() => {
    const updateCanScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      setCanScroll({
        left: el.scrollLeft > 4,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4,
      });
    };
    updateCanScroll();
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateCanScroll, { passive: true });
    window.addEventListener("resize", updateCanScroll);
    return () => {
      el.removeEventListener("scroll", updateCanScroll);
      window.removeEventListener("resize", updateCanScroll);
    };
  }, [section?.key, tabs.length]);

  // D5: hide the bar for sections with a single tab (or an unknown section key).
  if (!section || items.length < 2) return null;

  // Active tab: the Overview pseudo-tab on landing pages, otherwise the exact item the
  // context resolver chose (detail pages keep their parent tab). The per-tab scan is only
  // a safety net when no resolved item name is available.
  const isTabActive = (tab) => {
    if (tab.overview) return context.isLanding;
    if (context.itemName) return tab.name === context.itemName;
    return isNavItemActive(tab, location);
  };

  const scrollBy = (direction) => {
    scrollRef.current?.scrollBy({ left: direction * SCROLL_STEP_PX, behavior: "smooth" });
  };

  const handleKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = tabRefs.current.findIndex((el) => el === document.activeElement);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const target =
      tabRefs.current[Math.max(0, Math.min(tabRefs.current.length - 1, currentIndex + delta))];
    target?.focus();
    // jsdom does not implement scrollIntoView (browsers do); guard for tests.
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-xl border border-surface-border bg-surface-muted px-1.5 py-1.5 shadow-sm">
      {canScroll.left ? (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll tabs left"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label={`${section.label} pages`}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const active = isTabActive(tab);
          return (
            <div key={`${section.key}-${tab.href}-${tab.name}`} role="presentation" className="group flex shrink-0 items-center">
              <Link
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                to={tab.href}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted hover:bg-surface hover:text-text-primary"
                }`}
              >
                {tab.icon ? <tab.icon className={`h-3.5 w-3.5 ${active ? "text-primary-700" : "text-text-muted"}`} /> : null}
                {tab.name}
                {tab.unreadCount > 0 ? (
                  <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                    {tab.unreadCount > 99 ? "99+" : tab.unreadCount}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary-500" />
                ) : null}
              </Link>
              {!tab.overview ? (
                <button
                  type="button"
                  onClick={() => toggleFavorite(tab.href)}
                  aria-label={
                    isFavorite(tab.href)
                      ? `Remove ${tab.name} from favorites`
                      : `Add ${tab.name} to favorites`
                  }
                  aria-pressed={isFavorite(tab.href)}
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-opacity hover:bg-surface-subtle hover:text-yellow-500 focus-visible:opacity-100 group-hover:opacity-100 ${
                    isFavorite(tab.href) ? "opacity-100 text-yellow-500" : ""
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${isFavorite(tab.href) ? "fill-yellow-500" : ""}`} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {canScroll.right ? (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll tabs right"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export default SectionTabs;
