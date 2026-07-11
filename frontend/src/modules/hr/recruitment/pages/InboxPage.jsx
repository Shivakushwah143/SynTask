import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { RefreshCw, XCircle } from "lucide-react";
import { recruitmentApi } from "../../../../api/recruitment";
import { Button, PageHeader } from "../../../../components/ui";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { StatusBadge } from "../components/StatusBadge";
import { fmtDateTime, idOf, toArray } from "../utils/data";

export default function InboxPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const params = { page, page_size: 20, ...filters };
  const query = useQuery(["recruitment", "inbox", params], () => recruitmentApi.getInbox(params), { keepPreviousData: true });
  const mutation = useMutation(({ action, id }) => recruitmentApi[action](id), { onSuccess: () => { toast.success("Inbox updated"); qc.invalidateQueries(["recruitment", "inbox"]); } });
  const columns = [
    { key: "sender", header: "Sender", render: (row) => row.sender_email || row.sender || "—" },
    { key: "subject", header: "Subject", render: (row) => row.subject || row.original_filename || "—" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", header: "Imported", render: (row) => fmtDateTime(row.created_at || row.createdAt) },
    { key: "actions", header: "Actions", render: (row) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => mutation.mutate({ id: idOf(row), action: "retryInbox" })}><RefreshCw className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => mutation.mutate({ id: idOf(row), action: "ignoreInbox" })}><XCircle className="h-4 w-4" /></Button></div> },
  ];
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Recruitment Inbox" description="Email resume import queue, duplicate detection and retry handling." />
      <RecruitmentFilters search="" onSearch={() => {}} values={filters} onChange={(k, v) => setFilters((c) => ({ ...c, [k]: v }))} onReset={() => setFilters({})} filters={[{ key: "status", label: "Status", options: ["pending", "processing", "imported", "duplicate", "failed", "ignored"] }]} />
      <RecruitmentTable query={query} columns={columns} data={toArray(query.data)} emptyTitle="No inbox imports" emptyDescription="Email imports will appear here after backend ingestion." page={page} pageSize={20} onPageChange={setPage} />
    </div>
  );
}

