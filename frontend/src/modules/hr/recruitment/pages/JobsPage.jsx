import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { Copy, Eye, Pause, Plus, Send, Trash2 } from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, PageHeader } from "../../../../components/ui";
import { JOB_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from "../constants";
import { JobDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { StatusBadge } from "../components/StatusBadge";
import { compactParams, fmtDate, idOf, labelize, toArray } from "../utils/data";

export default function JobsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [dialogJob, setDialogJob] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerJob, setDrawerJob] = useState(null);
  const params = compactParams({ page, page_size: 20, search, ...filters });
  const query = useQuery(["recruitment", "jobs", params], () => recruitmentApi.getJobs(params), { keepPreviousData: true });
  const jobs = toArray(query.data);
  const invalidate = () => qc.invalidateQueries(["recruitment", "jobs"]);
  const saveMutation = useMutation((payload) => dialogJob ? recruitmentApi.updateJob(idOf(dialogJob), payload) : recruitmentApi.createJob(payload), {
    onSuccess: () => { toast.success("Job saved"); setDialogOpen(false); setDialogJob(null); invalidate(); },
  });
  const actionMutation = useMutation(({ action, id }) => recruitmentApi[action](id), {
    onSuccess: () => { toast.success("Job updated"); invalidate(); },
  });
  const columns = useMemo(() => [
    { key: "title", header: "Job", render: (job) => <button type="button" className="font-semibold text-primary-700 hover:underline dark:text-primary-300" onClick={() => setDrawerJob(job)}>{job.title}</button> },
    { key: "status", header: "Status", render: (job) => <StatusBadge status={job.lifecycle_status || job.status} /> },
    { key: "location", header: "Location", render: (job) => job.location || "—" },
    { key: "employment_type", header: "Type", render: (job) => labelize(job.employment_type) },
    { key: "created_at", header: "Created", render: (job) => fmtDate(job.created_at || job.createdAt) },
    { key: "actions", header: "Actions", render: (job) => (
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setDrawerJob(job)}><Eye className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setDialogJob(job); setDialogOpen(true); }}>Edit</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: idOf(job), action: "publishJob" })}><Send className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: idOf(job), action: "pauseJob" })}><Pause className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: idOf(job), action: "duplicateJob" })}><Copy className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: idOf(job), action: "archiveJob" })}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) },
  ], [actionMutation]);
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Jobs" description="Create, publish, pause, archive and duplicate recruitment jobs." actions={<Button onClick={() => { setDialogJob(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Create Job</Button>} />
      <RecruitmentFilters search={search} onSearch={(v) => { setSearch(v); setPage(1); }} values={filters} onChange={(k, v) => { setFilters((c) => ({ ...c, [k]: v })); setPage(1); }} onReset={() => { setSearch(""); setFilters({}); setPage(1); }} filters={[
        { key: "lifecycle_status", label: "Status", options: JOB_STATUSES },
        { key: "employment_type", label: "Employment", options: EMPLOYMENT_TYPES },
        { key: "work_mode", label: "Work mode", options: WORK_MODES },
      ]} />
      <RecruitmentTable query={query} columns={columns} data={jobs} emptyTitle="No jobs found" emptyDescription="Create the first recruitment job to start hiring." page={page} pageSize={20} onPageChange={setPage} />
      <JobDialog open={dialogOpen} job={dialogJob} onClose={() => setDialogOpen(false)} onSubmit={(payload) => saveMutation.mutate(payload)} loading={saveMutation.isLoading} />
      <RecruitmentDrawer open={!!drawerJob} title={drawerJob?.title} description="Job details" onClose={() => setDrawerJob(null)}>
        {drawerJob ? <div className="space-y-4 text-sm">
          <StatusBadge status={drawerJob.lifecycle_status || drawerJob.status} />
          <p className="text-text-muted">{drawerJob.description || "No description"}</p>
          <div className="grid gap-3 md:grid-cols-2">{["location", "employment_type", "work_mode", "experience_min", "experience_max", "salary_min", "salary_max"].map((key) => <div key={key} className="rounded-2xl bg-surface-muted p-3"><p className="text-xs text-text-muted">{labelize(key)}</p><p className="font-medium text-text-primary">{labelize(drawerJob[key])}</p></div>)}</div>
        </div> : null}
      </RecruitmentDrawer>
    </div>
  );
}

