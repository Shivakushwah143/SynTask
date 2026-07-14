import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { Download, ExternalLink, FileText, Paperclip, RefreshCw, XCircle, ArrowDownToLine, MailCheck, MailWarning, Eye } from "lucide-react";
import { recruitmentApi } from "../../../../api/recruitment";
import { Button, Modal, PageHeader } from "../../../../components/ui";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { StatusBadge } from "../components/StatusBadge";
import { fmtDateTime, idOf, toArray } from "../utils/data";

export default function InboxPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [previewId, setPreviewId] = useState(null);
  const params = { page, page_size: 50, ...filters };
  const query = useQuery(["recruitment", "inbox", params], () => recruitmentApi.getInbox(params), { keepPreviousData: true });
  const syncStatusQuery = useQuery(["recruitment", "inbox", "sync-status"], () => recruitmentApi.getInboxSyncStatus());
  const previewQuery = useQuery(["recruitment", "inbox", "preview", previewId], () => recruitmentApi.getInboxItem(previewId), {
    enabled: Boolean(previewId),
  });
  const mutation = useMutation(({ action, id }) => recruitmentApi[action](id), { onSuccess: () => { toast.success("Inbox updated"); qc.invalidateQueries(["recruitment", "inbox"]); } });
  const syncMutation = useMutation(() => recruitmentApi.syncInboxNow(), {
    onSuccess: (response) => {
      const synced = response?.synced_count ?? response?.data?.synced_count ?? 0;
      const processed = response?.processed_count ?? response?.data?.processed_count ?? 0;
      toast.success(`Synced ${synced} email(s), processed ${processed}.`);
      qc.invalidateQueries(["recruitment", "inbox"]);
      qc.invalidateQueries(["recruitment", "candidates"]);
      qc.invalidateQueries(["recruitment", "jobs", "dashboard"]);
      qc.invalidateQueries(["recruitment", "dashboard"]);
    },
  });
  const columns = [
    { key: "sender", header: "Sender", render: (row) => row.sender_email || row.sender || "—" },
    { key: "subject", header: "Subject", render: (row) => row.subject || row.original_filename || "—" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", header: "Imported", render: (row) => fmtDateTime(row.created_at || row.createdAt) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setPreviewId(idOf(row))} title="Preview mail">
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => mutation.mutate({ id: idOf(row), action: "retryInbox" })} title="Retry import">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => mutation.mutate({ id: idOf(row), action: "ignoreInbox" })} title="Ignore mail">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const preview = previewQuery.data?.data || previewQuery.data || null;
  const attachments = Array.isArray(preview?.attachments) ? preview.attachments : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Recruitment Inbox"
        description="Email resume import queue, duplicate detection and retry handling."
        actions={<Button onClick={() => syncMutation.mutate()} loading={syncMutation.isLoading}><ArrowDownToLine className="h-4 w-4" /> Sync now</Button>}
      />
      <div className="mb-4 rounded-2xl border border-surface-border bg-surface p-4 dark:bg-[var(--color-app-surface)]">
        <div className="flex flex-wrap items-center gap-3">
          {(syncStatusQuery.data?.data?.configured ?? syncStatusQuery.data?.configured) ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-600 dark:text-emerald-400">
              <MailCheck className="h-4 w-4" />
              Mail sync configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-600 dark:text-amber-400">
              <MailWarning className="h-4 w-4" />
              Mail sync not fully configured
            </span>
          )}
          <span className="text-sm text-text-muted dark:text-text-secondary">
            Folder: {(syncStatusQuery.data?.data?.folder ?? syncStatusQuery.data?.folder) || "INBOX"}{" "}
            · Target: {(syncStatusQuery.data?.data?.target_company_email ?? syncStatusQuery.data?.target_company_email) || "not set"}{" "}
            · Company: {(syncStatusQuery.data?.data?.resolved_company_name ?? syncStatusQuery.data?.resolved_company_name) || "unresolved"}
          </span>
        </div>
      </div>
      <RecruitmentFilters search="" onSearch={() => {}} values={filters} onChange={(k, v) => setFilters((c) => ({ ...c, [k]: v }))} onReset={() => setFilters({})} filters={[{ key: "status", label: "Status", options: ["pending", "processing", "imported", "duplicate", "failed", "ignored"] }]} />
      <RecruitmentTable query={query} columns={columns} data={toArray(query.data)} emptyTitle="No inbox imports" emptyDescription="Email imports will appear here after backend ingestion." page={page} pageSize={50} onPageChange={setPage} />
      <Modal
        isOpen={Boolean(previewId)}
        onClose={() => setPreviewId(null)}
        title={preview?.subject || "Mail preview"}
        description={preview ? `${preview.sender_name || preview.sender_email || "Unknown sender"} · ${fmtDateTime(preview.created_at || preview.createdAt)}` : "Loading mail..."}
        size="xl"
      >
        {previewQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-5 w-1/2 animate-pulse rounded bg-surface-muted" />
            <div className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
          </div>
        ) : preview ? (
          <div className="space-y-6">
            <div className="grid gap-3 rounded-2xl border border-surface-border bg-surface p-4 dark:bg-[var(--color-app-surface)] md:grid-cols-2">
              <Detail label="From" value={preview.sender_name || preview.sender_email || "—"} />
              <Detail label="Email" value={preview.sender_email || "—"} />
              <Detail label="Subject" value={preview.subject || "—"} />
              <Detail label="Imported" value={fmtDateTime(preview.created_at || preview.createdAt)} />
            </div>

            <section className="rounded-2xl border border-surface-border bg-surface p-4 dark:bg-[var(--color-app-surface)]">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <FileText className="h-4 w-4" />
                Email body
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-4 text-sm leading-6 text-text-primary dark:bg-[var(--color-app-surface-muted)]">
                {preview.body_preview || "No body preview available."}
              </pre>
            </section>

            <section className="rounded-2xl border border-surface-border bg-surface p-4 dark:bg-[var(--color-app-surface)]">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Paperclip className="h-4 w-4" />
                Attachments
              </div>
              {attachments.length ? (
                <div className="space-y-3">
                  {attachments.map((attachment, index) => (
                    <div key={`${attachment.filename || "attachment"}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{attachment.filename || "attachment"}</p>
                        <p className="text-xs text-text-muted">
                          {(attachment.mime_type || "unknown type")} · {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : "size unknown"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {attachment.content_base64 ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openAttachment(attachment)}
                          >
                            <Download className="h-4 w-4" /> Open
                          </Button>
                        ) : null}
                        {attachment.url ? (
                          <Button size="sm" variant="ghost" onClick={() => window.open(attachment.url, "_blank", "noopener,noreferrer")}>
                            <ExternalLink className="h-4 w-4" /> Open link
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No attachments found.</p>
              )}
            </section>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Unable to load this mail.</p>
        )}
      </Modal>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-1 break-words text-sm text-text-primary">{value}</p>
    </div>
  )
}

function openAttachment(attachment) {
  const content = attachment.content_base64 || ""
  const mimeType = attachment.mime_type || "application/octet-stream"
  if (!content) return
  const byteCharacters = atob(content)
  const byteNumbers = Array.from(byteCharacters, (char) => char.charCodeAt(0))
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: mimeType })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener,noreferrer")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

