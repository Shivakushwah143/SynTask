import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "react-query";
import toast from "react-hot-toast";
import { careersApi } from "../../../../api/recruitment";
import { Button, PageHeader } from "../../../../components/ui";
import { ApplyForm } from "../forms/ApplyForm";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
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
  const [appliedCode, setAppliedCode] = useState("");
  const jobQuery = useQuery(["careers", "job", companySlug, slug], () => careersApi.getJob(companySlug, slug), { enabled: !!companySlug && !!slug });
  const apply = useMutation(({ jobId, data }) => careersApi.apply(companySlug, jobId, data), { onSuccess: (res) => { setAppliedCode(res?.tracking_code || res?.trackingCode || "submitted"); toast.success("Application submitted"); } });
  const job = jobQuery.data;
  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black"><div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-card dark:bg-gray-950">
      {jobQuery.isLoading ? <LoadingState /> : jobQuery.isError ? <ErrorState onRetry={() => jobQuery.refetch()} /> : appliedCode ? <EmptyRecruitmentState title="Application submitted" description={`Tracking code: ${appliedCode}`} action={<Link to={`/careers/track?code=${appliedCode}`}><Button>Track application</Button></Link>} /> : <>
        <PageHeader title={job?.title || "Job"} description={`${job?.location || "Location"} · ${job?.employment_type || "Employment"}`} />
        <p className="mb-6 whitespace-pre-wrap text-sm text-text-muted">{job?.description || "No description provided."}</p>
        <ApplyForm jobId={idOf(job)} loading={apply.isLoading} onSubmit={(jobId, data) => apply.mutate({ jobId, data })} />
      </>}
    </div></div>
  );
}

export function CareerTrackingPage() {
  const [params] = useSearchParams();
  const code = params.get("code") || "";
  const query = useQuery(["careers", "track", code], () => careersApi.track(code), { enabled: !!code });
  return <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black"><div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-card dark:bg-gray-950"><PageHeader title="Application Tracking" description="Check your recruitment application status." />{!code ? <EmptyRecruitmentState title="Tracking code required" description="Open this page with ?code=YOUR_CODE." /> : query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : <RecruitmentDrawer open title="Application Status" description={code} onClose={() => {}}><StatusBadge status={query.data?.status} /><pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-surface-muted p-4 text-sm">{JSON.stringify(query.data, null, 2)}</pre></RecruitmentDrawer>}</div></div>;
}
