import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { Archive, Paperclip, UserPlus } from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, FormField, PageHeader, inputClassName } from "../../../../components/ui";
import { CANDIDATE_STATUSES } from "../constants";
import { AssignRecruiterDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { RecruitmentTabs } from "../components/RecruitmentTabs";
import { RecruitmentTimeline } from "../components/RecruitmentTimeline";
import { StatusBadge } from "../components/StatusBadge";
import { compactParams, fmtDateTime, idOf, toArray } from "../utils/data";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "resume", label: "Resume" },
  { key: "applications", label: "Applications" },
  { key: "timeline", label: "Timeline" },
  { key: "interviews", label: "Interviews" },
  { key: "notes", label: "Notes" },
  { key: "attachments", label: "Attachments" },
  { key: "assignment", label: "Assignment" },
];

export default function CandidatesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [assignOpen, setAssignOpen] = useState(false);
  const [note, setNote] = useState("");
  const params = compactParams({ page, page_size: 20, search, ...filters });
  const query = useQuery(["recruitment", "candidates", params], () => recruitmentApi.getCandidates(params), { keepPreviousData: true });
  const detail = useQuery(["recruitment", "candidate", idOf(selected)], () => recruitmentApi.getCandidate(idOf(selected)), { enabled: !!selected });
  const timeline = useQuery(["recruitment", "candidateTimeline", idOf(selected)], () => recruitmentApi.getCandidateTimeline(idOf(selected)), { enabled: !!selected });
  const invalidate = () => qc.invalidateQueries(["recruitment", "candidates"]);
  const assign = useMutation((payload) => recruitmentApi.assignCandidate(idOf(selected), payload), { onSuccess: () => { toast.success("Assigned"); setAssignOpen(false); invalidate(); } });
  const archive = useMutation((id) => recruitmentApi.archiveCandidate(id), { onSuccess: () => { toast.success("Archived"); invalidate(); } });
  const addNote = useMutation((body) => recruitmentApi.addCandidateNote(idOf(selected), { body }), { onSuccess: () => { toast.success("Note added"); setNote(""); qc.invalidateQueries(["recruitment", "candidate", idOf(selected)]); } });
  const columns = useMemo(() => [
    { key: "name", header: "Candidate", minWidth: 220, render: (row) => <button className="font-semibold text-primary-700 hover:underline dark:text-primary-300" onClick={() => { setSelected(row); setActiveTab("overview"); }}>{row.full_name || row.fullName || row.name || "Candidate"}</button> },
    { key: "email", header: "Email", minWidth: 220, render: (row) => row.email || "—" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "source", header: "Source", render: (row) => row.source || "—" },
    { key: "actions", header: "Actions", minWidth: 150, render: (row) => <div className="flex gap-1"><Button size="sm" variant="ghost" aria-label="Assign recruiter" onClick={() => { setSelected(row); setAssignOpen(true); }}><UserPlus className="h-4 w-4" /></Button><Button size="sm" variant="ghost" aria-label="Archive candidate" onClick={() => archive.mutate(idOf(row))}><Archive className="h-4 w-4" /></Button></div> },
  ], [archive]);
  const candidate = detail.data || selected;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Candidates" description="Tabbed candidate workspace with timeline, notes, resume, attachments and assignment." />
      <RecruitmentFilters
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        values={filters}
        onChange={(k, v) => { setFilters((current) => ({ ...current, [k]: v })); setPage(1); }}
        onReset={() => { setSearch(""); setFilters({}); }}
        filters={[
          { key: "status", label: "Status", options: CANDIDATE_STATUSES },
          { key: "source", label: "Source", options: ["portal", "email", "manual", "referral"] },
          { key: "notice_period", label: "Notice period", options: ["immediate", "15_days", "30_days", "60_days", "90_days"] },
        ]}
      />
      <RecruitmentTable query={query} columns={columns} data={toArray(query.data)} emptyTitle="No candidates found" emptyDescription="Portal and inbox applications will create candidates here." page={page} pageSize={20} onPageChange={setPage} />

      <RecruitmentDrawer open={!!selected} title={candidate?.full_name || candidate?.fullName || "Candidate"} description={candidate?.email} onClose={() => setSelected(null)}>
        <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            <RecruitmentTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
            {activeTab === "overview" ? (
              <div className="space-y-5">
                <StatusBadge status={candidate?.status} />
                <div className="grid gap-3 md:grid-cols-2">
                  {["phone", "location", "experience_years", "current_company", "expected_salary", "notice_period"].map((key) => (
                    <div key={key} className="rounded-2xl bg-surface-muted p-3">
                      <p className="text-xs text-text-muted">{key.replace(/_/g, " ")}</p>
                      <p className="font-medium text-text-primary">{candidate?.[key] || "—"}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">Skills</h3>
                  <p className="mt-1 text-sm text-text-muted">{Array.isArray(candidate?.skills) ? candidate.skills.join(", ") : candidate?.skills || "—"}</p>
                </div>
              </div>
            ) : null}
            {activeTab === "timeline" ? <RecruitmentTimeline events={timeline.data} /> : null}
            {activeTab === "notes" ? (
              <div className="space-y-3">
                <FormField label="Add note"><textarea className={`${inputClassName} min-h-24`} value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
                <Button disabled={!note.trim()} loading={addNote.isLoading} onClick={() => addNote.mutate(note)}>Add note</Button>
              </div>
            ) : null}
            {["resume", "applications", "interviews", "attachments", "assignment"].includes(activeTab) ? (
              <div className="rounded-2xl border border-dashed border-surface-border p-6 text-sm text-text-muted dark:border-gray-800">
                {activeTab} data will render here when returned by candidate overview API.
              </div>
            ) : null}
          </div>
          <aside className="rounded-3xl border border-surface-border bg-surface-muted/40 p-4 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-text-primary">Quick actions</h3>
            <div className="mt-3 grid gap-2">
              <Button variant="secondary" onClick={() => setAssignOpen(true)}><UserPlus className="h-4 w-4" /> Assign recruiter</Button>
              <Button variant="secondary" loading={archive.isLoading} onClick={() => archive.mutate(idOf(candidate))}><Archive className="h-4 w-4" /> Archive</Button>
              <Button variant="secondary"><Paperclip className="h-4 w-4" /> Add attachment</Button>
            </div>
            <div className="mt-4 text-xs text-text-muted">
              Last activity: {fmtDateTime(candidate?.updated_at || candidate?.updatedAt || candidate?.created_at || candidate?.createdAt)}
            </div>
          </aside>
        </div>
      </RecruitmentDrawer>
      <AssignRecruiterDialog open={assignOpen} onClose={() => setAssignOpen(false)} onSubmit={(payload) => assign.mutate(payload)} loading={assign.isLoading} />
    </div>
  );
}
