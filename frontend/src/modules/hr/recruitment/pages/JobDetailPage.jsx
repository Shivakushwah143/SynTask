import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowUpDown,
  Archive,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Copy,
  Download,
  FileText,
  Globe,
  ListChecks,
  MapPin,
  Pencil,
  Send,
  Star,
  Target,
  UserX,
  Users,
  Wallet,
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { departmentsAPI } from "../../../../api/departments";
import { usersAPI } from "../../../../api/users";
import { Button, FormField, Modal, PageHeader, inputClassName } from "../../../../components/ui";
import { JobDialog, ConfirmActionDialog, InterviewDialog } from "../dialogs/RecruitmentDialogs";
import { JobStatusDropdown } from "../components/JobStatusDropdown";
import { StatusBadge } from "../components/StatusBadge";
import { fmtDate, fmtDateTime, idOf, labelize } from "../utils/data";

// ============================================================
// SMALL PRESENTATION HELPERS
// ============================================================
const InfoItem = ({ icon: Icon, label, value }) => (
  <div className="flex min-h-10 items-start gap-3 rounded-lg px-2.5 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800/70">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
      <Icon className="h-3.5 w-3.5" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-semibold leading-snug text-gray-900 dark:text-white">{value}</p>
    </div>
  </div>
);

const SectionCard = ({ icon: Icon, title, children, action }) => (
  <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {action}
    </div>
    <div className="p-3.5">{children}</div>
  </section>
);

const ProseBlock = ({ title, children }) => {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40">
      <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{title}</h4>
      <p className="whitespace-pre-line text-sm leading-6 text-gray-700 dark:text-gray-300">{children}</p>
    </div>
  );
};

const CompactMetric = ({ icon: Icon, label, value, color }) => {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900/60",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60",
    amber: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60",
    blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60",
    teal: "bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60",
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ${colors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-base font-semibold leading-tight text-gray-950 dark:text-white">{value}</p>
      </div>
    </div>
  );
};

const fileUrl = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/uploads/")) return `/api/v1${value}`;
  if (value.startsWith("/api/")) return value;
  return value;
};

const resumeFileUrl = (resume) => {
  const resumeId = resume?.id || resume?._id;
  return resumeId ? `/api/v1/recruitment/resumes/${resumeId}/file` : fileUrl(resume?.resume_url || resume?.resumeUrl || resume?.url);
};

const CANDIDATE_ACTIONS = [
  { status: "screening", label: "Screening" },
  { status: "shortlisted", label: "Shortlist" },
  { status: "joined", label: "Joined" },
  { status: "withdrawn", label: "Withdraw" },
];

const CANDIDATE_TRANSITIONS = {
  new: new Set(["screening", "rejected", "withdrawn", "archived"]),
  screening: new Set(["shortlisted", "rejected", "withdrawn"]),
  shortlisted: new Set(["interview_1", "rejected", "withdrawn"]),
  interview_1: new Set(["interview_2", "offer_sent", "rejected", "withdrawn"]),
  interview_2: new Set(["offer_sent", "rejected", "withdrawn"]),
  offer_sent: new Set(["offer_accepted", "rejected", "withdrawn"]),
  offer_accepted: new Set(["joined", "withdrawn"]),
  joined: new Set(["employee"]),
};

const TERMINAL_CANDIDATE_STATUSES = new Set(["joined", "rejected", "withdrawn", "archived", "employee"]);

const candidateStage = (item, candidate) => String(item?.status || candidate?.status || "").toLowerCase();
const canMoveCandidate = (currentStatus, targetStatus) => Boolean(CANDIDATE_TRANSITIONS[currentStatus]?.has(targetStatus));
const canArchiveCandidate = (currentStatus) => Boolean(currentStatus && !TERMINAL_CANDIDATE_STATUSES.has(currentStatus));

const defaultExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

function InterviewResultDialog({ open, interview, onClose, onSubmit, loading, onScheduleNextRound }) {
  const [form, setForm] = useState({ decision: "passed", score: "", feedback: "", result: "" });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setForm({
      decision: interview?.decision || "passed",
      score: interview?.score ?? "",
      feedback: interview?.feedback || "",
      result: interview?.result || interview?.notes || "",
    });
  }, [open, interview]);

  return (
    <Modal isOpen={open} onClose={onClose} title="Record interview result" size="lg">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            decision: form.decision,
            score: form.score === "" ? null : Number(form.score),
            feedback: form.feedback,
            result: form.result || form.decision,
          });
        }}
      >
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950/40">
          Round {interview?.round || "?"} • {labelize(interview?.interview_type || "interview")} • {fmtDateTime(interview?.schedule_at)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Decision">
            <select className={inputClassName} value={form.decision} onChange={(event) => update("decision", event.target.value)}>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="hold">Hold</option>
            </select>
          </FormField>
          <FormField label="Score / 10">
            <input className={inputClassName} type="number" min="0" max="10" step="0.5" value={form.score} onChange={(event) => update("score", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Result summary">
          <input className={inputClassName} value={form.result} placeholder="Example: Strong technical fit, schedule one more round" onChange={(event) => update("result", event.target.value)} />
        </FormField>
        <FormField label="Feedback">
          <textarea className={`${inputClassName} min-h-28`} value={form.feedback} onChange={(event) => update("feedback", event.target.value)} />
        </FormField>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="secondary" onClick={onScheduleNextRound}>
            <Calendar className="h-3.5 w-3.5" /> Add another interview
          </Button>
          <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={!form.feedback.trim()}>Save result</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function OfferPrepDialog({ open, item, job, onClose, onSubmit, loading }) {
  const candidate = item?.candidate || {};
  const [offerFile, setOfferFile] = useState(null);
  const [form, setForm] = useState({
    joining_date: "",
    offer_expiry: defaultExpiryDate(),
    currency: "INR",
    base_salary: "",
    variable_pay: "",
    joining_bonus: "",
    probation_period: "",
    notice_period: "",
    work_location: job?.location || "",
    employment_type: job?.employment_type || "full_time",
  });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Modal isOpen={open} onClose={onClose} title="Prepare offer letter" size="xl">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            candidate_id: idOf(candidate),
            job_id: idOf(job),
            job_title: job?.title,
            department: job?.department_id,
            employment_type: form.employment_type,
            work_location: form.work_location,
            joining_date: new Date(form.joining_date).toISOString(),
            offer_expiry: form.offer_expiry ? new Date(form.offer_expiry).toISOString() : null,
            currency: form.currency,
            base_salary: Number(form.base_salary || 0),
            variable_pay: Number(form.variable_pay || 0),
            joining_bonus: Number(form.joining_bonus || 0),
            probation_period: form.probation_period,
            notice_period: form.notice_period,
            offer_letter_file: offerFile,
          });
        }}
      >
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
          Offer for <span className="font-semibold">{candidate.full_name || candidate.email}</span> as <span className="font-semibold">{job?.title}</span>. Generate an offer from these fields or upload an already prepared PDF/photo before sending.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Joining date">
            <input className={inputClassName} type="date" value={form.joining_date} onChange={(event) => update("joining_date", event.target.value)} required />
          </FormField>
          <FormField label="Offer expiry">
            <input className={inputClassName} type="date" value={form.offer_expiry} onChange={(event) => update("offer_expiry", event.target.value)} />
          </FormField>
          <FormField label="Work location">
            <input className={inputClassName} value={form.work_location} onChange={(event) => update("work_location", event.target.value)} />
          </FormField>
          <FormField label="Employment type">
            <input className={inputClassName} value={form.employment_type} onChange={(event) => update("employment_type", event.target.value)} />
          </FormField>
          <FormField label="Currency">
            <input className={inputClassName} value={form.currency} onChange={(event) => update("currency", event.target.value)} />
          </FormField>
          <FormField label="Base salary">
            <input className={inputClassName} type="number" min="0" value={form.base_salary} onChange={(event) => update("base_salary", event.target.value)} required />
          </FormField>
          <FormField label="Variable pay">
            <input className={inputClassName} type="number" min="0" value={form.variable_pay} onChange={(event) => update("variable_pay", event.target.value)} />
          </FormField>
          <FormField label="Joining bonus">
            <input className={inputClassName} type="number" min="0" value={form.joining_bonus} onChange={(event) => update("joining_bonus", event.target.value)} />
          </FormField>
          <FormField label="Probation period">
            <input className={inputClassName} value={form.probation_period} onChange={(event) => update("probation_period", event.target.value)} />
          </FormField>
          <FormField label="Notice period">
            <input className={inputClassName} value={form.notice_period} onChange={(event) => update("notice_period", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Upload prepared offer letter">
          <input
            className={inputClassName}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(event) => setOfferFile(event.target.files?.[0] || null)}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Optional. Upload PDF, JPG, or PNG if the offer letter is already prepared.
          </p>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={!form.joining_date || (!form.base_salary && !offerFile)}>
            <Send className="h-4 w-4" /> Send offer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function JobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveJob, setArchiveJob] = useState(false);
  const [selectedRankings, setSelectedRankings] = useState([]);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const [offerTarget, setOfferTarget] = useState(null);

  const jobQuery = useQuery(
    ["recruitment", "job", jobId],
    () => recruitmentApi.getJob(jobId),
    { enabled: !!jobId, retry: 1 }
  );
  const departmentsQuery = useQuery(
    ["recruitment", "departments"],
    () => departmentsAPI.listDepartments(),
    { retry: 1 }
  );
  const rankingsQuery = useQuery(
    ["recruitment", "rankings", jobId],
    () => recruitmentApi.getCandidateRankings(jobId),
    { enabled: !!jobId }
  );
  const applicationsQuery = useQuery(
    ["recruitment", "jobApplications", jobId],
    () => recruitmentApi.getJobApplications(jobId),
    { enabled: !!jobId, retry: 1 }
  );
  const interviewersQuery = useQuery(
    ["recruitment", "assignableUsers", "interviewers"],
    () => usersAPI.getAssignableUsers(false, null, "recruitment"),
    { retry: 1 }
  );

  const job = jobQuery.data;
  const departments = Array.isArray(departmentsQuery.data)
    ? departmentsQuery.data
    : departmentsQuery.data?.departments || [];
  const departmentName = departments.find((d) => String(d.id) === String(job?.department_id))?.name;
  const applicationItems = applicationsQuery.data?.items || [];
  const appliedCandidates = applicationItems.map((item) => ({
    ...(item.candidate || {}),
    applications: [{
      id: item.application_id,
      _id: item.application_id,
      job_id: jobId,
      job_title: job?.title,
      tracking_code: item.tracking_code,
    }],
  }));
  const interviewerItems = Array.isArray(interviewersQuery.data?.users)
    ? interviewersQuery.data.users
    : Array.isArray(interviewersQuery.data)
      ? interviewersQuery.data
      : [];

  const invalidate = () => {
    qc.invalidateQueries(["recruitment", "job", jobId]);
    qc.invalidateQueries(["recruitment", "jobApplications", jobId]);
    qc.invalidateQueries(["recruitment", "jobs"]);
    qc.invalidateQueries(["recruitment", "candidates"]);
    qc.invalidateQueries(["recruitment", "dashboard"]);
    qc.invalidateQueries(["recruitment", "rankings", jobId]);
    qc.invalidateQueries(["recruitment", "interviews"]);
    qc.invalidateQueries(["recruitment", "offers"]);
  };

  const statusMutation = useMutation(
    (status) => recruitmentApi.setJobStatus(jobId, status),
    {
      onSuccess: () => {
        toast.success("Job status updated successfully! 🎉");
        invalidate();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to update job status");
      },
    }
  );

  const saveMutation = useMutation(
    (payload) => recruitmentApi.updateJob(jobId, payload),
    {
      onSuccess: () => {
        toast.success("Job updated successfully! 🎉");
        setEditOpen(false);
        invalidate();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to save job");
      },
    }
  );

  const actionMutation = useMutation(
    ({ action }) => recruitmentApi[action](jobId),
    {
      onSuccess: (_, variables) => {
        const messages = {
          archiveJob: "Job archived successfully! 📦",
          duplicateJob: "Job duplicated successfully! 📋",
        };
        toast.success(messages[variables.action] || "Job updated");
        setArchiveJob(false);
        invalidate();
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Action failed");
      },
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
  const shortlistMutation = useMutation(
    (candidateIds) => recruitmentApi.shortlistCandidates(jobId, { candidate_ids: candidateIds, reason: "Reviewed ranking and shortlisted by HR" }),
    {
      onSuccess: () => {
        toast.success("Candidates shortlisted");
        setSelectedRankings([]);
        rankingsQuery.refetch();
      },
      onError: (error) => toast.error(error?.response?.data?.detail || "Failed to shortlist candidates"),
    }
  );
  const candidateActionMutation = useMutation(
    ({ candidateId, action, status }) => {
      if (action === "reject") return recruitmentApi.rejectCandidate(candidateId);
      if (action === "archive") return recruitmentApi.archiveCandidate(candidateId);
      return recruitmentApi.moveCandidate(candidateId, status);
    },
    {
      onSuccess: () => {
        toast.success("Candidate updated");
        invalidate();
      },
      onError: (error) => toast.error(error?.response?.data?.detail || "Candidate action failed"),
    }
  );
  const scheduleInterviewMutation = useMutation(
    async ({ payload, item }) => {
      const response = await recruitmentApi.createInterview(payload);
      const current = candidateStage(item, item?.candidate || {});
      const target = Number(payload.round || 1) > 1 ? "interview_2" : "interview_1";
      const candidateId = idOf(item?.candidate);
      if (candidateId && canMoveCandidate(current, target)) {
        await recruitmentApi.moveCandidate(candidateId, target);
      }
      return response;
    },
    {
      onSuccess: () => {
        toast.success("Interview scheduled");
        setScheduleTarget(null);
        invalidate();
      },
      onError: (error) => toast.error(error?.response?.data?.detail || "Failed to schedule interview"),
    }
  );
  const interviewResultMutation = useMutation(
    async ({ interview, payload }) => {
      const interviewId = idOf(interview);
      const response = await recruitmentApi.recordInterviewDecision(interviewId, { decision: payload.decision, notes: payload.result || payload.feedback });
      try {
        await recruitmentApi.submitInterviewFeedback(interviewId, payload);
      } catch (error) {
        if (error?.response?.status !== 403) throw error;
      }
      return response;
    },
    {
      onSuccess: () => {
        toast.success("Interview result saved");
        setResultTarget(null);
        invalidate();
      },
      onError: (error) => toast.error(error?.response?.data?.detail || "Failed to save interview result"),
    }
  );
  const sendOfferMutation = useMutation(
    async (payload) => {
      const { offer_letter_file: offerLetterFile, ...offerPayload } = payload;
      const created = await recruitmentApi.createOffer(offerPayload);
      const offer = created?.data || created;
      const offerId = idOf(offer);
      await recruitmentApi.approveOffer(offerId, { comment: "Approved from Job Details" });
      if (offerLetterFile) {
        await recruitmentApi.uploadOfferLetter(offerId, offerLetterFile);
      } else {
        await recruitmentApi.previewOffer(offerId);
        await recruitmentApi.generateOfferPdf(offerId);
      }
      return recruitmentApi.sendOffer(offerId);
    },
    {
      onSuccess: () => {
        toast.success("Offer letter sent");
        setOfferTarget(null);
        invalidate();
      },
      onError: (error) => toast.error(error?.response?.data?.detail || "Failed to send offer"),
    }
  );

  const counters = useMemo(() => job?.analytics_counters || {}, [job]);

  if (jobQuery.isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading job details…</p>
        </div>
      </div>
    );
  }

  if (jobQuery.isError || !job) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <Briefcase className="h-12 w-12 text-rose-500" />
        <p className="text-gray-600 dark:text-gray-400">
          {jobQuery.error?.response?.data?.detail || "Could not load this job"}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => jobQuery.refetch()}>Retry</Button>
          <Button variant="secondary" onClick={() => navigate("/hr/recruitment/jobs")}>Back to Jobs</Button>
        </div>
      </div>
    );
  }

  const experience = job.experience_max != null
    ? `${job.experience_min} – ${job.experience_max} yrs`
    : `${job.experience_min} yrs`;
  const salary = job.salary_min != null || job.salary_max != null
    ? `${job.salary_min ?? "—"} – ${job.salary_max ?? "—"}`
    : "Not specified";

  return (
    <div className="space-y-5 p-4 md:p-5">
      {/* ============================================================ */}
      {/* HEADER */}
      {/* ============================================================ */}
      <div>
        <Link
          to="/hr/recruitment/jobs"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Link>
        <PageHeader
          title={job.title}
          description={`${labelize(job.employment_type)} · ${job.location || "Location not set"} · Created ${fmtDate(job.created_at || job.createdAt)}`}
          actions={
            <>
              <JobStatusDropdown
                job={job}
                onChange={(status) => statusMutation.mutate(status)}
                loading={statusMutation.isLoading}
              />
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => actionMutation.mutate({ action: "duplicateJob" })}
                disabled={actionMutation.isLoading}
              >
                <Copy className="h-4 w-4" /> Duplicate
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setArchiveJob(true)}
                disabled={actionMutation.isLoading}
              >
                <Archive className="h-4 w-4" /> Archive
              </Button>
            </>
          }
        />
      </div>

      {/* ============================================================ */}
      {/* ANALYTICS COUNTERS */}
      {/* ============================================================ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Applications", value: counters.total_applications ?? 0, icon: Users, color: "indigo" },
          { label: "Shortlisted", value: counters.shortlisted ?? 0, icon: CheckCircle, color: "emerald" },
          { label: "Interviewing", value: counters.interviewing ?? 0, icon: Calendar, color: "blue" },
          { label: "Offers Sent", value: counters.offers_sent ?? 0, icon: FileText, color: "amber" },
          { label: "Joined", value: counters.joined ?? 0, icon: Users, color: "teal" },
        ].map(({ label, value, icon: Icon, color }) => (
          <CompactMetric key={label} label={label} value={value} icon={Icon} color={color} />
        ))}
      </div>

      {/* ============================================================ */}
      {/* DESCRIPTION + DETAILS */}
      {/* ============================================================ */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <SectionCard icon={FileText} title="Job Description">
            <div className="grid gap-3">
              <ProseBlock title="Description">{job.description}</ProseBlock>
              <ProseBlock title="Responsibilities">{job.responsibilities}</ProseBlock>
              <ProseBlock title="Qualifications">{job.qualifications}</ProseBlock>
              <ProseBlock title="Benefits">{job.benefits}</ProseBlock>
            </div>
          </SectionCard>

          <SectionCard icon={ListChecks} title="Required Skills">
            {Array.isArray(job.required_skills) && job.required_skills.length ? (
              <div className="flex flex-wrap gap-2">
                {job.required_skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex min-h-7 items-center rounded-md border border-indigo-100 bg-indigo-50 px-2.5 text-xs font-medium text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/40 dark:text-indigo-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No required skills listed.</p>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard icon={Briefcase} title="Job Details">
            <div className="grid gap-1">
              <InfoItem icon={MapPin} label="Location" value={job.location || "—"} />
              <InfoItem icon={Briefcase} label="Employment Type" value={labelize(job.employment_type)} />
              <InfoItem icon={Clock} label="Work Mode" value={labelize(job.work_mode)} />
              <InfoItem icon={Target} label="Experience" value={experience} />
              <InfoItem icon={Wallet} label="Salary" value={salary} />
              <InfoItem icon={Building2} label="Department" value={departmentName || "—"} />
              <InfoItem icon={Users} label="Openings" value={job.openings ?? 1} />
              <InfoItem icon={Calendar} label="Deadline" value={job.application_deadline ? fmtDate(job.application_deadline) : "—"} />
              <InfoItem icon={Globe} label="Visibility" value={labelize(job.visibility)} />
              <InfoItem icon={ListChecks} label="Apply Method" value={labelize(job.application_method)} />
            </div>
          </SectionCard>

          <SectionCard icon={Calendar} title="Timeline">
            <div className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
                <span className="text-gray-500 dark:text-gray-400">Created</span>
                <span className="text-right font-medium text-gray-900 dark:text-white">{fmtDateTime(job.created_at || job.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-gray-500 dark:text-gray-400">Last updated</span>
                <span className="text-right font-medium text-gray-900 dark:text-white">{fmtDateTime(job.updated_at || job.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2 last:pb-0">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <StatusBadge status={job.lifecycle_status || job.status} />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CANDIDATE RANKING */}
      {/* ============================================================ */}
      <SectionCard
        icon={Target}
        title="Candidate Ranking"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => extractRequirementsMutation.mutate(jobId)} disabled={extractRequirementsMutation.isLoading}>
              <FileText className="h-4 w-4" /> Extract
            </Button>
            <Button size="sm" variant="secondary" onClick={() => scoreCandidatesMutation.mutate(jobId)} disabled={scoreCandidatesMutation.isLoading}>
              <ArrowUpDown className="h-4 w-4" /> Score
            </Button>
            <Button size="sm" onClick={() => shortlistMutation.mutate(selectedRankings)} disabled={!selectedRankings.length || shortlistMutation.isLoading}>
              <CheckCircle className="h-4 w-4" /> Shortlist
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          AI ranking is decision support only. Human review is required.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedRankings.includes(candidateId)}
                        onChange={(e) =>
                          setSelectedRankings((current) =>
                            e.target.checked ? [...current, candidateId] : current.filter((id) => id !== candidateId)
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 dark:text-white">
                      {row.candidate?.full_name || candidateId}
                    </td>
                    <td className="py-2.5 pr-3">{score.overall_score ?? "—"}</td>
                    <td className="py-2.5 pr-3">{score.required_skills_score ?? "—"}</td>
                    <td className="py-2.5 pr-3">{score.experience_score ?? "—"}</td>
                    <td className="py-2.5 pr-3">{labelize(score.recommendation || "not scored")}</td>
                    <td className="py-2.5 pr-3 text-xs text-rose-600">
                      {(score.missing_required_skills || []).join(", ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rankingsQuery.data?.items?.length ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No ranking results yet. Extract requirements, then score candidates.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard icon={Users} title="Applied Candidates">
        {applicationsQuery.isLoading ? (
          <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>
        ) : applicationsQuery.isError ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-rose-600">{applicationsQuery.error?.response?.data?.detail || "Could not load applied candidates"}</p>
            <Button variant="secondary" size="sm" onClick={() => applicationsQuery.refetch()}>Retry</Button>
          </div>
        ) : applicationItems.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="py-2 pr-3">Candidate</th>
                  <th className="py-2 pr-3">Applied</th>
                  <th className="py-2 pr-3">Stage</th>
                  <th className="py-2 pr-3">Resume</th>
                  <th className="py-2 pr-3">Recruiter</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Interview / Offer</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applicationItems.map((item) => {
                  const candidate = item.candidate || {};
                  const candidateId = idOf(candidate);
                  const resumeHref = resumeFileUrl(item.resume);
                  const currentStage = candidateStage(item, candidate);
                  const interviews = Array.isArray(item.interviews) ? item.interviews : item.interview ? [item.interview] : [];
                  const latestInterview = interviews[interviews.length - 1];
                  const busy = candidateActionMutation.isLoading && candidateActionMutation.variables?.candidateId === candidateId;
                  return (
                    <tr key={item.application_id} className="border-t border-gray-100 align-top dark:border-gray-800">
                      <td className="py-3 pr-3">
                        <Link to="/hr/recruitment/candidates" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{candidate.full_name || candidate.fullName || candidate.email || candidateId}</Link>
                        <p className="text-xs text-gray-500">{candidate.email}</p>
                        <p className="font-mono text-[11px] text-gray-400">{item.tracking_code}</p>
                      </td>
                      <td className="py-3 pr-3">{fmtDate(item.applied_at)}</td>
                      <td className="py-3 pr-3"><StatusBadge status={item.status || candidate.status} /></td>
                      <td className="py-3 pr-3">{resumeHref ? <a className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400" href={resumeHref} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /> Resume</a> : "—"}</td>
                      <td className="py-3 pr-3">{item.recruiter?.name || "Unassigned"}</td>
                      <td className="py-3 pr-3">{item.score?.score?.overall_score ?? "—"}{item.score?.recommendation ? <p className="text-xs text-gray-500">{labelize(item.score.recommendation)}</p> : null}</td>
                      <td className="py-3 pr-3">
                        {interviews.length ? (
                          <div className="space-y-1.5">
                            {interviews.map((interview) => {
                              const result = interview.result || interview.decision;
                              return (
                              <div key={idOf(interview)} className="rounded-md border border-gray-100 px-2 py-1 text-xs dark:border-gray-800">
                                <p className="font-medium text-gray-800 dark:text-gray-200">Round {interview.round} • {labelize(interview.interview_type)}</p>
                                <p className="text-gray-500">{fmtDateTime(interview.schedule_at)} • {labelize(interview.interview_mode)}</p>
                                {result ? <p className="text-gray-500">Result: {labelize(result)}</p> : <p className="text-gray-500">No result recorded yet.</p>}
                                {interview.feedback ? <p className="text-gray-500">Feedback: {interview.feedback}</p> : null}
                                <Button className="mt-1" size="sm" variant="secondary" onClick={() => setResultTarget({ interview, item })}>
                                  <Star className="h-3.5 w-3.5" /> {result ? "Edit result" : "Set result"}
                                </Button>
                              </div>
                              );
                            })}
                          </div>
                        ) : <p>No interview</p>}
                        {!interviews.length ? (
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="secondary"
                            disabled={!candidateId || TERMINAL_CANDIDATE_STATUSES.has(currentStage)}
                            onClick={() => setScheduleTarget(item)}
                          >
                            <Calendar className="h-3.5 w-3.5" /> Schedule interview
                          </Button>
                        ) : null}
                        <p className="text-xs text-gray-500">{item.offer ? `Offer: ${labelize(item.offer.status)}` : "No offer"}</p>
                      </td>
                      <td className="min-w-64 py-3 pr-3">
                        <div className="flex flex-wrap gap-1.5">
                          {CANDIDATE_ACTIONS.filter((action) => ["screening", "shortlisted"].includes(action.status)).map((action) => {
                            const allowed = canMoveCandidate(currentStage, action.status);
                            return (
                              <Button
                                key={action.status}
                                size="sm"
                                variant="secondary"
                                disabled={busy || !candidateId || !allowed}
                                title={allowed ? action.label : `Cannot move from ${labelize(currentStage || "unknown")} to ${action.label}`}
                                onClick={() => candidateActionMutation.mutate({ candidateId, status: action.status })}
                              >
                                {action.label}
                              </Button>
                            );
                          })}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!candidateId || TERMINAL_CANDIDATE_STATUSES.has(currentStage)}
                            onClick={() => setScheduleTarget(item)}
                          >
                            <Calendar className="h-3.5 w-3.5" /> Interview
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!latestInterview}
                            title={latestInterview ? "Record latest interview result" : "Schedule an interview before recording a result"}
                            onClick={() => setResultTarget({ interview: latestInterview, item })}
                          >
                            <Star className="h-3.5 w-3.5" /> Result
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!candidateId || !canMoveCandidate(currentStage, "offer_sent")}
                            onClick={() => setOfferTarget(item)}
                          >
                            <Send className="h-3.5 w-3.5" /> Offer
                          </Button>
                          {CANDIDATE_ACTIONS.filter((action) => ["joined", "withdrawn"].includes(action.status)).map((action) => {
                            const allowed = canMoveCandidate(currentStage, action.status);
                            return (
                              <Button
                                key={action.status}
                                size="sm"
                                variant="secondary"
                                disabled={busy || !candidateId || !allowed}
                                title={allowed ? action.label : `Cannot move from ${labelize(currentStage || "unknown")} to ${action.label}`}
                                onClick={() => candidateActionMutation.mutate({ candidateId, status: action.status })}
                              >
                                {action.label}
                              </Button>
                            );
                          })}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy || !candidateId || !canMoveCandidate(currentStage, "rejected")}
                            title={canMoveCandidate(currentStage, "rejected") ? "Reject candidate" : `Cannot reject from ${labelize(currentStage || "unknown")}`}
                            onClick={() => candidateActionMutation.mutate({ candidateId, action: "reject" })}
                          >
                            <UserX className="h-3.5 w-3.5" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy || !candidateId || !canArchiveCandidate(currentStage)}
                            title={canArchiveCandidate(currentStage) ? "Archive candidate" : `Cannot archive from ${labelize(currentStage || "unknown")}`}
                            onClick={() => candidateActionMutation.mutate({ candidateId, action: "archive" })}
                          >
                            Archive
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No candidates have applied for this job yet.</p>
        )}
      </SectionCard>

      {/* ============================================================ */}
      {/* DIALOGS */}
      {/* ============================================================ */}
      <JobDialog
        open={editOpen}
        job={job}
        onClose={() => setEditOpen(false)}
        onSubmit={(payload) => saveMutation.mutate(payload)}
        loading={saveMutation.isLoading}
        departments={departments}
      />

      <InterviewDialog
        open={!!scheduleTarget}
        interview={scheduleTarget ? {
          candidate_id: idOf(scheduleTarget.candidate),
          application_id: scheduleTarget.application_id,
          job_id: jobId,
          round: Math.max(1, (Array.isArray(scheduleTarget.interviews) ? scheduleTarget.interviews.length : scheduleTarget.interview ? 1 : 0) + 1),
          interview_type: "technical",
          interview_mode: "video",
          mode: "online",
          schedule_at: "",
          duration_minutes: 60,
        } : null}
        onClose={() => setScheduleTarget(null)}
        onSubmit={(payload) => scheduleInterviewMutation.mutate({ payload, item: scheduleTarget })}
        loading={scheduleInterviewMutation.isLoading}
        candidates={appliedCandidates}
        jobs={job ? [job] : []}
        interviewers={interviewerItems}
      />

      <InterviewResultDialog
        open={!!resultTarget}
        interview={resultTarget?.interview}
        onClose={() => setResultTarget(null)}
        onSubmit={(payload) => interviewResultMutation.mutate({ interview: resultTarget?.interview, payload })}
        loading={interviewResultMutation.isLoading}
        onScheduleNextRound={() => {
          if (!resultTarget?.item) return;
          setScheduleTarget(resultTarget.item);
          setResultTarget(null);
        }}
      />

      <OfferPrepDialog
        open={!!offerTarget}
        item={offerTarget}
        job={job}
        onClose={() => setOfferTarget(null)}
        onSubmit={(payload) => sendOfferMutation.mutate(payload)}
        loading={sendOfferMutation.isLoading}
      />

      <ConfirmActionDialog
        open={archiveJob}
        title="Archive job?"
        description={`Archive "${job.title}"? It will be removed from active hiring lists and can be restored later.`}
        confirmLabel="Archive job"
        onClose={() => setArchiveJob(false)}
        onConfirm={() => actionMutation.mutate({ action: "archiveJob" })}
        loading={actionMutation.isLoading}
      />
    </div>
  );
}
