// SynTask v3.0 — Section landing page (tab sub-nav plan, D1).
// Each sidebar section links to /sections/:key, which renders the section's header plus
// a grid of its tab cards. Clicking a card jumps straight to the real page, where the
// SectionTabs bar takes over. Same gating as the sidebar (shared getSectionItems).
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useOrgDepartments } from "../hooks/useOrgDepartments";
import {
  ITEM_COLORS,
  SECTION_COLORS,
  SECTION_ICONS,
  SECTIONS,
  getSectionItems,
} from "../config/navigation";

const SECTION_DESCRIPTIONS = {
  home: "Your personal dashboard and workspace calendar.",
  sales: "Pipeline, leads and bulk import tools for your sales team.",
  clients: "Every client, company, contact and client insight in one place.",
  work: "Projects, tasks, requests, scheduled work and time tracking.",
  content: "Plan and produce content with the calendar and creative studio.",
  publishing: "Manage social channels, analytics and integrations.",
  inbox: "Every conversation, notification and update in one place.",
  ai: "Your personal AI workspace assistants.",
  people: "Employees, attendance, departments, leaves and HR tools.",
  finance: "Invoices, transactions and subscriptions.",
  insights: "Workspace and sales reporting.",
  settings: "System settings, permissions, automation and connected accounts.",
};

const SectionLanding = () => {
  const { sectionKey } = useParams();
  const { user } = useAuthStore();
  const orgDepartments = useOrgDepartments();

  const section = SECTIONS.find((s) => s.key === sectionKey);
  const items = section ? getSectionItems(section.key, user, orgDepartments) : [];

  if (!section) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Compass className="h-12 w-12 text-text-muted" />
        <h1 className="text-xl font-bold text-text-primary">Section not found</h1>
        <p className="max-w-sm text-sm text-text-muted">
          This section does not exist. Head back to the dashboard to find what you are
          looking for.
        </p>
        <Link
          to="/dashboard"
          className="mt-2 inline-flex min-h-10 items-center justify-center rounded-full bg-primary-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const Icon = SECTION_ICONS[section.key];
  const accent = SECTION_COLORS[section.key] || SECTION_COLORS.default;

  return (
    <div className="page-enter space-y-6">
      {/* Section hero */}
      <div className="rounded-2xl border border-surface-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-surface-border bg-surface-muted ${accent}`}>
            {Icon ? <Icon className="h-7 w-7" /> : null}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Section
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {section.label}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {SECTION_DESCRIPTIONS[section.key] || "Explore this section's pages."}
            </p>
          </div>
        </div>
      </div>

      {/* Tab cards */}
      {items.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const ItemIcon = item.icon;
            const color = ITEM_COLORS[item.name] || ITEM_COLORS.default;
            return (
              <Link
                key={`${item.href}-${item.name}`}
                to={item.href}
                className="group flex items-center gap-3 rounded-2xl border border-surface-border bg-surface p-4 shadow-sm transition-all hover:border-primary-500/40 hover:shadow-md"
              >
                {ItemIcon ? (
                  <ItemIcon
                    className={`h-5 w-5 flex-shrink-0 ${color} transition-transform duration-200 group-hover:scale-110`}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {item.name}
                  </p>
                  <p className="truncate text-[11px] text-text-muted">Open page</p>
                </div>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary-700" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-surface-border p-10 text-center text-sm text-text-muted">
          No pages in this section are available for your role yet.
        </div>
      )}
    </div>
  );
};

export default SectionLanding;
