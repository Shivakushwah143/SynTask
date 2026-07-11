import { useMemo, useState } from "react";
import { Button, FormField, inputClassName } from "../../../../components/ui";
import { EMPLOYMENT_TYPES, WORK_MODES } from "../constants";

const initialState = {
  title: "",
  department_id: "",
  location: "",
  employment_type: "full_time",
  work_mode: "onsite",
  experience_min: 0,
  experience_max: 0,
  salary_min: "",
  salary_max: "",
  required_skills: "",
  description: "",
};

export function JobForm({ initialValue, onSubmit, loading }) {
  const seed = useMemo(() => ({
    ...initialState,
    ...initialValue,
    required_skills: Array.isArray(initialValue?.required_skills) ? initialValue.required_skills.join(", ") : (initialValue?.required_skills || ""),
  }), [initialValue]);
  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState({});

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = "Job title is required";
    if (!form.description.trim()) nextErrors.description = "Description is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit({
      ...form,
      experience_min: Number(form.experience_min || 0),
      experience_max: Number(form.experience_max || 0),
      salary_min: form.salary_min === "" ? null : Number(form.salary_min),
      salary_max: form.salary_max === "" ? null : Number(form.salary_max),
      required_skills: String(form.required_skills || "").split(",").map((skill) => skill.trim()).filter(Boolean),
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <FormField label="Job title" error={errors.title} required>
        <input className={inputClassName} value={form.title} onChange={(e) => setField("title", e.target.value)} />
      </FormField>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Department ID">
          <input className={inputClassName} value={form.department_id || ""} onChange={(e) => setField("department_id", e.target.value)} />
        </FormField>
        <FormField label="Location">
          <input className={inputClassName} value={form.location || ""} onChange={(e) => setField("location", e.target.value)} />
        </FormField>
        <FormField label="Employment type">
          <select className={inputClassName} value={form.employment_type} onChange={(e) => setField("employment_type", e.target.value)}>
            {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
          </select>
        </FormField>
        <FormField label="Work mode">
          <select className={inputClassName} value={form.work_mode} onChange={(e) => setField("work_mode", e.target.value)}>
            {WORK_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </FormField>
        <FormField label="Experience min">
          <input className={inputClassName} type="number" value={form.experience_min} onChange={(e) => setField("experience_min", e.target.value)} />
        </FormField>
        <FormField label="Experience max">
          <input className={inputClassName} type="number" value={form.experience_max} onChange={(e) => setField("experience_max", e.target.value)} />
        </FormField>
        <FormField label="Salary min">
          <input className={inputClassName} type="number" value={form.salary_min || ""} onChange={(e) => setField("salary_min", e.target.value)} />
        </FormField>
        <FormField label="Salary max">
          <input className={inputClassName} type="number" value={form.salary_max || ""} onChange={(e) => setField("salary_max", e.target.value)} />
        </FormField>
      </div>
      <FormField label="Required skills" helperText="Comma separated">
        <input className={inputClassName} value={form.required_skills || ""} onChange={(e) => setField("required_skills", e.target.value)} />
      </FormField>
      <FormField label="Description" error={errors.description} required>
        <textarea className={`${inputClassName} min-h-32`} value={form.description || ""} onChange={(e) => setField("description", e.target.value)} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>Save job</Button>
      </div>
    </form>
  );
}

