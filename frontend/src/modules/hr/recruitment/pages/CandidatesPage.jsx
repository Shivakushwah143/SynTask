import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import { 
  Archive, 
  Paperclip, 
  UserPlus,
  Users,
  UserCheck,
  UserX,
  UserMinus,
  Filter,
  Search,
  RefreshCw,
  Eye,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  Clock,
  Award,
  FileText,
  MessageSquare,
  Upload,
  Link,
  User,
  Building2,
  Star,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock as ClockIcon
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, FormField, PageHeader, inputClassName } from "../../../../components/ui";
import { CANDIDATE_STATUSES } from "../constants";
import { AssignRecruiterDialog } from "../dialogs/RecruitmentDialogs";
import { RecruitmentDrawer } from "../components/RecruitmentDrawer";
import { RecruitmentFilters } from "../components/RecruitmentFilters";
import { RecruitmentTable } from "../components/RecruitmentTable";
import { RecruitmentTabs } from "../components/RecruitmentTabs";
import { RecruitmentTimeline } from "../components/RecruitmentTimeline";
import { StatusBadge } from "../components/StatusBadge";
import { compactParams, fmtDateTime, idOf, toArray } from "../utils/data";

const tabs = [
  { key: "overview", label: "Overview", icon: User },
  { key: "resume", label: "Resume", icon: FileText },
  { key: "applications", label: "Applications", icon: Briefcase },
  { key: "timeline", label: "Timeline", icon: Clock },
  { key: "interviews", label: "Interviews", icon: Calendar },
  { key: "notes", label: "Notes", icon: MessageSquare },
  { key: "attachments", label: "Attachments", icon: Paperclip },
  { key: "assignment", label: "Assignment", icon: UserPlus },
];

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
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// DETAIL ITEM COMPONENT
// ============================================================
const DetailItem = ({ label, value, icon: Icon }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />}
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
    </div>
    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value || "—"}</p>
  </div>
)

// ============================================================
// SKILLS COMPONENT
// ============================================================
const SkillsList = ({ skills }) => {
  const skillArray = Array.isArray(skills) ? skills : skills?.split(',').map(s => s.trim()) || [];
  
  if (!skillArray.length) return <p className="text-sm text-gray-500 dark:text-gray-400">No skills listed</p>;
  
  return (
    <div className="flex flex-wrap gap-2">
      {skillArray.slice(0, 8).map((skill, index) => (
        <span 
          key={index}
          className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
        >
          {skill}
        </span>
      ))}
      {skillArray.length > 8 && (
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          +{skillArray.length - 8} more
        </span>
      )}
    </div>
  )
}

// ============================================================
// QUICK ACTION BUTTON
// ============================================================
const QuickActionButton = ({ icon: Icon, label, onClick, loading, variant = 'secondary' }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
      variant === 'primary' 
        ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700'
        : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
    } disabled:opacity-50`}
  >
    {loading ? (
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    ) : (
      <Icon className="h-4 w-4" />
    )}
    {label}
  </button>
)

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CandidatesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [assignOpen, setAssignOpen] = useState(false);
  const [note, setNote] = useState("");
  
  const params = compactParams({ page, page_size: 20, search, ...filters });
  const query = useQuery(["recruitment", "candidates", params], () => recruitmentApi.getCandidates(params), { keepPreviousData: true });
  const detail = useQuery(["recruitment", "candidate", idOf(selected)], () => recruitmentApi.getCandidate(idOf(selected)), { enabled: !!selected });
  const timeline = useQuery(["recruitment", "candidateTimeline", idOf(selected)], () => recruitmentApi.getCandidateTimeline(idOf(selected)), { enabled: !!selected });
  
  const invalidate = () => qc.invalidateQueries(["recruitment", "candidates"]);
  
  const assign = useMutation(
    (payload) => recruitmentApi.assignCandidate(idOf(selected), payload), 
    { 
      onSuccess: () => { 
        toast.success("Recruiter assigned successfully! 👤"); 
        setAssignOpen(false); 
        invalidate(); 
        qc.invalidateQueries(["recruitment", "candidate", idOf(selected)]);
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to assign recruiter");
      }
    } 
  );
  
  const archive = useMutation(
    (id) => recruitmentApi.archiveCandidate(id), 
    { 
      onSuccess: () => { 
        toast.success("Candidate archived successfully! 📦"); 
        invalidate(); 
        setSelected(null);
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to archive candidate");
      }
    } 
  );
  
  const addNote = useMutation(
    (body) => recruitmentApi.addCandidateNote(idOf(selected), { body }), 
    { 
      onSuccess: () => { 
        toast.success("Note added successfully! 📝"); 
        setNote(""); 
        qc.invalidateQueries(["recruitment", "candidate", idOf(selected)]); 
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || "Failed to add note");
      }
    } 
  );

  // Calculate stats
  const candidates = toArray(query.data);
  const stats = {
    total: candidates.length,
    active: candidates.filter(c => c.status === 'active' || c.status === 'new').length,
    shortlisted: candidates.filter(c => c.status === 'shortlisted' || c.status === 'interview').length,
    rejected: candidates.filter(c => c.status === 'rejected' || c.status === 'archived').length,
  };

  const columns = useMemo(() => [
    { 
      key: "name", 
      header: "Candidate", 
      minWidth: 220, 
      render: (row) => (
        <button 
          className="font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300" 
          onClick={() => { setSelected(row); setActiveTab("overview"); }}
        >
          {row.full_name || row.fullName || row.name || "Candidate"}
        </button>
      ) 
    },
    { 
      key: "email", 
      header: "Email", 
      minWidth: 220, 
      render: (row) => (
        <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
          <Mail className="h-3.5 w-3.5" />
          <span>{row.email || "—"}</span>
        </div>
      ) 
    },
    { 
      key: "status", 
      header: "Status", 
      render: (row) => <StatusBadge status={row.status} /> 
    },
    { 
      key: "source", 
      header: "Source", 
      render: (row) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
          {row.source || "—"}
        </span>
      ) 
    },
    { 
      key: "actions", 
      header: "Actions", 
      minWidth: 150, 
      render: (row) => (
        <div className="flex gap-1">
          <button
            onClick={() => { setSelected(row); setAssignOpen(true); }}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-indigo-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
            aria-label="Assign recruiter"
          >
            <UserPlus className="h-4 w-4" />
          </button>
          <button
            onClick={() => archive.mutate(idOf(row))}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-rose-100 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
            aria-label="Archive candidate"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      ) 
    },
  ], [archive]);

  const candidate = detail.data || selected;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Candidates</h1>
                <p className="mt-1 text-indigo-100">
                  Tabbed candidate workspace with timeline, notes, resume, attachments and assignment.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => query.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Candidates" 
          value={stats.total} 
          icon={Users} 
          color="indigo"
          subtitle="All candidates in system"
        />
        <StatCard 
          label="Active" 
          value={stats.active} 
          icon={UserCheck} 
          color="emerald"
          subtitle="Active & new candidates"
        />
        <StatCard 
          label="Shortlisted" 
          value={stats.shortlisted} 
          icon={Star} 
          color="amber"
          subtitle="In interview process"
        />
        <StatCard 
          label="Rejected" 
          value={stats.rejected} 
          icon={UserX} 
          color="rose"
          subtitle="Archived & rejected"
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters & Search"
          description="Search candidates by name, email, or filter by status and source"
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
        <div className="p-4">
          <RecruitmentFilters
            search={search}
            onSearch={(v) => { setSearch(v); setPage(1); }}
            values={filters}
            onChange={(k, v) => { setFilters((current) => ({ ...current, [k]: v })); setPage(1); }}
            onReset={() => { setSearch(""); setFilters({}); }}
            filters={[
              { key: "status", label: "Status", options: CANDIDATE_STATUSES },
              { key: "source", label: "Source", options: ["portal", "email", "manual", "referral"] },
              { key: "notice_period", label: "Notice period", options: ["immediate", "15_days", "30_days", "60_days", "90_days"] },
            ]}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* CANDIDATES TABLE */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Users}
          title="All Candidates"
          description={`${stats.total} candidate${stats.total !== 1 ? 's' : ''} found`}
        />
        <div className="p-4">
          {query.isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading candidates...</p>
              </div>
            </div>
          ) : query.isError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {query.error?.response?.data?.detail || "Could not load candidates"}
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
              data={candidates} 
              emptyTitle="No candidates found" 
              emptyDescription="Portal and inbox applications will create candidates here." 
              page={page} 
              pageSize={20} 
              onPageChange={setPage} 
            />
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* CANDIDATE DRAWER */}
      {/* ============================================================ */}
      <RecruitmentDrawer 
        open={!!selected} 
        title={candidate?.full_name || candidate?.fullName || "Candidate"} 
        description={candidate?.email || "No email provided"} 
        onClose={() => setSelected(null)}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
          {/* Main Content */}
          <div className="min-w-0">
            <RecruitmentTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
            
            {/* Overview Tab */}
            {activeTab === "overview" && candidate && (
              <div className="mt-4 space-y-5">
                <div className="flex items-center gap-3">
                  <StatusBadge status={candidate?.status} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Updated {fmtDateTime(candidate?.updated_at || candidate?.updatedAt)}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <DetailItem label="Phone" value={candidate?.phone} icon={Phone} />
                  <DetailItem label="Location" value={candidate?.location} icon={MapPin} />
                  <DetailItem label="Experience" value={candidate?.experience_years ? `${candidate.experience_years} years` : null} icon={Briefcase} />
                  <DetailItem label="Current Company" value={candidate?.current_company} icon={Building2} />
                  <DetailItem label="Expected Salary" value={candidate?.expected_salary ? `₹${candidate.expected_salary.toLocaleString()}` : null} icon={Award} />
                  <DetailItem label="Notice Period" value={candidate?.notice_period?.replace(/_/g, ' ')} icon={ClockIcon} />
                </div>

                {candidate?.skills && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Skills</h4>
                    <SkillsList skills={candidate.skills} />
                  </div>
                )}

                {candidate?.summary && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Summary</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{candidate.summary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Timeline Tab */}
            {activeTab === "timeline" && (
              <div className="mt-4">
                <RecruitmentTimeline events={timeline.data} />
              </div>
            )}

            {/* Notes Tab */}
            {activeTab === "notes" && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Add Note
                  </label>
                  <textarea 
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white min-h-24"
                    placeholder="Enter your notes here..."
                    value={note} 
                    onChange={(e) => setNote(e.target.value)} 
                  />
                  <button
                    disabled={!note.trim() || addNote.isLoading}
                    onClick={() => addNote.mutate(note)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {addNote.isLoading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Adding...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4" />
                        Add Note
                      </>
                    )}
                  </button>
                </div>

                {/* Display existing notes would go here */}
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Notes will appear here</p>
                </div>
              </div>
            )}

            {/* Other Tabs */}
            {["resume", "applications", "interviews", "attachments", "assignment"].includes(activeTab) && (
              <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-12 dark:border-gray-700">
                <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeTab} data will render here when available
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Actions</h3>
              <div className="mt-3 space-y-2">
                <QuickActionButton 
                  icon={UserPlus} 
                  label="Assign Recruiter" 
                  onClick={() => setAssignOpen(true)} 
                />
                <QuickActionButton 
                  icon={Archive} 
                  label="Archive Candidate" 
                  onClick={() => archive.mutate(idOf(candidate))}
                  loading={archive.isLoading}
                />
                <QuickActionButton 
                  icon={Paperclip} 
                  label="Add Attachment" 
                  onClick={() => toast.success("Attachment feature coming soon")}
                />
                <QuickActionButton 
                  icon={Link} 
                  label="Share Profile" 
                  onClick={() => toast.success("Share feature coming soon")}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity</h3>
              <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <p>Last updated: {fmtDateTime(candidate?.updated_at || candidate?.updatedAt || candidate?.created_at || candidate?.createdAt)}</p>
                {candidate?.created_at && (
                  <p>Created: {fmtDateTime(candidate.created_at)}</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </RecruitmentDrawer>

      {/* ============================================================ */}
      {/* ASSIGN RECRUITER DIALOG */}
      {/* ============================================================ */}
      <AssignRecruiterDialog 
        open={assignOpen} 
        onClose={() => setAssignOpen(false)} 
        onSubmit={(payload) => assign.mutate(payload)} 
        loading={assign.isLoading} 
      />
    </div>
  );
}
