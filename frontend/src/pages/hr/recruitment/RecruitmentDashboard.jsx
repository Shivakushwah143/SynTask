import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { Briefcase, CalendarClock, FileBarChart2, Inbox, Plus, Send, TrendingUp, UserRoundSearch } from "lucide-react";

import { recruitmentApi } from "../../../api/recruitment";
import { Badge, Button, EmptyState, SkeletonCard } from "../../../components/ui";
import { RecruitmentStatCard } from "../../../modules/hr/recruitment/components/RecruitmentStatCard";
import { StatusBadge } from "../../../modules/hr/recruitment/components/StatusBadge";
import { fmtDateTime, toArray } from "../../../modules/hr/recruitment/utils/data";

const metrics = [
  { key: "open_jobs", alt: "openJobs", label: "Open Jobs", icon: Briefcase },
  { key: "active_applications", alt: "activeApplications", label: "Active Applications", icon: UserRoundSearch },
  { key: "interviews_scheduled", alt: "interviewsScheduled", label: "Today's Interviews", icon: CalendarClock },
  { key: "offers_pending", alt: "offersPending", label: "Pending Offers", icon: FileBarChart2 },
];

const quickActions = [
  { label: "Create Job", href: "/hr/recruitment/jobs", icon: Plus },
  { label: "Import Resume", href: "/hr/recruitment/inbox", icon: Inbox },
  { label: "Schedule Interview", href: "/hr/recruitment/interviews", icon: CalendarClock },
];

export default function RecruitmentDashboard() {
  const dashboardQuery = useQuery(["recruitment", "dashboard"], () => recruitmentApi.getDashboard(), { retry: 1 });
  const jobDashboardQuery = useQuery(["recruitment", "jobs", "dashboard"], () => recruitmentApi.getJobDashboard(), { retry: 1 });
  const candidateQuery = useQuery(["recruitment", "dashboard", "recentCandidates"], () => recruitmentApi.getCandidates({ page: 1, page_size: 5 }), { retry: 1 });
  const interviewQuery = useQuery(["recruitment", "dashboard", "recentInterviews"], () => recruitmentApi.getInterviews({ page: 1, page_size: 5 }), { retry: 1 });

  const dashboard = dashboardQuery.data || {};
  const recentJobs = toArray(jobDashboardQuery.data?.recent_jobs || jobDashboardQuery.data?.recentJobs);
  const recentApplications = toArray(candidateQuery.data);
  const interviews = toArray(interviewQuery.data);
  const funnel = dashboard.funnel || {};

  const isLoading = dashboardQuery.isLoading || jobDashboardQuery.isLoading;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <section className="mb-6 overflow-hidden rounded-[2rem] border border-surface-border bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_34%),linear-gradient(135deg,#111827,#1c1917)] p-6 text-white shadow-card dark:border-gray-800">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge label="HR / Recruitment" colorKey="new" className="mb-4 bg-white/15 text-white" />
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Recruitment command center</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
              Monitor hiring pipeline, act on urgent work, and move candidates without leaving HR.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Link key={action.href} to={action.href}>
                <Button type="button" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                  <action.icon className="h-4 w-4" /> {action.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((card) => <SkeletonCard key={card.key} />)}
        </div>
      ) : dashboardQuery.isError ? (
        <EmptyState title="Recruitment dashboard unavailable" description="Metrics could not be loaded. Check backend and permissions." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((card) => (
            <RecruitmentStatCard key={card.key} label={card.label} value={dashboard[card.key] ?? dashboard[card.alt] ?? 0} icon={card.icon} />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Hiring funnel preview</h2>
              <p className="text-sm text-text-muted">Live stage counts from recruitment reports.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-primary-600" />
          </div>
          {Object.keys(funnel).length ? (
            <div className="space-y-3">
              {Object.entries(funnel).slice(0, 7).map(([stage, count]) => {
                const max = Math.max(...Object.values(funnel).map((value) => Number(value) || 0), 1);
                return (
                  <div key={stage}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-text-primary">{stage.replace(/_/g, " ")}</span>
                      <span className="text-text-muted">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-muted">
                      <div className="h-2 rounded-full bg-primary-500" style={{ width: `${Math.max(6, (Number(count) / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No funnel activity yet" description="Candidate movement will appear here." />
          )}
        </section>

        <section className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
          <h2 className="text-lg font-semibold text-text-primary">Recent activity</h2>
          <div className="mt-4 space-y-3">
            {[...recentApplications, ...interviews].slice(0, 6).map((item, index) => (
              <div key={item.id || item._id || index} className="flex gap-3 rounded-2xl border border-surface-border p-3 dark:border-gray-800">
                <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
                  {item.scheduled_at || item.schedule_at ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{item.full_name || item.fullName || item.round || item.title || "Recruitment activity"}</p>
                  <p className="text-xs text-text-muted">{fmtDateTime(item.created_at || item.createdAt || item.scheduled_at || item.schedule_at)}</p>
                </div>
              </div>
            ))}
            {!recentApplications.length && !interviews.length ? <p className="text-sm text-text-muted">No recent applications or interviews.</p> : null}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {recentJobs.slice(0, 4).map((job) => (
          <Link key={job.id || job._id} to="/hr/recruitment/jobs" className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary-300 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-text-primary">{job.title}</h3>
              <StatusBadge status={job.lifecycle_status || job.status} />
            </div>
            <p className="text-sm text-text-muted">{job.location || "Location not set"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
