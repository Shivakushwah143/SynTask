import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { 
  FileText, Send, CheckCircle, Download, RefreshCw, 
  Plus, Eye, Clock, AlertCircle, Filter, XCircle,
  Briefcase, Users, Calendar
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, FormField, PageHeader, inputClassName } from "../../../../components/ui";
import { StatusBadge } from "../components/StatusBadge";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { fmtDate, fmtDateTime, idOf, toArray } from "../utils/data";

// ============================================================
// STAT CARD
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo' }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
  }
  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

// ============================================================
// OFFER STATUS DISPLAY
// ============================================================
const OFFER_STATUS_META = {
  draft: { color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300", label: "Draft" },
  pending_approval: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", label: "Pending Approval" },
  approved: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", label: "Approved" },
  ready: { color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", label: "Ready" },
  sent: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", label: "Sent" },
  viewed: { color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300", label: "Viewed" },
  accepted: { color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", label: "Accepted" },
  rejected: { color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", label: "Rejected" },
  withdrawn: { color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", label: "Withdrawn" },
  expired: { color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", label: "Expired" },
  delivery_failed: { color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", label: "Delivery Failed" },
};

const OfferStatusBadge = ({ status }) => {
  const meta = OFFER_STATUS_META[status] || OFFER_STATUS_META.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function OffersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [preview, setPreview] = useState("");

  // Fetch offers list
  const offersQuery = useQuery(
    ["recruitment", "offers", { page, status: statusFilter }],
    () => recruitmentApi.getOffers({ page, page_size: 20, ...(statusFilter ? { status: statusFilter } : {}) }),
    { keepPreviousData: true }
  );

  // Fetch candidates and jobs for create form
  const candidatesQuery = useQuery(["recruitment", "offerCandidates"], () => recruitmentApi.getCandidates({ page_size: 100 }));
  const jobsQuery = useQuery(["recruitment", "offerJobs"], () => recruitmentApi.getJobs({ page_size: 100 }));
  const applicationsQuery = useQuery(["recruitment", "offerApplications"], () => recruitmentApi.getApplications({ page_size: 100 }));

  const offers = toArray(offersQuery.data);
  const total = offersQuery.data?.total || offers.length;
  const hasNext = offersQuery.data?.has_next || false;

  // Form state for create
  const [form, setForm] = useState({
    application_id: "", candidate_id: "", job_id: "", job_title: "", department: "",
    employment_type: "full_time", work_location: "", joining_date: "",
    currency: "INR", base_salary: 0, variable_pay: 0, joining_bonus: 0, offer_expiry: "",
  });

  const candidateItems = toArray(candidatesQuery.data);
  const jobItems = toArray(jobsQuery.data);

  // Calculate stats
  const stats = {
    total,
    draft: offers.filter(o => o.status === "draft").length,
    pending: offers.filter(o => o.status === "pending_approval").length,
    sent: offers.filter(o => o.status === "sent").length,
    accepted: offers.filter(o => o.status === "accepted").length,
  };

  // Mutations
  const createMutation = useMutation(() => recruitmentApi.createOffer({
    application_id: form.application_id,
    joining_date: new Date(form.joining_date).toISOString(),
    offer_expiry: form.offer_expiry ? new Date(form.offer_expiry).toISOString() : null,
    base_salary: Number(form.base_salary || 0),
    variable_pay: Number(form.variable_pay || 0),
    joining_bonus: Number(form.joining_bonus || 0),
  }), {
    onSuccess: (response) => {
      const data = response.data || response;
      setSelectedOffer(data);
      setShowCreateForm(false);
      toast.success("Offer draft created");
      qc.invalidateQueries(["recruitment", "offers"]);
    },
    onError: (error) => toast.error(error?.response?.data?.detail || "Failed to create offer"),
  });

  const actionMutation = useMutation(async ({ action, id, payload }) => {
    switch (action) {
      case "submit": return recruitmentApi.submitOfferForApproval(id);
      case "approve": return recruitmentApi.approveOffer(id, payload || {});
      case "reject": return recruitmentApi.rejectOfferApproval(id, payload || {});
      case "preview": return recruitmentApi.previewOffer(id);
      case "pdf": return recruitmentApi.generateOfferPdf(id);
      case "send": return recruitmentApi.sendOffer(id);
      case "resend": return recruitmentApi.resendOffer(id);
      case "withdraw": return recruitmentApi.withdrawOffer(id, payload || {});
      default: return null;
    }
  }, {
    onSuccess: (response, variables) => {
      const data = response?.data || response;
      if (variables.action === "preview") {
        setPreview(data.preview || "");
      }
      if (data?.offer) setSelectedOffer(data.offer);
      else if (data?.id || data?._id) setSelectedOffer(data);
      const messages = {
        submit: "Offer submitted for approval",
        approve: "Offer approved",
        reject: "Offer approval rejected",
        preview: "Offer preview loaded",
        pdf: "PDF generated",
        send: `Offer sent: ${data?.email_status || "queued"}`,
        resend: "Offer resent",
        withdraw: "Offer withdrawn",
      };
      toast.success(messages[variables.action] || "Offer updated");
      qc.invalidateQueries(["recruitment", "offers"]);
    },
    onError: (error) => toast.error(error?.response?.data?.detail || "Action failed"),
  });

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Offer Letters</h1>
                <p className="mt-1 text-purple-100">
                  Create, approve, generate PDFs, send, and track secure offer responses.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setShowCreateForm(true); setSelectedOffer(null); setPreview(""); }}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Plus className="h-4 w-4" />
                Create Offer
              </button>
              <button
                onClick={() => offersQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} icon={FileText} color="indigo" />
        <StatCard label="Draft" value={stats.draft} icon={Clock} color="amber" />
        <StatCard label="Pending" value={stats.pending} icon={AlertCircle} color="amber" />
        <StatCard label="Sent" value={stats.sent} icon={Send} color="emerald" />
        <StatCard label="Accepted" value={stats.accepted} icon={CheckCircle} color="emerald" />
      </div>

      {/* Filter */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            <option value="">All statuses</option>
            {Object.entries(OFFER_STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Offers List */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">All Offers</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{total} offer{total !== 1 ? 's' : ''}</p>
        </div>
        
        {offersQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : offersQuery.isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <AlertCircle className="h-12 w-12 text-rose-500" />
            <p className="text-gray-600 dark:text-gray-400">Could not load offers</p>
            <Button onClick={() => offersQuery.refetch()}>Retry</Button>
          </div>
        ) : offers.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">No offers found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create your first offer to get started.</p>
            <Button onClick={() => setShowCreateForm(true)}><Plus className="h-4 w-4" /> Create Offer</Button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {offers.map((offer) => (
                <div
                  key={idOf(offer)}
                  className="flex items-center gap-4 p-4 transition hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                  onClick={() => { setSelectedOffer(offer); setShowCreateForm(false); setPreview(""); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {offer.job_title || offer.offer_number || "Untitled Offer"}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {offer.candidate_name && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {offer.candidate_name}
                        </span>
                      )}
                      {offer.offer_number && (
                        <span className="font-mono">{offer.offer_number}</span>
                      )}
                      <span>{offer.currency} {(offer.offered_ctc || offer.base_salary || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <OfferStatusBadge status={offer.status} />
                    <span className="text-xs text-gray-400">{fmtDate(offer.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-200 p-4 dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-500">Page {page}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!hasNext}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Form Drawer */}
      <RecruitmentDrawer
        open={showCreateForm}
        title="Create Offer"
        description="Draft a new offer letter for a candidate"
        onClose={() => setShowCreateForm(false)}
      >
        <div className="space-y-4">
          <FormField label="Candidate *">
            <select className={inputClassName} value={form.application_id} onChange={(e) => update("application_id", e.target.value)}>
              <option value="">Select application</option>
              {(applicationsQuery.data?.data?.items || []).map((app) => <option key={app.application_id} value={app.application_id}>{app.candidate.full_name} — {app.job.title}</option>)}
            </select>
          </FormField>
          {["job_title", "department", "employment_type", "work_location", "currency"].map((key) => (
            <FormField key={key} label={key.replaceAll("_", " ")}>
              <input className={inputClassName} value={form[key]} onChange={(e) => update(key, e.target.value)} />
            </FormField>
          ))}
          <FormField label="Joining date *"><input type="date" className={inputClassName} value={form.joining_date} onChange={(e) => update("joining_date", e.target.value)} /></FormField>
          <FormField label="Offer expiry"><input type="date" className={inputClassName} value={form.offer_expiry} onChange={(e) => update("offer_expiry", e.target.value)} /></FormField>
          <FormField label="Base salary"><input type="number" className={inputClassName} value={form.base_salary} onChange={(e) => update("base_salary", e.target.value)} /></FormField>
          <FormField label="Variable pay"><input type="number" className={inputClassName} value={form.variable_pay} onChange={(e) => update("variable_pay", e.target.value)} /></FormField>
          <FormField label="Joining bonus"><input type="number" className={inputClassName} value={form.joining_bonus} onChange={(e) => update("joining_bonus", e.target.value)} /></FormField>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isLoading || !form.application_id || !form.joining_date}>
              {createMutation.isLoading ? "Creating..." : "Create Draft"}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
          </div>
        </div>
      </RecruitmentDrawer>

      {/* Offer Detail Drawer */}
      <RecruitmentDrawer
        open={!!selectedOffer && !showCreateForm}
        title={selectedOffer?.job_title || selectedOffer?.offer_number || "Offer Details"}
        description="Offer details and actions"
        onClose={() => { setSelectedOffer(null); setPreview(""); }}
      >
        {selectedOffer && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <OfferStatusBadge status={selectedOffer.status} />
              <span className="text-xs text-gray-500">{fmtDate(selectedOffer.created_at)}</span>
            </div>

            {/* Details Grid */}
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { label: "Offer Number", value: selectedOffer.offer_number },
                { label: "Candidate", value: selectedOffer.candidate_name || selectedOffer.candidate_id },
                { label: "Job Title", value: selectedOffer.job_title },
                { label: "Department", value: selectedOffer.department },
                { label: "Employment Type", value: selectedOffer.employment_type },
                { label: "Work Location", value: selectedOffer.work_location },
                { label: "Joining Date", value: fmtDate(selectedOffer.joining_date) },
                { label: "Expiry", value: fmtDate(selectedOffer.offer_expiry) },
                { label: "Base Salary", value: `${selectedOffer.currency} ${(selectedOffer.base_salary || 0).toLocaleString()}` },
                { label: "Variable Pay", value: `${selectedOffer.currency} ${(selectedOffer.variable_pay || 0).toLocaleString()}` },
                { label: "Joining Bonus", value: `${selectedOffer.currency} ${(selectedOffer.joining_bonus || 0).toLocaleString()}` },
                { label: "Total CTC", value: `${selectedOffer.currency} ${(selectedOffer.offered_ctc || 0).toLocaleString()}` },
              ].filter(item => item.value).map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              {selectedOffer.sent_at && <p>Sent: {fmtDateTime(selectedOffer.sent_at)}</p>}
              {selectedOffer.viewed_at && <p>Viewed: {fmtDateTime(selectedOffer.viewed_at)}</p>}
              {selectedOffer.accepted_at && <p>Accepted: {fmtDateTime(selectedOffer.accepted_at)}</p>}
              {selectedOffer.rejected_at && <p>Rejected: {fmtDateTime(selectedOffer.rejected_at)}</p>}
              {selectedOffer.withdrawn_at && <p>Withdrawn: {fmtDateTime(selectedOffer.withdrawn_at)}</p>}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {selectedOffer.status === "draft" && (
                <Button onClick={() => actionMutation.mutate({ action: "submit", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                  <Send className="h-4 w-4" /> Submit for Approval
                </Button>
              )}
              {selectedOffer.status === "pending_approval" && (
                <>
                  <Button onClick={() => actionMutation.mutate({ action: "approve", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                    <CheckCircle className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="secondary" onClick={() => actionMutation.mutate({ action: "reject", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </>
              )}
              {selectedOffer.status === "approved" && (
                <Button onClick={() => actionMutation.mutate({ action: "pdf", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                  <Download className="h-4 w-4" /> Generate PDF
                </Button>
              )}
              {(selectedOffer.status === "ready" || selectedOffer.status === "sent" || selectedOffer.status === "delivery_failed") && (
                <>
                  <Button onClick={() => actionMutation.mutate({ action: "send", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                    <Send className="h-4 w-4" /> {selectedOffer.status === "sent" ? "Resend" : "Send"}
                  </Button>
                  <Button variant="secondary" onClick={() => actionMutation.mutate({ action: "preview", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                    <Eye className="h-4 w-4" /> Preview
                  </Button>
                </>
              )}
              {selectedOffer.status === "sent" && (
                <Button variant="secondary" onClick={() => actionMutation.mutate({ action: "withdraw", id: idOf(selectedOffer) })} disabled={actionMutation.isLoading}>
                  Withdraw
                </Button>
              )}
              {selectedOffer.pdf_file_id && (
                <a href={`/api/v1${selectedOffer.pdf_file_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
                  <Download className="h-4 w-4" /> Open PDF
                </a>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Preview</h4>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
                  {preview}
                </pre>
              </div>
            )}
          </div>
        )}
      </RecruitmentDrawer>
    </div>
  );
}
