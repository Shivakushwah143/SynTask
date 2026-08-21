import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "react-query";
import toast from "react-hot-toast";
import { careersApi } from "../../../../api/recruitment";
import { Button, PageHeader } from "../../../../components/ui";
import { ApplyForm } from "../forms/ApplyForm";
import { ErrorState, LoadingState, EmptyRecruitmentState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { toArray, idOf } from "../utils/data";

export function CareersLandingPage() {
  const { companySlug } = useParams();
  const [search, setSearch] = useState("");
  const companiesQuery = useQuery(["careers", "companies"], careersApi.getCompanies, { enabled: !companySlug });
  const portalQuery = useQuery(["careers", "portal", companySlug], () => careersApi.getPortal(companySlug), { enabled: !!companySlug });
  const jobsQuery = useQuery(["careers", "jobs", companySlug, search], () => careersApi.getJobs(companySlug, { search, page_size: 50 }), { enabled: !!companySlug });
  const companies = toArray(companiesQuery.data);
  const jobs = toArray(jobsQuery.data);

  if (!companySlug) {
    return (
      <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black">
        <div className="mx-auto max-w-6xl">
          <PageHeader title="Careers" description="Choose a company to view current openings." />
          {companiesQuery.isLoading ? <LoadingState /> : companiesQuery.isError ? <ErrorState onRetry={() => companiesQuery.refetch()} /> : companies.length === 0 ? <EmptyRecruitmentState title="No published jobs" description="Companies with open roles will appear here." /> : (
            <div className="grid gap-4 md:grid-cols-2">
              {companies.map((company) => (
                <Link key={company.slug} to={`/careers/${company.slug}`} className="rounded-lg border border-surface-border bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-text-primary">{company.name}</h2>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{company.job_count} open</span>
                  </div>
                  <p className="text-sm text-text-muted">{company.industry || "Hiring now"}{company.location ? ` · ${company.location}` : ""}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black">
      <div className="mx-auto max-w-6xl">
        <PageHeader title={`Careers at ${portalQuery.data?.company_name || "this company"}`} description="Explore open roles and apply with your resume." />
        <input className="mb-5 w-full rounded-2xl border border-surface-border bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-950" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs" />
        {jobsQuery.isLoading || portalQuery.isLoading ? <LoadingState /> : jobsQuery.isError || portalQuery.isError ? <ErrorState onRetry={() => { portalQuery.refetch(); jobsQuery.refetch(); }} /> : jobs.length === 0 ? <EmptyRecruitmentState title="No published jobs" description="Check again later." /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {jobs.map((job) => (
              <Link key={idOf(job)} to={`/careers/${companySlug}/jobs/${job.slug || idOf(job)}`} className="rounded-lg border border-surface-border bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
                <div className="mb-3 flex justify-between gap-3"><h2 className="font-semibold text-text-primary">{job.title}</h2><StatusBadge status={job.status || "published"} /></div>
                <p className="text-sm text-text-muted">{job.location || "Location not specified"} · {job.employment_type || "Role"}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CareerJobDetailsPage() {
  const { companySlug, slug } = useParams();
  const [trackingCredentials, setTrackingCredentials] = useState(null);
  const jobQuery = useQuery(["careers", "job", companySlug, slug], () => careersApi.getJob(companySlug, slug), { enabled: !!companySlug && !!slug });
  const apply = useMutation(({ jobId, data }) => careersApi.apply(companySlug, jobId, data), {
    onSuccess: (res) => {
      setTrackingCredentials({ code: res?.tracking_code || res?.trackingCode, pin: res?.tracking_pin || res?.trackingPin });
      toast.success("Application submitted");
    },
  });
  const job = jobQuery.data;
  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black"><div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-card dark:bg-gray-950">
      {jobQuery.isLoading ? <LoadingState /> : jobQuery.isError ? <ErrorState onRetry={() => jobQuery.refetch()} /> : trackingCredentials ? (
        <div className="space-y-5">
          <EmptyRecruitmentState title="Application submitted" description="Keep these credentials safe. The PIN is shown only once." />
          <div className="grid gap-3 rounded-lg border border-surface-border bg-surface-muted p-4 text-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase text-text-muted">Tracking ID</p><p className="mt-1 font-mono text-lg font-bold text-text-primary">{trackingCredentials.code}</p></div>
            <div><p className="text-xs font-semibold uppercase text-text-muted">Tracking PIN</p><p className="mt-1 font-mono text-lg font-bold text-text-primary">{trackingCredentials.pin}</p></div>
          </div>
          <Link to={`/careers/track?code=${encodeURIComponent(trackingCredentials.code || "")}`}><Button>Track application</Button></Link>
        </div>
      ) : <>
        <PageHeader title={job?.title || "Job"} description={`${job?.location || "Location"} · ${job?.employment_type || "Employment"}`} />
        <p className="mb-6 whitespace-pre-wrap text-sm text-text-muted">{job?.description || "No description provided."}</p>
        <ApplyForm jobId={idOf(job)} loading={apply.isLoading} onSubmit={(jobId, data) => apply.mutate({ jobId, data })} />
      </>}
    </div></div>
  );
}

export function CareerTrackingPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ code: params.get("code") || "", pin: "" });
  const [submitted, setSubmitted] = useState(null);
  const query = useQuery(["careers", "track", submitted?.code], () => careersApi.track(submitted.code, submitted.pin), { enabled: !!submitted?.code && !!submitted?.pin, retry: false });
  const submit = (event) => {
    event.preventDefault();
    setSubmitted({ code: form.code.trim(), pin: form.pin.trim() });
  };
  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-card dark:bg-gray-950">
        <PageHeader title="Application Tracking" description="Enter your Tracking ID and PIN." />
        <form className="mb-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
          <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value }))} placeholder="Tracking ID" />
          <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={form.pin} onChange={(event) => setForm((value) => ({ ...value, pin: event.target.value }))} placeholder="Tracking PIN" />
          <Button type="submit" disabled={!form.code.trim() || !form.pin.trim() || query.isLoading}>Track</Button>
        </form>
        {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
              <p className="text-xs font-semibold uppercase text-text-muted">Current status</p>
              <div className="mt-2 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-text-primary">{query.data.current_step || query.data.status_label}</h2><StatusBadge status={query.data.status} /></div>
              <p className="mt-1 text-sm text-text-muted">{query.data.job_title}</p>
            </div>
            <ol className="space-y-3">
              {(query.data.timeline || []).map((step) => (
                <li key={step.key} className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${step.state === "completed" ? "bg-emerald-500" : step.state === "current" ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"}`} />
                  <span className={`text-sm ${step.state === "pending" ? "text-text-muted" : "font-semibold text-text-primary"}`}>{step.label}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : <EmptyRecruitmentState title="Tracking credentials required" description="Use the Tracking ID and PIN shown after application submission." />}
      </div>
    </div>
  );
}
