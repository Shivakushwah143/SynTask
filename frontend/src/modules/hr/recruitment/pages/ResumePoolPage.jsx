import { useState } from "react";
import { useQuery } from "react-query";
import { 
  ExternalLink, 
  FileText, 
  Users, 
  Upload, 
  Clock, 
  Filter, 
  Search, 
  RefreshCw,
  AlertCircle,
  File,
  Image,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileJson,
  FileType,
  Calendar,
  User,
  Download,
  Eye,
  Layers,
  Database,
  TrendingUp,
  Briefcase,
  CheckCircle,
  XCircle,
  Clock as ClockIcon
} from "lucide-react";

import { Button, PageHeader } from "../../../../components/ui";
import { recruitmentApi } from "../../../../api/recruitment";
import { timeService } from "@/services/timeService";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { fmtDateTime, toArray } from "../utils/data";

const apiBase = import.meta.env.VITE_API_URL || "/api/v1";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
const getResumeUrl = (row) => {
  const resumeId = row.id || row._id;
  if (resumeId) return `/api/v1/recruitment/resumes/${resumeId}/file`;
  const url = row.resume_url || row.resumeUrl || row.storage_url || row.storageUrl || row.file_url || row.fileUrl;
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/v1/")) return url;
  if (url.startsWith("/uploads/")) return `${apiBase}${url}`;
  return url;
};

const getCandidateName = (row) =>
  row.candidate_name ||
  row.candidateName ||
  row.candidate?.full_name ||
  row.candidate?.fullName ||
  row.candidate?.name ||
  "Unassigned";

const getFileIcon = (mimeType) => {
  if (!mimeType) return File;
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return FileSpreadsheet;
  if (mimeType.includes('image')) return Image;
  if (mimeType.includes('zip') || mimeType.includes('archive')) return FileArchive;
  if (mimeType.includes('json')) return FileJson;
  if (mimeType.includes('code') || mimeType.includes('text')) return FileCode;
  return File;
};

const getFileColor = (mimeType) => {
  if (!mimeType) return 'from-gray-500 to-gray-600';
  if (mimeType.includes('pdf')) return 'from-rose-500 to-pink-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'from-blue-500 to-cyan-500';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'from-emerald-500 to-teal-500';
  if (mimeType.includes('image')) return 'from-purple-500 to-pink-500';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'from-amber-500 to-orange-500';
  return 'from-indigo-500 to-purple-500';
};

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
// FILE TYPE BADGE
// ============================================================
const FileTypeBadge = ({ mimeType }) => {
  const Icon = getFileIcon(mimeType);
  const color = getFileColor(mimeType);
  const label = mimeType?.split('/').pop()?.toUpperCase() || 'FILE';
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${color} px-3 py-1 text-xs font-medium text-white shadow-sm`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ResumePoolPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  
  const query = useQuery(
    ["recruitment", "resumePool", page, search, filters],
    () => recruitmentApi.getResumePool({ page, page_size: 20, search, ...filters }),
    { keepPreviousData: true }
  );

  const resumes = toArray(query.data);
  const isLoading = query.isLoading;
  const isError = query.isError;

  // Calculate stats
  const stats = {
    total: resumes.length,
    withCandidate: resumes.filter(r => r.candidate_id || r.candidateId || r.candidate).length,
    withoutCandidate: resumes.filter(r => !r.candidate_id && !r.candidateId && !r.candidate).length,
    fileTypes: Object.values(
      resumes.reduce((acc, r) => {
        const type = r.mime_type || r.mimeType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    ).length,
  };

  const columns = [
    { 
      key: "filename", 
      header: "Resume", 
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${getFileColor(row.mime_type || row.mimeType)} text-white shadow-sm`}>
            {(() => {
              const Icon = getFileIcon(row.mime_type || row.mimeType);
              return <Icon className="h-5 w-5" />;
            })()}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {row.original_filename || row.originalFilename || row.filename || "Resume"}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <FileTypeBadge mimeType={row.mime_type || row.mimeType} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.file_size ? `${(row.file_size / 1024).toFixed(1)} KB` : ''}
              </span>
            </div>
          </div>
        </div>
      ) 
    },
    { 
      key: "candidate", 
      header: "Candidate", 
      render: (row) => {
        const name = getCandidateName(row);
        const isAssigned = row.candidate_id || row.candidateId || row.candidate;
        return (
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isAssigned ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              <User className="h-4 w-4" />
            </div>
            <span className={`text-sm ${isAssigned ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              {name}
            </span>
          </div>
        );
      } 
    },
    { 
      key: "uploaded", 
      header: "Uploaded", 
      render: (row) => (
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <Calendar className="h-3.5 w-3.5" />
          <span>{fmtDateTime(row.uploaded_at || row.uploadedAt || row.created_at || row.createdAt)}</span>
        </div>
      ) 
    },
    {
      key: "actions",
      header: "Actions",
      minWidth: 120,
      render: (row) => {
        const url = getResumeUrl(row);
        return (
          <div className="flex gap-1">
            <button
              type="button"
              disabled={!url}
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                url 
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </button>
            {url && (
              <button
                type="button"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-5">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-cyan-700 via-sky-700 to-blue-700 px-4 py-3 text-white shadow-sm">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <Database className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold md:text-xl">Resume Pool</h1>
                <p className="truncate text-xs text-sky-100">Permanent resume repository from portal, inbox and attachments.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button 
                onClick={() => query.refetch()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
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
          label="Total Resumes" 
          value={stats.total} 
          icon={FileText} 
          color="indigo"
          subtitle="All uploaded resumes"
        />
        <StatCard 
          label="With Candidate" 
          value={stats.withCandidate} 
          icon={Users} 
          color="emerald"
          subtitle="Linked to candidates"
        />
        <StatCard 
          label="Unlinked" 
          value={stats.withoutCandidate} 
          icon={User} 
          color="amber"
          subtitle="Awaiting assignment"
        />
        <StatCard 
          label="File Types" 
          value={stats.fileTypes} 
          icon={Layers} 
          color="blue"
          subtitle="Different formats"
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters & Search"
          description="Search by filename, candidate name, or file type"
          action={
            <button
              onClick={() => { setSearch(""); setFilters({}); setPage(1); }}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          }
        />
        <div className="p-3">
          <RecruitmentFilters
            search={search}
            onSearch={(v) => { setSearch(v); setPage(1); }}
            values={filters}
            onChange={(k, v) => { setFilters((current) => ({ ...current, [k]: v })); setPage(1); }}
            onReset={() => { setSearch(""); setFilters({}); setPage(1); }}
            filters={[]}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* RESUMES TABLE */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={FileText}
          title="All Resumes"
          description={`${stats.total} resume${stats.total !== 1 ? 's' : ''} in pool`}
          action={
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Last updated: {timeService.formatDate(timeService.now())}</span>
            </div>
          }
        />
        <div className="p-3">
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading resumes...</p>
              </div>
            </div>
          ) : isError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {query.error?.response?.data?.detail || "Could not load resumes"}
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
              data={resumes}
              emptyTitle="No resumes found"
              emptyDescription="Resumes from portal, inbox and attachments will appear here."
              page={page}
              pageSize={20}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
