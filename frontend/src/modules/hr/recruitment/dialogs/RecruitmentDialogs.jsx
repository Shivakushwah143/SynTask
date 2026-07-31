import { useEffect, useState } from "react";
import { useQuery } from "react-query";
import { Check, UserCheck } from "lucide-react";
import { Button, EmptyState, FormField, Modal, SkeletonCard, inputClassName } from "../../../../components/ui";
import { recruitmentApi } from "../../../../api/recruitment";
import { usersAPI } from "../../../../api/users";
import { INTERVIEW_DECISIONS } from "../constants";
import { JobForm } from "../forms/JobForm";
import { InterviewForm } from "../forms/InterviewForm";

const userLabel = (user) =>
  user?.full_name ||
  user?.fullName ||
  user?.name ||
  [user?.first_name || user?.firstName, user?.last_name || user?.lastName].filter(Boolean).join(" ") ||
  user?.email ||
  `User ${user?.id || user?._id || ""}`;

export function JobDialog({ open, job, onClose, onSubmit, loading, departments }) {
  return (
    <Modal isOpen={open} onClose={onClose} title={job ? "Edit job" : "Create job"} size="xl">
      <JobForm initialValue={job} onSubmit={onSubmit} loading={loading} departments={departments} />
    </Modal>
  );
}

export function InterviewDialog({ open, interview, onClose, onSubmit, loading, candidates = [], jobs = [], interviewers = [] }) {
  return (
    <Modal isOpen={open} onClose={onClose} title={interview ? "Edit interview" : "Schedule interview"} size="xl">
      <InterviewForm initialValue={interview} onSubmit={onSubmit} loading={loading} candidates={candidates} jobs={jobs} interviewers={interviewers} />
    </Modal>
  );
}

export function ConfirmActionDialog({ open, title, description, confirmLabel = "Confirm", onClose, onConfirm, loading }) {
  return (
    <Modal isOpen={open} onClose={onClose} title={title} description={description} footer={
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    }>
      <p className="text-sm text-text-muted">This action will update backend state and refresh the current view.</p>
    </Modal>
  );
}

export function AssignRecruiterDialog({ open, onClose, onSubmit, loading }) {
  const [recruiterId, setRecruiterId] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsersLoading(true);
    setRecruiterId("");
    usersAPI
      .getAssignableUsers()
      .then((data) => {
        if (!cancelled) setUsers(Array.isArray(data?.users) ? data.users : []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const idOf = (user) => user?.id || user?._id;

  return (
    <Modal isOpen={open} onClose={onClose} title="Assign recruiter" footer={
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" loading={loading} disabled={!recruiterId} onClick={() => onSubmit({ recruiter_id: recruiterId })}>Assign</Button>
      </div>
    }>
      <FormField label="Recruiter" required>
        <select
          className={inputClassName}
          value={recruiterId}
          onChange={(e) => setRecruiterId(e.target.value)}
        >
          <option value="">{usersLoading ? "Loading users..." : "Select a recruiter"}</option>
          {users.map((user) => (
            <option key={idOf(user)} value={idOf(user)}>
              {userLabel(user)}
              {user?.role ? ` (${user.role})` : ""}
            </option>
          ))}
        </select>
      </FormField>
      {users.length === 0 && !usersLoading && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No assignable users found for your company.</p>
      )}
    </Modal>
  );
}

export function AssignJobDialog({ open, onClose, onSubmit, loading, candidate }) {
  const [jobId, setJobId] = useState("");
  const [hire, setHire] = useState(true);
  const { data, isLoading } = useQuery(
    ["recruitment", "jobs", "assign-dialog"],
    () => recruitmentApi.getJobs({ page_size: 100 }),
    { enabled: open, retry: 1 }
  );
  const jobs = data?.data?.items || data?.data || [];

  useEffect(() => {
    if (open) {
      setJobId("");
      setHire(true);
    }
  }, [open]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Assign job & hire"
      description="Link a job and move the candidate to the Employees page."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            loading={loading}
            disabled={!jobId}
            onClick={() => onSubmit({ job_id: jobId, hire })}
          >
            <Check className="h-4 w-4 mr-2" /> {hire ? "Hire" : "Assign"} Job
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
          <p className="font-medium text-gray-900 dark:text-white">{candidate?.full_name || candidate?.fullName || "Candidate"}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{candidate?.email}</p>
        </div>

        <FormField label="Select Job" required>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No jobs found"
              description="Create a job in the Jobs section first, then assign it here."
            />
          ) : (
            <select
              className={inputClassName}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value="">Select a job...</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} — {job.location || "Anywhere"}
                  {job.lifecycle_status && job.lifecycle_status !== "published" && job.lifecycle_status !== "active"
                    ? ` (${job.lifecycle_status})`
                    : ""}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <input
            type="checkbox"
            checked={hire}
            onChange={(e) => setHire(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Move to Employees (Hire)
            </span>
            <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">
              The candidate is hired, moved out of the candidates list, and appears on the Employees page.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

export function FeedbackDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ rating: 3, comments: "", strengths: "", weaknesses: "" });
  return (
    <Modal isOpen={open} onClose={onClose} title="Interview feedback" footer={
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" loading={loading} onClick={() => onSubmit(form)}>Submit feedback</Button>
      </div>
    }>
      <div className="space-y-4">
        <FormField label="Rating"><input className={inputClassName} type="number" min="1" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} /></FormField>
        <FormField label="Comments"><textarea className={`${inputClassName} min-h-24`} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></FormField>
      </div>
    </Modal>
  );
}

export function DecisionDialog({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ decision: "hold", notes: "" });
  return (
    <Modal isOpen={open} onClose={onClose} title="Record decision" footer={
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" loading={loading} onClick={() => onSubmit(form)}>Record</Button>
      </div>
    }>
      <div className="space-y-4">
        <FormField label="Decision"><select className={inputClassName} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>{INTERVIEW_DECISIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></FormField>
        <FormField label="Notes"><textarea className={`${inputClassName} min-h-24`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
      </div>
    </Modal>
  );
}

