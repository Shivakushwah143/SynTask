import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { Search, Plus, Upload, User, Phone, Mail, Building2, ChevronDown, Briefcase, Check } from "lucide-react";
import { recruitmentApi } from "../../../api/recruitment";
import { departmentsAPI } from "../../../api/departments";
import { Button, Modal, Badge, EmptyState, SkeletonCard, FormField } from "../../../components/ui";
import { inputClassName } from "../../../components/ui/FormField";
import { EMPLOYMENT_TYPES, WORK_MODES } from "../../../modules/hr/recruitment/constants";

// Candidate Sources
const CANDIDATE_SOURCES = [
  "Career Page",
  "Referral", 
  "Walk-in",
  "LinkedIn",
  "Naukri",
  "Indeed",
  "Recruiter",
  "Campus Drive",
  "Bulk Import",
  "Manual Entry"
];

// ============================================================
// CANDIDATE POPUP COMPONENT
// ============================================================
const CandidatePopup = ({ isOpen, onClose, onSave, initialData = null }) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    source: initialData?.source || "",
    referralBy: initialData?.referralBy || "",
    currentCompany: initialData?.currentCompany || "",
    experience: initialData?.experience || "",
    skills: initialData?.skills || "",
    resume: initialData?.resume || null
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, resume: file }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.source) newErrors.source = "Source is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    try {
      const submitData = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== "") {
          submitData.append(key, formData[key]);
        }
      });
      
      await onSave(submitData);
      onClose();
      setFormData({
        name: "", email: "", phone: "", source: "", referralBy: "",
        currentCompany: "", experience: "", skills: "", resume: null
      });
    } catch (error) {
      console.error("Error saving candidate:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Candidate" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full Name *
            </label>
            <input
              className={inputClassName}
              value={formData.name}
              onChange={handleChange("name")}
              placeholder="John Doe"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email *
            </label>
            <input
              type="email"
              className={inputClassName}
              value={formData.email}
              onChange={handleChange("email")}
              placeholder="john@example.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone Number
            </label>
            <input
              className={inputClassName}
              value={formData.phone}
              onChange={handleChange("phone")}
              placeholder="+91 9876543210"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source *
            </label>
            <div className="relative">
              <select
                value={formData.source}
                onChange={handleChange("source")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select Source</option>
                {CANDIDATE_SOURCES.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Referral By
            </label>
            <input
              className={inputClassName}
              value={formData.referralBy}
              onChange={handleChange("referralBy")}
              placeholder="Name of referrer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Company
            </label>
            <input
              className={inputClassName}
              value={formData.currentCompany}
              onChange={handleChange("currentCompany")}
              placeholder="Company name"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Experience (Years)
            </label>
            <input
              className={inputClassName}
              value={formData.experience}
              onChange={handleChange("experience")}
              placeholder="2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Skills
            </label>
            <input
              className={inputClassName}
              value={formData.skills}
              onChange={handleChange("skills")}
              placeholder="JavaScript, React, Node.js"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Resume
          </label>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              id="resume-upload"
            />
            <label htmlFor="resume-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formData.resume ? formData.resume.name : "Click to upload resume (PDF, DOC, DOCX)"}
              </p>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isSubmitting ? "Saving..." : "Save Candidate"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================
// ASSIGN JOB POPUP COMPONENT
// ============================================================
const AssignJobPopup = ({ isOpen, onClose, candidate, onAssigned }) => {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState("select"); // "select" | "create"
  const [jobSearch, setJobSearch] = useState("");
  const [hire, setHire] = useState(true);
  const queryClient = useQueryClient();

  // Fetch ALL non-archived jobs so existing drafts/pending jobs are visible
  const { data: jobsData, isLoading: jobsLoading } = useQuery(
    ["recruitment", "jobs", "assign"],
    () => recruitmentApi.getJobs({ page_size: 100 }),
    { enabled: isOpen, retry: 1 }
  );

  const allJobs = jobsData?.data?.items || jobsData?.data || [];

  // Client-side search filter
  const jobs = allJobs.filter((job) => {
    if (!jobSearch.trim()) return true;
    const q = jobSearch.toLowerCase();
    return (
      (job.title || "").toLowerCase().includes(q) ||
      (job.location || "").toLowerCase().includes(q) ||
      (job.department_name || job.department?.name || "").toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedJobId) return;
    setIsSubmitting(true);
    try {
      const response = await recruitmentApi.assignJobToCandidate(candidate.id, { job_id: selectedJobId, hire });
      const data = response?.data;
      const jobTitle = data?.job_title || allJobs.find((j) => j.id === selectedJobId)?.title || "the job";
      if (data?.hired) {
        toast.success(`${candidate.full_name || candidate.name} hired as ${data.designation || jobTitle} — moved to Employees`);
      } else {
        toast.success(`${candidate.full_name || candidate.name} assigned to ${jobTitle}`);
      }
      onAssigned?.(data);
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to assign job";
      toast.error(typeof detail === "string" ? detail : "Failed to assign job");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedJobId("");
      setJobSearch("");
      setMode("select");
      setHire(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "Create New Job" : "Assign Job to Candidate"}
      size="md"
    >
      {mode === "create" ? (
        <CreateJobForm
          onClose={onClose}
          onCreated={(newJobId) => {
            setMode("select");
            setSelectedJobId(newJobId);
            queryClient.invalidateQueries(["recruitment", "jobs"]);
            toast.success("Job created! Now assign it to this candidate.");
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="rounded-full bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {candidate?.full_name || candidate?.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{candidate?.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-700 dark:bg-indigo-900/20">
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              Can't find the right job? Create one right here.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode("create")}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Create New Job
            </Button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Job *
            </label>
            {jobsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : allJobs.length === 0 ? (
              <EmptyState
                title="No jobs found"
                description="Create a job using the button above, then assign it to this candidate."
              />
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder="Search jobs by title, location, or department..."
                    className={`${inputClassName} pl-9`}
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
                {jobs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                    No jobs match "{jobSearch}".
                  </p>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedJobId}
                      onChange={(e) => setSelectedJobId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <input
              type="checkbox"
              checked={hire}
              onChange={(e) => setHire(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                Move to Employees (Hire)
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                When enabled, {candidate?.full_name || candidate?.name} will be hired into this
                job, moved out of the candidates list, and shown on the Employees page.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedJobId}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
            <Check className="h-4 w-4 mr-2" />
            {isSubmitting ? "Assigning..." : "Assign Job"}
          </Button>
        </div>
      </form>
      )}
    </Modal>
  );
};

// ============================================================
// CREATE JOB FORM COMPONENT (used inside the assign modal)
// ============================================================
const CreateJobForm = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({
    title: "",
    department_id: "",
    location: "",
    employment_type: "full_time",
    work_mode: "onsite",
    experience_min: 0,
    experience_max: 0,
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  // Fetch departments for the dropdown
  const { data: departmentsData } = useQuery(
    ["recruitment", "departments"],
    () => departmentsAPI.listDepartments(),
    { retry: 1 }
  );
  const departments = Array.isArray(departmentsData) ? departmentsData : departmentsData?.departments || [];

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = "Job title is required";
    if (!form.department_id) nextErrors.department_id = "Please select a department";
    if (!form.location.trim()) nextErrors.location = "Location is required";
    if (!form.description.trim()) nextErrors.description = "Description is required";
    if (form.description.trim() && form.description.trim().length < 10) {
      nextErrors.description = "Description must be at least 10 characters";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsCreating(true);
    try {
      const response = await recruitmentApi.createJob({
        ...form,
        experience_min: Number(form.experience_min || 0),
        experience_max: Number(form.experience_max || 0),
        required_skills: [],
      });
      const newJob = response?.data || {};
      const newJobId = newJob.id || newJob._id;
      queryClient.invalidateQueries(["recruitment", "jobs"]);
      toast.success(`Job "${form.title}" created successfully! 🎉`);
      if (newJobId) {
        onCreated?.(newJobId);
      } else {
        onClose?.();
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to create job";
      toast.error(typeof detail === "string" ? detail : "Failed to create job");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Fill in the details below to create a new job. Once created, it will be selected so you can
        assign it to this candidate.
      </p>

      <FormField label="Job title" error={errors.title} required>
        <input
          className={inputClassName}
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="e.g. Frontend Developer"
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Department" error={errors.department_id} required>
          <select
            className={inputClassName}
            value={form.department_id}
            onChange={(e) => setField("department_id", e.target.value)}
          >
            <option value="">Select department</option>
            {departments.map((department) => (
              <option key={department.id || department._id} value={department.id || department._id}>
                {department.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Location" error={errors.location} required>
          <input
            className={inputClassName}
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
            placeholder="e.g. Remote / New York"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Employment type">
          <select
            className={inputClassName}
            value={form.employment_type}
            onChange={(e) => setField("employment_type", e.target.value)}
          >
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Work mode">
          <select
            className={inputClassName}
            value={form.work_mode}
            onChange={(e) => setField("work_mode", e.target.value)}
          >
            {WORK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Description" error={errors.description} required>
        <textarea
          className={`${inputClassName} min-h-24`}
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          placeholder="Brief description of the role..."
        />
      </FormField>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isCreating}>
          Cancel
        </Button>
        <Button type="submit" disabled={isCreating} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-2" />
          {isCreating ? "Creating..." : "Create Job"}
        </Button>
      </div>
    </form>
  );
};

// ============================================================
// INTERVIEW SCREEN COMPONENT
// ============================================================
export default function CandidateInterviewScreen() {
  const [showCandidatePopup, setShowCandidatePopup] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [assignCandidate, setAssignCandidate] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch candidates for selection
  const { data: candidatesData, isLoading: candidatesLoading } = useQuery(
    ["recruitment", "candidates", { search: searchTerm }],
    () => recruitmentApi.getCandidates({ search: searchTerm, limit: 50 }),
    { retry: 1 }
  );

  // Fetch existing interviews
  const { data: interviewsData } = useQuery(
    ["recruitment", "interviews"],
    () => recruitmentApi.getInterviews({ limit: 10 }),
    { retry: 1 }
  );

  // Create candidate mutation
  const createCandidateMutation = useMutation(
    (candidateData) => recruitmentApi.createCandidate(candidateData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["recruitment", "candidates"]);
        queryClient.invalidateQueries(["recruitment", "dashboard"]);
      }
    }
  );

  const handleAssignedJob = () => {
    queryClient.invalidateQueries(["recruitment", "candidates"]);
    queryClient.invalidateQueries(["recruitment", "jobs"]);
    queryClient.invalidateQueries(["recruitment", "dashboard"]);
    queryClient.invalidateQueries(["recruitment", "employees"]);
  };

  const candidates = candidatesData?.data?.items || candidatesData?.data || [];
  const interviews = interviewsData?.data?.items || interviewsData?.data || [];

  const handleCreateCandidate = async (candidateData) => {
    await createCandidateMutation.mutateAsync(candidateData);
  };

  const handleSelectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    // Navigate to the full interviews page with candidate pre-selected
    window.location.href = `/hr/recruitment/interviews?candidate_id=${candidate.id || candidate._id}`;
  };

  const getSourceBadgeColor = (source) => {
    const colors = {
      "Career Page": "bg-blue-100 text-blue-800",
      "Referral": "bg-green-100 text-green-800",
      "Walk-in": "bg-purple-100 text-purple-800",
      "LinkedIn": "bg-indigo-100 text-indigo-800",
      "Naukri": "bg-orange-100 text-orange-800",
      "Indeed": "bg-cyan-100 text-cyan-800",
      "Recruiter": "bg-rose-100 text-rose-800",
      "Campus Drive": "bg-emerald-100 text-emerald-800",
      "Bulk Import": "bg-gray-100 text-gray-800",
      "Manual Entry": "bg-yellow-100 text-yellow-800"
    };
    return colors[source] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HEADER SECTION */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl">
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <User className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Candidate Interview Management</h1>
                <p className="mt-1 text-indigo-100">
                  Select an existing candidate or add a new one to schedule interviews.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SEARCH AND ADD SECTION */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className={`${inputClassName} pl-10`}
              placeholder="Search candidates by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => setShowCandidatePopup(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Candidate
          </Button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SELECTION AREA */}
      {/* ============================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Existing Candidates */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Existing Candidates</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a candidate to schedule interview</p>
          </div>
          <div className="flex-1 max-h-[28rem] overflow-y-auto p-4">
            {candidatesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <EmptyState
                title="No candidates found"
                description="Try adjusting your search or add a new candidate."
              />
            ) : (
              <div className="space-y-3">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="group cursor-pointer rounded-lg border border-gray-200 p-4 transition-all hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20"
                    onClick={() => handleSelectCandidate(candidate)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-white group-hover:text-indigo-600">
                          {candidate.full_name || candidate.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {candidate.email}
                          </div>
                          {candidate.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {candidate.phone}
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold leading-none ${getSourceBadgeColor(candidate.source)}`}>
                            {candidate.source}
                          </span>
                          {(candidate.current_company || candidate.currentCompany) && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Building2 className="h-3 w-3" />
                              {candidate.current_company || candidate.currentCompany}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignCandidate(candidate);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                          >
                            <Briefcase className="h-3.5 w-3.5" />
                            Assign Job
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectCandidate(candidate);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                          >
                            Schedule Interview
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add New Candidate Section */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20">
          <div className="mx-auto max-w-xs">
            <div className="mb-4 rounded-full bg-indigo-100 p-4 dark:bg-indigo-900/30">
              <Plus className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Add New Candidate</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Create a new candidate record quickly without leaving this screen.
            </p>
            <Button
              onClick={() => setShowCandidatePopup(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              Add New Candidate
            </Button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* RECENT INTERVIEWS */}
      {/* ============================================================ */}
      {interviews.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Interviews</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Quick overview of scheduled interviews</p>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {interviews.slice(0, 5).map((interview) => (
                <div key={interview.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {interview.candidateName || interview.candidate?.name || "Unknown Candidate"}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {interview.jobTitle || interview.job?.title || "Position"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge label={interview.status || 'scheduled'} colorKey={interview.status === 'scheduled' ? 'scheduled' : 'pending'} />
                    <p className="text-xs text-gray-500 mt-1">
                      {interview.scheduledAt || interview.scheduled_at}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Candidate Popup */}
      <CandidatePopup
        isOpen={showCandidatePopup}
        onClose={() => setShowCandidatePopup(false)}
        onSave={handleCreateCandidate}
      />

      {/* Assign Job Popup */}
      <AssignJobPopup
        isOpen={!!assignCandidate}
        candidate={assignCandidate}
        onClose={() => setAssignCandidate(null)}
        onAssigned={handleAssignedJob}
      />
    </div>
  );
}