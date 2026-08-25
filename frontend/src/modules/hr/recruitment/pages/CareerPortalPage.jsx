import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { careersApi, publicOffersApi } from "../../../../api/recruitment";
import { Button, PageHeader } from "../../../../components/ui";
import { ApplyForm } from "../forms/ApplyForm";
import { ErrorState, LoadingState, EmptyRecruitmentState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { toArray, idOf, labelize } from "../utils/data";

const errorMessage = (error, fallback = "Request failed") => {
  const detail = error?.response?.data?.detail || error?.response?.data?.message || error?.message;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || item?.message || String(item)).join(", ");
  if (detail && typeof detail === "object") return detail.msg || detail.message || fallback;
  return detail || fallback;
};

const dateTimeText = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const offerTokenFromUrl = (url) => {
  if (!url) return "";
  return String(url).split("/").filter(Boolean).pop() || "";
};

const stageDateTime = (step, stageDetails, interviews, offers, application) => {
  const key = step?.key;
  const matchingStage = stageDetails.find((stage) => {
    const details = stage.details || {};
    return details.to === key || details.from === key || stage.type?.toLowerCase?.().includes(String(key || "").replace("_", ""));
  });
  if (key === "new") return dateTimeText(application.applied_at);
  if (key === "interview_1") return dateTimeText(interviews[0]?.schedule_at || matchingStage?.details?.schedule_at || matchingStage?.created_at);
  if (key === "offer_sent") return dateTimeText(offers[0]?.sent_at || matchingStage?.created_at);
  if (key === "joined") return dateTimeText(offers[0]?.accepted_at || matchingStage?.created_at);
  return dateTimeText(matchingStage?.details?.schedule_at || matchingStage?.created_at);
};

const importantTrackingUpdate = (application) => {
  const now = Date.now();
  const interviews = toArray(application.interviews);
  const offers = toArray(application.offers);
  const upcomingInterview = interviews
    .filter((item) => item.schedule_at && new Date(item.schedule_at).getTime() >= now)
    .sort((a, b) => new Date(a.schedule_at).getTime() - new Date(b.schedule_at).getTime())[0];
  const latestInterview = [...interviews].sort((a, b) => new Date(b.schedule_at || 0).getTime() - new Date(a.schedule_at || 0).getTime())[0];
  const activeOffer = offers.find((offer) => ["sent", "viewed", "ready"].includes(String(offer.status || "").toLowerCase()));

  if (upcomingInterview) {
    return {
      title: `Upcoming interview: Round ${upcomingInterview.round || 1}`,
      body: `${dateTimeText(upcomingInterview.schedule_at)} • ${upcomingInterview.duration_minutes || 60} min • ${labelize(upcomingInterview.interview_mode || "interview")}`,
      action: upcomingInterview.meeting_link ? { label: "Join interview", href: upcomingInterview.meeting_link } : null,
    };
  }
  if (activeOffer) {
    return {
      title: "Offer letter action required",
      body: `Offer ${labelize(activeOffer.status)}${activeOffer.offer_expiry ? ` • expires ${dateTimeText(activeOffer.offer_expiry)}` : ""}`,
      action: activeOffer.offer_url ? { label: "View offer letter", href: activeOffer.offer_url } : null,
    };
  }
  if (latestInterview?.result || latestInterview?.decision) {
    return {
      title: "Latest interview update",
      body: `Round ${latestInterview.round || 1} • ${labelize(latestInterview.result || latestInterview.decision)}`,
      action: null,
    };
  }
  return {
    title: application.current_step || application.status_label || "Application update",
    body: "Your application is active. The next interview, offer, or HR action will appear here when scheduled.",
    action: null,
  };
};

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
          <div className="mb-5">
            <Link to="/careers/track"><Button variant="secondary">Track application</Button></Link>
          </div>
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
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input className="w-full rounded-2xl border border-surface-border bg-white px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-950" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs" />
          <Link to="/careers/track" className="shrink-0"><Button variant="secondary">Track application</Button></Link>
        </div>
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
    onError: (error) => toast.error(errorMessage(error, "Failed to submit application")),
  });
  const job = jobQuery.data;
  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black"><div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-card dark:bg-gray-950">
      {jobQuery.isLoading ? <LoadingState /> : jobQuery.isError ? <ErrorState onRetry={() => jobQuery.refetch()} /> : trackingCredentials ? (
        <div className="space-y-5">
          <EmptyRecruitmentState title="Application submitted" description="Keep these credentials safe. The PIN is shown only once." />
          <div className="grid gap-3 rounded-lg border border-surface-border bg-surface-muted p-4 text-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase text-text-muted">Tracking ID</p><p className="mt-1 font-mono text-lg font-bold text-text-primary">{trackingCredentials.code}</p></div>
            <div><p className="text-xs font-semibold uppercase text-text-muted">Temporary password</p><p className="mt-1 font-mono text-lg font-bold text-text-primary">{trackingCredentials.pin}</p></div>
          </div>
          <div className="flex flex-wrap gap-3 print:hidden">
            <Link to={`/careers/track?code=${encodeURIComponent(trackingCredentials.code || "")}`}><Button>Track application</Button></Link>
            <Button type="button" variant="secondary" onClick={() => window.print()}>Print credentials</Button>
          </div>
        </div>
      ) : <>
        <PageHeader title={job?.title || "Job"} description={`${job?.location || "Location"} · ${job?.employment_type || "Employment"}`} />
        <p className="mb-6 whitespace-pre-wrap text-sm text-text-muted">{job?.description || "No description provided."}</p>
        <ApplyForm
          jobId={idOf(job)}
          loading={apply.isLoading}
          error={apply.isError ? errorMessage(apply.error, "Failed to submit application") : ""}
          onSubmit={(jobId, data) => apply.mutate({ jobId, data })}
        />
      </>}
    </div></div>
  );
}

export function CareerTrackingPage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const resumeInputRef = useRef(null);
  const [form, setForm] = useState({ code: params.get("code") || "", pin: "" });
  const [profile, setProfile] = useState({});
  const [offerReasons, setOfferReasons] = useState({});
  const [submitted, setSubmitted] = useState(null);
  const queryKey = ["careers", "track", submitted?.code];
  const query = useQuery(queryKey, () => careersApi.track(submitted.code, submitted.pin), { enabled: !!submitted?.code && !!submitted?.pin, retry: false });
  useEffect(() => {
    if (query.data?.candidate) {
      setProfile({
        full_name: query.data.candidate.full_name || "",
        phone: query.data.candidate.phone || "",
        current_company: query.data.candidate.current_company || "",
        experience_years: query.data.candidate.experience_years ?? 0,
        expected_salary: query.data.candidate.expected_salary ?? "",
        notice_period: query.data.candidate.notice_period || "",
        location: query.data.candidate.location || "",
        education: query.data.candidate.education || "",
        skills: toArray(query.data.candidate.skills).join(", "),
      });
    }
  }, [query.data]);
  const saveProfile = useMutation(
    () => careersApi.updateTrackedProfile({
      tracking_code: submitted.code,
      tracking_pin: submitted.pin,
      ...profile,
      experience_years: Number(profile.experience_years || 0),
      expected_salary: profile.expected_salary === "" ? null : Number(profile.expected_salary),
      skills: String(profile.skills || "").split(",").map((item) => item.trim()).filter(Boolean),
    }),
    {
      onSuccess: (data) => {
        queryClient.setQueryData(queryKey, data);
        toast.success("Application details updated");
      },
      onError: (error) => toast.error(errorMessage(error, "Could not update details")),
    }
  );
  const uploadResume = useMutation(
    (file) => careersApi.uploadTrackedResume(submitted.code, submitted.pin, file),
    {
      onSuccess: (data) => {
        queryClient.setQueryData(queryKey, data);
        if (resumeInputRef.current) resumeInputRef.current.value = "";
        toast.success("Resume updated");
      },
      onError: (error) => toast.error(errorMessage(error, "Could not upload resume")),
    }
  );
  const decideOffer = useMutation(
    ({ offer, accepted }) => {
      const token = offerTokenFromUrl(offer.offer_url);
      if (!token) throw new Error("Offer letter link is not available yet");
      const payload = {
        comment: accepted ? "Accepted from application tracking" : "Rejected from application tracking",
        rejection_reason: accepted ? undefined : offerReasons[offer.offer_number || offer.offer_url] || "",
      };
      return accepted ? publicOffersApi.accept(token, payload) : publicOffersApi.reject(token, payload);
    },
    {
      onSuccess: () => {
        toast.success("Offer response submitted");
        query.refetch();
        queryClient.invalidateQueries(queryKey);
      },
      onError: (error) => toast.error(errorMessage(error, "Could not submit offer response")),
    }
  );
  const submit = (event) => {
    event.preventDefault();
    setSubmitted({ code: form.code.trim(), pin: form.pin.trim() });
  };
  const updateProfile = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const updateOfferReason = (key, value) => setOfferReasons((current) => ({ ...current, [key]: value }));
  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-card dark:bg-gray-950">
        <PageHeader title="Application Tracking" description="Enter your Tracking ID and temporary password." />
        <form className="mb-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
          <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value }))} placeholder="Tracking ID" />
          <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={form.pin} onChange={(event) => setForm((value) => ({ ...value, pin: event.target.value }))} placeholder="Temporary password" />
          <Button type="submit" disabled={!form.code.trim() || !form.pin.trim() || query.isLoading}>Track</Button>
        </form>
        {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.data ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
              <p className="text-xs font-semibold uppercase text-text-muted">Current status</p>
              <div className="mt-2 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-text-primary">{query.data.current_step || query.data.status_label}</h2><StatusBadge status={query.data.status} /></div>
              <p className="mt-1 text-sm text-text-muted">{query.data.company_name ? `${query.data.company_name} · ` : ""}{query.data.job_title}</p>
            </div>
            {/* {(() => {
              const update = importantTrackingUpdate(query.data);
              return (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
                  <p className="text-xs font-semibold uppercase text-indigo-700 dark:text-indigo-300">Important update</p>
                  <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="text-base font-semibold text-text-primary">{update.title}</h2>
                      <p className="mt-1 text-sm text-text-muted">{update.body}</p>
                    </div>
                    {update.action ? (
                      <a className="inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700" href={update.action.href} target="_blank" rel="noreferrer">
                        {update.action.label}
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })()} */}
            {toArray(query.data.interviews).length ? (
              <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase text-text-muted">Interviews</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {toArray(query.data.interviews).map((interview, index) => (
                    <div key={`${interview.round}-${interview.schedule_at || index}`} className="rounded-lg bg-surface-muted p-3 text-sm dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-text-primary">Round {interview.round} â€¢ {labelize(interview.interview_type)}</p>
                        <StatusBadge status={interview.status} />
                      </div>
                      <p className="mt-1 text-text-muted">{interview.schedule_at ? new Date(interview.schedule_at).toLocaleString() : "Schedule pending"} â€¢ {interview.duration_minutes || 60} min â€¢ {labelize(interview.interview_mode)}</p>
                      {interview.meeting_link ? <a className="mt-2 inline-flex text-indigo-600 hover:underline" href={interview.meeting_link} target="_blank" rel="noreferrer">Join interview</a> : null}
                      {interview.location ? <p className="mt-1 text-text-muted">Location: {interview.location}</p> : null}
                      {interview.result ? <p className="mt-1 text-text-muted">Result: {labelize(interview.result)}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {toArray(query.data.offers).length ? (
              <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase text-text-muted">Offers</p>
                <div className="mt-3 space-y-3">
                  {toArray(query.data.offers).map((offer, index) => (
                    <div key={offer.offer_number || index} className="flex flex-col justify-between gap-2 rounded-lg bg-surface-muted p-3 text-sm dark:bg-gray-900">
                      <div>
                        <p className="font-semibold text-text-primary">{offer.offer_number || offer.job_title || "Offer letter"}</p>
                        <p className="text-text-muted">Joining {offer.joining_date ? new Date(offer.joining_date).toLocaleDateString() : "TBD"} â€¢ expires {offer.offer_expiry ? new Date(offer.offer_expiry).toLocaleDateString() : "not set"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={offer.status} />
                        {offer.offer_url ? <Link className="inline-flex min-h-9 items-center rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700" to={offer.offer_url}>View offer letter</Link> : null}
                        {offer.offer_url && offer.pdf_available ? <a className="inline-flex min-h-9 items-center rounded-lg border border-surface-border px-3 text-xs font-semibold text-text-primary hover:bg-white dark:border-gray-700 dark:hover:bg-gray-950" href={publicOffersApi.pdfUrl(offerTokenFromUrl(offer.offer_url))} target="_blank" rel="noreferrer">Download letter</a> : null}
                        {offer.offer_url ? <Button size="sm" disabled={["accepted", "rejected", "expired", "withdrawn"].includes(String(offer.status || "").toLowerCase()) || decideOffer.isLoading} onClick={() => decideOffer.mutate({ offer, accepted: true })}>Accept offer</Button> : null}
                      </div>
                      {offer.offer_url && !["accepted", "rejected", "expired", "withdrawn"].includes(String(offer.status || "").toLowerCase()) ? (
                        <div className="mt-2 grid w-full gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                            value={offerReasons[offer.offer_number || offer.offer_url || index] || ""}
                            onChange={(event) => updateOfferReason(offer.offer_number || offer.offer_url || index, event.target.value)}
                            placeholder="Reason if rejecting offer"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={decideOffer.isLoading || !(offerReasons[offer.offer_number || offer.offer_url || index] || "").trim()}
                            onClick={() => decideOffer.mutate({ offer, accepted: false })}
                          >
                            Reject offer
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
              <p className="text-xs font-semibold uppercase text-text-muted">Stage updates</p>
              <ol className="mt-3 space-y-3">
                {(query.data.timeline || []).map((step) => {
                  const when = stageDateTime(step, toArray(query.data.stage_details), toArray(query.data.interviews), toArray(query.data.offers), query.data);
                  return (
                    <li key={step.key} className="flex items-start gap-3">
                      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${step.state === "completed" ? "bg-emerald-500" : step.state === "current" ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"}`} />
                      <div className="min-w-0">
                        <p className={`text-sm ${step.state === "pending" ? "text-text-muted" : "font-semibold text-text-primary"}`}>
                          {when ? <span className="font-medium text-text-muted">{when} - </span> : null}
                          {step.label}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {toArray(query.data.stage_details).length ? (
                <div className="mt-4 space-y-3">
                  {toArray(query.data.stage_details).map((stage, index) => {
                    const details = stage.details || {};
                    const primaryTime = dateTimeText(details.schedule_at || stage.created_at);
                    return (
                      <div key={`${stage.type}-${stage.created_at || index}`} className="rounded-lg bg-surface-muted p-3 text-sm dark:bg-gray-900">
                        <p className="font-semibold text-text-primary">{primaryTime ? `${primaryTime} - ` : ""}{stage.label || labelize(stage.type)}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                          {details.from || details.to ? <span>{details.from ? labelize(details.from) : "Updated"} → {details.to ? labelize(details.to) : "Updated"}</span> : null}
                          {details.round ? <span>Round {details.round}</span> : null}
                          {details.decision ? <span>Decision: {labelize(details.decision)}</span> : null}
                          {details.score != null ? <span>Score: {details.score}/10</span> : null}
                          {details.reason ? <span>Reason: {details.reason}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-muted">Detailed stage updates will appear here when HR schedules interviews, records results, or sends offers.</p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase text-text-muted">Application</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-text-muted">Tracking ID</dt><dd className="font-mono text-text-primary">{query.data.tracking_code}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-text-muted">Applied</dt><dd className="text-text-primary">{query.data.applied_at ? new Date(query.data.applied_at).toLocaleDateString() : "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-text-muted">Last updated</dt><dd className="text-text-primary">{query.data.last_updated ? new Date(query.data.last_updated).toLocaleDateString() : "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-text-muted">Location</dt><dd className="text-text-primary">{query.data.job?.location || "—"}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase text-text-muted">Resume</p>
                <p className="mt-3 text-sm font-medium text-text-primary">{query.data.resume?.filename || "No resume on file"}</p>
                <p className="mt-1 text-xs text-text-muted">{query.data.resume?.uploaded_at ? `Uploaded ${new Date(query.data.resume.uploaded_at).toLocaleDateString()}` : "Upload a resume to keep your application current."}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,image/jpeg,image/png" className="text-sm text-text-muted" onChange={(event) => event.target.files?.[0] && uploadResume.mutate(event.target.files[0])} />
                  {uploadResume.isLoading && <span className="text-sm text-text-muted">Uploading...</span>}
                </div>
              </div>
            </div>
            {false && toArray(query.data.interviews).length ? (
              <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase text-text-muted">Interviews</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {toArray(query.data.interviews).map((interview, index) => (
                    <div key={`${interview.round}-${interview.schedule_at || index}`} className="rounded-lg bg-surface-muted p-3 text-sm dark:bg-gray-900">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-text-primary">Round {interview.round} • {labelize(interview.interview_type)}</p>
                        <StatusBadge status={interview.status} />
                      </div>
                      <p className="mt-1 text-text-muted">{interview.schedule_at ? new Date(interview.schedule_at).toLocaleString() : "Schedule pending"} • {interview.duration_minutes || 60} min • {labelize(interview.interview_mode)}</p>
                      {interview.meeting_link ? <a className="mt-2 inline-flex text-indigo-600 hover:underline" href={interview.meeting_link} target="_blank" rel="noreferrer">Join interview</a> : null}
                      {interview.location ? <p className="mt-1 text-text-muted">Location: {interview.location}</p> : null}
                      {interview.result ? <p className="mt-1 text-text-muted">Result: {labelize(interview.result)}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {false && toArray(query.data.offers).length ? (
              <div className="rounded-lg border border-surface-border p-4 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase text-text-muted">Offers</p>
                <div className="mt-3 space-y-3">
                  {toArray(query.data.offers).map((offer, index) => (
                    <div key={offer.offer_number || index} className="flex flex-col justify-between gap-2 rounded-lg bg-surface-muted p-3 text-sm dark:bg-gray-900 sm:flex-row sm:items-center">
                      <div>
                        <p className="font-semibold text-text-primary">{offer.offer_number || offer.job_title || "Offer letter"}</p>
                        <p className="text-text-muted">Joining {offer.joining_date ? new Date(offer.joining_date).toLocaleDateString() : "TBD"} • expires {offer.offer_expiry ? new Date(offer.offer_expiry).toLocaleDateString() : "not set"}</p>
                      </div>
                      <StatusBadge status={offer.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <form
              className="rounded-lg border border-surface-border p-4 dark:border-gray-800"
              onSubmit={(event) => {
                event.preventDefault();
                saveProfile.mutate();
              }}
            >
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase text-text-muted">Your details</p>
                  <h2 className="mt-1 text-base font-semibold text-text-primary">Edit application details</h2>
                </div>
                <Button type="submit" disabled={saveProfile.isLoading}>{saveProfile.isLoading ? "Saving..." : "Save details"}</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={profile.full_name || ""} onChange={(event) => updateProfile("full_name", event.target.value)} placeholder="Full name" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={query.data.candidate?.email || ""} disabled placeholder="Email" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={profile.phone || ""} onChange={(event) => updateProfile("phone", event.target.value)} placeholder="Mobile number" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={profile.location || ""} onChange={(event) => updateProfile("location", event.target.value)} placeholder="Location" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={profile.current_company || ""} onChange={(event) => updateProfile("current_company", event.target.value)} placeholder="Current company" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" type="number" min="0" step="0.5" value={profile.experience_years ?? 0} onChange={(event) => updateProfile("experience_years", event.target.value)} placeholder="Experience years" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" value={profile.notice_period || ""} onChange={(event) => updateProfile("notice_period", event.target.value)} placeholder="Notice period" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900" type="number" min="0" value={profile.expected_salary ?? ""} onChange={(event) => updateProfile("expected_salary", event.target.value)} placeholder="Expected salary" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 md:col-span-2" value={profile.education || ""} onChange={(event) => updateProfile("education", event.target.value)} placeholder="Education" />
                <input className="rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 md:col-span-2" value={profile.skills || ""} onChange={(event) => updateProfile("skills", event.target.value)} placeholder="Skills, separated by commas" />
              </div>
            </form>
          </div>
        ) : <EmptyRecruitmentState title="Tracking credentials required" description="Use the Tracking ID and temporary password shown after application submission." />}
      </div>
    </div>
  );
}
