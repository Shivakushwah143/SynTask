import { useState } from "react";
import { useMutation, useQuery } from "react-query";
import toast from "react-hot-toast";
import { FileText, Send, CheckCircle, Download, RefreshCw } from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, FormField, inputClassName } from "../../../../components/ui";
import { fmtDateTime, idOf, toArray } from "../utils/data";

export default function OffersPage() {
  const [form, setForm] = useState({
    candidate_id: "",
    job_id: "",
    job_title: "",
    department: "",
    employment_type: "full_time",
    work_location: "",
    joining_date: "",
    currency: "INR",
    base_salary: 0,
    variable_pay: 0,
    joining_bonus: 0,
    offer_expiry: "",
  });
  const [offer, setOffer] = useState(null);
  const [preview, setPreview] = useState("");
  const candidates = useQuery(["recruitment", "offerCandidates"], () => recruitmentApi.getCandidates({ page_size: 100 }));
  const jobs = useQuery(["recruitment", "offerJobs"], () => recruitmentApi.getJobs({ page_size: 100 }));

  const create = useMutation(() => recruitmentApi.createOffer({
    ...form,
    joining_date: new Date(form.joining_date).toISOString(),
    offer_expiry: form.offer_expiry ? new Date(form.offer_expiry).toISOString() : null,
    base_salary: Number(form.base_salary || 0),
    variable_pay: Number(form.variable_pay || 0),
    joining_bonus: Number(form.joining_bonus || 0),
  }), {
    onSuccess: (response) => {
      setOffer(response.data || response);
      toast.success("Offer draft saved");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || "Failed to create offer"),
  });
  const runAction = useMutation(async (action) => {
    const id = idOf(offer);
    if (action === "submit") return recruitmentApi.submitOfferForApproval(id);
    if (action === "approve") return recruitmentApi.approveOffer(id, {});
    if (action === "preview") return recruitmentApi.previewOffer(id);
    if (action === "pdf") return recruitmentApi.generateOfferPdf(id);
    if (action === "send") return recruitmentApi.sendOffer(id);
    return null;
  }, {
    onSuccess: (response, action) => {
      const data = response?.data || response;
      if (action === "preview") setPreview(data.preview || "");
      if (data?.offer) setOffer(data.offer);
      else if (data?.id || data?._id) setOffer(data);
      toast.success(action === "send" ? `Offer sent: ${data.email_status || "queued"}` : "Offer updated");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || "Offer action failed"),
  });

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const candidateItems = toArray(candidates.data);
  const jobItems = toArray(jobs.data);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Offer Letters</h1>
        <p className="mt-1 text-sm text-gray-500">Create, approve, generate PDF, send, and track secure offer responses.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Candidate">
              <select className={inputClassName} value={form.candidate_id} onChange={(e) => update("candidate_id", e.target.value)}>
                <option value="">Select candidate</option>
                {candidateItems.map((candidate) => <option key={idOf(candidate)} value={idOf(candidate)}>{candidate.full_name || candidate.name}</option>)}
              </select>
            </FormField>
            <FormField label="Job">
              <select className={inputClassName} value={form.job_id} onChange={(e) => {
                const job = jobItems.find((item) => idOf(item) === e.target.value);
                setForm((current) => ({ ...current, job_id: e.target.value, job_title: job?.title || current.job_title, department: job?.department_id || current.department, work_location: job?.location || current.work_location, employment_type: job?.employment_type || current.employment_type }));
              }}>
                <option value="">Select job</option>
                {jobItems.map((job) => <option key={idOf(job)} value={idOf(job)}>{job.title}</option>)}
              </select>
            </FormField>
            {["job_title", "department", "employment_type", "work_location", "currency"].map((key) => (
              <FormField key={key} label={key.replaceAll("_", " ")}>
                <input className={inputClassName} value={form[key]} onChange={(e) => update(key, e.target.value)} />
              </FormField>
            ))}
            <FormField label="Joining date"><input type="date" className={inputClassName} value={form.joining_date} onChange={(e) => update("joining_date", e.target.value)} /></FormField>
            <FormField label="Offer expiry"><input type="date" className={inputClassName} value={form.offer_expiry} onChange={(e) => update("offer_expiry", e.target.value)} /></FormField>
            <FormField label="Base salary"><input type="number" className={inputClassName} value={form.base_salary} onChange={(e) => update("base_salary", e.target.value)} /></FormField>
            <FormField label="Variable pay"><input type="number" className={inputClassName} value={form.variable_pay} onChange={(e) => update("variable_pay", e.target.value)} /></FormField>
            <FormField label="Joining bonus"><input type="number" className={inputClassName} value={form.joining_bonus} onChange={(e) => update("joining_bonus", e.target.value)} /></FormField>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => create.mutate()} disabled={create.isLoading || !form.candidate_id || !form.joining_date}><FileText className="h-4 w-4" /> Save draft</Button>
            <Button variant="secondary" onClick={() => runAction.mutate("submit")} disabled={!offer}>Submit</Button>
            <Button variant="secondary" onClick={() => runAction.mutate("approve")} disabled={!offer}><CheckCircle className="h-4 w-4" /> Approve</Button>
            <Button variant="secondary" onClick={() => runAction.mutate("preview")} disabled={!offer}>Preview</Button>
            <Button variant="secondary" onClick={() => runAction.mutate("pdf")} disabled={!offer}><Download className="h-4 w-4" /> Generate PDF</Button>
            <Button onClick={() => runAction.mutate("send")} disabled={!offer}><Send className="h-4 w-4" /> Send</Button>
          </div>
        </section>

        <aside className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Offer Status</h2>
          {offer ? (
            <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <p><span className="font-medium">Number:</span> {offer.offer_number}</p>
              <p><span className="font-medium">Status:</span> {offer.status}</p>
              <p><span className="font-medium">Sent:</span> {fmtDateTime(offer.sent_at)}</p>
              <p><span className="font-medium">Accepted:</span> {fmtDateTime(offer.accepted_at)}</p>
              {offer.pdf_file_id ? <a className="text-indigo-600" href={`/api/v1${offer.pdf_file_id}`} target="_blank" rel="noreferrer">Open PDF</a> : null}
            </div>
          ) : <p className="mt-3 text-sm text-gray-500">No draft selected.</p>}
          {preview ? <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-900">{preview}</pre> : null}
          <Button className="mt-4" variant="secondary" onClick={() => { setOffer(null); setPreview(""); }}><RefreshCw className="h-4 w-4" /> New offer</Button>
        </aside>
      </div>
    </div>
  );
}
