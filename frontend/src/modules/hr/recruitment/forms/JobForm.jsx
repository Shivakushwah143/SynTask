import { useMemo, useState } from "react";
import { Button, FormField, inputClassName } from "../../../../components/ui";
import { EMPLOYMENT_TYPES, WORK_MODES } from "../constants";

const SKILL_OPTIONS = [
  "Video Editor",
  "Videographer",
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "UI/UX Designer",
  "Graphic Designer",
  "Motion Designer",
  "Content Writer",
  "HR Specialist",
  "Recruiter",
  "Digital Marketer",
  "Sales Executive",
  "Project Manager",
];

const initialState = {
  title: "",
  department_id: "",
  location: "",
  employment_type: "full_time",
  work_mode: "onsite",
  openings: 1,
  experience_min: 0,
  experience_max: 0,
  salary_min: "",
  salary_max: "",
  required_skills: [],
  skill_picker: "",
  description: "",
};

export function JobForm({ initialValue, onSubmit, loading, departments = [] }) {
  const seed = useMemo(() => ({
    ...initialState,
    ...initialValue,
    required_skills: Array.isArray(initialValue?.required_skills)
      ? initialValue.required_skills
      : String(initialValue?.required_skills || "")
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
  }), [initialValue]);
  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState({});

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedSkills = Array.isArray(form.required_skills) ? form.required_skills : [];
  const departmentName = departments.find((department) => String(department.id) === String(form.department_id))?.name || "";

  const addSkill = (skill) => {
    const nextSkill = String(skill || "").trim();
    if (!nextSkill) return;
    setForm((current) => {
      const currentSkills = Array.isArray(current.required_skills) ? current.required_skills : [];
      if (currentSkills.includes(nextSkill)) return current;
      return {
        ...current,
        required_skills: [...currentSkills, nextSkill],
        skill_picker: "",
      };
    });
  };

  const removeSkill = (skill) => {
    setForm((current) => ({
      ...current,
      required_skills: (Array.isArray(current.required_skills) ? current.required_skills : []).filter((item) => item !== skill),
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = "Job title is required";
    if (!form.department_id) nextErrors.department_id = "Department is required";
    if (!form.location.trim()) nextErrors.location = "Location is required";
    if (!form.description.trim()) nextErrors.description = "Description is required";
    else if (form.description.trim().length < 10) nextErrors.description = "Description must be at least 10 characters";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit({
      title: form.title.trim(),
      department_id: form.department_id,
      location: form.location.trim(),
      employment_type: form.employment_type,
      work_mode: form.work_mode,
      openings: Math.max(1, Number(form.openings || 1)),
      experience_min: Number(form.experience_min || 0),
      experience_max: Number(form.experience_max || 0),
      salary_min: form.salary_min === "" ? null : Number(form.salary_min),
      salary_max: form.salary_max === "" ? null : Number(form.salary_max),
      required_skills: Array.isArray(form.required_skills) ? form.required_skills : [],
      description: form.description.trim(),
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <FormField label="Job title" error={errors.title} required>
        <input className={inputClassName} value={form.title} onChange={(e) => setField("title", e.target.value)} />
      </FormField>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Department" error={errors.department_id} required>
          <select className={inputClassName} value={form.department_id || ""} onChange={(e) => setField("department_id", e.target.value)}>
            <option value="">Select department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Location" error={errors.location}>
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
        <FormField label="Openings">
          <input className={inputClassName} type="number" min="1" value={form.openings} onChange={(e) => setField("openings", e.target.value)} />
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
      <FormField label="Required skills" helperText="Pick one or more skills from the dropdown">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className={inputClassName}
              value={form.skill_picker || ""}
              onChange={(e) => {
                const value = e.target.value
                setField("skill_picker", value)
                if (value) addSkill(value)
              }}
            >
              <option value="">Select a skill</option>
              {SKILL_OPTIONS.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={() => setField("required_skills", [])}>
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedSkills.length ? selectedSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => removeSkill(skill)}
                className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {skill} <span className="ml-1">×</span>
              </button>
            )) : (
              <p className="text-xs text-text-muted">No skills selected yet.</p>
            )}
          </div>
        </div>
      </FormField>
      <FormField label="Description" error={errors.description} required>
        <textarea className={`${inputClassName} min-h-32`} value={form.description || ""} onChange={(e) => setField("description", e.target.value)} placeholder="Minimum 10 characters..." />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>Save job</Button>
      </div>
    </form>
  );
}

