import { useState } from "react";
import { useQuery } from "react-query";
import { 
  Briefcase, 
  CalendarClock, 
  CheckCircle2, 
  FileBarChart2, 
  UserRoundSearch,
  Users,
  TrendingUp,
  Award,
  Target,
  BarChart3,
  PieChart,
  Activity,
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  Clock,
  Zap,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Star,
  UserCheck,
  UserX,
  CalendarDays,
  FileText,
  Download,
  Eye,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart as RePieChart, Pie, Cell, LineChart, Line } from "recharts";
import { recruitmentApi } from "../../../../api/recruitment";
import { PageHeader, inputClassName } from "../../../../components/ui";
import { RecruitmentStatCard } from "../components/RecruitmentStatCard";
import { ErrorState, LoadingState } from "../components/States";
import { toArray } from "../utils/data";

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle, change, changeType }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      {change && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${changeType === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {changeType === 'up' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {change}% from last month
        </div>
      )}
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// KPI CARD COMPONENT
// ============================================================
const KPICard = ({ label, value, subtitle, icon: Icon, color = 'indigo' }) => {
  const colors = {
    indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    rose: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg ${colors[color]} p-2.5`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// CHART CARD COMPONENT
// ============================================================
const ChartCard = ({ title, children, icon: Icon }) => (
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
        </div>
      </div>
    </div>
    <div className="p-4">
      {children}
    </div>
  </div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ReportsPage() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  
  const overview = useQuery(["recruitment", "reports", params], () => recruitmentApi.getReportsOverview(params));
  
  const funnel = overview.data?.funnel || {};
  const dashboard = overview.data?.dashboard || {};
  const trends = toArray(overview.data?.trends);
  const stages = toArray(overview.data?.stages);
  const sources = toArray(overview.data?.sources);
  const metrics = overview.data?.metrics || {};

  const isLoading = overview.isLoading;
  const isError = overview.isError;

  // Calculate additional metrics
  const totalCandidates = dashboard.active_applications ?? dashboard.activeApplications ?? 0;
  const conversionRate = totalCandidates > 0 
    ? ((dashboard.joined_candidates ?? dashboard.joinedCandidates ?? 0) / totalCandidates * 100).toFixed(1)
    : 0;

  // Colors for pie chart
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'];

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Recruitment Reports</h1>
                <p className="mt-1 text-indigo-100">
                  Hiring funnel, analytics, trends and KPI cards.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => overview.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button 
                onClick={() => toast.success("Export feature coming soon")}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DATE FILTERS */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Calendar}
          title="Date Range"
          description="Filter reports by date range"
        />
        <div className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">From</label>
              <input 
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                type="date" 
                value={filters.date_from} 
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} 
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">To</label>
              <input 
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                type="date" 
                value={filters.date_to} 
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} 
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => setFilters({ date_from: "", date_to: "" })}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MAIN CONTENT */}
      {/* ============================================================ */}
      {isLoading ? (
        <LoadingState type="cards" />
      ) : isError ? (
        <ErrorState onRetry={() => overview.refetch()} />
      ) : (
        <div className="space-y-6">
          {/* ============================================================ */}
          {/* KPI CARDS - 5 Cards */}
          {/* ============================================================ */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard 
              label="Open Jobs" 
              value={dashboard.open_jobs ?? dashboard.openJobs ?? 0} 
              icon={Briefcase} 
              color="indigo"
              subtitle="Active positions"
            />
            <StatCard 
              label="Active Applications" 
              value={dashboard.active_applications ?? dashboard.activeApplications ?? 0} 
              icon={UserRoundSearch} 
              color="emerald"
              subtitle="In pipeline"
            />
            <StatCard 
              label="Interviews" 
              value={dashboard.interviews_scheduled ?? dashboard.interviewsScheduled ?? 0} 
              icon={CalendarClock} 
              color="blue"
              subtitle="Scheduled"
            />
            <StatCard 
              label="Offers Pending" 
              value={dashboard.offers_pending ?? dashboard.offersPending ?? 0} 
              icon={FileBarChart2} 
              color="amber"
              subtitle="Awaiting response"
            />
            <StatCard 
              label="Joined" 
              value={dashboard.joined_candidates ?? dashboard.joinedCandidates ?? 0} 
              icon={CheckCircle2} 
              color="rose"
              subtitle="Hired"
            />
          </div>

          {/* ============================================================ */}
          {/* ADDITIONAL METRICS - Quick Stats */}
          {/* ============================================================ */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard 
              label="Conversion Rate" 
              value={`${conversionRate}%`} 
              subtitle="Applications to hires"
              icon={Target}
              color="indigo"
            />
            <KPICard 
              label="Avg Time to Hire" 
              value={metrics.avg_time_to_hire || "N/A"} 
              subtitle="Days from application"
              icon={Clock}
              color="blue"
            />
            <KPICard 
              label="Source Quality" 
              value={metrics.top_source || "N/A"} 
              subtitle="Best performing source"
              icon={Award}
              color="amber"
            />
            <KPICard 
              label="Active Recruiters" 
              value={metrics.active_recruiters || 0} 
              subtitle="Team members"
              icon={Users}
              color="emerald"
            />
          </div>

          {/* ============================================================ */}
          {/* CHARTS SECTION - 2 Column Grid */}
          {/* ============================================================ */}
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Hiring Funnel Chart */}
            <ChartCard title="Hiring Funnel" icon={PieChart}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={Object.entries(funnel).map(([name, value]) => ({ 
                  name: name.replace(/_/g, " "), 
                  value: Number(value) || 0 
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="name" className="text-xs text-gray-600 dark:text-gray-400" />
                  <YAxis className="text-xs text-gray-600 dark:text-gray-400" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg-surface)', 
                      borderColor: 'var(--color-border)',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="#6366f1" 
                    radius={[8, 8, 0, 0]} 
                    className="hover:opacity-80 transition-opacity"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Monthly Trend Chart */}
            <ChartCard title="Monthly Trend" icon={Activity}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trends.length > 0 ? trends : [{ month: "No Data", count: 0 }]}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="month" className="text-xs text-gray-600 dark:text-gray-400" />
                  <YAxis className="text-xs text-gray-600 dark:text-gray-400" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg-surface)', 
                      borderColor: 'var(--color-border)',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#0ea5e9" 
                    radius={[8, 8, 0, 0]} 
                    className="hover:opacity-80 transition-opacity"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ============================================================ */}
          {/* SOURCE BREAKDOWN */}
          {/* ============================================================ */}
          {sources.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <SectionHeader 
                icon={Users}
                title="Application Sources"
                description="Where candidates are coming from"
              />
              <div className="p-4">
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {sources.slice(0, 8).map((source, index) => (
                    <div 
                      key={source.name || index}
                      className="rounded-xl border border-gray-200 p-4 transition hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:hover:border-indigo-700"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {source.name || "Unknown"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                          {source.count || 0}
                        </span>
                      </div>
                      {source.percentage && (
                        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div 
                            className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${Math.min(source.percentage, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STAGE BREAKDOWN */}
          {/* ============================================================ */}
          {stages.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <SectionHeader 
                icon={Target}
                title="Stage Distribution"
                description="Candidates by current stage"
              />
              <div className="p-4">
                <div className="space-y-3">
                  {stages.map((stage, index) => {
                    const max = Math.max(...stages.map(s => Number(s.count) || 0), 1);
                    const percentage = (Number(stage.count) / max) * 100;
                    const colors = [
                      'from-indigo-500 to-purple-500',
                      'from-emerald-500 to-teal-500',
                      'from-blue-500 to-cyan-500',
                      'from-amber-500 to-orange-500',
                      'from-rose-500 to-pink-500',
                      'from-teal-500 to-cyan-500',
                      'from-purple-500 to-pink-500',
                    ];
                    
                    return (
                      <div key={stage.name || index}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium capitalize text-gray-700 dark:text-gray-300">
                            {stage.name?.replace(/_/g, " ") || "Stage"}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">{stage.count || 0}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <div 
                            className={`h-2 rounded-full bg-gradient-to-r ${colors[index % colors.length]} transition-all duration-500`}
                            style={{ width: `${Math.max(4, percentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}