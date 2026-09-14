import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, EmptyState, FormField, Modal, inputClassName } from "../../../../components/ui";

const stages = [
  ["", "All"], ["new", "New"], ["screening", "Screening"], ["shortlisted", "Shortlisted"],
  ["interview_1", "Interview 1"], ["interview_2", "Interview 2"], ["offer_sent", "Offer Sent"],
  ["offer_accepted", "Offer Accepted"], ["joined", "Joined"], ["rejected", "Rejected"],
  ["withdrawn", "Withdrawn"], ["archived", "Archived"], ["converted", "Converted"],
];

const stageColors = {
  new: "#7C6FE0", screening: "#6366F1", shortlisted: "#0EA5E9",
  interview_1: "#F59E0B", interview_2: "#F97316", offer_sent: "#10B981",
  offer_accepted: "#059669", joined: "#2FB47C", rejected: "#EF4444",
  withdrawn: "#F97316", archived: "#9CA3AF", converted: "#16A34A",
};

function ApplicationLifecyclePipeline({ current, counts, total, onSelect }) {
  const activeStages = stages.slice(1, 9);
  const outcomes = stages.slice(9);
  const chip = ([value, label]) => {
    const active = current === value;
    const plain = !value;
    const color = stageColors[value] || "#6366F1";
    const count = value ? counts[value] || 0 : total || 0;
    return <button key={value || "all"} type="button" role="tab" aria-selected={active} onClick={() => onSelect(value)} title={`Show ${label} applications`} className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${active ? "border-transparent text-white shadow-sm" : plain ? "border-transparent text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800" : "border-gray-200/70 bg-white/70 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm dark:border-gray-600/50 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800"}`} style={active ? { backgroundColor: color } : undefined}>
      {!plain && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: active ? "rgba(255,255,255,.9)" : color }} />}
      <span>{label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? "bg-white/25 text-white" : "bg-gray-200/90 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>{count}</span>
    </button>;
  };
  return <div role="tablist" aria-label="Candidate application lifecycle stages" className="flex items-center overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {chip(stages[0])}<span className="mx-1.5 w-px shrink-0 self-stretch bg-gray-300/80 dark:bg-gray-600/70" aria-hidden="true" />
    {activeStages.map((entry, index) => <div key={entry[0]} className="flex shrink-0 items-center">{index > 0 && <span className="mx-1 text-gray-300 dark:text-gray-600" aria-hidden="true"><ArrowRight className="h-3.5 w-3.5" /></span>}{chip(entry)}</div>)}
    <span className="mx-1.5 w-px shrink-0 self-stretch bg-gray-300/80 dark:bg-gray-600/70" aria-hidden="true" />{outcomes.map(chip)}
  </div>;
}

function AddCandidateDialog({ open, onClose, jobs, jobId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "manual", currentCompany: "", experience: "0", skills: "", job_id: jobId || "" });
  const [resume, setResume] = useState(null);
  const submit = useMutation(async () => {
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => { if (key !== "job_id") data.append(key, value); });
    const candidate = (await recruitmentApi.createCandidate(data)).data;
    let resumeId = candidate.resume_id;
    if (resume) resumeId = (await recruitmentApi.uploadCandidateResume(candidate.id, resume)).data?.id;
    return recruitmentApi.createApplication({ candidate_id: candidate.id, job_id: form.job_id, source: form.source, current_resume_id: resumeId || undefined });
  }, {
    onSuccess: () => { toast.success("Candidate application created"); qc.invalidateQueries(["recruitment", "applications"]); qc.invalidateQueries(["recruitment", "applicationSummary"]); onClose(); },
    onError: (error) => toast.error(error?.response?.data?.detail?.message || error?.response?.data?.detail || "Could not create candidate application"),
  });
  return <Modal isOpen={open} onClose={onClose} title="Add Candidate" size="lg">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Full name"><input required className={inputClassName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Email"><input required type="email" className={inputClassName} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClassName} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="Source"><input className={inputClassName} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></FormField>
        <FormField label="Current company"><input className={inputClassName} value={form.currentCompany} onChange={(e) => setForm({ ...form, currentCompany: e.target.value })} /></FormField>
        <FormField label="Experience (years)"><input type="number" min="0" className={inputClassName} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></FormField>
      </div>
      <FormField label="Skills"><input className={inputClassName} placeholder="React, Python, …" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></FormField>
      <FormField label="Job"><select required disabled={Boolean(jobId)} className={inputClassName} value={jobId || form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}><option value="">Select a job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select>{jobId && <p className="mt-1 text-xs text-gray-500">Candidate will be added to this Job Pipeline.</p>}</FormField>
      <FormField label="Resume"><input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)} /></FormField>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={submit.isLoading}>Create application</Button></div>
    </form>
  </Modal>;
}

export function ApplicationLifecycleWorkspace({ jobId } = {}) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  const [addOpen, setAddOpen] = useState(false);
  const stage = params.get("stage") || "";
  const queryParams = useMemo(() => ({ stage: stage || undefined, job_id: jobId, search: search || undefined, page_size: 50 }), [stage, jobId, search]);
  const applications = useQuery(["recruitment", "applications", queryParams], () => recruitmentApi.getApplications(queryParams));
  const summary = useQuery(["recruitment", "applicationSummary", jobId], () => recruitmentApi.getApplicationSummary({ job_id: jobId }));
  const jobs = useQuery(["recruitment", "jobs", "forApplications"], () => recruitmentApi.getJobs({ page_size: 100 }));
  const qc = useQueryClient();
  const transition = useMutation(({ id, target, current }) => recruitmentApi.transitionApplication(id, { target_status: target, expected_current_status: current }), {
    onSuccess: () => { qc.invalidateQueries(["recruitment", "applications"]); qc.invalidateQueries(["recruitment", "applicationSummary"]); },
    onError: (error) => toast.error(error?.response?.data?.detail?.message || error?.response?.data?.detail || "Stage could not be updated"),
  });
  const items = applications.data?.data?.items || [];
  const counts = summary.data?.data?.counts || {};
  const selectStage = (value) => { const next = new URLSearchParams(params); value ? next.set("stage", value) : next.delete("stage"); setParams(next); };
  return <div className="space-y-6 px-2 pb-4 pt-1.5 md:px-3 md:pb-6 md:pt-2">
    <ApplicationLifecyclePipeline current={stage} counts={counts} total={summary.data?.data?.total} onSelect={selectStage} />
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">{jobId ? "Candidate Pipeline" : "Candidates"}</h1><p className="text-sm text-gray-500">Application lifecycle workspace</p></div><Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Candidate</Button></div>
    <div className="flex gap-2"><input className={inputClassName} value={search} placeholder="Search candidate or job" onChange={(e) => setSearch(e.target.value)} /><Button variant="secondary" onClick={() => applications.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button></div>
    {applications.isLoading ? <p className="p-8 text-center text-gray-500">Loading applications…</p> : applications.isError ? <EmptyState title="Could not load applications" description="Try refreshing this workspace." /> : !items.length ? <EmptyState title={`No applications${stage ? ` in ${stage.replace(/_/g, " ")}` : ""}`} description="Applications matching this scope will appear here." /> : <div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left dark:bg-gray-900"><tr>{["Candidate", "Job", "Stage", "Score", "Recruiter", "Source", "Applied", "Actions"].map((label) => <th className="px-3 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{items.map((app) => <tr className="border-t" key={app.application_id}><td className="px-3 py-3"><Link className="font-medium text-indigo-600" to={`/hr/recruitment/candidates/${app.candidate.id}`}>{app.candidate.full_name}</Link></td><td className="px-3 py-3">{app.job.title}</td><td className="px-3 py-3">{app.status.replace(/_/g, " ")}</td><td className="px-3 py-3">{app.score?.score ?? "—"}</td><td className="px-3 py-3">{app.recruiter?.name || "—"}</td><td className="px-3 py-3">{app.source}</td><td className="px-3 py-3">{new Date(app.applied_at).toLocaleDateString()}</td><td className="px-3 py-3">{app.allowed_transitions?.filter((target) => !["rejected", "withdrawn", "archived"].includes(target)).slice(0, 1).map((target) => <Button key={target} size="sm" onClick={() => transition.mutate({ id: app.application_id, target, current: app.status })}>{target.replace(/_/g, " ")}</Button>)}</td></tr>)}</tbody></table></div>}
    <AddCandidateDialog open={addOpen} onClose={() => setAddOpen(false)} jobs={jobs.data?.data?.items || []} jobId={jobId} />
  </div>;
}
