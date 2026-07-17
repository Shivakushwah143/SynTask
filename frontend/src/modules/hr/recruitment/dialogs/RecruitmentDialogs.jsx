import { useState } from "react";
import { Button, FormField, Modal, inputClassName } from "../../../../components/ui";
import { INTERVIEW_DECISIONS } from "../constants";
import { JobForm } from "../forms/JobForm";
import { InterviewForm } from "../forms/InterviewForm";

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
  return (
    <Modal isOpen={open} onClose={onClose} title="Assign recruiter" footer={
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" loading={loading} onClick={() => onSubmit({ recruiter_id: recruiterId })}>Assign</Button>
      </div>
    }>
      <FormField label="Recruiter ID" required>
        <input className={inputClassName} value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)} />
      </FormField>
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

