import { useState } from "react";
import { useQuery } from "react-query";
import { ExternalLink } from "lucide-react";

import { Button, PageHeader } from "../../../../components/ui";
import { recruitmentApi } from "../../../../api/recruitment";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { fmtDateTime, toArray } from "../utils/data";

const apiBase = import.meta.env.VITE_API_URL || "/api/v1";

const getResumeUrl = (row) => {
  const url = row.storage_url || row.storageUrl || row.file_url || row.fileUrl;
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

export default function ResumePoolPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useQuery(
    ["recruitment", "resumePool", page, search],
    () => recruitmentApi.getResumePool({ page, page_size: 20, search }),
    { keepPreviousData: true }
  );
  const columns = [
    { key: "filename", header: "Resume", render: (row) => row.original_filename || row.originalFilename || row.filename || "Resume" },
    { key: "candidate", header: "Candidate", render: getCandidateName },
    { key: "mime", header: "Type", render: (row) => row.mime_type || row.mimeType || "-" },
    { key: "uploaded", header: "Uploaded", render: (row) => fmtDateTime(row.uploaded_at || row.uploadedAt) },
    {
      key: "actions",
      header: "Actions",
      minWidth: 120,
      render: (row) => {
        const url = getResumeUrl(row);
        return (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!url}
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>
        );
      },
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Resume Pool" description="Permanent candidate resume repository." />
      <RecruitmentFilters
        search={search}
        onSearch={setSearch}
        values={{}}
        onChange={() => {}}
        onReset={() => setSearch("")}
      />
      <RecruitmentTable
        query={query}
        columns={columns}
        data={toArray(query.data)}
        emptyTitle="No resumes found"
        emptyDescription="Resumes from portal, inbox and attachments will appear here."
        page={page}
        pageSize={20}
        onPageChange={setPage}
      />
    </div>
  );
}
