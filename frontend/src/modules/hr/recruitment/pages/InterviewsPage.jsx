import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { CalendarPlus, MessageSquare, XCircle } from "lucide-react";
import { recruitmentApi } from "../../../../api/recruitment";
import { Button, PageHeader } from "../../../../components/ui";
import { INTERVIEW_STATUSES } from "../constants";
import { DecisionDialog, FeedbackDialog, InterviewDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState, EmptyRecruitmentState } from "../components/States";
import { compactParams, fmtDateTime, idOf, toArray } from "../utils/data";

const lanes = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "rescheduled"];

export default function InterviewsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const params = compactParams({ page: 1, page_size: 100, ...filters });
  const query = useQuery(["recruitment", "interviews", params], () => recruitmentApi.getInterviews(params));
  const interviews = toArray(query.data);
  const byLane = useMemo(() => lanes.reduce((acc, lane) => ({ ...acc, [lane]: interviews.filter((item) => String(item.status || item.feedback_status || "scheduled").toLowerCase() === lane) }), {}), [interviews]);
  const invalidate = () => qc.invalidateQueries(["recruitment", "interviews"]);
  const save = useMutation((payload) => recruitmentApi.createInterview(payload), { onSuccess: () => { toast.success("Interview scheduled"); setScheduleOpen(false); invalidate(); } });
  const cancel = useMutation((id) => recruitmentApi.cancelInterview(id, { reason: "Cancelled from recruitment UI" }), { onSuccess: () => { toast.success("Interview cancelled"); invalidate(); } });
  const feedback = useMutation((payload) => recruitmentApi.submitInterviewFeedback(idOf(selected), payload), { onSuccess: () => { toast.success("Feedback submitted"); setFeedbackOpen(false); invalidate(); } });
  const decision = useMutation((payload) => recruitmentApi.recordInterviewDecision(idOf(selected), payload), { onSuccess: () => { toast.success("Decision recorded"); setDecisionOpen(false); invalidate(); } });
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Interview Board" description="Kanban pipeline for scheduling, feedback and decisions." actions={<Button onClick={() => setScheduleOpen(true)}><CalendarPlus className="h-4 w-4" /> Schedule</Button>} />
      <RecruitmentFilters search="" onSearch={() => {}} values={filters} onChange={(k, v) => setFilters((c) => ({ ...c, [k]: v }))} onReset={() => setFilters({})} filters={[{ key: "status", label: "Status", options: INTERVIEW_STATUSES }]} />
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : interviews.length === 0 ? <EmptyRecruitmentState title="No interviews scheduled" description="Schedule an interview to start the pipeline." /> : (
        <div className="grid gap-4 overflow-x-auto xl:grid-cols-6">
          {lanes.map((lane) => (
            <section key={lane} className="min-h-80 rounded-3xl border border-surface-border bg-surface-muted/50 p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{lane.replace(/_/g, " ")}</h3><span className="rounded-full bg-white px-2 py-1 text-xs dark:bg-gray-900">{byLane[lane]?.length || 0}</span></div>
              <div className="space-y-3">{(byLane[lane] || []).map((item) => <button key={idOf(item)} type="button" onClick={() => setSelected(item)} className="w-full rounded-2xl border border-surface-border bg-surface p-4 text-left shadow-card transition hover:border-primary-300 dark:border-gray-800 dark:bg-gray-900"><p className="font-semibold text-text-primary">{item.round || item.interview_type || "Interview"}</p><p className="mt-1 text-sm text-text-muted">{fmtDateTime(item.scheduled_at || item.schedule_at)}</p><div className="mt-3"><StatusBadge status={item.decision || item.status || item.feedback_status} /></div></button>)}</div>
            </section>
          ))}
        </div>
      )}
      <RecruitmentDrawer open={!!selected} title={selected?.round || "Interview"} description={fmtDateTime(selected?.scheduled_at || selected?.schedule_at)} onClose={() => setSelected(null)}>
        <div className="space-y-4"><StatusBadge status={selected?.decision || selected?.status || selected?.feedback_status} /><p className="text-sm text-text-muted">{selected?.notes || "No notes recorded."}</p><div className="flex flex-wrap gap-2"><Button onClick={() => setFeedbackOpen(true)}><MessageSquare className="h-4 w-4" /> Feedback</Button><Button variant="secondary" onClick={() => setDecisionOpen(true)}>Decision</Button><Button variant="secondary" onClick={() => cancel.mutate(idOf(selected))}><XCircle className="h-4 w-4" /> Cancel</Button></div></div>
      </RecruitmentDrawer>
      <InterviewDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} onSubmit={(payload) => save.mutate(payload)} loading={save.isLoading} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} onSubmit={(payload) => feedback.mutate(payload)} loading={feedback.isLoading} />
      <DecisionDialog open={decisionOpen} onClose={() => setDecisionOpen(false)} onSubmit={(payload) => decision.mutate(payload)} loading={decision.isLoading} />
    </div>
  );
}

