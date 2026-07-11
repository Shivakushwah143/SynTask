import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { Briefcase, CalendarClock, FileBarChart2, UserRoundSearch } from "lucide-react";

import { recruitmentApi } from "../../../api/recruitment";
import { Badge, EmptyState, PageHeader, SkeletonCard } from "../../../components/ui";

const metricCards = [
  { key: "openJobs", label: "Open Jobs", icon: Briefcase },
  { key: "activeApplications", label: "Active Applications", icon: UserRoundSearch },
  { key: "interviewsScheduled", label: "Interviews Scheduled", icon: CalendarClock },
  { key: "offersPending", label: "Offers Pending", icon: FileBarChart2 },
];

const quickLinks = [
  { label: "Jobs", href: "/hr/recruitment/jobs", description: "Create, publish and manage job openings." },
  { label: "Candidates", href: "/hr/recruitment/candidates", description: "Review candidate profiles and applications." },
  { label: "Interviews", href: "/hr/recruitment/interviews", description: "Schedule panels and track decisions." },
  { label: "Reports", href: "/hr/recruitment/reports", description: "Track funnel, source and hiring metrics." },
];

export default function RecruitmentDashboard() {
  const dashboardQuery = useQuery(["recruitment", "dashboard"], () => recruitmentApi.getDashboard(), {
    retry: 1,
  });

  const dashboard = dashboardQuery.data || {};

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Recruitment"
        description="Hiring command center inside the HR department."
        actions={<Badge label="HR / Recruitment" colorKey="new" />}
      />

      {dashboardQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => <SkeletonCard key={card.key} />)}
        </div>
      ) : dashboardQuery.isError ? (
        <EmptyState
          title="Recruitment dashboard unavailable"
          description="The HR route is ready, but dashboard metrics could not be loaded from the backend."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <div key={card.key} className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text-muted">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-text-primary">{dashboard[card.key] ?? 0}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Recruitment Modules</h2>
            <p className="text-sm text-text-muted">Department → Module routing is active under /hr/recruitment.</p>
          </div>
          <Badge label="HR Module" colorKey="new" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="rounded-2xl border border-surface-border bg-surface-muted/40 p-4 transition hover:border-primary-300 hover:bg-primary-50/60 dark:border-gray-800 dark:bg-gray-900/50 dark:hover:bg-primary-950/30"
            >
              <p className="font-semibold text-text-primary">{link.label}</p>
              <p className="mt-1 text-sm text-text-muted">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
