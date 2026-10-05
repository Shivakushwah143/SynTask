import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import toast from "react-hot-toast";
import { projectsApi } from "../api/projects";
import { tasksAPI } from "../api/tasks";
import { scheduledJobsAPI } from "../api/scheduledJobs";
import { invalidateWorkspaceCalendar } from "../api/calendar";
import { usersAPI } from "../api/users";
import { componentsApi } from "../api/components";
import { versionsApi } from "../api/versions";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useAuthStore } from "../store/authStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  canManageProject,
  hasCompanyAdminAccess,
  normalizeRole,
} from "../utils/roles";
import { useProjectPermissions } from "../hooks/useProjectPermissions";
import {
  Badge,
  Button,
  ConfirmDialog,
  CreatableSelectField,
  EmptyState,
  FormField,
  Modal,
  PageHeader,
  SkeletonCard,
  SkeletonKanban,
  SkeletonTable,
  inputClassName,
} from "../components/ui";
import { QuickCreateEmployeeModal } from "../components/relatedRecords/QuickCreateModals";
import QuickAssignPanel from "../components/tasks/QuickAssignPanel";
import TaskStageMenu from "../components/tasks/TaskStageMenu";
import TaskLifecyclePipeline from "../components/tasks/TaskLifecyclePipeline";
import {
  DEFAULT_STATUSES,
  buildProjectTaskQuery,
  getProjectRoleAssignmentIds,
  getProjectRoleNames,
  getTaskAssigneeUsers,
  getUserDisplayName,
  groupTasksByStatus,
  normalizeBoardPayload,
  normalizeEstimatedHours,
  normalizeStatusId,
  resolveWorkspaceTab,
  workspaceTabParam,
} from "./ProjectBoard.helpers";
import {
  ATTENTION_FILTERS,
  BOARD_STATUSES,
  attentionCount,
  projectEmptyStateMessage,
} from "./tasksLifecycle";
import { readTaskRouteState, writeTaskRouteState } from "./tasksRouteState";
import { isFollowUpTask } from "./tasksData";

// Scheduled placeholders belong to Work -> Scheduled Work, not the Task
// lifecycle; they never surface in the Project Task workspace.
const isScheduledTask = (task) => Boolean(task?.is_scheduled_placeholder);
import { timeService } from "../services/timeService";
import CarryForwardDueDate from "../components/tasks/CarryForwardDueDate";
import { excludeCurrentUser } from "../utils/userFilters";
import TemplateApplyModal from "../components/templates/TemplateApplyModal";

const STATUS_COLORS = {
  todo: "#7C6FE0",
  assigned: "#6366F1",
  in_progress: "#FF8A4C",
  in_review: "#F59E0B",
  revision_required: "#EF4444",
  approved: "#10B981",
  completed: "#2FB47C",
  done: "#2FB47C",
  cancelled: "#9CA3AF",
};

const TASK_PRIORITY_STYLES = {
  critical:
    "border-rose-200 bg-rose-50/75 hover:border-rose-300 dark:border-rose-700/55 dark:bg-[rgb(45_24_24_/_0.96)] dark:hover:border-rose-500/75",
  high: "border-orange-200 bg-orange-50/75 hover:border-orange-300 dark:border-orange-700/55 dark:bg-[rgb(45_30_20_/_0.96)] dark:hover:border-orange-500/75",
  medium:
    "border-amber-200 bg-amber-50/70 hover:border-amber-300 dark:border-amber-700/55 dark:bg-[rgb(42_34_20_/_0.96)] dark:hover:border-amber-500/75",
  low: "border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-700/55 dark:bg-[rgb(22_38_30_/_0.96)] dark:hover:border-emerald-500/75",
};

const TASK_PRIORITY_OPTIONS = [
  {
    value: "low",
    label: "Low",
    className: "text-emerald-700 dark:text-emerald-300",
  },
  {
    value: "medium",
    label: "Medium",
    className: "text-amber-700 dark:text-amber-300",
  },
  {
    value: "high",
    label: "High",
    className: "text-orange-700 dark:text-orange-300",
  },
  {
    value: "critical",
    label: "Critical",
    className: "text-rose-700 dark:text-rose-300",
  },
];

const TASK_PRIORITY_SELECT_STYLES = {
  low: "border-emerald-300 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-700 dark:text-emerald-300",
  medium:
    "border-amber-300 text-amber-700 focus:border-amber-500 focus:ring-amber-500/20 dark:border-amber-700 dark:text-amber-300",
  high: "border-orange-300 text-orange-700 focus:border-orange-500 focus:ring-orange-500/20 dark:border-orange-700 dark:text-orange-300",
  critical:
    "border-rose-300 text-rose-700 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-700 dark:text-rose-300",
};

const PROJECT_AGENT_OPERATIONS = [
  { value: "project_summary", label: "Project summary" },
  { value: "decompose_scope", label: "Decompose scope" },
  { value: "identify_risks", label: "Identify risks" },
  { value: "execution_guidance", label: "Execution guidance" },
  { value: "review_plan", label: "Review plan" },
  { value: "estimate_work", label: "Estimate work" },
  { value: "comprehensive_project_review", label: "Full review" },
];

export default function ProjectBoard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const userRole = normalizeRole(user?.role);
  const isManager = userRole === "manager";
  // The URL is the single source of truth for the task workspace. State is
  // initialized from the URL (and re-synced by the read effect below), so a
  // remount after Back/Forward never rewrites the query string using stale
  // empty state - which previously flickered the URL between two forms.
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readTaskRouteState(searchParams);
  const initialActiveTab = resolveWorkspaceTab(searchParams.get("tab"));
  const initialFilters = {
    priority: routeState.filters.priority || "",
    assignee: routeState.filters.assigned_to || "",
    due_from: routeState.filters.due_from || "",
    due_to: routeState.filters.due_to || "",
  };
  // Holds the URL whose query state has already been applied to component
  // state. Write effects skip while an external navigation (Back/Forward/
  // deep link) is in flight - otherwise they would rewrite the incoming URL
  // with the still-stale pre-navigation state and the address bar flickers
  // between two forms. Synced below in an effect that runs AFTER the write
  // effects, so in-flight external changes are always detected.
  const appliedUrlRef = useRef(searchParams.toString());
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [projectInfo, setProjectInfo] = useState(null);
  const [boardData, setBoardData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [pages, setPages] = useState([]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [components, setComponents] = useState([]);
  const [versions, setVersions] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [projectAssignableUsers, setProjectAssignableUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState(routeState.searchQuery);
  const [filters, setFilters] = useState(initialFilters);
  const [taskView, setTaskView] = useState(routeState.view);
  const [taskStatus, setTaskStatus] = useState(routeState.filters.status || "");
  const [taskAttention, setTaskAttention] = useState(routeState.attention);
  const [taskPage, setTaskPage] = useState(1);
  const [projectTasks, setProjectTasks] = useState([]);
  const [projectTasksTotal, setProjectTasksTotal] = useState(0);
  const [taskSummary, setTaskSummary] = useState(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskLoadError, setTaskLoadError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showProjectAgentModal, setShowProjectAgentModal] = useState(false);
  const [showQuickEmployeeModal, setShowQuickEmployeeModal] = useState(false);
  const [assignmentManagerId, setAssignmentManagerId] = useState("");
  const [assignmentLeaderId, setAssignmentLeaderId] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [createTaskPriority, setCreateTaskPriority] = useState("medium");
  const [createMode, setCreateMode] = useState("now");
  const [scheduleRunAt, setScheduleRunAt] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createEstimatedHours, setCreateEstimatedHours] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todo");
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [submitting, setSubmitting] = useState(false);
  const [projectAgentSubmitting, setProjectAgentSubmitting] = useState(false);
  const [projectAgentOperation, setProjectAgentOperation] =
    useState("project_summary");
  const [projectAgentRequest, setProjectAgentRequest] = useState("");
  const [projectAgentRun, setProjectAgentRun] = useState(null);
  const [assigningProject, setAssigningProject] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [resources, setResources] = useState([]);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourceCategoryFilter, setResourceCategoryFilter] = useState("all");
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    id: null,
    name: "",
    value: "",
  });
  const [resourceFields, setResourceFields] = useState([
    { id: 0, name: "", value: "", category: "link" },
  ]);
  const [savingResource, setSavingResource] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    lead_id: "",
    type: "software",
    priority: "medium",
    start_date: "",
    delivery_date: "",
    status: "active",
  });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completionReadiness, setCompletionReadiness] = useState(null);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [completionAction, setCompletionAction] = useState(null);
  const [showTemplateApplyModal, setShowTemplateApplyModal] = useState(false);

  const projectAssigneeOptions = useMemo(
    () => projectAssignableUsers.filter((item) => item.status === "active"),
    [projectAssignableUsers],
  );

  const openEditModal = () => {
    if (!projectRecord) return;
    setEditFormData({
      name: projectRecord.name || "",
      description: projectRecord.description || "",
      lead_id: projectRecord.lead_id || "",
      type: projectRecord.type || "software",
      priority: projectRecord.priority || "medium",
      start_date: projectRecord.start_date
        ? projectRecord.start_date.substring(0, 16)
        : "",
      delivery_date: projectRecord.delivery_date
        ? projectRecord.delivery_date.substring(0, 16)
        : "",
      status: projectRecord.status || "active",
    });
    setEditFormErrors({});
    setShowEditModal(true);
  };

  const validateEditForm = () => {
    const nextErrors = {};
    if (!editFormData.name.trim())
      nextErrors.name = "Project name is required.";
    if (
      editFormData.start_date &&
      editFormData.delivery_date &&
      timeService.instant(editFormData.delivery_date) <
        timeService.instant(editFormData.start_date)
    ) {
      nextErrors.delivery_date = "Delivery date must be after the start date.";
    }
    setEditFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !validateEditForm()) return;
    try {
      setSubmitting(true);
      const payload = { ...editFormData };
      if (payload.start_date)
        payload.start_date = timeService.toUtcISOString(payload.start_date);
      if (payload.delivery_date)
        payload.delivery_date = timeService.toUtcISOString(
          payload.delivery_date,
        );

      await projectsApi.updateProject(projectId, payload);
      toast.success("Project updated successfully");
      setShowEditModal(false);
      await loadProjectInfo();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update project");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deleting) return;
    try {
      setDeleting(true);
      await projectsApi.deleteProject(projectId);
      toast.success("Project deleted successfully");
      setShowDeleteConfirm(false);
      navigate("/projects");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  const handleCompleteProject = async () => {
    if (completionAction) return;
    try {
      setCompletionAction("complete");
      await projectsApi.completeProject(projectId);
      toast.success("Project completed");
      await loadProjectInfo();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to complete project");
    } finally {
      setCompletionAction(null);
    }
  };

  const handleArchiveProject = async () => {
    if (completionAction) return;
    try {
      setCompletionAction("archive");
      await projectsApi.archiveProject(projectId);
      toast.success("Project archived");
      await loadProjectInfo();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to archive project");
    } finally {
      setCompletionAction(null);
    }
  };

  const handleReopenProject = async () => {
    if (completionAction || !reopenReason.trim()) return;
    try {
      setCompletionAction("reopen");
      await projectsApi.reopenProject(projectId, reopenReason.trim());
      toast.success("Project reopened");
      setShowReopenModal(false);
      setReopenReason("");
      await loadProjectInfo();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reopen project");
    } finally {
      setCompletionAction(null);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const loadProjectInfo = useCallback(async () => {
    try {
      const [projectResponse, componentsResponse, versionsResponse] =
        await Promise.all([
          projectsApi.getProject(projectId),
          componentsApi
            .getComponents(projectId)
            .catch(() => ({ data: { components: [] } })),
          versionsApi
            .getVersions(projectId)
            .catch(() => ({ data: { versions: [] } })),
        ]);
      setProjectInfo(projectResponse.data);
      setComponents(componentsResponse.data.components || []);
      setVersions(versionsResponse.data.versions || []);
      const [pagesResponse, filesResponse] = await Promise.all([
        projectsApi.getPages(projectId).catch(() => ({ data: { pages: [] } })),
        projectsApi
          .getProjectFiles(projectId)
          .catch(() => ({ data: { files: [] } })),
      ]);
      setPages(pagesResponse.data.pages || []);
      setProjectFiles(filesResponse.data.files || []);
      // Load completion readiness (non-blocking)
      projectsApi
        .getCompletionReadiness(projectId)
        .then((res) => setCompletionReadiness(res.data))
        .catch(() => setCompletionReadiness(null));
    } catch (error) {
      console.error(error);
    }
  }, [projectId]);

  const loadAssignableUsers = useCallback(async () => {
    try {
      const projectAssignableData = await usersAPI.getAssignableUsers(false);
      setAssignableUsers(
        getTaskAssigneeUsers(projectAssignableData.users || [], user),
      );
      setProjectAssignableUsers(
        excludeCurrentUser(projectAssignableData.users || [], user),
      );
    } catch (error) {
      setAssignableUsers([]);
      setProjectAssignableUsers([]);
    }
  }, [user]);

  const loadBoardData = useCallback(async () => {
    try {
      const response = await projectsApi.getProjectBoard(projectId);
      const normalizedBoard = normalizeBoardPayload(response);
      setBoardData(normalizedBoard);
      setStatuses(normalizedBoard.board_columns);
    } catch (error) {
      toast.error(
        error.response?.data?.detail || "Failed to load project board",
      );
    }
  }, [projectId]);

  const loadSummaryData = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const response = await projectsApi.getProjectSummary(projectId, 7);
      setSummaryData(response.data);
    } catch (error) {
      toast.error(
        error.response?.data?.detail || "Failed to load project summary",
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [projectId]);

  const loadPages = useCallback(async () => {
    try {
      setLoadingPages(true);
      const response = await projectsApi.getPages(projectId);
      setPages(response.data.pages || []);
      const files = await projectsApi.getProjectFiles(projectId);
      setProjectFiles(files.data.files || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to load pages");
    } finally {
      setLoadingPages(false);
    }
  }, [projectId]);

  const fetchProjectTasks = useCallback(async () => {
    if (activeTab !== "board") return;
    try {
      setTaskLoading(true);
      setTaskLoadError("");
      // Project is fixed in this workspace: never user-changeable from the page.
      const params = buildProjectTaskQuery({
        filters,
        taskStatus,
        attention: taskAttention,
        search: searchQuery,
        page: taskPage,
        pageSize: 20,
        projectId,
      });
      const data = await tasksAPI.listTasks(params);
      const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
      // Scheduled placeholders belong to Work -> Scheduled Work, not the Task
      // lifecycle, so they stay out of the Project Task workspace.
      const placeholderCount = rawTasks.filter((task) =>
        isScheduledTask(task),
      ).length;
      const filteredTasks = rawTasks.filter(
        (task) => !isScheduledTask(task) && !isFollowUpTask(task),
      );
      setProjectTasks(filteredTasks);
      setProjectTasksTotal(
        Math.max(
          0,
          Number(data.total || filteredTasks.length) - placeholderCount,
        ),
      );
    } catch (error) {
      console.error("Error loading project tasks:", error);
      setTaskLoadError(
        error.response?.data?.detail || error.message || "Failed to load tasks",
      );
      setProjectTasks([]);
    } finally {
      setTaskLoading(false);
    }
  }, [
    activeTab,
    filters,
    projectId,
    searchQuery,
    taskAttention,
    taskPage,
    taskStatus,
  ]);

  const fetchProjectSummary = useCallback(async () => {
    if (activeTab !== "board") return;
    try {
      const data = await tasksAPI.getStatusSummary({ project_id: projectId });
      setTaskSummary(data || {});
    } catch (error) {
      console.error("Error loading project task summary:", error);
      setTaskSummary(null);
    }
  }, [activeTab, projectId]);

  // One refresh path for every mutation: filtered list + project-scoped counts
  // + board/overview data + Work Overview, so both views stay consistent.
  const refreshProjectTasks = useCallback(async () => {
    await Promise.all([
      fetchProjectTasks(),
      fetchProjectSummary(),
      loadBoardData(),
      loadProjectInfo(),
    ]);
    queryClient.invalidateQueries(["workOverview"]);
    invalidateWorkspaceCalendar(queryClient);
  }, [
    fetchProjectSummary,
    fetchProjectTasks,
    loadBoardData,
    loadProjectInfo,
    queryClient,
  ]);

  useEffect(() => {
    loadProjectInfo();
    loadAssignableUsers();
  }, [loadAssignableUsers, loadProjectInfo]);

  useEffect(() => {
    if (activeTab === "board") loadBoardData();
    if (activeTab === "summary") loadSummaryData();
    if (activeTab === "pages") loadPages();
  }, [activeTab, loadBoardData, loadPages, loadSummaryData]);

  // URL state: workspace tab (tab=) + task filters (status/attention/q/view).
  // Same read-then-write convergence pattern as the global Tasks page, so
  // refresh and browser Back/Forward preserve the active view.
  useEffect(() => {
    const mapped = resolveWorkspaceTab(searchParams.get("tab"));
    if (mapped !== activeTab) setActiveTab(mapped);
  }, [activeTab, searchParams]);

  useEffect(() => {
    setSearchQuery(routeState.searchQuery);
    setTaskAttention(routeState.attention);
    setTaskView(routeState.view === "board" ? "board" : "list");
    setTaskStatus(routeState.filters.status || "");
    setFilters((current) => ({
      ...current,
      priority: routeState.filters.priority || "",
      assignee: routeState.filters.assigned_to || "",
      due_from: routeState.filters.due_from || "",
      due_to: routeState.filters.due_to || "",
    }));
    // Read effect intentionally re-runs only when the URL-derived values change.
  }, [
    routeState.attention,
    routeState.filters.assigned_to,
    routeState.filters.due_from,
    routeState.filters.due_to,
    routeState.filters.priority,
    routeState.filters.status,
    routeState.searchQuery,
    routeState.view,
  ]);

  useEffect(() => {
    // Skip while an external URL change is still being applied to state (see
    // appliedUrlRef) so Back/Forward never re-writes the old query back.
    if (appliedUrlRef.current !== searchParams.toString()) return;
    const nextParams = new URLSearchParams(searchParams);
    const tabParam = workspaceTabParam(activeTab);
    if (nextParams.get("tab") !== tabParam) {
      nextParams.set("tab", tabParam);
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    if (appliedUrlRef.current !== searchParams.toString()) return;
    if (activeTab !== "board") return;
    const nextParams = writeTaskRouteState(searchParams, {
      view: taskView,
      searchQuery,
      attention: taskAttention,
      filters: { ...filters, status: taskStatus },
    });
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    activeTab,
    filters,
    searchParams,
    searchQuery,
    setSearchParams,
    taskAttention,
    taskStatus,
    taskView,
  ]);

  // Mark the URL as applied AFTER the write effects have run for this commit,
  // so a URL change that arrived in this commit is still visible to them.
  useEffect(() => {
    appliedUrlRef.current = searchParams.toString();
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== "board") return;
    const timer = setTimeout(() => {
      fetchProjectTasks();
      fetchProjectSummary();
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTab, fetchProjectSummary, fetchProjectTasks]);

  useEffect(() => {
    const refreshBoard = () => {
      if (activeTab === "board") {
        refreshProjectTasks();
      }
    };
    window.addEventListener("syntask:tasks-updated", refreshBoard);
    return () =>
      window.removeEventListener("syntask:tasks-updated", refreshBoard);
  }, [activeTab, refreshProjectTasks]);

  // Board columns are built from the SAME backend-filtered dataset as the list
  // (one source of truth); active lifecycle tab / attention / filters apply to
  // both views. Cancelled stays reachable through its own lifecycle tab.
  const groupedProjectTasks = useMemo(
    () => groupTasksByStatus(projectTasks),
    [projectTasks],
  );

  const availableLabels = useMemo(() => {
    const labels = new Set();
    Object.values(boardData?.tasks_by_status || {})
      .flat()
      .forEach((task) => {
        (task.tags || []).forEach((tag) => labels.add(tag));
      });
    return [...labels].sort();
  }, [boardData]);

  const handleTaskStatusChange = async (taskId, newStatus) => {
    if (updatingTaskId) return;
    try {
      setUpdatingTaskId(taskId);
      // TaskWorkflow remains authoritative for status changes.
      await tasksAPI.updateTaskStatus(taskId, newStatus);
      toast.success("Task updated");
      await refreshProjectTasks();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update task");
      await refreshProjectTasks();
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    // prefer controlled suggestion value when present
    const estimatedValue =
      createEstimatedHours || formData.get("estimated_hours");
    const estimatedHours = normalizeEstimatedHours(estimatedValue);
    if (!estimatedHours) {
      toast.error("Estimated hours must be greater than 0");
      return;
    }
    try {
      setSubmitting(true);
      const taskPayload = {
        title: formData.get("title"),
        description: formData.get("description") || "",
        priority: formData.get("priority") || createTaskPriority || "medium",
        assigned_to: taskAssigneeId || null,
        due_date: timeService.zonedInputToUtcISOString(
          createDueDate || formData.get("due_date"),
        ),
        estimated_hours: estimatedHours,
        project_id: projectId,
        status: selectedStatus,
      };
      if (createMode === "schedule") {
        if (!scheduleRunAt) {
          toast.error("Schedule time is required");
          return;
        }
        const runAt = timeService.parseZonedInput(scheduleRunAt);
        if (
          !runAt ||
          Number.isNaN(runAt.getTime()) ||
          runAt <= timeService.now()
        ) {
          toast.error("Schedule time must be in the future");
          return;
        }
        await scheduledJobsAPI.scheduleJob({
          action_type: "CREATE_TASK",
          payload: taskPayload,
          run_at: timeService.toUtcISOString(runAt),
        });
        toast.success("Task scheduled successfully");
        invalidateWorkspaceCalendar(queryClient);
        setShowCreateModal(false);
        event.target.reset();
        setTaskAssigneeId("");
        setCreateTaskPriority("medium");
        setCreateMode("now");
        setScheduleRunAt("");
        await refreshProjectTasks();
        return;
      }
      await tasksAPI.createTask(taskPayload);
      toast.success("Task created successfully");
      setShowCreateModal(false);
      event.target.reset();
      setTaskAssigneeId("");
      setCreateTaskPriority("medium");
      setCreateMode("now");
      setScheduleRunAt("");
      await refreshProjectTasks();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const openAssignProjectModal = () => {
    const roleIds = getProjectRoleAssignmentIds(
      projectRecord,
      projectAssignableUsers,
      user,
    );
    setAssignmentManagerId(roleIds.manager);
    setAssignmentLeaderId(roleIds.lead || projectRecord.lead_id || "");
    setShowAssignModal(true);
  };

  // Calculate working hours between two Date objects considering office hours 10:00-19:00
  function calcWorkingHoursSuggestion(startDate, endDate) {
    if (!startDate || !endDate || endDate <= startDate) return "";
    const start = timeService.instant(startDate);
    const end = timeService.instant(endDate);
    const MS_PER_HOUR = 1000 * 60 * 60;
    let total = 0;
    let cursor = timeService.instant(start);
    // iterate day by day
    while (cursor < end) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const day = cursor.getDate();
      const workStart = timeService.instantFromParts(
        year,
        month,
        day,
        10,
        0,
        0,
      );
      const workEnd = timeService.instantFromParts(year, month, day, 19, 0, 0);
      const segmentStart = cursor > workStart ? cursor : workStart;
      const segmentEnd = end < workEnd ? end : workEnd;
      if (segmentEnd > segmentStart) {
        total += (segmentEnd.getTime() - segmentStart.getTime()) / MS_PER_HOUR;
      }
      // advance to next day at 00:00
      cursor = timeService.instantFromParts(year, month, day + 1, 0, 0, 0);
    }
    // round to nearest 0.25
    const rounded = Math.round(total * 4) / 4;
    return Math.max(rounded, 0.25);
  }

  const handleAssignProject = async (event) => {
    event.preventDefault();
    if (assigningProject) return;
    try {
      setAssigningProject(true);
      const assignedUserIds = [assignmentManagerId, assignmentLeaderId].filter(
        Boolean,
      );
      await projectsApi.updateProject(projectId, {
        assigned_to: assignmentManagerId || "",
        lead_id: assignmentLeaderId || "",
        assigned_user_ids: assignedUserIds.join(","),
      });
      toast.success(
        assignedUserIds.length
          ? "Project assignment updated"
          : "Project unassigned",
      );
      setShowAssignModal(false);
      await Promise.all([loadProjectInfo(), loadBoardData()]);
    } catch (error) {
      toast.error(
        error.response?.data?.detail || "Failed to update project assignment",
      );
    } finally {
      setAssigningProject(false);
    }
  };

  const handleProjectAgentRun = async (event) => {
    event.preventDefault();
    const request = projectAgentRequest.trim();
    if (!request) {
      toast.error("Request is required");
      return;
    }
    try {
      setProjectAgentSubmitting(true);
      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `project-agent-${timeService.nowMs()}-${Math.random().toString(36).slice(2)}`;
      const response = await projectsApi.createProjectAgentRun({
        schema_version: "1.0",
        project_id: projectId,
        task_id: null,
        operation: projectAgentOperation,
        user_request: request,
        requested_focus: null,
        selected_record_ids: {},
        preferences: { detail_level: "standard" },
        session_id: `project:${projectId}`,
        conversation_id: `project-agent:${projectId}`,
        idempotency_key: idempotencyKey,
      });
      setProjectAgentRun(response.data);
      toast.success("Project Agent request started");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Project Agent unavailable");
    } finally {
      setProjectAgentSubmitting(false);
    }
  };

  const allProjectTasks = Object.values(
    boardData?.tasks_by_status || {},
  ).flat();
  const completedTasks = allProjectTasks.filter((task) =>
    ["completed", "done"].includes((task.status || "").toLowerCase()),
  ).length;
  const fallbackCompletionPercentage = allProjectTasks.length
    ? Math.round((completedTasks / allProjectTasks.length) * 100)
    : 0;
  const overdueTasks = allProjectTasks.filter((task) => {
    if (!task.due_date) return false;
    try {
      return (
        timeService.instantTime(task.due_date) < timeService.now().getTime() &&
        !["completed", "done", "cancelled"].includes(
          (task.status || "").toLowerCase(),
        )
      );
    } catch {
      return false;
    }
  }).length;
  const dueSoonTasks = allProjectTasks.filter((task) => {
    if (!task.due_date) return false;
    try {
      const dueAt = timeService.instantTime(task.due_date);
      const now = timeService.now().getTime();
      const inThreeDays = now + 3 * 24 * 60 * 60 * 1000;
      return (
        dueAt >= now &&
        dueAt <= inThreeDays &&
        !["completed", "done", "cancelled"].includes(
          (task.status || "").toLowerCase(),
        )
      );
    } catch {
      return false;
    }
  }).length;
  const unassignedTasks = allProjectTasks.filter(
    (task) => !task.assigned_to,
  ).length;
  const totalEstimatedHours = allProjectTasks.reduce(
    (sum, task) => sum + Number(task.estimated_hours || 0),
    0,
  );
  const projectRecord = {
    ...(boardData?.project || {}),
    ...(projectInfo || {}),
    assigned_users:
      projectInfo?.assigned_users || boardData?.project?.assigned_users || [],
    assigned_user_ids:
      projectInfo?.assigned_user_ids ||
      boardData?.project?.assigned_user_ids ||
      [],
  };
  const projectPermissions = useProjectPermissions(user, projectRecord);
  const canManageCurrentProject =
    projectPermissions.hasProjectPermission("manage_project") ||
    canManageProject(user?.role, projectRecord, user?.id);
  const canManageColumns =
    projectPermissions.hasProjectPermission("manage_board");
  const canAssignProject =
    hasCompanyAdminAccess(user?.role) ||
    (userRole === "manager" && canManageCurrentProject);
  const canCreateProjectTask =
    projectPermissions.hasProjectPermission("create_task");
  // Task workflow power for the row-level stage-advance menus: project task
  // managers and company admins always, plus per-row task creators below.
  const canManageProjectTasks =
    projectPermissions.hasProjectPermission("manage_task") ||
    hasCompanyAdminAccess(user?.role);

  const loadResources = useCallback(async () => {
    try {
      const response = await projectsApi.getResources(projectId);
      setResources(response.data?.resources || []);
    } catch (error) {
      console.error("Error loading project resources:", error);
    }
  }, [projectId]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const saveResource = async (event) => {
    event.preventDefault();
    const fields = resourceFields.filter(
      (field) => field.name.trim() && field.value.trim(),
    );
    if (!fields.length || savingResource) return;
    try {
      setSavingResource(true);
      if (resourceForm.id)
        await projectsApi.updateResource(projectId, resourceForm.id, {
          name: fields[0].name.trim(),
          value: fields[0].value.trim(),
          category: fields[0].category,
        });
      else
        await Promise.all(
          fields.map((field) =>
            projectsApi.createResource(projectId, {
              name: field.name.trim(),
              value: field.value.trim(),
              category: field.category,
            }),
          ),
        );
      toast.success(
        resourceForm.id
          ? "Resource updated"
          : `${fields.length} resource${fields.length > 1 ? "s" : ""} added`,
      );
      setResourceFormOpen(false);
      setResourceForm({ id: null, name: "", value: "" });
      setResourceFields([{ id: 0, name: "", value: "", category: "link" }]);
      await loadResources();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save resource");
    } finally {
      setSavingResource(false);
    }
  };

  const removeResource = async (resource) => {
    try {
      await projectsApi.deleteResource(projectId, resource.id);
      toast.success("Resource deleted");
      await loadResources();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete resource");
    }
  };
  const copyResourceLink = async (resource) => {
    try {
      await navigator.clipboard.writeText(resource.value);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };
  const activeProject =
    projectInfo?.name || boardData?.project?.name || "Project";
  const projectDescription =
    projectRecord.description || "No project description available.";
  const projectStatus = projectRecord.status || "active";
  const projectHealth = projectRecord.project_health || {};
  const completionPercentage =
    typeof projectRecord.progress_percentage === "number"
      ? Math.round(projectRecord.progress_percentage)
      : Math.round(
          projectHealth.completion_percentage ?? fallbackCompletionPercentage,
        );
  const formatProjectDate = (value) => {
    if (!value) return "Not set";
    try {
      return timeService.format(value, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Not set";
    }
  };

  const handleDragStart = (event) => {
    setActiveTaskId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveTaskId(null);

    if (!over || updatingTaskId) return;

    const activeTask = projectTasks.find(
      (task) => String(task.id) === String(active.id),
    );
    if (!activeTask) return;

    const destinationStatus = normalizeStatusId(
      over.data?.current?.sortable?.containerId || over.id,
    );
    const currentStatus = normalizeStatusId(activeTask.status);
    if (!destinationStatus || destinationStatus === currentStatus) return;
    if (!BOARD_STATUSES.some((status) => status.id === destinationStatus))
      return;

    try {
      setUpdatingTaskId(active.id);
      // TaskWorkflow remains authoritative: the PATCH route runs the existing
      // transition validation (e.g. review-required tasks cannot be dragged to
      // completed) and surfaces backend errors to the UI.
      await tasksAPI.updateTaskStatus(active.id, destinationStatus);
      toast.success("Task status updated");
      await refreshProjectTasks();
    } catch (error) {
      toast.error(
        error.response?.data?.detail || "Failed to update task status",
      );
      await refreshProjectTasks();
    } finally {
      setUpdatingTaskId(null);
    }
  };
  const managerAssignmentOptions = useMemo(() => {
    const managers = projectAssignableUsers.filter(
      (item) => normalizeRole(item.role) === "manager",
    );
    if (
      userRole === "manager" &&
      !managers.some(
        (item) => String(item.id || item._id) === String(user?.id || user?._id),
      )
    ) {
      return [user, ...managers].filter(Boolean);
    }
    return managers;
  }, [projectAssignableUsers, user, userRole]);
  const leaderAssignmentOptions = useMemo(
    () => projectAssignableUsers.filter((item) => item.status === "active"),
    [projectAssignableUsers],
  );
  const { manager: projectManagers, lead: projectLeaders } =
    getProjectRoleNames(projectRecord, projectAssignableUsers, user);
  const managerValue = projectManagers.length
    ? projectManagers.join(", ")
    : "Unassigned";
  const leaderValue = projectLeaders.length
    ? projectLeaders.join(", ")
    : "Unassigned";
  const statusChartData = statuses
    .map((status) => ({
      id: status.id,
      name: status.label || status.id.replace(/_/g, " "),
      value: allProjectTasks.filter(
        (task) => normalizeStatusId(task.status) === status.id,
      ).length,
      color: STATUS_COLORS[status.id] || "#4285F4",
    }))
    .filter((item) => item.value > 0);
  const overviewCards = [
    {
      title: "Tasks",
      value: allProjectTasks.length,
      color: "#4285F4",
      helper: "Live total tasks",
    },
    {
      title: "Complete",
      value: completedTasks,
      color: "#2FB47C",
      helper: "Tasks finished",
    },
    {
      title: "Overdue",
      value: overdueTasks,
      color: "#EF4444",
      helper: "Past due items",
    },
    {
      title: "Due soon",
      value: dueSoonTasks,
      color: "#FF8A4C",
      helper: "Next 3 days",
    },
    {
      title: "Unassigned",
      value: unassignedTasks,
      color: "#7C6FE0",
      helper: "Needs ownership",
    },
    {
      title: "Est. hours",
      value: totalEstimatedHours,
      color: "#0EA5E9",
      helper: "Task effort",
    },
    {
      title: "In progress",
      value: allProjectTasks.filter(
        (task) => (task.status || "").toLowerCase() === "in_progress",
      ).length,
      color: "#A855F7",
      helper: "Active now",
    },
    {
      title: "Completion",
      value: `${completionPercentage}%`,
      color: "#7C6FE0",
      helper: "Derived from live tasks",
    },
  ];

  const handleTaskTabClick = (statusId) => {
    setTaskStatus(statusId);
    setTaskPage(1);
  };

  const handleAttentionClick = (attentionId) => {
    setTaskAttention((current) => (current === attentionId ? "" : attentionId));
    setTaskPage(1);
  };

  const handleTaskViewChange = (nextView) => {
    setTaskView(nextView);
    setTaskPage(1);
  };

  // Prefer the name the backend serialized on the Task (resolved against the
  // full user collection) so leads/managers and any assignee outside the
  // assignable-employees subset still show. The local lookup is only a
  // fallback for payloads that predate the serialized name.
  const taskAssigneeName = (task) => {
    if (!task) return "Unassigned";
    if (task.assigned_to_name) return task.assigned_to_name;
    if (!task.assigned_to) return "Unassigned";
    const match = assignableUsers.find(
      (item) => String(item.id || item._id) === String(task.assigned_to),
    );
    return match
      ? `${match.first_name || ""} ${match.last_name || ""}`.trim() ||
          "Unassigned"
      : "Unassigned";
  };

  const taskReviewerName = (task) => {
    if (!task) return null;
    if (task.reviewer_name) return task.reviewer_name;
    if (!task.reviewer_id) return null;
    const match = assignableUsers.find(
      (item) => String(item.id || item._id) === String(task.reviewer_id),
    );
    return match
      ? `${match.first_name || ""} ${match.last_name || ""}`.trim()
      : null;
  };

  const hasTaskFilters = Boolean(
    taskStatus ||
      taskAttention ||
      searchQuery.trim() ||
      filters.priority ||
      filters.assignee ||
      filters.due_from ||
      filters.due_to,
  );
  const taskEmptyMessage = projectEmptyStateMessage({
    filters: { ...filters, status: taskStatus },
    attention: taskAttention,
    search: searchQuery,
  });

  const PRIORITY_PILL_COLORS = {
    low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    medium:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    critical:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };
  const STATUS_PILL_COLORS = {
    todo: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    assigned:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    in_progress:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    in_review:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    revision_required:
      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    approved:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    completed:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={activeProject}
        description="Project board with filtered work streams and quick task edits."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/projects")}
            >
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Button>
            {canManageCurrentProject && (
              <>
                <Button variant="secondary" size="sm" onClick={openEditModal}>
                  Edit project
                </Button>
                {completionReadiness?.ready && projectStatus === "review" && (
                  <Button
                    size="sm"
                    onClick={handleCompleteProject}
                    loading={completionAction === "complete"}
                    loadingText="Completing"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete
                  </Button>
                )}
                {projectStatus === "completed" && (
                  <Button
                    size="sm"
                    onClick={() => setShowReopenModal(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Reopen
                  </Button>
                )}
                {projectStatus === "reporting" && (
                  <Button
                    size="sm"
                    onClick={handleArchiveProject}
                    loading={completionAction === "archive"}
                    loadingText="Archiving"
                    className="bg-gray-600 hover:bg-gray-700 text-white"
                  >
                    Archive
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900/50"
                >
                  Delete project
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowProjectAgentModal(true)}
            >
              <Sparkles className="h-4 w-4" />
              Project Agent
            </Button>
            {canCreateProjectTask ? (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedStatus("todo");
                  setShowCreateModal(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Create task
              </Button>
            ) : null}
            {canManageCurrentProject && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowTemplateApplyModal(true)}
              >
                <Sparkles className="h-4 w-4" />
                Apply Template
              </Button>
            )}
          </div>
        }
      />

      <TemplateApplyModal
        isOpen={showTemplateApplyModal}
        onClose={() => setShowTemplateApplyModal(false)}
        projectId={projectRecord?.project_id || projectId}
        projectName={activeProject}
        projectStartDate={projectRecord?.start_date}
        onApplied={() => {
          setShowTemplateApplyModal(false);
          refreshProjectTasks();
        }}
      />

      <section className="overflow-hidden rounded-2xl border border-primary-200/60 bg-[linear-gradient(135deg,rgba(255,250,244,0.98),rgba(248,242,232,0.92))] shadow-[0_18px_45px_rgba(63,49,37,0.08)] dark:border-[#5a4635] dark:bg-[linear-gradient(135deg,rgba(36,28,20,0.98),rgba(20,16,12,0.96))] dark:shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Project detail
              </p>
              <Badge
                label={projectStatus.replace(/_/g, " ")}
                colorKey={projectStatus}
              />
              {projectRecord.type ? (
                <Badge label={projectRecord.type} colorKey="scheduled" />
              ) : null}
            </div>
            <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-text-primary dark:text-text-primary">
                  Delivery overview
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-text-secondary dark:text-text-secondary">
                  {projectDescription}
                </p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    <span>Completion</span>
                    <span>{completionPercentage}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/55">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#2FB47C,#FF8A4C,#7C6FE0)] transition-all duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, completionPercentage))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <ProjectStatusDonut
                data={statusChartData}
                completion={completionPercentage}
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overviewCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-black/35"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {card.title}
                    </p>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: card.color }}
                    />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary dark:text-text-primary">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">
                    {card.helper}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 via-white/50 to-purple-50/60 p-4 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/35 dark:via-black/20 dark:to-purple-950/25">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-text-primary dark:text-text-primary">
                    Resources
                  </h3>
                  <p className="mt-0.5 text-xs text-text-muted dark:text-text-secondary">
                    Important links and project references.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageCurrentProject ? (
                    <button
                      type="button"
                      onClick={() => {
                        setResourceForm({ id: null, name: "", value: "" });
                        setResourceFields([
                          { id: 0, name: "", value: "", category: "link" },
                        ]);
                        setResourceFormOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Resource
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setResourcesOpen(true)}
                    className="rounded-lg border border-indigo-200 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-white dark:border-indigo-800 dark:bg-black/20 dark:text-indigo-300"
                  >
                    View All
                  </button>
                </div>
              </div>
              <div className="mt-3 divide-y divide-indigo-100 overflow-hidden rounded-xl border border-indigo-100 bg-white/75 dark:divide-indigo-900/40 dark:border-indigo-900/50 dark:bg-black/25">
                {resources.slice(0, 4).map((resource) => {
                  const safeUrl = /^https?:\/\//i.test(resource.value)
                    ? resource.value
                    : null;
                  const category = resource.category || "link";
                  const tone =
                    category === "media_file"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : category === "text"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                        : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";
                  return (
                    <div
                      key={resource.id}
                      className="flex min-w-0  items-center  gap-3 px-3 py-2.5"
                    >
                      <p className="max-w-[28%] shrink-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {resource.name}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone}`}
                      >
                        {category === "media_file" ? "Media" : category}
                      </span>
                      <p
                        className="min-w-0 flex-1 truncate text-right text-xs text-gray-500 dark:text-gray-400"
                        title={resource.value}
                      >
                        {resource.value}
                      </p>
                      {safeUrl ? (
                        <a
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${resource.name}`}
                          className="shrink-0 rounded-md p-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
                {!resources.length ? (
                  <p className="text-xs text-text-muted dark:text-text-secondary">
                    No resources added yet.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <aside className="border-t border-primary-200/60 bg-white/40 p-5 dark:border-[#5a4635] dark:bg-black/25 xl:border-l xl:border-t-0">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary">
                Project signals
              </h3>
              <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">
                Ownership, lifecycle, delivery, and build context.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-text-secondary dark:text-text-secondary">
              <ProjectOverviewLine
                label="Manager"
                value={managerValue}
                action={
                  hasCompanyAdminAccess(user?.role) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={openAssignProjectModal}
                    >
                      <UserPlus className="h-4 w-4" />
                      Change
                    </Button>
                  ) : null
                }
              />
              <ProjectOverviewLine
                label="Project Owner"
                value={leaderValue}
                action={
                  canAssignProject ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={openAssignProjectModal}
                    >
                      <UserPlus className="h-4 w-4" />
                      Change
                    </Button>
                  ) : null
                }
              />
              <ProjectOverviewLine
                label="Start"
                value={formatProjectDate(projectRecord.start_date)}
              />
              <ProjectOverviewLine
                label="Delivery"
                value={formatProjectDate(projectRecord.delivery_date)}
              />
              <ProjectOverviewLine
                label="Client"
                value={projectRecord.client?.name || "No client"}
              />
              <ProjectOverviewLine
                label="Type"
                value={(projectRecord.type || "software").replace(/_/g, " ")}
              />
              <ProjectOverviewLine
                label="Priority"
                value={projectRecord.priority || "medium"}
              />
              <ProjectOverviewLine
                label="Health"
                value={(
                  projectHealth.level ||
                  projectRecord.health ||
                  "healthy"
                ).replace(/_/g, " ")}
              />
              <CompletionReadinessLine readiness={completionReadiness} />
              <ProjectOverviewLine
                label="Open tasks"
                value={projectHealth.total_open_tasks ?? allProjectTasks.length}
              />
              <ProjectOverviewLine
                label="Overdue"
                value={projectHealth.overdue_task_count ?? overdueTasks}
              />
              <ProjectOverviewLine
                label="Assets"
                value={`${projectFiles.length} files / ${pages.length} pages`}
              />
              <ProjectOverviewLine
                label="Build"
                value={`${components.length} components / ${versions.length} versions`}
              />
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <BoardMetric title="Open tasks" value={allProjectTasks.length} />
        <BoardMetric title="Statuses" value={statuses.length} />
        <BoardMetric title="Labels" value={availableLabels.length} />
        <BoardMetric title="Team" value={assignableUsers.length} />
      </section>

      {/* Quick Assign Panel */}
      <QuickAssignPanel
        users={projectAssignableUsers}
        projectId={projectId}
        onTaskCreated={refreshProjectTasks}
      />

      <section className="border-b border-gray-200 dark:border-gray-800">
        <nav className="flex gap-2 overflow-x-auto pb-2">
          {["summary", "board", "pages"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}
            >
              {tab === "summary"
                ? "Overview"
                : tab === "board"
                  ? "Tasks"
                  : "Files"}
            </button>
          ))}
        </nav>
      </section>

      {activeTab === "summary" ? (
        loadingSummary ? (
          <SkeletonCard lines={8} />
        ) : summaryData ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              <section className="card p-5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Overview
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {summaryData.project?.description ||
                    projectInfo?.description ||
                    "No project overview available."}
                </p>
              </section>
              <section className="card p-5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Tasks
                </h2>
                <div className="mt-4 grid gap-3">
                  {(summaryData.recent_activity || [])
                    .slice(0, 8)
                    .map((item, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {item.title || item.name || "Task"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {item.status || "unknown"}
                        </p>
                      </div>
                    ))}
                </div>
              </section>
            </div>
            <aside className="space-y-4">
              <section className="card p-5">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  AI Briefing
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Use live project health and board signals to brief the team
                  without leaving the workspace.
                </p>
              </section>
              <section className="card p-5">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Analytics
                </h3>
                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>
                    Completion:{" "}
                    {summaryData.statistics?.completion_percentage || 0}%
                  </p>
                  <p>
                    In progress:{" "}
                    {summaryData.statistics?.in_progress_count || 0}
                  </p>
                  <p>
                    Completed: {summaryData.statistics?.completed_count || 0}
                  </p>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <EmptyState
            title="No summary data"
            description="Summary data will appear once project activity is available."
          />
        )
      ) : activeTab === "board" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Project Tasks
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeProject} execution tasks
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canCreateProjectTask ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedStatus(taskStatus || "todo");
                    setShowCreateModal(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  New Task
                </Button>
              ) : null}
              {canManageCurrentProject ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowTemplateApplyModal(true)}
                >
                  <Sparkles className="h-4 w-4" />
                  Apply Template
                </Button>
              ) : null}
            </div>
          </div>

          {/* Lifecycle Stage Pipeline - project-scoped counts; Scheduled is not a lifecycle stage */}
          <TaskLifecyclePipeline
            current={taskStatus}
            attentionActive={Boolean(taskAttention)}
            summary={taskSummary}
            onSelect={handleTaskTabClick}
            tooltipSuffix=" for this project"
          />

          {/* Needs Attention - project-scoped conditions; NOT lifecycle statuses */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-amber-200/70 bg-amber-50/60 px-2.5 py-1.5 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30">
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Needs Attention
            </span>
            <span className="hidden h-4 w-px bg-amber-300/70 sm:block dark:bg-amber-800" />
            <div
              role="tablist"
              aria-label="Needs attention views"
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {ATTENTION_FILTERS.map((item) => {
                const isActive = taskAttention === item.id;
                const count = attentionCount(taskSummary, item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleAttentionClick(item.id)}
                    title={`Show ${item.label} tasks for this project`}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition ${
                      isActive ? item.activeClass : item.idleClass
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dotClass} ${isActive ? "bg-white" : ""}`}
                    />
                    <span>{item.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced filters - project is fixed in this workspace, so no project filter */}
          <section className="card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setTaskPage(1);
                  }}
                  className={`${inputClassName} pl-10`}
                  placeholder="Search tasks by title, description, or ID"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:flex-1">
                <select
                  className={inputClassName}
                  value={filters.assignee}
                  onChange={(event) => {
                    setFilters((state) => ({
                      ...state,
                      assignee: event.target.value,
                    }));
                    setTaskPage(1);
                  }}
                >
                  <option
                    className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    value=""
                  >
                    All assignees
                  </option>
                  {assignableUsers.map((userItem) => (
                    <option
                      className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                      key={userItem.id || userItem._id}
                      value={userItem.id || userItem._id}
                    >
                      {userItem.first_name} {userItem.last_name}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClassName}
                  value={filters.priority}
                  onChange={(event) => {
                    setFilters((state) => ({
                      ...state,
                      priority: event.target.value,
                    }));
                    setTaskPage(1);
                  }}
                >
                  <option
                    className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    value=""
                  >
                    All priorities
                  </option>
                  <option
                    className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    value="critical"
                  >
                    Critical
                  </option>
                  <option
                    className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    value="high"
                  >
                    High
                  </option>
                  <option
                    className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    value="medium"
                  >
                    Medium
                  </option>
                  <option
                    className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    value="low"
                  >
                    Low
                  </option>
                </select>
                <input
                  type="date"
                  className={inputClassName}
                  value={filters.due_from}
                  onChange={(event) => {
                    setFilters((state) => ({
                      ...state,
                      due_from: event.target.value,
                    }));
                    setTaskPage(1);
                  }}
                  title="Due from"
                  aria-label="Due from"
                />
                <input
                  type="date"
                  className={inputClassName}
                  value={filters.due_to}
                  onChange={(event) => {
                    setFilters((state) => ({
                      ...state,
                      due_to: event.target.value,
                    }));
                    setTaskPage(1);
                  }}
                  title="Due to"
                  aria-label="Due to"
                />
              </div>
            </div>
          </section>

          {/* Results toolbar: List | Board + totals + pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => handleTaskViewChange("list")}
                aria-pressed={taskView === "list"}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${taskView === "list" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"}`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                onClick={() => handleTaskViewChange("board")}
                aria-pressed={taskView === "board"}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${taskView === "board" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>
                Showing {projectTasks.length} of {projectTasksTotal}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  disabled={taskPage <= 1 || taskLoading}
                  onClick={() => setTaskPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  disabled={taskPage * 20 >= projectTasksTotal || taskLoading}
                  onClick={() => setTaskPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Content: loading / error / empty / list / board - all from one backend-filtered dataset */}
          {taskLoading && projectTasks.length === 0 ? (
            taskView === "list" ? (
              <SkeletonTable rows={6} cols={6} />
            ) : (
              <SkeletonKanban cols={Math.min(BOARD_STATUSES.length, 4)} />
            )
          ) : taskLoadError ? (
            <EmptyState
              title="Could not load project tasks"
              description={taskLoadError}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchProjectTasks()}
                >
                  Retry
                </Button>
              }
            />
          ) : projectTasks.length === 0 ? (
            <EmptyState
              title={hasTaskFilters ? "No matching tasks" : "No tasks yet"}
              description={taskEmptyMessage}
              action={
                !hasTaskFilters && canCreateProjectTask ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedStatus("todo");
                        setShowCreateModal(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      New Task
                    </Button>
                    {canManageCurrentProject ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowTemplateApplyModal(true)}
                      >
                        <Sparkles className="h-4 w-4" />
                        Apply Template
                      </Button>
                    ) : null}
                  </div>
                ) : null
              }
            />
          ) : taskView === "list" ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Priority
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Due
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Assignee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Reviewer
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {projectTasks.map((task) => {
                      const reviewerName = taskReviewerName(task);
                      const needsYourReview =
                        task.status === "in_review" &&
                        task.reviewer_id &&
                        String(task.reviewer_id) === String(user?.id);
                      const canManageTaskStage =
                        canManageProjectTasks ||
                        Boolean(
                          user &&
                            task.created_by &&
                            String(task.created_by) ===
                              String(user?.id || user?._id || ""),
                        );
                      return (
                        <tr
                          key={task.id}
                          onClick={() =>
                            navigate(`/projects/${projectId}/tasks/${task.id}`)
                          }
                          className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{task.title}</span>
                              {task.is_blocked ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                                  Blocked
                                </span>
                              ) : null}
                              {needsYourReview ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                  Needs Your Review
                                </span>
                              ) : null}
                            </div>
                            {(task.status === "revision_required" &&
                              task.latest_revision_reason) ||
                            (task.status === "in_review" &&
                              task.review_round > 0) ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                {task.status === "revision_required" &&
                                task.latest_revision_reason
                                  ? `Revision: ${task.latest_revision_reason}`
                                  : `Review round ${task.review_round}`}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_PILL_COLORS[task.status] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}
                            >
                              {(task.status || "").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PRIORITY_PILL_COLORS[task.priority] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}
                            >
                              {task.priority || "medium"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <CarryForwardDueDate task={task} formatOptions={{ month: 'short', day: 'numeric' }} />
                              {task.health_status === "overdue" ? (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                  Overdue
                                </span>
                              ) : null}
                              {task.health_status === "due_today" ? (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Due Today
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {taskAssigneeName(task)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {reviewerName || "\u2014"}
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <TaskStageMenu
                                task={task}
                                user={user}
                                canManage={canManageTaskStage}
                                assignableUsers={assignableUsers}
                                updating={updatingTaskId === task.id}
                                onUpdated={refreshProjectTasks}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  navigate(
                                    `/projects/${projectId}/tasks/${task.id}`,
                                  )
                                }
                              >
                                Open
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : `repeat(${Math.min(BOARD_STATUSES.length, 4)}, minmax(0, 1fr))`,
                }}
              >
                {BOARD_STATUSES.map((status) => (
                  <ProjectBoardColumn
                    key={status.id}
                    status={status}
                    tasks={groupedProjectTasks[status.id] || []}
                    statuses={BOARD_STATUSES}
                    updatingTaskId={updatingTaskId}
                    canManageColumns={canCreateProjectTask}
                    onAddTask={() => {
                      setSelectedStatus(status.id);
                      setShowCreateModal(true);
                    }}
                    onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
                    onOpenProjectTask={(taskId) =>
                      navigate(`/projects/${projectId}/tasks/${taskId}`)
                    }
                    onStatusChange={handleTaskStatusChange}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeTaskId ? (
                  <div className="rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-text-primary shadow-xl dark:border-primary-800 dark:bg-gray-950 dark:text-gray-100">
                    Moving task
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      ) : loadingPages ? (
        <SkeletonTable rows={4} cols={3} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Files
            </h2>
            <div className="mt-4 space-y-3">
              {projectFiles.length ? (
                projectFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {file.name || file.original_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {file.type?.toUpperCase() || "FILE"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(file.url, "_blank", "noreferrer")
                      }
                    >
                      Open
                    </Button>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No files"
                  description="Upload files from the project details view."
                />
              )}
            </div>
          </section>
          <section className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Pages
            </h2>
            <div className="mt-4 space-y-3">
              {pages.length ? (
                pages.map((page) => (
                  <div
                    key={page.id}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {page.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {page.status}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No pages"
                  description="Pages are managed from the project details workspace."
                />
              )}
            </div>
          </section>
        </div>
      )}

      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign project owner"
      >
        <form onSubmit={handleAssignProject} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Project
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {activeProject}
            </p>
          </div>
          {!isManager ? (
            <FormField label="Manager">
              <CreatableSelectField
                value={assignmentManagerId}
                onChange={setAssignmentManagerId}
                className={inputClassName}
                createLabel="Create user"
                onCreate={() => setShowQuickEmployeeModal(true)}
                canCreate={hasCompanyAdminAccess(user?.role)}
                disabled={!hasCompanyAdminAccess(user?.role)}
              >
                <option value="">No manager</option>
                {managerAssignmentOptions.map((item) => (
                  <option key={item.id || item._id} value={item.id || item._id}>
                    {getUserDisplayName(item)} ({item.role})
                  </option>
                ))}
              </CreatableSelectField>
            </FormField>
          ) : null}
          <FormField label="Leader">
            <CreatableSelectField
              value={assignmentLeaderId}
              onChange={setAssignmentLeaderId}
              className={inputClassName}
              createLabel="Create employee"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={canAssignProject}
            >
              <option value="">No leader</option>
              {leaderAssignmentOptions.map((item) => (
                <option key={item.id || item._id} value={item.id || item._id}>
                  {getUserDisplayName(item)} ({item.role})
                </option>
              ))}
            </CreatableSelectField>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowAssignModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={assigningProject}
              loadingText="Saving"
            >
              Save assignment
            </Button>
          </div>
        </form>
      </Modal>

      <QuickCreateEmployeeModal
        isOpen={showQuickEmployeeModal}
        onClose={() => setShowQuickEmployeeModal(false)}
        existing={projectAssignableUsers}
        leads={[]}
        canCreateLead={false}
        onCreated={async (created) => {
          await loadAssignableUsers();
          setAssignmentLeaderId(created.id);
          setTaskAssigneeId(created.id);
        }}
      />

      <Modal
        isOpen={showProjectAgentModal}
        onClose={() => setShowProjectAgentModal(false)}
        title="Project Agent"
        size="xl"
      >
        <form onSubmit={handleProjectAgentRun} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Read-only pilot
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Creates an Agent run scoped to this project. No task or project
              records are changed.
            </p>
          </div>
          <FormField label="Operation">
            <select
              className={inputClassName}
              value={projectAgentOperation}
              onChange={(event) => setProjectAgentOperation(event.target.value)}
            >
              {PROJECT_AGENT_OPERATIONS.map((operation) => (
                <option key={operation.value} value={operation.value}>
                  {operation.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Request" required>
            <textarea
              rows={4}
              className={inputClassName}
              value={projectAgentRequest}
              onChange={(event) => setProjectAgentRequest(event.target.value)}
              placeholder="Summarize risks, dependencies, and next steps for this project."
            />
          </FormField>
          {projectAgentRun ? (
            <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={projectAgentRun.state || "queued"}
                  colorKey={projectAgentRun.state || "scheduled"}
                />
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  {projectAgentRun.run_id}
                </span>
              </div>
              {projectAgentRun.error_category ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                  {projectAgentRun.error_category}
                </p>
              ) : null}
              {projectAgentRun.sanitized_result?.summary ? (
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {projectAgentRun.sanitized_result.summary}
                </p>
              ) : null}
              {projectAgentRun.sanitized_result?.department_specialist ? (
                <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                  <div className="font-semibold">Selected specialist</div>
                  <div className="mt-1">
                    {
                      projectAgentRun.sanitized_result.department_specialist
                        .pack_id
                    }{" "}
                    /{" "}
                    {
                      projectAgentRun.sanitized_result.department_specialist
                        .specialist_id
                    }{" "}
                    v
                    {
                      projectAgentRun.sanitized_result.department_specialist
                        .specialist_version
                    }
                  </div>
                  <div className="mt-1 text-indigo-700 dark:text-indigo-300">
                    {
                      projectAgentRun.sanitized_result.department_specialist
                        .selection_reason
                    }
                  </div>
                  {projectAgentRun.sanitized_result.department_specialist
                    .fallback_reason ? (
                    <div className="mt-1 text-amber-700 dark:text-amber-300">
                      Fallback:{" "}
                      {
                        projectAgentRun.sanitized_result.department_specialist
                          .fallback_reason
                      }
                    </div>
                  ) : null}
                </div>
              ) : null}
              {projectAgentRun.sanitized_result
                ?.department_specialist_output ? (
                <div className="mt-3 grid gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      Guidance:{" "}
                    </span>
                    {(
                      projectAgentRun.sanitized_result
                        .department_specialist_output.task_guidance || []
                    ).join(", ") ||
                      projectAgentRun.sanitized_result
                        .department_specialist_output.summary}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      Checklist:{" "}
                    </span>
                    {(
                      projectAgentRun.sanitized_result
                        .department_specialist_output.checklist || []
                    ).join(", ") || "No checklist returned"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      Proposal status:{" "}
                    </span>
                    {projectAgentRun.sanitized_result
                      .department_specialist_output.proposal_only
                      ? "Proposal only"
                      : "Read only"}
                  </div>
                </div>
              ) : null}
              {projectAgentRun.sanitized_result?.warnings?.length ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {projectAgentRun.sanitized_result.warnings.join(", ")}
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowProjectAgentModal(false)}
            >
              Close
            </Button>
            <Button
              type="submit"
              loading={projectAgentSubmitting}
              loadingText="Starting"
            >
              Start run
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={canCreateProjectTask && showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create task"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <FormField label="Title" required>
            <input name="title" required className={inputClassName} />
          </FormField>
          <FormField label="Description">
            <textarea name="description" rows={3} className={inputClassName} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority">
              <select
                name="priority"
                value={createTaskPriority}
                onChange={(event) => setCreateTaskPriority(event.target.value)}
                className={`${inputClassName} font-semibold ${TASK_PRIORITY_SELECT_STYLES[createTaskPriority] || TASK_PRIORITY_SELECT_STYLES.medium}`}
              >
                {TASK_PRIORITY_OPTIONS.map((priority) => (
                  <option
                    key={priority.value}
                    value={priority.value}
                    className={priority.className}
                  >
                    {priority.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Due date" required>
              <input
                type="datetime-local"
                name="due_date"
                required
                className={inputClassName}
                value={createDueDate}
                onChange={(e) => {
                  setCreateDueDate(e.target.value);
                  // compute suggestion
                  try {
                    const parsed = timeService.parseZonedInput(e.target.value);
                    const suggestion = calcWorkingHoursSuggestion(
                      timeService.now(),
                      parsed,
                    );
                    setCreateEstimatedHours(
                      suggestion ? String(suggestion) : "",
                    );
                  } catch (err) {
                    // ignore
                  }
                }}
              />
            </FormField>
            <FormField label="Estimated hours" required>
              <input
                type="number"
                name="estimated_hours"
                min="0.25"
                step="0.25"
                required
                className={inputClassName}
                placeholder="Suggested"
                value={createEstimatedHours}
                onChange={(e) => setCreateEstimatedHours(e.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Assign to">
            <CreatableSelectField
              name="assigned_to"
              value={taskAssigneeId}
              onChange={setTaskAssigneeId}
              className={inputClassName}
              createLabel="Create user"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={canManageColumns}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((item) => (
                <option key={item.id || item._id} value={item.id || item._id}>
                  {getUserDisplayName(item)}
                </option>
              ))}
            </CreatableSelectField>
          </FormField>
          <div className="rounded-xl border border-gray-200 p-3 dark:border-[var(--color-app-border)]">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createMode === "schedule"}
                  onChange={(e) =>
                    setCreateMode(e.target.checked ? "schedule" : "now")
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Schedule task
                </span>
              </label>
              <span className="text-xs text-gray-500">
                (check to set a future run time)
              </span>
            </div>
            {createMode === "schedule" && (
              <FormField label="Schedule for" required>
                <input
                  type="datetime-local"
                  value={scheduleRunAt}
                  onChange={(event) => setScheduleRunAt(event.target.value)}
                  required={createMode === "schedule"}
                  className={inputClassName}
                />
              </FormField>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {createMode === "schedule" ? "Schedule task" : "Create task"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit project"
        size="xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-5">
          <FormField label="Project name" error={editFormErrors.name} required>
            <input
              name="name"
              autoComplete="off"
              className={inputClassName}
              value={editFormData.name}
              onChange={(event) =>
                setEditFormData((state) => ({
                  ...state,
                  name: event.target.value,
                }))
              }
              placeholder="Enter project name"
            />
          </FormField>
          <FormField label="Details">
            <textarea
              className={inputClassName}
              rows={4}
              value={editFormData.description}
              onChange={(event) =>
                setEditFormData((state) => ({
                  ...state,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormField label="Status">
              <select
                className={inputClassName}
                value={editFormData.status}
                onChange={(event) =>
                  setEditFormData((state) => ({
                    ...state,
                    status: event.target.value,
                  }))
                }
              >
                <option value="created">Created</option>
                <option value="kickoff">Kickoff</option>
                <option value="execution">Execution</option>
                <option value="review">Review</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="reporting">Reporting</option>
                <option value="archived">Archived</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FormField>
            <FormField label="Project Owner">
              <select
                className={inputClassName}
                value={editFormData.lead_id}
                onChange={(event) =>
                  setEditFormData((state) => ({
                    ...state,
                    lead_id: event.target.value,
                  }))
                }
              >
                <option value="">Unassigned</option>
                {projectAssigneeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name} ({item.role})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Type">
              <input
                className={inputClassName}
                value={editFormData.type}
                onChange={(event) =>
                  setEditFormData((state) => ({
                    ...state,
                    type: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Priority">
              <select
                className={inputClassName}
                value={editFormData.priority}
                onChange={(event) =>
                  setEditFormData((state) => ({
                    ...state,
                    priority: event.target.value,
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
            <FormField label="Start date">
              <input
                type="datetime-local"
                className={inputClassName}
                value={editFormData.start_date}
                onChange={(event) =>
                  setEditFormData((state) => ({
                    ...state,
                    start_date: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField
              label="Delivery date"
              error={editFormErrors.delivery_date}
            >
              <input
                type="datetime-local"
                className={inputClassName}
                value={editFormData.delivery_date}
                onChange={(event) =>
                  setEditFormData((state) => ({
                    ...state,
                    delivery_date: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting} loadingText="Saving">
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Project Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete project"
        message="This will permanently delete this project and all of its tasks. This action cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDeleteProject}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <Modal
        isOpen={resourcesOpen}
        onClose={() => setResourcesOpen(false)}
        title="Project Resources"
      >
        <div className="space-y-3">
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {[
              ["all", "All"],
              ["link", "Links"],
              ["media_file", "Media"],
              ["text", "Text"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setResourceCategoryFilter(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${resourceCategoryFilter === key ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300" : "text-gray-500 dark:text-gray-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {resources
            .filter(
              (resource) =>
                resourceCategoryFilter === "all" ||
                (resource.category || "link") === resourceCategoryFilter,
            )
            .map((resource) => {
              const safeUrl = /^https?:\/\//i.test(resource.value)
                ? resource.value
                : null;
              return (
                <div
                  key={resource.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {resource.name}
                    </p>
                    <p className="break-all text-sm text-gray-500 dark:text-gray-400">
                      {resource.value}
                    </p>
                  </div>
                  {safeUrl ? (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => copyResourceLink(resource)} aria-label={`Copy ${resource.name} link`} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-indigo-300">
                        <Copy className="h-4 w-4" />
                      </button>
                      <a href={safeUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${resource.name}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ) : null}
                  {canManageCurrentProject ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setResourceForm(resource);
                          setResourceFields([
                            {
                              id: resource.id,
                              name: resource.name,
                              value: resource.value,
                              category: resource.category || "link",
                            },
                          ]);
                          setResourceFormOpen(true);
                        }}
                        aria-label={`Edit ${resource.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeResource(resource)}
                        aria-label={`Delete ${resource.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
          {!resources.filter(
            (resource) =>
              resourceCategoryFilter === "all" ||
              (resource.category || "link") === resourceCategoryFilter,
          ).length ? (
            <p className="text-sm text-gray-500">
              No resources in this category.
            </p>
          ) : null}
          {canManageCurrentProject ? (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setResourceForm({ id: null, name: "", value: "" });
                  setResourceFields([
                    { id: 0, name: "", value: "", category: "link" },
                  ]);
                  setResourceFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Resource
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={resourceFormOpen}
        onClose={() => !savingResource && setResourceFormOpen(false)}
        title={resourceForm.id ? "Edit Resource" : "Add Resource"}
      >
        <form onSubmit={saveResource} className="space-y-4">
          <div className="space-y-2">
            {resourceFields.map((field, index) => (
              <div
                key={field.id}
                className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_130px_minmax(0,1.4fr)]"
              >
                <input
                  className={inputClassName}
                  maxLength={120}
                  value={field.name}
                  onChange={(event) =>
                    setResourceFields((current) =>
                      current.map((item) =>
                        item.id === field.id
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="Name (e.g. GitHub)"
                  aria-label={`Resource name ${index + 1}`}
                />
                <select
                  className={inputClassName}
                  value={field.category}
                  onChange={(event) =>
                    setResourceFields((current) =>
                      current.map((item) =>
                        item.id === field.id
                          ? { ...item, category: event.target.value }
                          : item,
                      ),
                    )
                  }
                  aria-label={`Resource type ${index + 1}`}
                >
                  <option value="link">Link</option>
                  <option value="media_file">Media file</option>
                  <option value="text">Text</option>
                </select>
                <input
                  className={inputClassName}
                  maxLength={2048}
                  value={field.value}
                  onChange={(event) =>
                    setResourceFields((current) =>
                      current.map((item) =>
                        item.id === field.id
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder={
                    field.category === "link"
                      ? "https://example.com"
                      : field.category === "media_file"
                        ? "File URL or name"
                        : "Enter text"
                  }
                  aria-label={`Resource value ${index + 1}`}
                />
              </div>
            ))}
          </div>
          {!resourceForm.id ? (
            <button
              type="button"
              onClick={() =>
                setResourceFields((current) => [
                  ...current,
                  { id: Date.now(), name: "", value: "", category: "link" },
                ])
              }
              className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
            >
              <Plus className="h-4 w-4" />
              Add field
            </button>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResourceFormOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={savingResource} loadingText="Saving">
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reopen Project Modal */}
      <Modal
        isOpen={showReopenModal}
        onClose={() => setShowReopenModal(false)}
        title="Reopen project"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Provide a reason for reopening this project. It will be moved back
            to Review status.
          </p>
          <FormField label="Reason" required>
            <textarea
              rows={3}
              className={inputClassName}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Why does this project need to be reopened?"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowReopenModal(false);
                setReopenReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReopenProject}
              loading={completionAction === "reopen"}
              loadingText="Reopening"
              disabled={!reopenReason.trim()}
            >
              Reopen project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProjectBoardColumn({
  status,
  tasks,
  statuses,
  updatingTaskId,
  canManageColumns,
  onAddTask,
  onOpenTask,
  onOpenProjectTask,
  onStatusChange,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const statusColor = STATUS_COLORS[status.id] || "#4285F4";

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[420px] flex-col overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,rgba(255,250,244,0.96),rgba(255,255,255,0.86))] shadow-[0_14px_34px_rgba(63,49,37,0.06)] transition-colors duration-150 dark:bg-[linear-gradient(180deg,rgba(36,28,20,0.96),rgba(16,13,10,0.92))] dark:shadow-[0_18px_42px_rgba(0,0,0,0.22)] ${isOver ? "border-primary-400 ring-2 ring-primary-200/80 dark:border-primary-500 dark:ring-primary-900/70" : "border-primary-200/50 dark:border-[#4a3b2e]"}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: statusColor }} />
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {status.label || status.id}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {tasks.length} tasks
            </p>
          </div>
          <Badge label={status.label || status.id} colorKey={status.id} />
        </div>
        <SortableContext
          id={status.id}
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            className={`min-h-[260px] flex-1 space-y-3 overflow-y-auto rounded-xl transition-colors ${isOver ? "bg-primary-50/60 p-2 dark:bg-primary-950/20" : ""}`}
          >
            {tasks.length ? (
              tasks.map((task) => (
                <SortableProjectTaskCard
                  key={task.id}
                  task={task}
                  statuses={statuses}
                  statusColor={statusColor}
                  updatingTaskId={updatingTaskId}
                  onOpenTask={onOpenTask}
                  onOpenProjectTask={onOpenProjectTask}
                  onStatusChange={onStatusChange}
                />
              ))
            ) : (
              <EmptyState
                title="No tasks in this column"
                description="Drop a task here or create a new one."
                action={
                  canManageColumns ? (
                    <Button size="sm" onClick={onAddTask}>
                      <Plus className="h-4 w-4" /> Add task
                    </Button>
                  ) : null
                }
              />
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}

function SortableProjectTaskCard({
  task,
  statuses,
  statusColor,
  updatingTaskId,
  onOpenTask,
  onOpenProjectTask,
  onStatusChange,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)] ${TASK_PRIORITY_STYLES[(task.priority || "medium").toLowerCase()] || TASK_PRIORITY_STYLES.medium}`}
    >
      <div
        className="mb-3 h-1 rounded-full shadow-[0_0_14px_rgba(255,138,76,0.24)]"
        style={{ backgroundColor: statusColor }}
      />
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          className="mt-0.5 cursor-grab rounded-lg p-1.5 text-text-muted transition hover:bg-white/75 hover:text-primary-600 active:cursor-grabbing dark:hover:bg-black/30"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onOpenTask(task.id)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-[#fff7ed]">
                {task.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-[#d8cbbb]">
                {task.description || "No description."}
              </p>
            </div>
            <Badge
              label={task.priority || "medium"}
              colorKey={task.priority || "medium"}
            />
          </div>
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(task.due_date || task.carry_forward_due_date) ? (
          <Badge
            label={`${timeService.format(task.carry_forward_due_date || task.due_date, {
              month: "short",
              day: "numeric",
            })}${task.carry_forward_due_date && task.carry_forward_days ? ` · Carry forwarded — ${task.carry_forward_days >= 30 && task.carry_forward_days % 30 === 0 ? `${task.carry_forward_days / 30} M` : `${task.carry_forward_days} D`}` : ''}`}
            colorKey="scheduled"
          />
        ) : null}
        {task.assigned_to_name ? (
          <Badge label={task.assigned_to_name} colorKey="scheduled" />
        ) : (
          <Badge label="Unassigned" colorKey="scheduled" />
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <select
          className={`${inputClassName} text-xs`}
          value={task.status}
          disabled={Boolean(updatingTaskId)}
          onChange={(event) => onStatusChange(task.id, event.target.value)}
          aria-label={
            updatingTaskId === task.id
              ? `Moving ${task.title}`
              : `Move ${task.title}`
          }
          aria-busy={updatingTaskId === task.id || undefined}
        >
          {statuses.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label || option.id}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenProjectTask(task.id)}
        >
          Open
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}

function BoardMetric({ title, value }) {
  return (
    <div className="card p-4 transition-colors hover:border-primary-300 dark:hover:border-primary-700">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
        {title}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-text-primary dark:text-text-primary">
        {value}
      </p>
    </div>
  );
}

function ProjectOverviewLine({ label, value, action = null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/70 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-black/35">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </span>
      <span className="ml-auto min-w-0 truncate text-right font-medium text-text-primary dark:text-text-primary">
        {value}
      </span>
      {action ? <span className="flex-none">{action}</span> : null}
    </div>
  );
}

function CompletionReadinessLine({ readiness }) {
  if (!readiness)
    return <ProjectOverviewLine label="Completion" value="Loading..." />;
  const ready = readiness.ready;
  const completed = readiness.completed_required_tasks || 0;
  const total = readiness.required_tasks || 0;
  const label = ready
    ? "Ready to complete"
    : `${completed}/${total} required tasks done`;
  return (
    <div
      className={`rounded-lg border px-3 py-2 dark:bg-black/35 ${ready ? "border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-800/50" : "border-amber-200/70 bg-amber-50/70 dark:border-amber-800/50"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
          Completion
        </span>
        <span
          className={`ml-auto text-xs font-semibold ${ready ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}
        >
          {ready ? "READY" : "NOT READY"}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary dark:text-text-secondary">
        {label}
      </p>
      {!ready && readiness.blocking_reasons?.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {readiness.blocking_reasons.map((reason, index) => (
            <li
              key={index}
              className="text-[10px] text-amber-700 dark:text-amber-300"
            >
              • {reason.type?.replace(/_/g, " ")} ({reason.count})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectStatusDonut({ data, completion }) {
  const hasData = data.length > 0;
  if (!hasData) {
    return (
      <div className="flex h-full min-h-40 flex-col justify-center rounded-2xl border border-dashed border-primary-200/70 bg-white/60 p-4 shadow-sm dark:border-white/10 dark:bg-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          Task mix
        </p>
        <p className="mt-2 text-sm font-medium text-text-primary dark:text-text-primary">
          No tasks yet
        </p>
        <p className="mt-1 text-xs leading-5 text-text-secondary dark:text-text-secondary">
          Status chart will appear after the first task is created for this
          project.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/70 bg-white/65 p-3 shadow-sm dark:border-white/10 dark:bg-black/30">
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-text-primary dark:text-text-primary">
            {completion}%
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Done
          </span>
        </div>
      </div>
      <div className="mt-2 grid gap-1.5">
        {data.slice(0, 4).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-text-secondary dark:text-text-secondary">
              <span
                className="h-2 w-2 flex-none rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate capitalize">{item.name}</span>
            </span>
            <span className="font-semibold tabular-nums text-text-primary dark:text-text-primary">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
