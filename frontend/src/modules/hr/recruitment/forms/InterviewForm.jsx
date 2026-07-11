import { useState } from "react";
import { Button, FormField, inputClassName } from "../../../../components/ui";

export function InterviewForm({ initialValue, onSubmit, loading }) {
  const [form, setForm] = useState({
    candidate_id: initialValue?.candidate_id || "",
    application_id: initialValue?.application_id || "",
    job_id: initialValue?.job_id || "",
    round: initialValue?.round || "Interview 1",
    interview_type: initialValue?.interview_type || "technical",
    interview_mode: initialValue?.interview_mode || "video",
    interviewer_ids: Array.isArray(initialValue?.interviewer_ids) ? initialValue.interviewer_ids.join(", ") : "",
    scheduled_at: initialValue?.scheduled_at || initialValue?.schedule_at || "",
    duration: initialValue?.duration || 60,
    meeting_link: initialValue?.meeting_link || "",
    location: initialValue?.location || "",
    notes: initialValue?.notes || "",
  });
  const [errors, setErrors] = useState({});
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.candidate_id) nextErrors.candidate_id = "Candidate ID required";
    if (!form.job_id) nextErrors.job_id = "Job ID required";
    if (!form.scheduled_at) nextErrors.scheduled_at = "Schedule time required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit({
      ...form,
      interviewer_ids: form.interviewer_ids.split(",").map((id) => id.trim()).filter(Boolean),
      duration: Number(form.duration || 60),
    });
  };
  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        {["candidate_id", "application_id", "job_id", "round", "interview_type", "interview_mode"].map((key) => (
          <FormField key={key} label={key.replace(/_/g, " ")} error={errors[key]}>
            <input className={inputClassName} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
          </FormField>
        ))}
        <FormField label="Interviewer IDs" helperText="Comma separated">
          <input className={inputClassName} value={form.interviewer_ids} onChange={(e) => setField("interviewer_ids", e.target.value)} />
        </FormField>
        <FormField label="Scheduled at" error={errors.scheduled_at}>
          <input className={inputClassName} type="datetime-local" value={form.scheduled_at} onChange={(e) => setField("scheduled_at", e.target.value)} />
        </FormField>
        <FormField label="Duration minutes">
          <input className={inputClassName} type="number" value={form.duration} onChange={(e) => setField("duration", e.target.value)} />
        </FormField>
        <FormField label="Meeting link">
          <input className={inputClassName} value={form.meeting_link} onChange={(e) => setField("meeting_link", e.target.value)} />
        </FormField>
      </div>
      <FormField label="Notes">
        <textarea className={`${inputClassName} min-h-24`} value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
      </FormField>
      <div className="flex justify-end"><Button type="submit" loading={loading}>Save interview</Button></div>
    </form>
  );
}

