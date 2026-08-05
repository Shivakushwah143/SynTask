import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, Clock3, Layers3, Search, Sparkles } from "lucide-react";

const iconWrap = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-muted";

export const ModuleOverviewHeader = ({ icon: Icon, title, label, description, accent }) => (
  <section className="rounded-lg border border-surface-border bg-surface p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <div className={`${iconWrap} ${accent}`}>
          {Icon ? <Icon className="h-6 w-6" aria-hidden="true" /> : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
          <h1 className="mt-1 text-2xl font-bold text-text-primary sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-500/10 px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Workspace Map
      </div>
    </div>
  </section>
);

export const OverviewStats = ({ stats }) => {
  const icons = [Layers3, Clock3, BarChart3, Sparkles];
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const Icon = icons[index % icons.length];
        return (
          <div key={stat.label} className="rounded-lg border border-surface-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-text-muted">{stat.label}</p>
              <Icon className="h-4 w-4 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-text-primary">{stat.value}</p>
            <p className="mt-1 text-xs text-text-muted">{stat.hint}</p>
          </div>
        );
      })}
    </section>
  );
};

export const SearchFilter = ({ value, onChange, placeholder }) => (
  <label className="relative block">
    <span className="sr-only">Search overview cards</span>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-h-11 w-full rounded-lg border border-surface-border bg-surface py-2 pl-10 pr-3 text-sm text-text-primary shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
    />
  </label>
);

export const QuickActions = ({ actions }) => (
  <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-text-primary">Quick Actions</h2>
      <span className="text-xs text-text-muted">Available now</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={`${action.label}-${action.href}`}
          to={action.href}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-muted px-3 py-2 text-sm font-medium text-text-primary transition duration-200 hover:border-primary-500/40 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        >
          {action.icon ? <action.icon className="h-4 w-4" aria-hidden="true" /> : null}
          {action.label}
        </Link>
      ))}
    </div>
  </section>
);

export const OverviewMetrics = ({ metrics }) => (
  <div className="grid grid-cols-2 gap-2">
    {metrics.slice(0, 4).map((metric) => (
      <div key={metric.label} className="rounded-lg border border-surface-border bg-surface-muted p-3">
        <p className="truncate text-[11px] font-medium text-text-muted">{metric.label}</p>
        <p className="mt-1 text-lg font-bold text-text-primary">{metric.value}</p>
      </div>
    ))}
  </div>
);

export const OverviewAlertPanel = ({ alerts }) => {
  const visible = alerts.slice(0, 3);
  if (!visible.length) return null;
  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Needs Attention
      </div>
      <div className="grid gap-2">
        {visible.map((alert) => (
          <Link
            key={`${alert.label}-${alert.href}`}
            to={alert.href}
            className="flex min-h-9 items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm text-text-primary transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            <span className="truncate">{alert.label}</span>
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {alert.count}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export const OverviewSummary = ({ section, activeItem, items }) => (
  <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase text-text-muted">{section.label}</p>
        <h2 className="mt-1 text-base font-semibold text-text-primary">
          {activeItem ? activeItem.name : "Overview"}
        </h2>
      </div>
      <span className="rounded-full border border-surface-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">
        {items.length} pages visible
      </span>
    </div>
  </section>
);

export const OverviewInsightCard = ({ item, overview, insights, color }) => {
  const Icon = item.icon;
  return (
    <article className="group flex min-h-[300px] flex-col rounded-lg border border-surface-border bg-surface p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary-500/40 hover:shadow-lg motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <div className={`${iconWrap} ${color}`}>
          {Icon ? <Icon className="h-5 w-5 transition duration-200 group-hover:scale-110 motion-reduce:transform-none" aria-hidden="true" /> : null}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${insights.toneClass}`}>
          {insights.status}
        </span>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text-primary">{item.name}</h3>
          <p className="text-xs text-text-muted">{insights.updated}</p>
        </div>
        <OverviewMetrics metrics={insights.metrics} />
        <div className="mt-4 flex flex-wrap gap-2">
          {(overview.badges || []).slice(0, 3).map((badge) => (
            <span key={badge} className="rounded-full border border-surface-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">
              {badge}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {insights.actions.slice(0, 3).map((action, index) => (
          <Link
            key={`${action}-${item.href}`}
            to={item.href}
            className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
              index === 0
                ? "bg-primary-600 text-white hover:bg-primary-700"
                : "border border-surface-border bg-surface-muted text-text-primary hover:border-primary-500/40"
            }`}
          >
            {action}
          </Link>
        ))}
        <Link
          to={item.href}
          aria-label={`Open ${item.name}`}
          className="ml-auto inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-surface-border bg-surface-muted text-text-muted transition hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:hover:text-primary-300"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
};

export const OverviewCard = OverviewInsightCard;

export const RecentActivity = ({ items }) => (
  <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-text-primary">Recent Activity</h2>
      <span className="text-xs text-text-muted">Available pages</span>
    </div>
    {items.length ? (
      <div className="grid gap-2">
        {items.map((item) => (
          <Link key={`${item.name}-${item.href}`} to={item.href} className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-muted px-3 py-2 text-sm text-text-primary transition hover:border-primary-500/40">
            <span>{item.name}</span>
            <ArrowRight className="h-4 w-4 text-text-muted" aria-hidden="true" />
          </Link>
        ))}
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted p-6 text-sm text-text-muted">
        No recent records are available here yet.
      </div>
    )}
  </section>
);
