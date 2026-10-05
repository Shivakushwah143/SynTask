// SynTask v3.0 section landing. Route and permission source stay unchanged:
// sidebar section links use /sections/:key, items come from getSectionItems.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueries, useQueryClient } from "react-query";
import { ArrowRight, Compass, FileDown, FileUp, Plus, Settings } from "lucide-react";

import {
  ModuleOverviewHeader,
  OverviewAlertPanel,
  OverviewCard,
  OverviewStats,
  QuickActions,
  RecentActivity,
  SearchFilter,
} from "../components/overview/ModuleOverview";
import {
  ITEM_COLORS,
  SECTION_COLORS,
  SECTION_ICONS,
  SECTIONS,
  getSectionItems,
} from "../config/navigation";
import { SECTION_OVERVIEWS, getItemInsights, getItemOverview } from "../config/sectionOverview";
import { attendanceAPI } from "../api/attendance";
import { employeesApi } from "../api/employees";
import { hrDocumentsApi } from "../api/hrDocuments";
import { calendarApi } from "../api/calendar";
import { companiesAPI } from "../api/companies";
import { crmApi } from "../api/crm";
import { googleWorkspaceApi } from "../api/googleWorkspace";
import { invoicesAPI } from "../api/invoices";
import { ledgerAPI } from "../api/ledger";
import { leavesAPI } from "../api/leaves";
import { notificationsAPI } from "../api/notifications";
import { projectsApi } from "../api/projects";
import { reportsAPI } from "../api/reports";
import { scheduledJobsAPI } from "../api/scheduledJobs";
import { salesApi } from "../api/sales";
import { tasksAPI } from "../api/tasks";
import { ticketsAPI } from "../api/tickets";
import { timesheetApi } from "../api/timesheet";
import { usersAPI } from "../api/users";
import { useOrgDepartments } from "../hooks/useOrgDepartments";
import { useAuthStore } from "../store/authStore";

const normalize = (value) => String(value || "").toLowerCase().trim();

const flattenCachedData = (queryClient, hints = []) => {
  const loweredHints = hints.map(normalize).filter(Boolean);
  if (!loweredHints.length) return [];
  return queryClient
    .getQueryCache()
    .findAll()
    .filter((query) => loweredHints.some((hint) => normalize(query.queryKey).includes(hint)))
    .flatMap((query) => {
      const data = query.state?.data;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.results)) return data.results;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.records)) return data.records;
      if (Array.isArray(data?.projects)) return data.projects;
      if (Array.isArray(data?.tasks)) return data.tasks;
      if (Array.isArray(data?.tickets)) return data.tickets;
      if (Array.isArray(data?.entries)) return data.entries;
      if (Array.isArray(data?.users)) return data.users;
      if (Array.isArray(data?.companies)) return data.companies;
      if (Array.isArray(data?.contacts)) return data.contacts;
      if (Array.isArray(data?.leads)) return data.leads;
      if (Array.isArray(data?.prospects)) return data.prospects;
      if (Array.isArray(data?.notifications)) return data.notifications;
      if (Array.isArray(data?.events)) return data.events;
      if (Array.isArray(data?.invoices)) return data.invoices;
      if (Array.isArray(data?.transactions)) return data.transactions;
      if (Array.isArray(data?.mails)) return data.mails;
      if (Array.isArray(data?.messages)) return data.messages;
      if (Array.isArray(data?.activity)) return data.activity;
      return [];
    });
};

const getArrayData = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.projects)) return data.projects;
  if (Array.isArray(data?.tasks)) return data.tasks;
  if (Array.isArray(data?.tickets)) return data.tickets;
  if (Array.isArray(data?.entries)) return data.entries;
  if (Array.isArray(data?.users)) return data.users;
  if (Array.isArray(data?.companies)) return data.companies;
  if (Array.isArray(data?.contacts)) return data.contacts;
  if (Array.isArray(data?.leads)) return data.leads;
  if (Array.isArray(data?.prospects)) return data.prospects;
  if (Array.isArray(data?.notifications)) return data.notifications;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.invoices)) return data.invoices;
  if (Array.isArray(data?.transactions)) return data.transactions;
  if (Array.isArray(data?.mails)) return data.mails;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.activity)) return data.activity;
  return [];
};

const getTotalFromData = (data, fallback) => {
  const direct = data?.total ?? data?.count ?? data?.total_count ?? data?.totalCount;
  const numeric = Number(direct);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getRecordDate = (record) =>
  record?.updated_at || record?.updatedAt || record?.created_at || record?.createdAt || record?.date || null;

const isToday = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
};

const isOverdue = (record) => {
  const raw = record?.due_date || record?.deadline || record?.end_date || record?.follow_up_date;
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return date < new Date() && !/done|complete|closed|won|paid/i.test(String(record?.status || ""));
};

const countByText = (records, patterns) =>
  records.filter((record) =>
    patterns.some((pattern) => pattern.test(String(record?.status || record?.stage || record?.priority || record?.type || "")))
  ).length;

const itemFetchers = {
  Home: () => reportsAPI.getAnalyticsCharts("month"),
  Calendar: async () => (await calendarApi.getEvents({ view: "month" })).data,
  Leads: async () => (await salesApi.getLeads({ limit: 50 })).data,
  "All Leads": async () => (await salesApi.getLeads({ limit: 50 })).data,
  Pipeline: async () => (await crmApi.getPipeline({ limit: 50 })).data,
  "Import Leads": async () => (await salesApi.getImportHistory()).data,
  "All Clients": () => companiesAPI.listCompanies(null, 0, 50),
  Companies: async () => (await crmApi.getCompanies({ limit: 50 })).data,
  Contacts: async () => (await crmApi.getContacts({ limit: 50 })).data,
  "Client Calendar": async () => (await calendarApi.getEvents({ view: "month" })).data,
  "Client Insights": async () => (await crmApi.getDashboard()).data,
  Projects: async () => (await projectsApi.getProjects({ limit: 50 })).data,
  Tasks: () => tasksAPI.listTasks({ limit: 50 }),
  Requests: () => ticketsAPI.listTickets({ limit: 50 }),
  "Scheduled Work": () => scheduledJobsAPI.listJobs({ limit: 50 }),
  "Time Tracking": async () => (await timesheetApi.list({ limit: 50 })).data,
  "Content Calendar": async () => (await calendarApi.getEvents({ view: "month" })).data,
  "Publishing Centre": async () => (await crmApi.getDashboard()).data,
  "Social Accounts": async () => (await crmApi.getDashboard()).data,
  "Publishing Analytics": async () => (await crmApi.getDashboard()).data,
  Integrations: async () => (await googleWorkspaceApi.getConnection()).data,
  WhatsApp: async () => (await crmApi.getActivities({ channel: "whatsapp", limit: 50 })).data,
  Instagram: async () => (await crmApi.getActivities({ channel: "instagram", limit: 50 })).data,
  Messenger: async () => (await crmApi.getActivities({ channel: "messenger", limit: 50 })).data,
  "Meta Messages": async () => (await crmApi.getActivities({ limit: 50 })).data,
  Notifications: () => notificationsAPI.listNotifications(null, 0, 50),
  "Activity Feed": async () => (await crmApi.getActivities({ limit: 50 })).data,
  "Daily Updates": () => notificationsAPI.listNotifications(null, 0, 50),
  "AI Replies": async () => (await crmApi.getActivities({ type: "ai", limit: 50 })).data,
  "Approval Queue": async () => (await crmApi.getActivities({ status: "pending", limit: 50 })).data,
  "AI Assistant": () => reportsAPI.getAnalyticsCharts("month"),
  "AI Content Assistant": () => reportsAPI.getAnalyticsCharts("month"),
  Employees: async () => (await employeesApi.list({ page_size: 50 })).data,
  "User Accounts": () => usersAPI.listUsers(null, null, null, 0, 50),
  "My People": () => usersAPI.getMyTeam(),
  Documents: async () => (await hrDocumentsApi.listDocuments({ page_size: 50 })).data,
  "Document Types": async () => (await hrDocumentsApi.listTypes({ include_inactive: true })).data,
  Attendance: () => attendanceAPI.getDashboardStats(),
  "Live Attendance": () => attendanceAPI.getLiveMonitoring(),
  "Attendance Reports": () => attendanceAPI.getDashboardStats(),
  "Leave Management": async () => (await leavesAPI.list({ limit: 50 })).data,
  Departments: () => usersAPI.listUsers(null, null, null, 0, 50),
  "Company Directory": () => companiesAPI.listCompanies(null, 0, 50),
  Invoices: () => invoicesAPI.listInvoices(0, 50),
  Transactions: () => ledgerAPI.getLedger({ limit: 50 }),
  Subscriptions: () => invoicesAPI.listInvoices(0, 50),
  "Workspace Reports": () => reportsAPI.getAnalyticsCharts("month"),
  "Sales Reports": async () => (await salesApi.getSalesReport({ limit: 50 })).data,
  "System Settings": () => usersAPI.listUsers(null, null, null, 0, 50),
  "Roles & Permissions": () => usersAPI.listUsers(null, null, null, 0, 50),
  "Automation Rules": () => scheduledJobsAPI.listJobs({ limit: 50 }),
  "Connected Accounts": async () => (await googleWorkspaceApi.getConnection()).data,
  "Google Workspace": async () => (await googleWorkspaceApi.getDashboard()).data,
  "Activity Logs": async () => (await crmApi.getActivities({ limit: 50 })).data,
  "Client Settings": async () => (await crmApi.getDashboard()).data,
};

const mergeUniqueRecords = (cachedRecords, liveRecords) => {
  const seen = new Set();
  return [...liveRecords, ...cachedRecords].filter((record, index) => {
    const key = record?.id || record?._id || record?.key || `${record?.name || record?.title || "record"}-${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildInsights = (item, queryClient, liveData) => {
  const config = getItemInsights(item);
  const liveRecords = getArrayData(liveData?.data);
  const records = mergeUniqueRecords(flattenCachedData(queryClient, config.queryHints), liveRecords);
  const total = getTotalFromData(liveData?.data, records.length);
  const overdue = records.filter(isOverdue).length;
  const today = records.filter((record) => isToday(getRecordDate(record))).length;
  const pending = countByText(records, [/pending/i, /open/i, /todo/i, /new/i]);
  const completed = countByText(records, [/done/i, /complete/i, /won/i, /paid/i, /approved/i]);
  const blocked = countByText(records, [/blocked/i, /stuck/i, /failed/i, /rejected/i, /lost/i]);
  const values = liveData?.isLoading
    ? ["...", "...", "...", "..."]
    : liveData?.isError
      ? ["No access", "No access", "No access", "No access"]
      : [total, today, overdue || pending, blocked || completed];
  const attention = overdue || blocked;
  const pendingSignal = pending || today;
  const status = attention ? "Requires Attention" : pendingSignal ? "Pending" : "Healthy";
  const toneClass = attention
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    : pendingSignal
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return {
    status,
    toneClass,
    updated: liveData?.isLoading ? "Loading" : liveData?.isError ? "Unavailable" : "Updated now",
    metrics: config.metrics.map((label, index) => ({ label, value: values[index] ?? "--" })),
    alerts: config.alerts.map((label, index) => ({
      label,
      count: [attention, pendingSignal, total][index] ?? 0,
      href: item.href,
    })),
    actions: config.actions,
  };
};

const buildStats = (items, overview) => {
  const available = items.length;
  const configured = overview?.stats || [];
  return [
    { label: configured[0] || "Total Items", value: available, hint: "Available to your role" },
    { label: configured[1] || "Pending", value: "Open", hint: "Live data in subpages" },
    { label: configured[2] || "Active", value: available ? "Ready" : "None", hint: "Routes unchanged" },
    { label: configured[3] || "Recently Updated", value: "View", hint: "Open page for records" },
  ];
};

const buildQuickActions = (items, overview) => {
  const primary = items[0];
  const importItem = items.find((item) => /import/i.test(item.name));
  const reportItem = items.find((item) => /report|insight|analytics/i.test(item.name));
  const settingsItem = items.find((item) => /setting|permission|account|integration/i.test(item.name));
  const labels = overview?.actions || [];
  return [
    primary ? { label: labels[0] || "Create New", href: primary.href, icon: Plus } : null,
    importItem ? { label: labels[1] || "Import", href: importItem.href, icon: FileUp } : null,
    reportItem ? { label: labels[2] || "Reports", href: reportItem.href, icon: FileDown } : null,
    settingsItem ? { label: labels[3] || "Settings", href: settingsItem.href, icon: Settings } : null,
  ].filter(Boolean).slice(0, 4);
};

const SectionLanding = () => {
  const { sectionKey } = useParams();
  const { user } = useAuthStore();
  const orgDepartments = useOrgDepartments();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const section = SECTIONS.find((candidate) => candidate.key === sectionKey);
  const items = useMemo(
    () => (section ? getSectionItems(section.key, user, orgDepartments) : []),
    [section, user, orgDepartments]
  );
  const overview = SECTION_OVERVIEWS[section?.key] || {};
  const dataQueries = useQueries(
    items.map((item) => ({
      queryKey: ["module-overview", section?.key, item.name],
      queryFn: itemFetchers[item.name],
      enabled: Boolean(section && itemFetchers[item.name]),
      staleTime: 60_000,
      retry: false,
    }))
  );
  const liveRecordsByName = useMemo(() => {
    const map = new Map();
    items.forEach((item, index) => {
      map.set(item.name, dataQueries[index] || {});
    });
    return map;
  }, [items, dataQueries]);
  const filteredItems = useMemo(() => {
    const term = normalize(query);
    if (!term) return items;
    return items.filter((item) => {
      const itemOverview = getItemOverview(item);
      return [
        item.name,
        item.href,
        itemOverview.description,
        ...(itemOverview.examples || []),
        ...(itemOverview.badges || []),
      ].some((part) => normalize(part).includes(term));
    });
  }, [items, query]);

  if (!section) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Compass className="h-12 w-12 text-text-muted" />
        <h1 className="text-xl font-bold text-text-primary">Section not found</h1>
        <p className="max-w-sm text-sm text-text-muted">
          This section does not exist. Head back to the dashboard to find what you are looking for.
        </p>
        <Link
          to="/dashboard"
          className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const Icon = SECTION_ICONS[section.key];
  const accent = SECTION_COLORS[section.key] || SECTION_COLORS.default;
  const title = overview.title || section.label;
  const quickActions = buildQuickActions(items, overview);
  const recentItems = items.slice(0, 4);
  const itemInsights = useMemo(
    () => new Map(items.map((item) => [item.href, buildInsights(item, queryClient, liveRecordsByName.get(item.name))])),
    [items, queryClient, liveRecordsByName]
  );
  const alerts = items.flatMap((item) => itemInsights.get(item.href)?.alerts || []).slice(0, 3);

  return (
    <div className="page-enter space-y-5">
      <ModuleOverviewHeader
        icon={Icon}
        title={title}
        label={section.label}
        description={overview.description || "Explore pages available in this workspace section."}
        accent={accent}
      />

      <OverviewStats stats={buildStats(items, overview)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <SearchFilter value={query} onChange={setQuery} placeholder={`Search ${section.label} tools`} />

          {filteredItems.length ? (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredItems.map((item) => (
                <OverviewCard
                  key={`${item.href}-${item.name}`}
                  item={item}
                  overview={getItemOverview(item)}
                  insights={itemInsights.get(item.href)}
                  color={ITEM_COLORS[item.name] || ITEM_COLORS.default}
                />
              ))}
            </section>
          ) : (
            <section className="rounded-lg border border-dashed border-surface-border bg-surface p-10 text-center">
              <Compass className="mx-auto h-10 w-10 text-text-muted" />
              <h2 className="mt-3 text-base font-semibold text-text-primary">No matching tools</h2>
              <p className="mt-1 text-sm text-text-muted">Try a different search term.</p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <OverviewAlertPanel alerts={alerts} />
          <QuickActions actions={quickActions} />
          <RecentActivity items={recentItems} />
          <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-text-primary">Suggested Start</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Start with the most common workspace page, then move through related tools as the work develops.
            </p>
            {items[0] ? (
              <Link to={items[0].href} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-700">
                Start with {items[0].name}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default SectionLanding;
