import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "react-query";
import { CheckCircle, XCircle, Download } from "lucide-react";

import { publicOffersApi } from "../../../../api/recruitment";
import { Button } from "../../../../components/ui";
import { fmtDateTime } from "../utils/data";

export default function CandidateOfferPage() {
  const { token } = useParams();
  const [comment, setComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const query = useQuery(["publicOffer", token], () => publicOffersApi.getOffer(token), { retry: 1 });
  const decide = useMutation((accepted) => accepted ? publicOffersApi.accept(token, { comment }) : publicOffersApi.reject(token, { comment, rejection_reason: rejectionReason }), {
    onSuccess: () => query.refetch(),
  });
  const offer = query.data?.data || query.data;

  if (query.isLoading) return <div className="p-8 text-center text-sm text-gray-500">Loading offer...</div>;
  if (query.isError) return <div className="p-8 text-center text-sm text-rose-600">Offer link expired or unavailable.</div>;

  const decided = ["accepted", "rejected", "expired", "withdrawn"].includes(offer.status);

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-8">
      <section className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase text-indigo-600">Offer Letter</p>
            <h1 className="mt-1 text-2xl font-bold">{offer.job_title || "Employment Offer"}</h1>
            <p className="mt-1 text-sm text-gray-500">{offer.department || "Department"} | expires {fmtDateTime(offer.offer_expiry)}</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium capitalize">{offer.status}</span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Joining date</p><p className="font-semibold">{fmtDateTime(offer.joining_date)}</p></div>
          <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Base salary</p><p className="font-semibold">{offer.currency} {Number(offer.base_salary || 0).toLocaleString()}</p></div>
          <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Total compensation</p><p className="font-semibold">{offer.currency} {Number(offer.total_compensation || 0).toLocaleString()}</p></div>
        </div>

        {offer.preview ? <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 text-sm leading-6">{offer.preview}</pre> : null}

        <div className="mt-6">
          <label className="text-sm font-medium">Comment</label>
          <textarea className="mt-2 min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} disabled={decided} />
          <label className="mt-4 block text-sm font-medium">Rejection reason</label>
          <input className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} disabled={decided} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {offer.pdf_available ? <a className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium" href={publicOffersApi.pdfUrl(token)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Download PDF</a> : null}
          <Button onClick={() => decide.mutate(true)} disabled={decided || decide.isLoading}><CheckCircle className="h-4 w-4" /> Accept</Button>
          <Button variant="secondary" onClick={() => decide.mutate(false)} disabled={decided || decide.isLoading || !rejectionReason.trim()}><XCircle className="h-4 w-4" /> Reject</Button>
        </div>
      </section>
    </main>
  );
}
