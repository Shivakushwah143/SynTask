import { useState } from "react";
import { useQuery } from "react-query";
import { PageHeader } from "../../../../components/ui";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { fmtDateTime, toArray } from "../utils/data";
import { recruitmentApi } from "../../../../api/recruitment";

export default function ResumePoolPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useQuery(["recruitment", "resumePool", page, search], () => recruitmentApi.getResumePool({ page, page_size: 20, search }), { keepPreviousData: true });
  const columns = [
    { key: "filename", header: "Resume", render: (row) => row.original_filename || row.originalFilename || row.filename || "Resume" },
    { key: "candidate", header: "Candidate", render: (row) => row.candidate_name || row.candidate_id || "—" },
    { key: "mime", header: "Type", render: (row) => row.mime_type || row.mimeType || "—" },
    { key: "uploaded", header: "Uploaded", render: (row) => fmtDateTime(row.uploaded_at || row.uploadedAt) },
  ];
  return <div className="p-4 sm:p-6 lg:p-8"><PageHeader title="Resume Pool" description="Permanent candidate resume repository." /><RecruitmentFilters search={search} onSearch={setSearch} values={{}} onChange={() => {}} onReset={() => setSearch("")} /><RecruitmentTable query={query} columns={columns} data={toArray(query.data)} emptyTitle="No resumes found" emptyDescription="Resumes from portal, inbox and attachments will appear here." page={page} pageSize={20} onPageChange={setPage} /></div>;
}

