import { useMemo, useState } from "react";

import { Button, FormField, inputClassName } from "../../../../components/ui";

const INTERVIEW_TYPES = ["technical", "hr", "managerial", "culture", "final"];
const INTERVIEW_MODES = ["video", "phone", "onsite"];
const ROUNDS = [
  { value: 1, label: "Interview 1" },
  { value: 2, label: "Interview 2" },
  { value: 3, label: "Interview 3" },
  { value: 4, label: "Final round" },
];

const idOf = (item) => item?.id || item?._id;
const labelize = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const userName = (user) =>
  user?.full_name ||
  user?.fullName ||
  user?.name ||
  [user?.first_name || user?.firstName, user?.last_name || user?.lastName].filter(Boolean).join(" ") ||
  user?.email ||
  "User";

const candidateName = (candidate) =>
  candidate?.full_name ||
  candidate?.fullName ||
  candidate?.name ||
  candidate?.email ||
  "Candidate";

const candidateApplications = (candidate) =>
  Array.isArray(candidate?.applications) ? candidate.applications : [];

export function InterviewForm({ initialValue, onSubmit, loading, candidates = [], jobs = [], interviewers = [] }) {
  const [form, setForm] = useState({
    candidate_id: initialValue?.candidate_id || "",
    application_id: initialValue?.application_id || "",
    job_id: initialValue?.job_id || "",
    round: initialValue?.round || 1,
    interview_type: initialValue?.interview_type || "technical",
    interview_mode: initialValue?.interview_mode || "video",
    interviewer_ids: Array.isArray(initialValue?.interviewer_ids) ? initialValue.interviewer_ids : [],
    schedule_at: initialValue?.schedule_at || initialValue?.scheduled_at || "",
    duration_minutes: initialValue?.duration_minutes || initialValue?.duration || 60,
    meeting_link: initialValue?.meeting_link || "",
    location: initialValue?.location || "",
    notes: initialValue?.notes || "",
  });
  const [errors, setErrors] = useState({});

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => idOf(candidate) === form.candidate_id),
    [candidates, form.candidate_id]
  );
  const applications = candidateApplications(selectedCandidate);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleInterviewer = (userId) => {
    setForm((current) => ({
      ...current,
      interviewer_ids: current.interviewer_ids.includes(userId)
        ? current.interviewer_ids.filter((id) => id !== userId)
        : [...current.interviewer_ids, userId],
    }));
  };
  const selectCandidate = (candidateId) => {
    const candidate = candidates.find((item) => idOf(item) === candidateId);
    const firstApplication = candidateApplications(candidate)[0];
    setForm((current) => ({
      ...current,
      candidate_id: candidateId,
      application_id: firstApplication ? idOf(firstApplication) : "",
      job_id: firstApplication?.job_id || current.job_id,
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.candidate_id) nextErrors.candidate_id = "Select candidate";
    if (!form.job_id) nextErrors.job_id = "Select job";
    if (!form.interviewer_ids.length) nextErrors.interviewer_ids = "Select at least one interviewer";
    if (!form.schedule_at) nextErrors.schedule_at = "Schedule time required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit({
      ...form,
      round: Number(form.round || 1),
      interviewer_ids: form.interviewer_ids,
      duration_minutes: Number(form.duration_minutes || 60),
    });
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Candidate" error={errors.candidate_id}>
          <select className={inputClassName} value={form.candidate_id} onChange={(event) => selectCandidate(event.target.value)}>
            <option value="">Select candidate</option>
            {candidates.map((candidate) => (
              <option key={idOf(candidate)} value={idOf(candidate)}>
                {candidateName(candidate)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Job" error={errors.job_id}>
          <select className={inputClassName} value={form.job_id} onChange={(event) => setField("job_id", event.target.value)}>
            <option value="">Select job</option>
            {jobs.map((job) => (
              <option key={idOf(job)} value={idOf(job)}>
                {job.title || job.slug || "Job"}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Application">
          <select className={inputClassName} value={form.application_id} onChange={(event) => setField("application_id", event.target.value)}>
            <option value="">No linked application</option>
            {applications.map((application) => (
              <option key={idOf(application)} value={idOf(application)}>
                {application.job_title || application.job?.title || application.tracking_code || idOf(application)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Round">
          <select className={inputClassName} value={form.round} onChange={(event) => setField("round", event.target.value)}>
            {ROUNDS.map((round) => (
              <option key={round.value} value={round.value}>{round.label}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Interview type">
          <select className={inputClassName} value={form.interview_type} onChange={(event) => setField("interview_type", event.target.value)}>
            {INTERVIEW_TYPES.map((type) => (
              <option key={type} value={type}>{labelize(type)}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Mode">
          <select className={inputClassName} value={form.interview_mode} onChange={(event) => setField("interview_mode", event.target.value)}>
            {INTERVIEW_MODES.map((mode) => (
              <option key={mode} value={mode}>{labelize(mode)}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Scheduled at" error={errors.schedule_at}>
          <input className={inputClassName} type="datetime-local" value={form.schedule_at} onChange={(event) => setField("schedule_at", event.target.value)} />
        </FormField>

        <FormField label="Duration minutes">
          <input className={inputClassName} type="number" min="15" max="480" step="15" value={form.duration_minutes} onChange={(event) => setField("duration_minutes", event.target.value)} />
        </FormField>

        <FormField label="Meeting link">
          <input className={inputClassName} value={form.meeting_link} onChange={(event) => setField("meeting_link", event.target.value)} />
        </FormField>

        <FormField label="Location">
          <input className={inputClassName} value={form.location} onChange={(event) => setField("location", event.target.value)} />
        </FormField>
      </div>

      <FormField label="Interviewers" error={errors.interviewer_ids}>
        <div className="grid max-h-44 gap-2 overflow-y-auto rounded-2xl border border-surface-border bg-surface-muted p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-2">
          {interviewers.length ? interviewers.map((user) => {
            const userId = idOf(user);
            return (
              <label key={userId} className="flex min-w-0 items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-text-primary dark:bg-gray-900">
                <input type="checkbox" checked={form.interviewer_ids.includes(userId)} onChange={() => toggleInterviewer(userId)} />
                <span className="truncate">{userName(user)}</span>
              </label>
            );
          }) : <p className="text-sm text-text-muted">No interviewers available.</p>}
        </div>
      </FormField>

      <FormField label="Notes">
        <textarea className={`${inputClassName} min-h-24`} value={form.notes} onChange={(event) => setField("notes", event.target.value)} />
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" loading={loading}>Save interview</Button>
      </div>
    </form>
  );
}
