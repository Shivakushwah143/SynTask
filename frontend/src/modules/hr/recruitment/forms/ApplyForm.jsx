import { useRef, useState } from "react";
import { Button, FormField, PhoneInput, inputClassName } from "../../../../components/ui";

export function ApplyForm({ jobId, onSubmit, loading, error }) {
  const formRef = useRef(null);
  const [form, setForm] = useState({ full_name: "", email: "", date_of_birth: "", phone: "", experience_years: 0, skills: "", resume: null });
  const [errors, setErrors] = useState({});
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!form.full_name.trim()) next.full_name = "Name required";
    if (!form.email.trim()) next.email = "Email required";
    if (!form.date_of_birth) next.date_of_birth = "Date of birth required";
    if (!form.resume) next.resume = "Resume required";
    setErrors(next);
    if (Object.keys(next).length) return;
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== null && value !== undefined) data.append(key, value);
    });
    onSubmit(jobId, data);
  };
  return (
    <form ref={formRef} className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Full name" error={errors.full_name} required><input className={inputClassName} value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} /></FormField>
        <FormField label="Email" error={errors.email} required><input className={inputClassName} type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} /></FormField>
        <FormField label="Date of birth" error={errors.date_of_birth} required><input className={inputClassName} type="date" value={form.date_of_birth} onChange={(e) => setField("date_of_birth", e.target.value)} /></FormField>
        <FormField label="Phone"><PhoneInput className={inputClassName} value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="Enter mobile number" /></FormField>
        <FormField label="Experience years"><input className={inputClassName} type="number" value={form.experience_years} onChange={(e) => setField("experience_years", e.target.value)} /></FormField>
      </div>
      <FormField label="Skills" helperText="Comma separated"><input className={inputClassName} value={form.skills} onChange={(e) => setField("skills", e.target.value)} /></FormField>
      <FormField label="Resume" error={errors.resume} required><input className={inputClassName} type="file" accept=".pdf,.doc,.docx" onChange={(e) => setField("resume", e.target.files?.[0] || null)} /></FormField>
      {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
      <Button type="button" loading={loading} disabled={!jobId} onClick={() => formRef.current?.requestSubmit()}>Submit application</Button>
    </form>
  );
}

