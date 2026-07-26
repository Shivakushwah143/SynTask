import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { 
  Briefcase, 
  CalendarClock, 
  FileBarChart2, 
  Inbox, 
  Plus, 
  Send, 
  TrendingUp, 
  UserRoundSearch,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  UserPlus,
  Award,
  Activity,
  BarChart3,
  PieChart,
  Target,
  Zap
} from "lucide-react";

import { recruitmentApi } from "../../../api/recruitment";
import { Badge, EmptyState, SkeletonCard } from "../../../components/ui";
import { RecruitmentStatCard } from "../../../modules/hr/recruitment/components/RecruitmentStatCard";
import { StatusBadge } from "../../../modules/hr/recruitment/components/StatusBadge";
import { fmtDateTime, toArray } from "../../../modules/hr/recruitment/utils/data";

const metrics = [
  { key: "open_jobs", alt: "openJobs", label: "Open Jobs", icon: Briefcase, color: "indigo" },
  { key: "active_applications", alt: "activeApplications", label: "Active Applications", icon: UserRoundSearch, color: "emerald" },
  { key: "interviews_scheduled", alt: "interviewsScheduled", label: "Today's Interviews", icon: CalendarClock, color: "blue" },
  { key: "offers_pending", alt: "offersPending", label: "Pending Offers", icon: FileBarChart2, color: "amber" },
];

const quickActions = [
  { label: "Create Job", href: "/hr/recruitment/jobs", icon: Plus },
  { label: "Import Resume", href: "/hr/recruitment/inbox", icon: Inbox },
  { label: "Schedule Interview", href: "/hr/recruitment/interviews", icon: CalendarClock },
];

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
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
// MAIN COMPONENT
// ============================================================
export default function RecruitmentDashboard() {
  const dashboardQuery = useQuery(["recruitment", "dashboard"], () => recruitmentApi.getDashboard(), { retry: 1 });
  const jobDashboardQuery = useQuery(["recruitment", "jobs", "dashboard"], () => recruitmentApi.getJobDashboard(), { retry: 1 });
  const candidateQuery = useQuery(["recruitment", "dashboard", "recentCandidates"], () => recruitmentApi.getCandidates({ page: 1, page_size: 5 }), { retry: 1 });
  const interviewQuery = useQuery(["recruitment", "dashboard", "recentInterviews"], () => recruitmentApi.getInterviews({ page: 1, page_size: 5 }), { retry: 1 });

  const dashboard = dashboardQuery.data?.data || dashboardQuery.data || {};
  const jobDashboard = jobDashboardQuery.data?.data || jobDashboardQuery.data || {};
  const recentJobs = toArray(jobDashboard.recent_jobs || jobDashboard.recentJobs);
  const recentApplications = toArray(candidateQuery.data?.data || candidateQuery.data);
  const interviews = toArray(interviewQuery.data?.data || interviewQuery.data);
  const metricsData = dashboard.metrics || dashboard;
  const funnel = Array.isArray(dashboard.funnel)
    ? Object.fromEntries(dashboard.funnel.map((item) => [item._id, item.count]))
    : (dashboard.funnel || {});

  const isLoading = dashboardQuery.isLoading || jobDashboardQuery.isLoading;

  // Calculate additional stats
  const totalCandidates = recentApplications.length + interviews.length;
  const activeJobs = metricsData.open_jobs || metricsData.openJobs || 0;
  const todayInterviews = metricsData.interviews_scheduled || metricsData.interviewsScheduled || 0;
  const conversionRate = activeJobs > 0 ? Math.round((totalCandidates / activeJobs) * 10) / 10 : 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-green-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Recruitment Command Center</h1>
                <p className="mt-1 text-indigo-100">
                  Monitor hiring pipeline, act on urgent work, and move candidates without leaving HR.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  to={action.href}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((card) => <SkeletonCard key={card.key} />)}
        </div>
      ) : dashboardQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-2 text-lg font-semibold text-rose-900 dark:text-rose-100">Recruitment dashboard unavailable</h3>
          <p className="text-sm text-rose-700 dark:text-rose-300">Metrics could not be loaded. Check backend and permissions.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((card) => (
            <StatCard 
              key={card.key} 
              label={card.label} 
              value={metricsData[card.key] ?? metricsData[card.alt] ?? 0} 
              icon={card.icon} 
              color={card.color}
            />
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* MAIN GRID - Funnel & Recent Activity */}
      {/* ============================================================ */}
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        {/* Hiring Funnel */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader 
            icon={TrendingUp}
            title="Hiring Funnel Preview"
            description="Live stage counts from recruitment reports."
            action={
              <Link 
                to="/hr/recruitment/reports" 
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="p-4">
            {Object.keys(funnel).length ? (
              <div className="space-y-4">
                {Object.entries(funnel).slice(0, 7).map(([stage, count], index) => {
                  const max = Math.max(...Object.values(funnel).map((value) => Number(value) || 0), 1);
                  const percentage = Math.max(6, (Number(count) / max) * 100);
                  const colors = [
                    'from-indigo-500 to-purple-500',
                    'from-emerald-500 to-teal-500',
                    'from-blue-500 to-cyan-500',
                    'from-amber-500 to-orange-500',
                    'from-rose-500 to-pink-500',
                    'from-teal-500 to-cyan-500',
                    'from-indigo-400 to-blue-500'
                  ];
                  
                  return (
                    <div key={stage}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium capitalize text-gray-700 dark:text-gray-300">
                          {stage.replace(/_/g, " ")}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">{count}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                        <div 
                          className={`h-2.5 rounded-full bg-gradient-to-r ${colors[index % colors.length]} transition-all duration-500`} 
                          style={{ width: `${percentage}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No funnel activity yet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Candidate movement will appear here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader 
            icon={Activity}
            title="Recent Activity"
            description="Latest applications and interviews"
          />
          <div className="p-4">
            {[...recentApplications, ...interviews].slice(0, 6).length > 0 ? (
              <div className="space-y-3">
                {[...recentApplications, ...interviews].slice(0, 6).map((item, index) => {
                  const isInterview = item.scheduled_at || item.schedule_at;
                  const isApplication = item.full_name || item.fullName;
                  
                  return (
                    <div 
                      key={item.id || item._id || index} 
                      className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-indigo-200 dark:border-gray-700 dark:hover:border-indigo-700"
                    >
                      <div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isInterview 
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {isInterview ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {item.full_name || item.fullName || item.round || item.title || "Recruitment activity"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {fmtDateTime(item.created_at || item.createdAt || item.scheduled_at || item.schedule_at)}
                        </p>
                        {isInterview && (
                          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            Interview
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No recent activity</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Applications and interviews will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* RECENT JOBS - Grid with Cards */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Briefcase}
          title="Recent Jobs"
          description="Latest job openings and their status"
          action={
            <Link 
              to="/hr/recruitment/jobs" 
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              View All Jobs
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <div className="p-4">
          {recentJobs.slice(0, 4).length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentJobs.slice(0, 4).map((job) => (
                <Link 
                  key={job.id || job._id} 
                  to={`/hr/recruitment/jobs/${job.id || job._id}`}
                  className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
                          <Briefcase className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                          {job.title}
                        </h3>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Building2 className="h-3 w-3" />
                        <span>{job.department || 'General'}</span>
                        <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                        <span>{job.location || "Location not set"}</span>
                      </div>
                    </div>
                    <StatusBadge status={job.lifecycle_status || job.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 dark:border-gray-700">
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Users className="h-3 w-3" />
                      <span>{job.applicant_count || 0} applicants</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>{job.posted_at ? fmtDateTime(job.posted_at) : 'Recent'}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No jobs created yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Create your first job posting to get started.</p>
              <Link
                to="/hr/recruitment/jobs"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Create Job
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
