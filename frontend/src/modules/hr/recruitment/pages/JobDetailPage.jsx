import { useMemo, useState } from "react";
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
  FileText,
  Globe,
  ListChecks,
  MapPin,
  Pencil,
  Target,
  Users,
  Wallet,
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { departmentsAPI } from "../../../../api/departments";
import { Button, PageHeader } from "../../../../components/ui";
import { JobDialog, ConfirmActionDialog } from "../dialogs/RecruitmentDialogs";
import { JobStatusDropdown } from "../components/JobStatusDropdown";
import { StatusBadge } from "../components/StatusBadge";
import { fmtDate, fmtDateTime, idOf, labelize } from "../utils/data";

// ============================================================
// SMALL PRESENTATION HELPERS
// ============================================================
const InfoItem = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-gray-700 dark:bg-gray-800/60">
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
    </div>
    <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
  </div>
);

const SectionCard = ({ icon: Icon, title, children, action }) => (
  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
      <div className="flex items-center gap-2.5">
        <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const ProseBlock = ({ title, children }) => {
  if (!children) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  );
};

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

  const job = jobQuery.data;
  const departments = Array.isArray(departmentsQuery.data)
    ? departmentsQuery.data
    : departmentsQuery.data?.departments || [];
  const departmentName = departments.find((d) => String(d.id) === String(job?.department_id))?.name;

  const invalidate = () => {
    qc.invalidateQueries(["recruitment", "job", jobId]);
    qc.invalidateQueries(["recruitment", "jobs"]);
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
        ].map(({ label, value, icon: Icon, color }) => {
          const colors = {
            indigo: "from-indigo-500 to-purple-500",
            emerald: "from-emerald-500 to-teal-500",
            amber: "from-amber-500 to-orange-500",
            blue: "from-blue-500 to-cyan-500",
            teal: "from-teal-500 to-cyan-500",
          };
          return (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* DESCRIPTION + DETAILS */}
      {/* ============================================================ */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard icon={FileText} title="Job Description">
            <div className="space-y-4">
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
                    className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
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

        <div className="space-y-5">
          <SectionCard icon={Briefcase} title="Job Details">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Created</span>
                <span className="font-medium text-gray-900 dark:text-white">{fmtDateTime(job.created_at || job.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Last updated</span>
                <span className="font-medium text-gray-900 dark:text-white">{fmtDateTime(job.updated_at || job.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between">
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