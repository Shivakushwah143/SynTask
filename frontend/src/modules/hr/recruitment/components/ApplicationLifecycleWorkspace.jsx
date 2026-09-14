import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, RefreshCw } from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, EmptyState, FormField, Modal, inputClassName } from "../../../../components/ui";

const stages = [
  ["", "All"], ["new", "New"], ["screening", "Screening"], ["shortlisted", "Shortlisted"],
  ["interview_1", "Interview 1"], ["interview_2", "Interview 2"], ["offer_sent", "Offer Sent"],
  ["offer_accepted", "Offer Accepted"], ["joined", "Joined"], ["rejected", "Rejected"],
  ["withdrawn", "Withdrawn"], ["archived", "Archived"], ["converted", "Converted"],
];

function AddCandidateDialog({ open, onClose, jobs }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "manual", currentCompany: "", experience: "0", skills: "", job_id: "" });
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
      <FormField label="Job"><select required className={inputClassName} value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}><option value="">Select a job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></FormField>
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
  return <div className="space-y-4 p-4 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">{jobId ? "Candidate Pipeline" : "Candidates"}</h1><p className="text-sm text-gray-500">Application lifecycle workspace</p></div>{!jobId && <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Candidate</Button>}</div>
    <div className="flex gap-2 overflow-x-auto pb-1">{stages.map(([value, label]) => <button key={value} onClick={() => selectStage(value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${stage === value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}>{label} {value === "" ? (summary.data?.data?.total || 0) : (counts[value] || 0)}</button>)}</div>
    <div className="flex gap-2"><input className={inputClassName} value={search} placeholder="Search candidate or job" onChange={(e) => setSearch(e.target.value)} /><Button variant="secondary" onClick={() => applications.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button></div>
    {applications.isLoading ? <p className="p-8 text-center text-gray-500">Loading applications…</p> : applications.isError ? <EmptyState title="Could not load applications" description="Try refreshing this workspace." /> : !items.length ? <EmptyState title={`No applications${stage ? ` in ${stage.replace(/_/g, " ")}` : ""}`} description="Applications matching this scope will appear here." /> : <div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left dark:bg-gray-900"><tr>{["Candidate", "Job", "Stage", "Score", "Recruiter", "Source", "Applied", "Actions"].map((label) => <th className="px-3 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{items.map((app) => <tr className="border-t" key={app.application_id}><td className="px-3 py-3"><Link className="font-medium text-indigo-600" to={`/hr/recruitment/candidates/${app.candidate.id}`}>{app.candidate.full_name}</Link></td><td className="px-3 py-3">{app.job.title}</td><td className="px-3 py-3">{app.status.replace(/_/g, " ")}</td><td className="px-3 py-3">{app.score?.score ?? "—"}</td><td className="px-3 py-3">{app.recruiter?.name || "—"}</td><td className="px-3 py-3">{app.source}</td><td className="px-3 py-3">{new Date(app.applied_at).toLocaleDateString()}</td><td className="px-3 py-3">{app.allowed_transitions?.filter((target) => !["rejected", "withdrawn", "archived"].includes(target)).slice(0, 1).map((target) => <Button key={target} size="sm" onClick={() => transition.mutate({ id: app.application_id, target, current: app.status })}>{target.replace(/_/g, " ")}</Button>)}</td></tr>)}</tbody></table></div>}
    {!jobId && <AddCandidateDialog open={addOpen} onClose={() => setAddOpen(false)} jobs={jobs.data?.data?.items || []} />}
  </div>;
}
