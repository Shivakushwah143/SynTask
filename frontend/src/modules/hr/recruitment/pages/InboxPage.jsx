import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { 
  Download, 
  ExternalLink, 
  FileText, 
  Paperclip, 
  RefreshCw, 
  XCircle, 
  ArrowDownToLine, 
  MailCheck, 
  MailWarning, 
  Eye,
  Inbox,
  Mail,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  Filter,
  Search,
  ArrowRight,
  FileCheck,
  FileX,
  Clock as ClockIcon
} from "lucide-react";
import { recruitmentApi } from "../../../../api/recruitment";
import { Button, Modal, PageHeader } from "../../../../components/ui";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { StatusBadge } from "../components/StatusBadge";
import { fmtDateTime, idOf, toArray } from "../utils/data";

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
          <p className="truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// DETAIL COMPONENT
// ============================================================
function Detail({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />}
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className="mt-1 break-words text-sm text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

// ============================================================
// ATTACHMENT COMPONENT
// ============================================================
function AttachmentItem({ attachment, index }) {
  const openAttachment = () => {
    const content = attachment.content_base64 || ""
    const mimeType = attachment.mime_type || "application/octet-stream"
    if (!content) return
    try {
      const byteCharacters = atob(content)
      const byteNumbers = Array.from(byteCharacters, (char) => char.charCodeAt(0))
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mimeType })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener,noreferrer")
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      toast.error("Could not open attachment")
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 transition hover:border-indigo-200 dark:border-gray-700 dark:hover:border-indigo-700">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {attachment.filename || `attachment-${index + 1}`}
          </p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {attachment.mime_type || "unknown type"} · {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : "size unknown"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {attachment.content_base64 && (
          <button
            onClick={openAttachment}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
          >
            <Download className="h-3.5 w-3.5" />
            Open
          </button>
        )}
        {attachment.url && (
          <button
            onClick={() => window.open(attachment.url, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open link
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================
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
  
  const mutation = useMutation(
    ({ action, id }) => recruitmentApi[action](id), 
    { 
      onSuccess: () => { 
        toast.success("Inbox updated successfully! ✅"); 
        qc.invalidateQueries(["recruitment", "inbox"]); 
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Action failed");
      }
    } 
  );
  
  const syncMutation = useMutation(() => recruitmentApi.syncInboxNow(), {
    onSuccess: (response) => {
      const synced = response?.synced_count ?? response?.data?.synced_count ?? 0;
      const processed = response?.processed_count ?? response?.data?.processed_count ?? 0;
      toast.success(`Synced ${synced} email(s), processed ${processed}. 📨`);
      qc.invalidateQueries(["recruitment", "inbox"]);
      qc.invalidateQueries(["recruitment", "candidates"]);
      qc.invalidateQueries(["recruitment", "jobs", "dashboard"]);
      qc.invalidateQueries(["recruitment", "dashboard"]);
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || "Sync failed");
    }
  });

  // Calculate stats
  const inboxItems = toArray(query.data);
  const stats = {
    total: inboxItems.length,
    pending: inboxItems.filter(item => item.status === 'pending').length,
    processing: inboxItems.filter(item => item.status === 'processing').length,
    imported: inboxItems.filter(item => item.status === 'imported').length,
    duplicate: inboxItems.filter(item => item.status === 'duplicate').length,
    failed: inboxItems.filter(item => item.status === 'failed').length,
  };

  const columns = [
    { 
      key: "sender", 
      header: "Sender", 
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {row.sender_name || "Unknown Sender"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {row.sender_email || row.sender || "—"}
            </p>
          </div>
        </div>
      ) 
    },
    { 
      key: "subject", 
      header: "Subject", 
      render: (row) => (
        <div className="max-w-xs">
          <p className="truncate text-sm text-gray-700 dark:text-gray-300">
            {row.subject || row.original_filename || "—"}
          </p>
        </div>
      ) 
    },
    { 
      key: "status", 
      header: "Status", 
      render: (row) => <StatusBadge status={row.status} /> 
    },
    { 
      key: "created_at", 
      header: "Imported", 
      render: (row) => (
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <ClockIcon className="h-3.5 w-3.5" />
          <span>{fmtDateTime(row.created_at || row.createdAt)}</span>
        </div>
      ) 
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-1">
          <button
            onClick={() => setPreviewId(idOf(row))}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-indigo-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
            title="Preview mail"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => mutation.mutate({ id: idOf(row), action: "retryInbox" })}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-emerald-100 hover:text-emerald-600 dark:text-gray-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
            title="Retry import"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => mutation.mutate({ id: idOf(row), action: "ignoreInbox" })}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-rose-100 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
            title="Ignore mail"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const preview = previewQuery.data?.data || previewQuery.data || null;
  const attachments = Array.isArray(preview?.attachments) ? preview.attachments : [];
  const isConfigured = syncStatusQuery.data?.data?.configured ?? syncStatusQuery.data?.configured;

  return (
    <div className="space-y-4 p-4 md:p-5">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 px-4 py-3 text-white shadow-sm">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <Inbox className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold md:text-xl">Recruitment Inbox</h1>
                <p className="truncate text-xs text-cyan-100">Resume import queue, duplicates and retries.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button 
                onClick={() => syncMutation.mutate()} 
                disabled={syncMutation.isLoading}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50 disabled:opacity-50"
              >
                {syncMutation.isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="h-4 w-4" />
                    Sync Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Emails" 
          value={stats.total} 
          icon={Mail} 
          color="indigo"
          subtitle="All imported emails"
        />
        <StatCard 
          label="Pending" 
          value={stats.pending + stats.processing} 
          icon={Clock} 
          color="amber"
          subtitle="Awaiting processing"
        />
        <StatCard 
          label="Imported" 
          value={stats.imported} 
          icon={CheckCircle} 
          color="emerald"
          subtitle="Successfully processed"
        />
        <StatCard 
          label="Failed" 
          value={stats.failed + stats.duplicate} 
          icon={AlertCircle} 
          color="rose"
          subtitle="Needs attention"
        />
      </div>

      {/* ============================================================ */}
      {/* SYNC STATUS BANNER */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/70">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
              <MailCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sync Status</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Email integration and configuration</p>
            </div>
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            {isConfigured ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <MailCheck className="h-4 w-4" />
                Mail sync configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <MailWarning className="h-4 w-4" />
                Mail sync not fully configured
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">Folder:</span>
                {(syncStatusQuery.data?.data?.folder ?? syncStatusQuery.data?.folder) || "INBOX"}
              </span>
              <span className="hidden h-4 w-px bg-gray-300 dark:bg-gray-700 sm:block"></span>
              <span className="flex items-center gap-1.5">
                <span className="font-medium">Target:</span>
                {(syncStatusQuery.data?.data?.target_company_email ?? syncStatusQuery.data?.target_company_email) || "not set"}
              </span>
              <span className="hidden h-4 w-px bg-gray-300 dark:bg-gray-700 sm:block"></span>
              <span className="flex items-center gap-1.5">
                <span className="font-medium">Company:</span>
                {(syncStatusQuery.data?.data?.resolved_company_name ?? syncStatusQuery.data?.resolved_company_name) || "unresolved"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters"
          description="Filter emails by status"
          action={
            <button
              onClick={() => setFilters({})}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          }
        />
        <div className="p-3">
          <RecruitmentFilters 
            search="" 
            onSearch={() => {}} 
            values={filters} 
            onChange={(k, v) => setFilters((c) => ({ ...c, [k]: v }))} 
            onReset={() => setFilters({})} 
            filters={[
              { 
                key: "status", 
                label: "Status", 
                options: ["pending", "processing", "imported", "duplicate", "failed", "ignored"] 
              }
            ]} 
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* INBOX TABLE */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Inbox}
          title="Email Imports"
          description={`${stats.total} email${stats.total !== 1 ? 's' : ''} in queue`}
        />
        <div className="p-3">
          {query.isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading inbox...</p>
              </div>
            </div>
          ) : query.isError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {query.error?.response?.data?.detail || "Could not load inbox"}
              </p>
              <button
                onClick={() => query.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : (
            <RecruitmentTable 
              query={query} 
              columns={columns} 
              data={inboxItems} 
              emptyTitle="No inbox imports" 
              emptyDescription="Email imports will appear here after backend ingestion." 
              page={page} 
              pageSize={50} 
              onPageChange={setPage} 
            />
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* PREVIEW MODAL - Glassmorphism */}
      {/* ============================================================ */}
      <Modal
        isOpen={Boolean(previewId)}
        onClose={() => setPreviewId(null)}
        title={preview?.subject || "Mail Preview"}
        description={preview ? `${preview.sender_name || preview.sender_email || "Unknown sender"} · ${fmtDateTime(preview.created_at || preview.createdAt)}` : "Loading mail..."}
        size="xl"
      >
        {previewQuery.isLoading ? (
          <div className="space-y-4">
            <div className="h-6 w-1/2 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          </div>
        ) : preview ? (
          <div className="space-y-6">
            {/* Details Grid */}
            <div className="grid gap-3 md:grid-cols-2">
              <Detail label="From" value={preview.sender_name || preview.sender_email || "—"} icon={Mail} />
              <Detail label="Email" value={preview.sender_email || "—"} icon={Mail} />
              <Detail label="Subject" value={preview.subject || "—"} icon={FileText} />
              <Detail label="Imported" value={fmtDateTime(preview.created_at || preview.createdAt)} icon={ClockIcon} />
            </div>

            {/* Email Body */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Email Body
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm leading-6 text-gray-700 dark:bg-gray-900 dark:text-gray-300 max-h-60 overflow-y-auto">
                {preview.body_preview || "No body preview available."}
              </pre>
            </div>

            {/* Attachments */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <Paperclip className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Attachments ({attachments.length})
              </div>
              {attachments.length ? (
                <div className="space-y-3">
                  {attachments.map((attachment, index) => (
                    <AttachmentItem key={`${attachment.filename || "attachment"}-${index}`} attachment={attachment} index={index} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Paperclip className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No attachments found</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-rose-500" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Unable to load this mail.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
