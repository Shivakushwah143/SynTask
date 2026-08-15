import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { 
  Archive, 
  Copy, 
  Eye, 
  Plus, 
  Send,
  Briefcase,
  Users,
  Calendar,
  Building2,
  MapPin,
  Clock,
  Filter,
  Search,
  AlertCircle,
  RefreshCw,
  ArrowUpDown,
  FileText,
  CheckCircle,
  XCircle,
  Clock as ClockIcon
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { departmentsAPI } from "../../../../api/departments";
import { Button, PageHeader } from "../../../../components/ui";
import { JOB_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from "../constants";
import { JobDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmActionDialog } from "../dialogs/RecruitmentDialogs";
import { compactParams, fmtDate, idOf, labelize, toArray } from "../utils/data";

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
export default function JobsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [dialogJob, setDialogJob] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerJob, setDrawerJob] = useState(null);
  const [archiveJob, setArchiveJob] = useState(null);
  const [selectedRankings, setSelectedRankings] = useState([]);
  
  const params = compactParams({ page, page_size: 20, search, ...filters });
  const query = useQuery(["recruitment", "jobs", params], () => recruitmentApi.getJobs(params), { keepPreviousData: true });
  const departmentsQuery = useQuery(["recruitment", "departments"], () => departmentsAPI.listDepartments(), { retry: 1 });
  const rankingsQuery = useQuery(
    ["recruitment", "rankings", idOf(drawerJob)],
    () => recruitmentApi.getCandidateRankings(idOf(drawerJob)),
    { enabled: !!drawerJob }
  );
  
  const jobs = toArray(query.data);
  const departments = Array.isArray(departmentsQuery.data) ? departmentsQuery.data : departmentsQuery.data?.departments || [];
  const isLoading = query.isLoading || departmentsQuery.isLoading;
  const isError = query.isError || departmentsQuery.isError;
  
  const invalidate = () => qc.invalidateQueries(["recruitment", "jobs"]);
  
  const saveMutation = useMutation(
    (payload) => dialogJob 
      ? recruitmentApi.updateJob(idOf(dialogJob), payload) 
      : recruitmentApi.createJob(payload),
    {
      onSuccess: () => { 
        toast.success(dialogJob ? "Job updated successfully! 🎉" : "Job created successfully! 🎉"); 
        setDialogOpen(false); 
        setDialogJob(null); 
        invalidate(); 
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to save job");
      }
    }
  );
  
  const actionMutation = useMutation(
    ({ action, id }) => {
      if (action === 'rejectJob') return recruitmentApi.rejectJob(id, {});
      return recruitmentApi[action](id);
    },
    {
      onSuccess: (_, variables) => {
        const messages = {
          archiveJob: "Job archived successfully!",
          publishJob: "Job published successfully!",
          pauseJob: "Job paused successfully!",
          closeJob: "Job closed successfully!",
          restoreJob: "Job restored successfully!",
          duplicateJob: "Job duplicated successfully!",
          submitJobForApproval: "Job submitted for approval!",
          approveJob: "Job approved successfully!",
          rejectJob: "Job rejected and returned to draft.",
        };
        toast.success(messages[variables.action] || "Job updated");
        setArchiveJob(null);
        invalidate();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Action failed");
      }
    }
  );
  const extractRequirementsMutation = useMutation((id) => recruitmentApi.extractJobRequirements(id), {
    onSuccess: () => toast.success("Requirements extracted"),
    onError: (error) => toast.error(error?.response?.data?.detail || "Failed to extract requirements"),
  });
  const scoreCandidatesMutation = useMutation((id) => recruitmentApi.scoreCandidates(id), {
    onSuccess: () => {
      toast.success("Candidates scored");
      rankingsQuery.refetch();
    },
    onError: (error) => toast.error(error?.response?.data?.detail || "Failed to score candidates"),
  });
  const shortlistMutation = useMutation((candidateIds) => recruitmentApi.shortlistCandidates(idOf(drawerJob), { candidate_ids: candidateIds, reason: "Reviewed ranking and shortlisted by HR" }), {
    onSuccess: () => {
      toast.success("Candidates shortlisted");
      setSelectedRankings([]);
      rankingsQuery.refetch();
    },
    onError: (error) => toast.error(error?.response?.data?.detail || "Failed to shortlist candidates"),
  });
  
  const confirmArchiveJob = () => {
    if (!archiveJob) return;
    actionMutation.mutate({ id: idOf(archiveJob), action: "archiveJob" });
  };

  // Calculate stats
  const stats = useMemo(() => {
    const total = jobs.length;
    const active = jobs.filter(job => 
      job.lifecycle_status === 'active' || job.status === 'active'
    ).length;
    const draft = jobs.filter(job => 
      job.lifecycle_status === 'draft' || job.status === 'draft'
    ).length;
    const closed = jobs.filter(job => 
      job.lifecycle_status === 'closed' || job.status === 'closed'
    ).length;
    return { total, active, draft, closed };
  }, [jobs]);

  const columns = useMemo(() => [
    { 
      key: "title", 
      header: "Job", 
      render: (job) => (
        <button 
          type="button" 
          className="font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300" 
          onClick={() => setDrawerJob(job)}
        >
          {job.title}
        </button>
      ) 
    },
    { 
      key: "status", 
      header: "Status", 
      render: (job) => <StatusBadge status={job.lifecycle_status || job.status} /> 
    },
    { 
      key: "location", 
      header: "Location", 
      render: (job) => (
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <MapPin className="h-3.5 w-3.5" />
          <span>{job.location || "—"}</span>
        </div>
      ) 
    },
    { 
      key: "employment_type", 
      header: "Type", 
      render: (job) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {labelize(job.employment_type)}
        </span>
      ) 
    },
    { 
      key: "created_at", 
      header: "Created", 
      render: (job) => (
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Calendar className="h-3.5 w-3.5" />
          <span>{fmtDate(job.created_at || job.createdAt)}</span>
        </div>
      ) 
    },
    { 
      key: "actions", 
      header: "Actions", 
      render: (job) => {
        const status = job.lifecycle_status || job.status;
        return (
        <div className="flex gap-1">
          <Button 
            type="button" 
            size="sm" 
            variant="ghost" 
            className="text-gray-500 transition hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
            onClick={() => setDrawerJob(job)}
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">View</span>
          </Button>
          {(status === "draft" || status === "rejected") && (
            <>
              <Button 
                type="button" 
                size="sm" 
                variant="ghost" 
                className="text-gray-500 transition hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
                onClick={() => { setDialogJob(job); setDialogOpen(true); }}
              >
                <FileText className="h-4 w-4" />
                <span className="sr-only">Edit</span>
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant="ghost" 
                className="text-gray-500 transition hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400"
                onClick={() => actionMutation.mutate({ id: idOf(job), action: "submitJobForApproval" })}
                title="Submit for approval"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Submit</span>
              </Button>
            </>
          )}
          {status === "pending_approval" && (
            <>
              <Button 
                type="button" 
                size="sm" 
                variant="ghost" 
                className="text-gray-500 transition hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400"
                onClick={() => actionMutation.mutate({ id: idOf(job), action: "approveJob" })}
                title="Approve job"
              >
                <CheckCircle className="h-4 w-4" />
                <span className="sr-only">Approve</span>
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant="ghost" 
                className="text-gray-500 transition hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
                onClick={() => actionMutation.mutate({ id: idOf(job), action: "rejectJob" })}
                title="Reject job"
              >
                <XCircle className="h-4 w-4" />
                <span className="sr-only">Reject</span>
              </Button>
            </>
          )}
          {status === "approved" && (
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              className="text-gray-500 transition hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400"
              onClick={() => actionMutation.mutate({ id: idOf(job), action: "publishJob" })}
              title="Publish job"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Publish</span>
            </Button>
          )}
          {status === "published" && (
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              className="text-gray-500 transition hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400"
              onClick={() => actionMutation.mutate({ id: idOf(job), action: "pauseJob" })}
              title="Pause job"
            >
              <ClockIcon className="h-4 w-4" />
              <span className="sr-only">Pause</span>
            </Button>
          )}
          {status === "paused" && (
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              className="text-gray-500 transition hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400"
              onClick={() => actionMutation.mutate({ id: idOf(job), action: "publishJob" })}
              title="Resume job"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Resume</span>
            </Button>
          )}
          {(status === "published" || status === "paused") && (
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              className="text-gray-500 transition hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
              onClick={() => actionMutation.mutate({ id: idOf(job), action: "closeJob" })}
              title="Close job"
            >
              <XCircle className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          )}
          <Button 
            type="button" 
            size="sm" 
            variant="ghost" 
            className="text-gray-500 transition hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
            onClick={() => actionMutation.mutate({ id: idOf(job), action: "duplicateJob" })}
          >
            <Copy className="h-4 w-4" />
            <span className="sr-only">Duplicate</span>
          </Button>
          {status !== "archived" ? (
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              className="text-gray-500 transition hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
              disabled={actionMutation.isLoading} 
              onClick={() => setArchiveJob(job)} 
              title="Archive job" 
              aria-label={`Archive ${job.title || "job"}`}
            >
              <Archive className="h-4 w-4" />
              <span className="sr-only">Archive</span>
            </Button>
          ) : (
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              className="text-gray-500 transition hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400"
              onClick={() => actionMutation.mutate({ id: idOf(job), action: "restoreJob" })}
              title="Restore job"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Restore</span>
            </Button>
          )}
        </div>
        );
      } 
    },
  ], [actionMutation]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Briefcase className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Jobs</h1>
                <p className="mt-1 text-indigo-100">
                  Create, publish, archive and duplicate recruitment jobs.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => { setDialogJob(null); setDialogOpen(true); }}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Plus className="h-4 w-4" />
                Create Job
              </button>
              <button 
                onClick={() => query.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Jobs" 
          value={stats.total} 
          icon={Briefcase} 
          color="indigo"
          subtitle="All jobs in system"
        />
        <StatCard 
          label="Active Jobs" 
          value={stats.active} 
          icon={CheckCircle} 
          color="emerald"
          subtitle="Currently hiring"
        />
        <StatCard 
          label="Draft Jobs" 
          value={stats.draft} 
          icon={FileText} 
          color="amber"
          subtitle="In preparation"
        />
        <StatCard 
          label="Closed Jobs" 
          value={stats.closed} 
          icon={XCircle} 
          color="rose"
          subtitle="Filled positions"
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters & Search"
          description="Narrow down jobs by status, type, or keyword"
          action={
            <button
              onClick={() => { setSearch(""); setFilters({}); setPage(1); }}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          }
        />
        <div className="p-4">
          <RecruitmentFilters 
            search={search} 
            onSearch={(v) => { setSearch(v); setPage(1); }} 
            values={filters} 
            onChange={(k, v) => { setFilters((c) => ({ ...c, [k]: v })); setPage(1); }} 
            onReset={() => { setSearch(""); setFilters({}); setPage(1); }} 
            filters={[
              { key: "lifecycle_status", label: "Status", options: JOB_STATUSES },
              { key: "employment_type", label: "Employment", options: EMPLOYMENT_TYPES },
              { key: "work_mode", label: "Work mode", options: WORK_MODES },
            ]} 
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* JOBS TABLE */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Briefcase}
          title="All Jobs"
          description={`${jobs.length} job${jobs.length !== 1 ? 's' : ''} found`}
        />
        <div className="p-4">
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading jobs...</p>
              </div>
            </div>
          ) : isError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {query.error?.response?.data?.detail || "Could not load jobs"}
              </p>
              <button
                onClick={() => query.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : (
            <RecruitmentTable 
              query={query} 
              columns={columns} 
              data={jobs} 
              emptyTitle="No jobs found" 
              emptyDescription="Create the first recruitment job to start hiring." 
              page={page} 
              pageSize={20} 
              onPageChange={setPage} 
            />
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* JOB DIALOG - Create/Edit */}
      {/* ============================================================ */}
      <JobDialog
        open={dialogOpen}
        job={dialogJob}
        onClose={() => setDialogOpen(false)}
        onSubmit={(payload) => saveMutation.mutate(payload)}
        loading={saveMutation.isLoading}
        departments={departments}
      />

      {/* ============================================================ */}
      {/* CONFIRM ARCHIVE DIALOG */}
      {/* ============================================================ */}
      <ConfirmActionDialog
        open={!!archiveJob}
        title="Archive job?"
        description={archiveJob?.title ? `Archive "${archiveJob.title}"? It will be removed from active hiring lists and can be restored later.` : "Archive this job? It will be removed from active hiring lists and can be restored later."}
        confirmLabel="Archive job"
        onClose={() => setArchiveJob(null)}
        onConfirm={confirmArchiveJob}
        loading={actionMutation.isLoading}
      />

      {/* ============================================================ */}
      {/* JOB DRAWER - Details */}
      {/* ============================================================ */}
      <RecruitmentDrawer 
        open={!!drawerJob} 
        title={drawerJob?.title} 
        description="Job details" 
        onClose={() => setDrawerJob(null)}
      >
        {drawerJob ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={drawerJob.lifecycle_status || drawerJob.status} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Created {fmtDate(drawerJob.created_at || drawerJob.createdAt)}
              </span>
            </div>
            
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Description</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {drawerJob.description || "No description provided"}
              </p>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Details</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { key: "location", label: "Location", icon: MapPin },
                  { key: "employment_type", label: "Employment Type", icon: Briefcase },
                  { key: "work_mode", label: "Work Mode", icon: ClockIcon },
                  { key: "experience_min", label: "Min Experience", icon: Clock },
                  { key: "experience_max", label: "Max Experience", icon: Clock },
                  { key: "salary_min", label: "Min Salary", icon: Users },
                  { key: "salary_max", label: "Max Salary", icon: Users },
                  { key: "department", label: "Department", icon: Building2 },
                ].map(({ key, label, icon: Icon }) => (
                  <div 
                    key={key} 
                    className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    </div>
                    <p className="mt-1 font-medium text-gray-900 dark:text-white">
                      {drawerJob[key] ? labelize(drawerJob[key]) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {drawerJob.requirements && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Requirements</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {drawerJob.requirements}
                </p>
              </div>
            )}

            {drawerJob.benefits && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Benefits</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {drawerJob.benefits}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Candidate Ranking</h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">AI ranking is decision support only. Human review is required.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => extractRequirementsMutation.mutate(idOf(drawerJob))} disabled={extractRequirementsMutation.isLoading}>
                    <FileText className="h-4 w-4" /> Extract
                  </Button>
                  <Button size="sm" onClick={() => scoreCandidatesMutation.mutate(idOf(drawerJob))} disabled={scoreCandidatesMutation.isLoading}>
                    <ArrowUpDown className="h-4 w-4" /> Score
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => shortlistMutation.mutate(selectedRankings)} disabled={!selectedRankings.length || shortlistMutation.isLoading}>
                    <CheckCircle className="h-4 w-4" /> Shortlist
                  </Button>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2 pr-3"></th>
                      <th className="py-2 pr-3">Candidate</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Required</th>
                      <th className="py-2 pr-3">Experience</th>
                      <th className="py-2 pr-3">Recommendation</th>
                      <th className="py-2 pr-3">Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rankingsQuery.data?.items || []).map((row) => {
                      const candidateId = idOf(row.candidate) || row.score?.candidate_id;
                      const score = row.score?.score || {};
                      return (
                        <tr key={candidateId} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-3">
                            <input type="checkbox" checked={selectedRankings.includes(candidateId)} onChange={(e) => setSelectedRankings((current) => e.target.checked ? [...current, candidateId] : current.filter((id) => id !== candidateId))} />
                          </td>
                          <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">{row.candidate?.full_name || candidateId}</td>
                          <td className="py-2 pr-3">{score.overall_score ?? "-"}</td>
                          <td className="py-2 pr-3">{score.required_skills_score ?? "-"}</td>
                          <td className="py-2 pr-3">{score.experience_score ?? "-"}</td>
                          <td className="py-2 pr-3">{labelize(score.recommendation || "not scored")}</td>
                          <td className="py-2 pr-3 text-xs text-rose-600">{(score.missing_required_skills || []).join(", ") || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!rankingsQuery.data?.items?.length ? (
                  <p className="py-6 text-center text-sm text-gray-500">No ranking results yet. Extract requirements, then score candidates.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">No job selected</p>
          </div>
        )}
      </RecruitmentDrawer>
    </div>
  );
}
