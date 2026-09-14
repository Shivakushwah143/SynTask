import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, ClipboardList, Plus, RefreshCw, Search, UserCheck, Users, X } from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, EmptyState, FormField, Modal, inputClassName } from "../../../../components/ui";

const stages = [
  ["", "All"], ["new", "New"], ["screening", "Screening"], ["shortlisted", "Shortlisted"],
  ["interview_1", "Interview 1"], ["interview_2", "Interview 2"], ["offer_sent", "Offer Sent"],
  ["offer_accepted", "Offer Accepted"], ["joined", "Joined"], ["rejected", "Rejected"],
  ["withdrawn", "Withdrawn"], ["archived", "Archived"], ["converted", "Converted"],
];

const stageLabel = Object.fromEntries(stages);
const lifecycleSequence = stages.slice(1, 9).map(([value]) => value);
const displayStage = (value) => stageLabel[value] || String(value || "").replace(/_/g, " ");

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

function WorkspaceMetric({ label, value, icon: Icon, tone }) {
  return <div className="flex min-w-36 flex-1 items-center justify-between gap-2 px-3 py-2.5">
    <div><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p><p className="mt-0.5 text-lg font-bold leading-none tabular-nums text-gray-900 dark:text-white">{value}</p></div><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-3.5 w-3.5" /></span>
  </div>;
}

function AddCandidateDialog({ open, onClose, jobs, jobId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "manual", currentCompany: "", experience: "0", skills: "", job_id: jobId || "" });
  const [resume, setResume] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const submit = useMutation(async () => {
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => { if (key !== "job_id") data.append(key, value); });
    const candidate = (await recruitmentApi.createCandidate(data)).data;
    let resumeId = candidate.resume_id;
    if (resume) {
      const extension = `.${(resume.name.split(".").pop() || "").toLowerCase()}`;
      const resumeExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"]);
      if (resumeExtensions.has(extension)) resumeId = (await recruitmentApi.uploadCandidateResume(candidate.id, resume)).data?.id;
      else await recruitmentApi.addCandidateAttachment(candidate.id, resume);
    }
    const applicationFields = customFields.reduce((values, field) => {
      if (field.label.trim()) values[field.label.trim()] = field.value;
      return values;
    }, {});
    return recruitmentApi.createApplication({ candidate_id: candidate.id, job_id: jobId || form.job_id, source: form.source, current_resume_id: resumeId || undefined, custom_fields: applicationFields });
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
      <div>
        <div className="flex items-center justify-between gap-3"><label className="text-sm font-medium text-gray-700 dark:text-gray-200">Job-specific details</label><button type="button" onClick={() => setCustomFields((fields) => [...fields, { id: crypto.randomUUID(), label: "", value: "" }])} className="min-h-9 cursor-pointer text-xs font-semibold text-indigo-600 transition hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300">+ Add field</button></div>
        <p className="mt-1 text-xs text-gray-500">Stored on this application only.</p>
        {customFields.length > 0 && <div className="mt-2 space-y-2">{customFields.map((field) => <div className="flex items-center gap-2" key={field.id}><input className={inputClassName} aria-label="Field label" placeholder="Field name" value={field.label} onChange={(e) => setCustomFields((fields) => fields.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))} /><input className={inputClassName} aria-label={field.label || "Field value"} placeholder="Value" value={field.value} onChange={(e) => setCustomFields((fields) => fields.map((item) => item.id === field.id ? { ...item, value: e.target.value } : item))} /><button type="button" aria-label={`Remove ${field.label || "custom field"}`} onClick={() => setCustomFields((fields) => fields.filter((item) => item.id !== field.id))} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-rose-950/40"><X className="h-4 w-4" /></button></div>)}</div>}
      </div>
      <FormField label="Job"><select required disabled={Boolean(jobId)} className={inputClassName} value={jobId || form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}><option value="">Select a job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select>{jobId && <p className="mt-1 text-xs text-gray-500">Candidate will be added to this Job Pipeline.</p>}</FormField>
      <FormField label="Resume or attachment"><input type="file" onChange={(e) => setResume(e.target.files?.[0] || null)} /><p className="mt-1 text-xs text-gray-500">All file types supported. Resumes are parsed when supported; images, video, and other files are saved as candidate attachments.</p></FormField>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={submit.isLoading}>Create application</Button></div>
    </form>
  </Modal>;
}

export function ApplicationLifecycleWorkspace({ jobId } = {}) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  const [addOpen, setAddOpen] = useState(false);
  const [moveApplication, setMoveApplication] = useState(null);
  const stage = params.get("stage") || "";
  const queryParams = useMemo(() => ({ stage: stage || undefined, job_id: jobId, search: search || undefined, page_size: 50 }), [stage, jobId, search]);
  const applications = useQuery(["recruitment", "applications", queryParams], () => recruitmentApi.getApplications(queryParams));
  const summary = useQuery(["recruitment", "applicationSummary", jobId], () => recruitmentApi.getApplicationSummary({ job_id: jobId }));
  const jobs = useQuery(["recruitment", "jobs", "forApplications"], () => recruitmentApi.getJobs({ page_size: 100 }));
  const qc = useQueryClient();
  const transition = useMutation(({ id, target, current }) => recruitmentApi.transitionApplication(id, { target_status: target, expected_current_status: current }), {
    onSuccess: () => { qc.invalidateQueries(["recruitment", "applications"]); qc.invalidateQueries(["recruitment", "applicationSummary"]); setMoveApplication(null); },
    onError: (error) => toast.error(error?.response?.data?.detail?.message || error?.response?.data?.detail || "Stage could not be updated"),
  });
  const items = applications.data?.data?.items || [];
  const counts = summary.data?.data?.counts || {};
  const totalApplications = summary.data?.data?.total || 0;
  const activeApplications = lifecycleSequence.slice(0, -1).reduce((total, currentStage) => total + (counts[currentStage] || 0), 0);
  const interviewApplications = (counts.interview_1 || 0) + (counts.interview_2 || 0);
  const offerApplications = (counts.offer_sent || 0) + (counts.offer_accepted || 0);
  const selectStage = (value) => { const next = new URLSearchParams(params); value ? next.set("stage", value) : next.delete("stage"); setParams(next); };
  const transitionsFor = (app) => app.allowed_transitions || [];
  const isSequentialTransition = (app, target) => lifecycleSequence.indexOf(target) === lifecycleSequence.indexOf(app.status) + 1;
  const renderMoveAction = (app) => {
    const available = transitionsFor(app);
    if (!available.length) return <span className="text-xs text-gray-400">No next stage</span>;
    if (available.length === 1 && isSequentialTransition(app, available[0])) {
      const target = available[0];
      return <Button size="sm" loading={transition.isLoading && transition.variables?.id === app.application_id} onClick={() => transition.mutate({ id: app.application_id, target, current: app.status })}>Move to {displayStage(target)}</Button>;
    }
    return <Button size="sm" variant="secondary" onClick={() => setMoveApplication(app)}>Move to…</Button>;
  };
  return <div className="space-y-4 px-1 pb-5 pt-1 sm:px-2 sm:pb-6">
    <section className="rounded-xl border border-indigo-100 bg-white px-3 py-2 shadow-sm dark:border-indigo-900/60 dark:bg-gray-900 sm:px-4"><ApplicationLifecyclePipeline current={stage} counts={counts} total={totalApplications} onSelect={selectStage} /></section>
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 shadow-sm dark:border-indigo-900/60 dark:from-indigo-950/30 dark:via-gray-950 dark:to-sky-950/20">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm"><Users className="h-4 w-4" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">Recruitment workspace</p><h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{jobId ? "Candidate Pipeline" : "Candidates"}</h1></div></div><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Review applications, progress candidates, and keep hiring stages moving.</p></div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Candidate</Button>
      </div>
    </section>
    <section aria-label="Pipeline summary" className="flex flex-wrap divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900 sm:divide-x sm:divide-y-0">
      <WorkspaceMetric label="Applications" value={totalApplications} icon={ClipboardList} tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" />
      <WorkspaceMetric label="Active" value={activeApplications} icon={Users} tone="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" />
      <WorkspaceMetric label="Interviews" value={interviewApplications} icon={UserCheck} tone="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" />
      <WorkspaceMetric label="Offers" value={offerApplications} icon={ClipboardList} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" />
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="block min-w-0 flex-1"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Search applications</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className={`${inputClassName} pl-9`} value={search} placeholder="Candidate name or job title" onChange={(e) => setSearch(e.target.value)} /></div></label><Button variant="secondary" onClick={() => applications.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/80"><div><h2 className="font-semibold text-gray-900 dark:text-white">Candidate applications</h2><p className="text-xs text-gray-500 dark:text-gray-400">Status colors match lifecycle pipeline.</p></div><span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold tabular-nums text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">{items.length} shown</span></div>
      {applications.isLoading ? <p className="p-8 text-center text-gray-500">Loading applications…</p> : applications.isError ? <EmptyState title="Could not load applications" description="Try refreshing this workspace." /> : !items.length ? <EmptyState title={`No applications${stage ? ` in ${stage.replace(/_/g, " ")}` : ""}`} description="Applications matching this scope will appear here." /> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="bg-gray-50 text-left dark:bg-gray-950"><tr>{["Candidate", "Job", "Current status", "Score", "Recruiter", "Source", "Applied", "Actions"].map((label) => <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{items.map((app) => <tr className="transition-colors hover:bg-indigo-50/40 dark:hover:bg-indigo-950/15" key={app.application_id}><td className="px-4 py-3"><Link className="font-semibold text-indigo-700 hover:text-indigo-800 hover:underline dark:text-indigo-300" to={`/hr/recruitment/candidates/${app.candidate.id}`}>{app.candidate.full_name}</Link></td><td className="max-w-52 px-4 py-3 font-medium text-gray-700 dark:text-gray-200"><span className="block truncate" title={app.job.title}>{app.job.title}</span></td><td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stageColors[app.status] || "#6B7280" }} />{displayStage(app.status)}</span></td><td className="px-4 py-3 font-semibold tabular-nums text-gray-700 dark:text-gray-200">{app.score?.score ?? "—"}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-300">{app.recruiter?.name || "—"}</td><td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{app.source}</td><td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{new Date(app.applied_at).toLocaleDateString()}</td><td className="px-4 py-3">{renderMoveAction(app)}</td></tr>)}</tbody></table></div>}
    </section>
    <Modal isOpen={Boolean(moveApplication)} onClose={() => setMoveApplication(null)} title="Move candidate" description={moveApplication ? `Current status: ${displayStage(moveApplication.status)}. Select an allowed next stage.` : undefined} size="sm">
      <div className="space-y-2" role="list" aria-label="Allowed next stages">{transitionsFor(moveApplication || {}).map((target) => <button key={target} type="button" role="listitem" disabled={transition.isLoading} onClick={() => transition.mutate({ id: moveApplication.application_id, target, current: moveApplication.status })} className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: stageColors[target] || "#6B7280" }} />Move to {displayStage(target)}</span><ArrowRight className="h-4 w-4 text-gray-400" /></button>)}</div>
    </Modal>
    <AddCandidateDialog open={addOpen} onClose={() => setAddOpen(false)} jobs={jobs.data?.data?.items || []} jobId={jobId} />
  </div>;
}
