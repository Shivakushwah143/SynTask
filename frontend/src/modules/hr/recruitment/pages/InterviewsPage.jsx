import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { 
  CalendarPlus, 
  MessageSquare, 
  XCircle,
  CalendarClock,
  Users,
  User,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  Plus,
  Eye,
  Edit,
  Trash2,
  Send,
  Star,
  AlertCircle,
  TrendingUp,
  Award,
  Target,
  Activity,
  FileText,
  Mail,
  Phone,
  MapPin,
  Building2,
  Clock as ClockIcon,
  ArrowRight,
  MoreVertical,
  CheckCircle,
  XCircle as XCircleIcon,
  UserCheck,
  UserX,
  MessageCircle,
  CalendarDays,
  BarChart3,
  PieChart,
  Zap,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  GripVertical,
  LayoutDashboard,
  Clock
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { usersAPI } from "../../../../api/users";
import { Button, PageHeader } from "../../../../components/ui";
import { INTERVIEW_STATUSES } from "../constants";
import { DecisionDialog, FeedbackDialog, InterviewDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState, EmptyRecruitmentState } from "../components/States";
import { compactParams, fmtDateTime, idOf, toArray } from "../utils/data";

// ============================================================
// CONSTANTS
// ============================================================
const lanes = [
  { key: "scheduled", label: "Scheduled", color: "blue" },
  { key: "confirmed", label: "Confirmed", color: "indigo" },
  { key: "in_progress", label: "In Progress", color: "amber" },
  { key: "completed", label: "Completed", color: "emerald" },
  { key: "cancelled", label: "Cancelled", color: "rose" },
  { key: "rescheduled", label: "Rescheduled", color: "orange" },
];

const laneColors = {
  blue: 'from-blue-500 to-cyan-500',
  indigo: 'from-indigo-500 to-purple-500',
  amber: 'from-amber-500 to-orange-500',
  emerald: 'from-emerald-500 to-teal-500',
  rose: 'from-rose-500 to-pink-500',
  orange: 'from-orange-500 to-amber-500',
};

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
// LANE CARD COMPONENT
// ============================================================
const InterviewCard = ({ interview, onClick }) => {
  const getStatusColor = (status) => {
    const colors = {
      scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      confirmed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
      in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
      rescheduled: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    };
    return colors[status] || colors.scheduled;
  };

  const hasFeedback = interview.feedback_status && interview.feedback_status !== 'pending';
  const hasDecision = interview.decision && interview.decision !== 'pending';

  return (
    <button
      type="button"
      onClick={() => onClick(interview)}
      className="group w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {interview.round || interview.interview_type || "Interview"}
          </p>
          {interview.candidate_name && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
              <User className="mr-1 inline h-3 w-3" />
              {interview.candidate_name}
            </p>
          )}
          {interview.job_title && (
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              <Building2 className="mr-1 inline h-3 w-3" />
              {interview.job_title}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(interview.status || interview.feedback_status)}`}>
            {interview.status || interview.feedback_status || "scheduled"}
          </span>
          {hasFeedback && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              <MessageSquare className="mr-1 inline h-3 w-3" />
              Feedback
            </span>
          )}
          {hasDecision && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">
              <CheckCircle className="mr-1 inline h-3 w-3" />
              Decision
            </span>
          )}
        </div>
      </div>
      
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <ClockIcon className="h-3 w-3" />
          {fmtDateTime(interview.scheduled_at || interview.schedule_at)}
        </span>
        {interview.duration && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {interview.duration} min
          </span>
        )}
        {interview.interviewer_name && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {interview.interviewer_name}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================
// LANE COMPONENT
// ============================================================
const Lane = ({ lane, interviews, onSelect }) => {
  const color = laneColors[lane.color] || laneColors.blue;
  
  return (
    <section className="flex min-h-[400px] flex-col rounded-2xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/30">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${color}`}></div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            {lane.label}
          </h3>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm dark:bg-gray-700 dark:text-gray-300">
          {interviews.length}
        </span>
      </div>
      
      <div className="flex-1 space-y-3 overflow-y-auto">
        {interviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 dark:border-gray-700">
            <div className="rounded-full bg-gray-100 p-2 dark:bg-gray-700">
              <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">No interviews</p>
          </div>
        ) : (
          interviews.map((interview) => (
            <InterviewCard 
              key={idOf(interview)} 
              interview={interview} 
              onClick={onSelect} 
            />
          ))
        )}
      </div>
    </section>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function InterviewsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  
  const params = compactParams({ page: 1, page_size: 100, ...filters });
  const query = useQuery(["recruitment", "interviews", params], () => recruitmentApi.getInterviews(params));
  const candidatesQuery = useQuery(["recruitment", "interviewCandidates"], () => recruitmentApi.getCandidates({ page: 1, page_size: 100 }), { staleTime: 5 * 60 * 1000 });
  const jobsQuery = useQuery(["recruitment", "interviewJobs"], () => recruitmentApi.getJobs({ page: 1, page_size: 100 }), { staleTime: 5 * 60 * 1000 });
  const interviewersQuery = useQuery(["recruitment", "interviewers"], () => usersAPI.getAssignableUsersWithJuniors(), { staleTime: 5 * 60 * 1000 });
  
  const interviews = toArray(query.data);
  const candidates = toArray(candidatesQuery.data);
  const jobs = toArray(jobsQuery.data);
  const interviewers = toArray(interviewersQuery.data);
  
  const byLane = useMemo(() => {
    const result = lanes.reduce((acc, lane) => ({
      ...acc,
      [lane.key]: interviews.filter((item) => 
        String(item.status || item.feedback_status || "scheduled").toLowerCase() === lane.key
      )
    }), {});
    return result;
  }, [interviews]);

  // Calculate stats
  const stats = {
    total: interviews.length,
    scheduled: byLane.scheduled?.length || 0,
    confirmed: byLane.confirmed?.length || 0,
    completed: byLane.completed?.length || 0,
    cancelled: byLane.cancelled?.length || 0,
    inProgress: byLane.in_progress?.length || 0,
  };

  const invalidate = () => qc.invalidateQueries(["recruitment", "interviews"]);
  
  const save = useMutation(
    (payload) => recruitmentApi.createInterview(payload), 
    { 
      onSuccess: () => { 
        toast.success("Interview scheduled successfully! 📅"); 
        setScheduleOpen(false); 
        invalidate(); 
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to schedule interview");
      }
    } 
  );
  
  const cancel = useMutation(
    (id) => recruitmentApi.cancelInterview(id, { reason: "Cancelled from recruitment UI" }), 
    { 
      onSuccess: () => { 
        toast.success("Interview cancelled successfully! ❌"); 
        invalidate(); 
        setSelected(null);
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to cancel interview");
      }
    } 
  );
  
  const feedback = useMutation(
    (payload) => recruitmentApi.submitInterviewFeedback(idOf(selected), payload), 
    { 
      onSuccess: () => { 
        toast.success("Feedback submitted successfully! 💬"); 
        setFeedbackOpen(false); 
        invalidate(); 
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to submit feedback");
      }
    } 
  );
  
  const decision = useMutation(
    (payload) => recruitmentApi.recordInterviewDecision(idOf(selected), payload), 
    { 
      onSuccess: () => { 
        toast.success("Decision recorded successfully! ✅"); 
        setDecisionOpen(false); 
        invalidate(); 
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to record decision");
      }
    } 
  );

  const isLoading = query.isLoading || candidatesQuery.isLoading || jobsQuery.isLoading || interviewersQuery.isLoading;
  const isError = query.isError;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Interview Board</h1>
                <p className="mt-1 text-indigo-100">
                  Kanban pipeline for scheduling, feedback and decisions.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setScheduleOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <CalendarPlus className="h-4 w-4" />
                Schedule
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
          label="Total Interviews" 
          value={stats.total} 
          icon={CalendarClock} 
          color="indigo"
          subtitle="All interviews"
        />
        <StatCard 
          label="Scheduled" 
          value={stats.scheduled + stats.confirmed} 
          icon={Calendar} 
          color="blue"
          subtitle="Upcoming interviews"
        />
        <StatCard 
          label="In Progress" 
          value={stats.inProgress} 
          icon={Activity} 
          color="amber"
          subtitle="Currently ongoing"
        />
        <StatCard 
          label="Completed" 
          value={stats.completed} 
          icon={CheckCircle} 
          color="emerald"
          subtitle="Finished interviews"
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters"
          description="Filter interviews by status"
          action={
            <button
              onClick={() => setFilters({})}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          }
        />
        <div className="p-4">
          <RecruitmentFilters 
            search="" 
            onSearch={() => {}} 
            values={filters} 
            onChange={(k, v) => setFilters((c) => ({ ...c, [k]: v }))} 
            onReset={() => setFilters({})} 
            filters={[{ key: "status", label: "Status", options: INTERVIEW_STATUSES }]} 
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* KANBAN BOARD */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={LayoutDashboard}
          title="Interview Pipeline"
          description={`${stats.total} interview${stats.total !== 1 ? 's' : ''} across ${lanes.length} stages`}
          action={
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Live updates</span>
            </div>
          }
        />
        <div className="p-4">
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading interviews...</p>
              </div>
            </div>
          ) : isError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {query.error?.response?.data?.detail || "Could not load interviews"}
              </p>
              <button
                onClick={() => query.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : interviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-16 w-16 text-gray-300 dark:text-gray-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No interviews scheduled</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Schedule an interview to start the pipeline.</p>
              <button
                onClick={() => setScheduleOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <CalendarPlus className="h-4 w-4" />
                Schedule Interview
              </button>
            </div>
          ) : (
            <div className="grid gap-4 overflow-x-auto xl:grid-cols-6">
              {lanes.map((lane) => (
                <Lane 
                  key={lane.key} 
                  lane={lane} 
                  interviews={byLane[lane.key] || []} 
                  onSelect={setSelected} 
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* INTERVIEW DRAWER */}
      {/* ============================================================ */}
      <RecruitmentDrawer 
        open={!!selected} 
        title={selected?.round || "Interview"} 
        description={fmtDateTime(selected?.scheduled_at || selected?.schedule_at)} 
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-5">
            {/* Status Section */}
            <div className="flex items-center justify-between">
              <StatusBadge status={selected?.decision || selected?.status || selected?.feedback_status} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {fmtDateTime(selected?.created_at || selected?.createdAt)}
              </span>
            </div>

            {/* Details Grid */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Candidate</p>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {selected?.candidate_name || selected?.candidate?.name || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Job</p>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {selected?.job_title || selected?.job?.title || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Interviewer</p>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {selected?.interviewer_name || selected?.interviewer?.name || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Duration</p>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {selected?.duration ? `${selected.duration} minutes` : "—"}
                </p>
              </div>
            </div>

            {/* Notes */}
            {selected?.notes && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Notes</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selected.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                onClick={() => setFeedbackOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <MessageSquare className="h-4 w-4" />
                Feedback
              </button>
              <button
                onClick={() => setDecisionOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <CheckCircle className="h-4 w-4" />
                Decision
              </button>
              <button
                onClick={() => cancel.mutate(idOf(selected))}
                disabled={cancel.isLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-900/20 disabled:opacity-50"
              >
                {cancel.isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-rose-600 border-t-transparent"></div>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </RecruitmentDrawer>

      {/* ============================================================ */}
      {/* DIALOGS */}
      {/* ============================================================ */}
      <InterviewDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSubmit={(payload) => save.mutate(payload)}
        loading={save.isLoading}
        candidates={candidates}
        jobs={jobs}
        interviewers={interviewers}
      />

      <FeedbackDialog 
        open={feedbackOpen} 
        onClose={() => setFeedbackOpen(false)} 
        onSubmit={(payload) => feedback.mutate(payload)} 
        loading={feedback.isLoading} 
      />

      <DecisionDialog 
        open={decisionOpen} 
        onClose={() => setDecisionOpen(false)} 
        onSubmit={(payload) => decision.mutate(payload)} 
        loading={decision.isLoading} 
      />
    </div>
  );
}
