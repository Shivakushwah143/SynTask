import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Archive,
  Briefcase,
  Calendar,
  CheckCircle,
  Copy,
  Eye,
  FileText,
  Filter,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  Clock,
  XCircle,
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { departmentsAPI } from "../../../../api/departments";
import { Button } from "../../../../components/ui";
import { JOB_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from "../constants";
import { JobDialog, ConfirmActionDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { JobStatusDropdown } from "../components/JobStatusDropdown";
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
    <div className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
          <p className="truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
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
  const [archiveJob, setArchiveJob] = useState(null);
  const [updatingStatusJobId, setUpdatingStatusJobId] = useState(null);
  
  const params = compactParams({ page, page_size: 20, search, ...filters });
  const query = useQuery(["recruitment", "jobs", params], () => recruitmentApi.getJobs(params), { keepPreviousData: true });
  const departmentsQuery = useQuery(["recruitment", "departments"], () => departmentsAPI.listDepartments(), { retry: 1 });
  const careerPageQuery = useQuery(["recruitment", "career-page"], () => recruitmentApi.getCareerPage(), { retry: 1 });
  
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
  const statusMutation = useMutation(
    ({ id, status }) => recruitmentApi.setJobStatus(id, status),
    {
      onMutate: ({ id }) => {
        setUpdatingStatusJobId(id);
      },
      onSuccess: () => {
        toast.success("Job status updated successfully! 🎉");
        invalidate();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to update job status");
      },
      onSettled: () => {
        setUpdatingStatusJobId(null);
      },
    }
  );
  
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
        <Link
          to={`/hr/recruitment/jobs/${idOf(job)}`}
          className="font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {job.title}
        </Link>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (job) => (
        <JobStatusDropdown
          job={job}
          onChange={(status) => statusMutation.mutate({ id: idOf(job), status })}
          loading={updatingStatusJobId === idOf(job)}
        />
      )
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
          <Link
            to={`/hr/recruitment/jobs/${idOf(job)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-surface-muted hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
            title="View job details"
            aria-label={`View ${job.title || "job"}`}
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">View</span>
          </Link>
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
              <Clock className="h-4 w-4" />
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
  ], [actionMutation, statusMutation, updatingStatusJobId]);

  return (
    <div className="space-y-4 p-4 md:p-5">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-4 py-3 text-white shadow-sm">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold md:text-xl">Jobs</h1>
                <p className="truncate text-xs text-indigo-100">Create, publish, archive and duplicate jobs.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                to={careerPageQuery.data?.path || "/careers"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
              >
                <Eye className="h-4 w-4" />
                View Career Page
              </Link>
              <button 
                onClick={() => { setDialogJob(null); setDialogOpen(true); }}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
              >
                <Plus className="h-4 w-4" />
                Create Job
              </button>
              <button 
                onClick={() => query.refetch()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
        <div className="p-3">
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
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Briefcase}
          title="All Jobs"
          description={`${jobs.length} job${jobs.length !== 1 ? 's' : ''} found`}
        />
        <div className="p-3">
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading jobs...</p>
              </div>
            </div>
          ) : isError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <XCircle className="h-12 w-12 text-rose-500" />
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
    </div>
  );
}
