import { useState } from "react";
import { useQuery } from "react-query";
import { Briefcase, CalendarClock, CheckCircle2, FileBarChart2, UserRoundSearch } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { recruitmentApi } from "../../../../api/recruitment";
import { PageHeader, inputClassName } from "../../../../components/ui";
import { RecruitmentStatCard } from "../components/RecruitmentStatCard";
import { ErrorState, LoadingState } from "../components/States";
import { toArray } from "../utils/data";

export default function ReportsPage() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const overview = useQuery(["recruitment", "reports", params], () => recruitmentApi.getReportsOverview(params));
  const funnel = overview.data?.funnel || {};
  const dashboard = overview.data?.dashboard || {};
  const trends = toArray(overview.data?.trends);
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Recruitment Reports" description="Hiring funnel, analytics, trends and KPI cards." />
      <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-surface-border bg-surface p-4 dark:border-gray-800 dark:bg-gray-950 md:flex-row">
        <input className={inputClassName} type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        <input className={inputClassName} type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
      </div>
      {overview.isLoading ? <LoadingState type="cards" /> : overview.isError ? <ErrorState onRetry={() => overview.refetch()} /> : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <RecruitmentStatCard label="Open Jobs" value={dashboard.open_jobs ?? dashboard.openJobs} icon={Briefcase} />
            <RecruitmentStatCard label="Active Applications" value={dashboard.active_applications ?? dashboard.activeApplications} icon={UserRoundSearch} />
            <RecruitmentStatCard label="Interviews" value={dashboard.interviews_scheduled ?? dashboard.interviewsScheduled} icon={CalendarClock} />
            <RecruitmentStatCard label="Offers Pending" value={dashboard.offers_pending ?? dashboard.offersPending} icon={FileBarChart2} />
            <RecruitmentStatCard label="Joined" value={dashboard.joined_candidates ?? dashboard.joinedCandidates} icon={CheckCircle2} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
              <h2 className="mb-4 font-semibold text-text-primary">Hiring Funnel</h2>
              <ResponsiveContainer width="100%" height={280}><BarChart data={Object.entries(funnel).map(([name, value]) => ({ name, value }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#f97316" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
            <div className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
              <h2 className="mb-4 font-semibold text-text-primary">Monthly Trend</h2>
              <ResponsiveContainer width="100%" height={280}><BarChart data={trends}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

