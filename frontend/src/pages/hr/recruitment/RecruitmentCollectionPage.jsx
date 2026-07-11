import { useQuery } from "react-query";

import { recruitmentApi } from "../../../api/recruitment";
import { EmptyState, PageHeader, SkeletonTable } from "../../../components/ui";

const pageConfig = {
  jobs: {
    title: "Recruitment Jobs",
    description: "Manage job openings from the HR recruitment module.",
    queryKey: ["recruitment", "jobs"],
    queryFn: () => recruitmentApi.getJobs({ limit: 10 }),
    emptyTitle: "No jobs found",
  },
  candidates: {
    title: "Candidates",
    description: "Review candidates and applications from the recruitment workspace.",
    queryKey: ["recruitment", "candidates"],
    queryFn: () => recruitmentApi.getCandidates({ limit: 10 }),
    emptyTitle: "No candidates found",
  },
  interviews: {
    title: "Interviews",
    description: "Track scheduled interviews, panels and decisions.",
    queryKey: ["recruitment", "interviews"],
    queryFn: () => recruitmentApi.getInterviews({ limit: 10 }),
    emptyTitle: "No interviews found",
  },
  reports: {
    title: "Recruitment Reports",
    description: "Hiring funnel, source, recruiter and interview analytics.",
    queryKey: ["recruitment", "reports"],
    queryFn: () => recruitmentApi.getReportsOverview(),
    emptyTitle: "No report data found",
  },
};

const getItems = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export default function RecruitmentCollectionPage({ type }) {
  const config = pageConfig[type];
  const query = useQuery(config.queryKey, config.queryFn, { retry: 1 });
  const items = getItems(query.data);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title={config.title} description={config.description} />

      {query.isLoading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : query.isError ? (
        <EmptyState
          title={`${config.title} unavailable`}
          description="The HR route is ready, but this recruitment API did not return successfully."
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={config.emptyTitle}
          description="This screen is wired into the HR department shell and ready for the full recruitment workflow UI."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-surface-border bg-surface shadow-card dark:border-gray-800 dark:bg-gray-950">
          <div className="border-b border-surface-border px-5 py-4 dark:border-gray-800">
            <p className="text-sm font-semibold text-text-primary">Latest records</p>
          </div>
          <div className="divide-y divide-surface-border dark:divide-gray-800">
            {items.slice(0, 10).map((item, index) => (
              <div key={item.id || item._id || index} className="px-5 py-4">
                <p className="font-medium text-text-primary">
                  {item.title || item.fullName || item.full_name || item.name || item.status || `Record ${index + 1}`}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {item.email || item.location || item.departmentName || item.department || item.createdAt || item.created_at || "Recruitment record"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
