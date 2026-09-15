import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Trash2,
  Paperclip,
  Eye,
  History,
  Mail,
  CalendarClock,
  GitBranch,
  GitPullRequest,
  User,
  X,
  Lock,
  Share2,
  MoreVertical,
  Maximize2,
  CheckSquare,
  ChevronRight,
  Zap,
  Sparkles,
  Plus,
  List,
  FileText,
  Loader2,
} from "lucide-react";
import { useConfirmation } from "../hooks/useConfirmation";
import { aiAPI } from "../api/ai";
import { tasksAPI } from "../api/tasks";
import {
  filesAPI,
  MAX_UPLOAD_SIZE,
  formatFileSize,
  getUploadErrorMessage,
} from "../api/files";
import { usersAPI } from "../api/users";
import { watchersApi } from "../api/watchers";
import { changelogApi } from "../api/changelog";
import { projectsApi } from "../api/projects";
import { useAuthStore } from "../store/authStore";
import { EmailComposer } from "../components/EmailComposer";
import { Badge, EmptyState, Modal } from "../components/ui";
import {
  TASK_STATUS_TONES,
  buildTaskAssignmentOptions,
  canEditTaskDetails,
  getAttachmentKind,
  getProjectLeadName,
  getRevisionReasonContext,
  getTaskStatusTone,
  getUserDisplayName,
  getUserId,
} from "./TaskDetail.helpers";
import { normalizeRole } from "../utils/roles";
import {
  buildTaskShareUrl,
  resolveTaskBackTarget,
  resolveTaskCloseFallback,
} from "./taskNavigation";
import toast from "react-hot-toast";
import { timeService } from "@/services/timeService";
import CarryForwardDueDate from "../components/tasks/CarryForwardDueDate";

const dedupeUsersById = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?.id || item?._id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

// Lifecycle order used for the subtask status tabs + detail modal actions.
const SUBTASK_STATUS_ORDER = [
  "todo",
  "assigned",
  "in_progress",
  "in_review",
  "revision_required",
  "approved",
  "completed",
  "cancelled",
];

const SUBTASK_PRIORITY_META = {
  critical: {
    label: "Critical",
    chipClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  high: {
    label: "High",
    chipClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  medium: {
    label: "Medium",
    chipClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  low: {
    label: "Low",
    chipClass: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  },
};

const TaskDetail = () => {
  const { projectId, taskId } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirmation();
  const { user } = useAuthStore();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [watchers, setWatchers] = useState([]);
  const [isWatching, setIsWatching] = useState(false);
  const [changelog, setChangelog] = useState([]);
  const [projectInfo, setProjectInfo] = useState(null);
  const [taskStatus, setTaskStatus] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingWatch, setUpdatingWatch] = useState(false);
  const [updatingField, setUpdatingField] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskDescription, setNewSubtaskDescription] = useState("");
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState("");
  const [newSubtaskEstimatedHours, setNewSubtaskEstimatedHours] = useState("");
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [subtaskStatusFilter, setSubtaskStatusFilter] = useState("all");
  const [selectedSubtask, setSelectedSubtask] = useState(null);
  const [subtaskUpdatingField, setSubtaskUpdatingField] = useState(null);
  const [showAssignFirstModal, setShowAssignFirstModal] = useState(false);
  const [assignFirstEmployeeId, setAssignFirstEmployeeId] = useState("");
  const [assigningFirstAssignee, setAssigningFirstAssignee] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionModalReason, setRevisionModalReason] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [extensionForm, setExtensionForm] = useState({
    requested_due_date: "",
    reason: "",
  });
  const [submittingExtension, setSubmittingExtension] = useState(false);
  const [reviewingExtensionId, setReviewingExtensionId] = useState(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  // Production tracking state
  const [productionCompleted, setProductionCompleted] = useState(0);
  const [productionNotes, setProductionNotes] = useState("");
  const [updatingProduction, setUpdatingProduction] = useState(false);
  const [proofs, setProofs] = useState([]);
  const [proofsOpen, setProofsOpen] = useState(false);
  const [progressProofOpen, setProgressProofOpen] = useState(false);
  const [reviewProofOpen, setReviewProofOpen] = useState(false);
  const [reviewProofEntries, setReviewProofEntries] = useState([
    { id: 0, category: "text", value: "" },
  ]);
  const [uploadProofOpen, setUploadProofOpen] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofEntries, setProofEntries] = useState([]);
  const pageRef = useRef(null);
  const detailsRef = useRef(null);
  const historyRef = useRef(null);
  const { leads: leadAssignmentOptions, employees: employeeAssignmentOptions } =
    buildTaskAssignmentOptions(users, user);
  const currentAssignee =
    users.find((item) => getUserId(item) === String(task?.assigned_to || "")) ||
    (getUserId(user) === String(task?.assigned_to || "") ? user : null);
  const currentAssigneeRole = normalizeRole(currentAssignee?.role);
  // Show the assigned employee in the select even when the assigned user is not
  // part of the assignable list (freshly assigned, or outside the manager
  // scope): otherwise the field keeps showing "No employee assigned" while the
  // task actually has an assignee.
  const selectedEmployeeId =
    currentAssigneeRole === "employee" || !currentAssignee
      ? String(task?.assigned_to || "")
      : "";
  const assigneeOptions = useMemo(() => {
    const options = employeeAssignmentOptions.slice();
    if (
      task?.assigned_to &&
      !options.some((item) => getUserId(item) === String(task.assigned_to))
    ) {
      if (currentAssignee) {
        options.unshift(currentAssignee);
      } else if (task.assigned_to_name) {
        options.unshift({
          id: task.assigned_to,
          first_name: task.assigned_to_name,
          role: "employee",
        });
      }
    }
    return options;
  }, [
    currentAssignee,
    employeeAssignmentOptions,
    task?.assigned_to,
    task?.assigned_to_name,
  ]);
  const projectLeadName = getProjectLeadName(
    projectInfo,
    leadAssignmentOptions,
    user,
  );
  const canEditDetails = canEditTaskDetails(user, task);

  // ── Subtask workspace: status tabs, filtered list, detail modal ────────────
  const reloadSubtasks = useCallback(async () => {
    try {
      const parentId = task?.id || taskId;
      const data = await tasksAPI.getSubtasks(parentId);
      const list = Array.isArray(data.subtasks) ? data.subtasks : [];
      setSubtasks(list);
      setSelectedSubtask((current) => {
        if (!current) return current;
        const refreshed = list.find(
          (item) => String(item.id) === String(current.id),
        );
        return refreshed ? { ...current, ...refreshed } : current;
      });
    } catch (error) {
      console.error("Error reloading subtasks:", error);
    }
  }, [task?.id, taskId]);

  const updateSubtaskField = async (field, value) => {
    const subtaskId = selectedSubtask?.id;
    if (!subtaskId || subtaskUpdatingField) return;
    try {
      setSubtaskUpdatingField(field);
      if (field === "status") {
        await tasksAPI.updateTaskStatus(subtaskId, value);
      } else {
        await tasksAPI.updateTask(subtaskId, { [field]: value || null });
      }
      toast.success("Subtask updated");
      await reloadSubtasks();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update subtask");
    } finally {
      setSubtaskUpdatingField(null);
    }
  };

  const openSubtaskPage = (subtask) => {
    if (projectId) navigate(`/projects/${projectId}/tasks/${subtask.id}`);
    else navigate(`/tasks/${subtask.id}`);
  };

  const subtaskCountByStatus = useMemo(() => {
    const counts = {};
    subtasks.forEach((subtask) => {
      const key = String(subtask.status || "").toLowerCase();
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [subtasks]);

  const visibleSubtasks = useMemo(() => {
    if (!subtaskStatusFilter || subtaskStatusFilter === "all") return subtasks;
    return subtasks.filter(
      (subtask) =>
        String(subtask.status || "").toLowerCase() === subtaskStatusFilter,
    );
  }, [subtaskStatusFilter, subtasks]);

  const subtaskAssigneeName = (subtask) => {
    if (subtask?.assigned_to_name) return subtask.assigned_to_name;
    const match = users.find(
      (item) => getUserId(item) === String(subtask?.assigned_to || ""),
    );
    return match ? getUserDisplayName(match) : "";
  };

  const updateAssignee = async (newAssignee) => {
    try {
      setUpdatingField("assignee");
      await tasksAPI.updateTask(task.id, { assigned_to: newAssignee || null });
      toast.success("Task reassigned");
      // Optimistically reflect the assignee so the select never flashes back to
      // "No employee assigned" while the fresh task loads.
      setTask((current) =>
        current ? { ...current, assigned_to: newAssignee || null } : current,
      );
      await loadTask();
    } catch (error) {
      toast.error("Failed to reassign task");
    } finally {
      setUpdatingField(null);
    }
  };

  const navigateBack = useCallback(() => {
    const fallbackPath = resolveTaskCloseFallback(
      projectId || task?.project_id,
    );
    const historyState = window.history.state || {};
    const target = resolveTaskBackTarget(historyState, fallbackPath);
    if (target) {
      navigate(target);
      return;
    }
    navigate(-1);
  }, [navigate, projectId, task?.project_id]);

  const loadTask = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const data = await tasksAPI.getTask(taskId);
      setTask(data);
      setTaskStatus(data.status);

      // Initialize production tracking state
      setProductionCompleted(data.completed_quantity || 0);
      setProductionNotes("");
      try {
        const proofData = await tasksAPI.getProofs(taskId);
        setProofs(proofData.proofs || []);
      } catch {
        setProofs([]);
      }

      if (data.attachments) {
        const API_URL = import.meta.env.VITE_API_URL || "/api/v1";
        const BASE_URL = API_URL.replace("/api/v1", "") || "";
        const fullAttachments = data.attachments.map((url) => {
          if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
          }
          if (url.startsWith("/api/v1/files/")) {
            return `${BASE_URL}${url}`;
          }
          if (url.startsWith("/files/")) {
            return `${BASE_URL}/api/v1${url}`;
          }
          const filename = url.split("/").pop().split("\\").pop();
          return `${BASE_URL}/api/v1/files/${filename}`;
        });
        setAttachments(fullAttachments);
      } else {
        setAttachments([]);
      }

      setEditData({
        title: data.title,
        description: data.description || "",
        priority: data.priority,
        assigned_to: data.assigned_to || "",
        due_date: data.due_date
          ? timeService.toZonedDateTimeInput(data.due_date)
          : "",
        estimated_hours: data.estimated_hours ?? "",
        tags: data.tags ? data.tags.join(", ") : "",
        issue_type_id: data.issue_type_id || "",
        component_id: data.component_id || "",
        fix_version_id: data.fix_version_id || "",
      });

      if (data.project_id) {
        try {
          const response = await projectsApi.getProject(data.project_id);
          setProjectInfo(response.data);
        } catch (error) {
          console.error("Error loading project:", error);
        }
      }

      try {
        setLoadingComments(true);
        const commentsData = await tasksAPI.getComments(taskId);
        setComments(commentsData.comments || []);
      } catch (error) {
        console.error("Error loading comments:", error);
        setComments([]);
      } finally {
        setLoadingComments(false);
      }

      try {
        const watchersResponse = await watchersApi.getWatchers(data.id);
        setWatchers(watchersResponse.data.watchers || []);
        setIsWatching(
          watchersResponse.data.watchers?.some((w) => w.user_id === user.id) ||
            false,
        );
      } catch (error) {
        console.error("Error loading watchers:", error);
      }

      try {
        const changelogResponse = await changelogApi.getChangelog(data.id);
        setChangelog(changelogResponse.data.changelog || []);
      } catch (error) {
        console.error("Error loading changelog:", error);
      }

      try {
        const extensionData = await tasksAPI.listExtensionRequests(data.id);
        setExtensionRequests(extensionData.requests || []);
      } catch (error) {
        console.error("Error loading extension requests:", error);
      }

      try {
        const subtaskData = await tasksAPI.getSubtasks(data.id);
        setSubtasks(subtaskData.subtasks || []);
      } catch (error) {
        console.error("Error loading subtasks:", error);
      }
    } catch (error) {
      console.error("Error loading task:", error);
      setLoadError(
        error.response?.data?.detail || error.message || "Failed to load task",
      );
      toast.error("Failed to load task");
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [navigate, taskId, user.id]);

  // Fetch assignable users only on mount — not on every task update event
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await usersAPI.getAssignableUsers();
        setUsers(dedupeUsersById(usersData.users || []));
      } catch (error) {
        console.error("Error loading users:", error);
      }
    };
    if (taskId) loadUsers();
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      loadTask();
    }
  }, [taskId, loadTask]);

  useEffect(() => {
    // Debounce timer to prevent cascading re-fetches when multiple
    // syntask:tasks-updated events fire in quick succession.
    let debounceTimer = null;

    const refreshCurrentTask = (event) => {
      const relatedId = event?.detail?.relatedId;
      const metadataTaskId = event?.detail?.metadata?.task_id;
      if (
        relatedId &&
        String(relatedId) !== String(taskId) &&
        (!metadataTaskId || String(metadataTaskId) !== String(taskId))
      )
        return;
      const notificationType = String(event?.detail?.type || "").toLowerCase();
      const eventName = String(
        event?.detail?.metadata?.event || "",
      ).toLowerCase();

      // Comments refresh immediately (no debounce needed — lightweight)
      if (
        notificationType === "task_comment" ||
        eventName === "task_comment_added"
      ) {
        const refreshComments = async () => {
          try {
            const data = await tasksAPI.getComments(taskId);
            setComments(data.comments || []);
          } catch (error) {
            console.error("Error refreshing comments:", error);
          }
        };
        refreshComments();
        return;
      }

      // Full task reload is debounced to avoid rapid re-fetches from cascade events
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (taskId) {
          loadTask();
        }
      }, 2000);
    };
    window.addEventListener("syntask:tasks-updated", refreshCurrentTask);
    return () => {
      window.removeEventListener("syntask:tasks-updated", refreshCurrentTask);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [taskId, loadTask]);

  const loadWatchers = async () => {
    if (!task) return;
    try {
      const response = await watchersApi.getWatchers(task.id);
      setWatchers(response.data.watchers || []);
      setIsWatching(
        response.data.watchers?.some((w) => w.user_id === user.id) || false,
      );
    } catch (error) {
      console.error("Error loading watchers:", error);
    }
  };

  const loadComments = async () => {
    if (!taskId) return;
    try {
      setLoadingComments(true);
      const data = await tasksAPI.getComments(taskId);
      setComments(data.comments || []);
    } catch (error) {
      console.error("Error loading comments:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !taskId || commenting) return;

    try {
      setCommenting(true);
      await tasksAPI.addComment(taskId, newComment);
      toast.success("Comment added");
      setNewComment("");
      await loadComments();
    } catch (error) {
      toast.error("Failed to add comment");
    } finally {
      setCommenting(false);
    }
  };

  const handleReviewSubmit = async (withProof = true) => {
    try {
      setUpdatingStatus(true);
      const proof = withProof
        ? reviewProofEntries.find((entry) => entry.value.trim())
        : null;
      const response = await tasksAPI.submitForReview(
        taskId,
        null,
        proof ? { name: proof.category, value: proof.value.trim() } : null,
      );
      if (response.proof_error) toast.error(response.proof_error);
      else toast.success("Submitted for review");
      setReviewProofOpen(false);
      setTaskStatus("in_review");
      await loadTask();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to submit for review",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleUploadProofs = async () => {
    const entries = reviewProofEntries.filter((entry) => entry.value.trim());
    if (!entries.length) {
      setUploadProofOpen(false);
      return;
    }
    try {
      setUploadingProof(true);
      await Promise.all(
        entries.map((entry, index) =>
          tasksAPI.createProof(taskId, {
            name: `Proof ${index + 1}`,
            value: entry.value.trim(),
            category: entry.category,
            context: "progress_update",
          }),
        ),
      );
      toast.success("Proof uploaded");
      setUploadProofOpen(false);
      setReviewProofEntries([{ id: 0, category: "text", value: "" }]);
      const proofData = await tasksAPI.getProofs(taskId);
      setProofs(proofData.proofs || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to upload proof");
    } finally {
      setUploadingProof(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!taskId || updatingStatus) return;
    if (newStatus === "assigned") {
      if (String(taskStatus).toLowerCase() === "assigned") {
        toast.error("Task is already assigned");
        return;
      }
      if (!task?.assigned_to) {
        // Moving to Assigned requires an assignee - prompt before changing state.
        setAssignFirstEmployeeId("");
        setShowAssignFirstModal(true);
        return;
      }
    }
    if (newStatus === "revision_required") {
      // The backend rejects a revision without a written reason, so collect it
      // in a modal before calling the semantic request-revision endpoint.
      setRevisionModalReason("");
      setShowRevisionModal(true);
      return;
    }
    if (newStatus === "in_review" && task?.task_type === "quantitative") {
      const targetQuantity = Number(task.target_quantity || 0);
      const completedQuantity = Number(task.completed_quantity || 0);
      if (targetQuantity > completedQuantity) {
        const remainingQuantity = targetQuantity - completedQuantity;
        const unit = task.target_unit || "units";
        toast.error(
          `Cannot move task to In Review yet. Complete ${remainingQuantity} more ${unit} (${completedQuantity}/${targetQuantity} completed).`,
          { duration: 5000 },
        );
        return;
      }
    }
    if (newStatus === "in_review" && user?.role === "employee") {
      setReviewProofEntries([{ id: 0, category: "text", value: "" }]);
      setReviewProofOpen(true);
      return;
    }
    try {
      setUpdatingStatus(true);
      await tasksAPI.updateTaskStatus(taskId, newStatus);
      setTaskStatus(newStatus);
      toast.success("Status updated");
      await loadTask();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssignFirstConfirm = async () => {
    if (!assignFirstEmployeeId) {
      toast.error("Please select an employee to assign");
      return;
    }
    try {
      setAssigningFirstAssignee(true);
      await tasksAPI.updateTask(task.id, {
        assigned_to: assignFirstEmployeeId,
      });
      await tasksAPI.updateTaskStatus(taskId, "assigned");
      toast.success("Task assigned");
      setShowAssignFirstModal(false);
      await loadTask();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to assign task");
    } finally {
      setAssigningFirstAssignee(false);
    }
  };

  const handleRevisionConfirm = async () => {
    if (!revisionModalReason.trim()) {
      toast.error("A revision reason is required");
      return;
    }
    try {
      setSubmittingRevision(true);
      await tasksAPI.requestRevision(taskId, revisionModalReason.trim());
      setShowRevisionModal(false);
      setTaskStatus("revision_required");
      toast.success("Revision requested");
      await loadTask();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to request revision",
      );
    } finally {
      setSubmittingRevision(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!taskId || savingEdit) return;
    try {
      setSavingEdit(true);
      await tasksAPI.updateTask(taskId, editData);
      toast.success("Task updated successfully");
      setIsEditing(false);
      await loadTask();
    } catch (error) {
      toast.error("Failed to update task");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExtensionRequest = async (event) => {
    event.preventDefault();
    if (!taskId || submittingExtension) return;
    try {
      setSubmittingExtension(true);
      await tasksAPI.requestExtension(taskId, extensionForm);
      toast.success("Extension request submitted");
      setExtensionForm({ requested_due_date: "", reason: "" });
      await loadTask();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to request extension",
      );
    } finally {
      setSubmittingExtension(false);
    }
  };

  const handleExtensionReview = async (requestId, action) => {
    if (!requestId || reviewingExtensionId) return;
    try {
      setReviewingExtensionId(requestId);
      if (action === "approve") {
        await tasksAPI.approveExtensionRequest(requestId);
        toast.success("Extension approved");
      } else {
        await tasksAPI.rejectExtensionRequest(requestId);
        toast.success("Extension rejected");
      }
      await loadTask();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to review extension",
      );
    } finally {
      setReviewingExtensionId(null);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    const confirmed = await confirm({
      title: "Delete Task",
      message: "Are you sure you want to delete this task?",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDangerous: true,
    });
    if (!confirmed) return;
    if (!taskId) return;

    try {
      setDeleting(true);
      await tasksAPI.deleteTask(taskId);
      toast.success("Task deleted successfully");
      navigateBack();
    } catch (error) {
      toast.error("Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !taskId) return;

    // Client-side size pre-check for a clear, immediate message
    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error(
        `File is too large (${formatFileSize(file.size)}). Maximum allowed size is ${formatFileSize(MAX_UPLOAD_SIZE)}.`,
      );
      e.target.value = "";
      return;
    }

    try {
      setUploading(true);
      // Upload file
      const result = await filesAPI.uploadFile(file);

      // Get full file URL - convert relative path to full URL
      const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
      const BASE_URL = API_BASE.replace("/api/v1", "") || "";
      let fullFileUrl = result.file_url;

      // If it's a relative path, convert to full URL
      if (fullFileUrl.startsWith("/api/v1/files/")) {
        // file_url is like "/api/v1/files/filename.png"
        fullFileUrl = `${BASE_URL}${fullFileUrl}`;
      } else if (fullFileUrl.startsWith("/files/")) {
        fullFileUrl = `${BASE_URL}/api/v1${fullFileUrl}`;
      } else if (!fullFileUrl.startsWith("http")) {
        // Just a filename, construct full path
        fullFileUrl = `${BASE_URL}/api/v1/files/${fullFileUrl}`;
      }

      // Save attachment to task
      await tasksAPI.addTaskAttachment(taskId, fullFileUrl);

      // Update local state
      const newAttachments = [...attachments, fullFileUrl];
      setAttachments(newAttachments);

      // Reload task to get updated attachments
      await loadTask();

      toast.success("File uploaded successfully");
    } catch (error) {
      console.error("File upload error:", error);
      toast.error(getUploadErrorMessage(error));
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  };

  const handleToggleWatch = async () => {
    if (!taskId || updatingWatch) return;
    try {
      setUpdatingWatch(true);
      if (isWatching) {
        await watchersApi.removeWatcher(taskId);
        toast.success("Stopped watching");
      } else {
        await watchersApi.addWatcher(taskId);
        toast.success("Now watching");
      }
      await loadWatchers();
    } catch (error) {
      toast.error("Failed to update watch status");
    } finally {
      setUpdatingWatch(false);
    }
  };

  const handleGenerateBreakdown = async () => {
    if (!task?.id || breakdownLoading) return;

    try {
      setBreakdownLoading(true);
      setBreakdownError("");
      const data = await aiAPI.generateTaskBreakdown({
        task_id: task.id,
        max_subtasks: 5,
      });
      setBreakdown(data);
      toast.success("Task breakdown generated");
    } catch (error) {
      console.error("Failed to generate task breakdown", error);
      setBreakdownError(
        error.response?.data?.detail ||
          error.message ||
          "Failed to generate task breakdown",
      );
      toast.error(
        error.response?.data?.detail || "Failed to generate task breakdown",
      );
    } finally {
      setBreakdownLoading(false);
    }
  };

  const focusDetails = useCallback(() => {
    setDetailsExpanded(true);
    detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const focusHistory = useCallback(() => {
    setActiveTab("history");
    setHeaderMenuOpen(false);
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleShareTask = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        buildTaskShareUrl(window.location.href),
      );
      toast.success("Task link copied");
    } catch (error) {
      toast.error("Could not copy task link");
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await pageRef.current?.requestFullscreen();
      }
    } catch (error) {
      toast.error("Fullscreen is not available");
    }
  }, []);

  const openProjectBoard = useCallback(() => {
    const targetProjectId = projectId || task?.project_id;
    if (targetProjectId) navigate(`/projects/${targetProjectId}/board`);
  }, [navigate, projectId, task?.project_id]);

  const priorities = {
    low: { label: "Low", color: "text-gray-600 bg-gray-100" },
    medium: { label: "Medium", color: "text-blue-600 bg-blue-100" },
    high: { label: "High", color: "text-orange-600 bg-orange-100" },
    critical: { label: "Critical", color: "text-red-600 bg-red-100" },
  };

  const statuses = TASK_STATUS_TONES;
  const currentStatusTone = getTaskStatusTone(taskStatus || task?.status);

  // ── Revision reason section ────────────────────────────────────────────────
  // The reviewer's requested changes can get lost on the detail page (no
  // revision panel existed), so surface the latest revision reason as a
  // color-coded call-out: red while the task waits in Revision Required,
  // amber while the assignee is reworking an earlier revision request.
  const revisionContext = getRevisionReasonContext(task, {
    status: taskStatus,
    users,
  });
  const isRevisionRequired = revisionContext.isRevisionRequired;
  const revisionReason = revisionContext.reason;
  const revisionRequesterName = revisionContext.requesterName;
  const showRevisionSection = revisionContext.show;
  const revisionDateLabel = revisionContext.revisionRequestedAt
    ? (() => {
        try {
          return timeService.formatPattern(
            revisionContext.revisionRequestedAt,
            "MMM d, yyyy",
          );
        } catch {
          return String(revisionContext.revisionRequestedAt).slice(0, 10);
        }
      })()
    : "";
  const revisionTone = isRevisionRequired
    ? {
        header: "from-rose-600 to-red-500",
        iconWrap:
          "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
        quote:
          "border-rose-400/70 bg-rose-50/80 text-rose-950 dark:border-rose-800/60 dark:bg-rose-950/25 dark:text-rose-50",
        badge: "Revision required",
      }
    : {
        header: "from-amber-500 to-orange-500",
        iconWrap:
          "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
        quote:
          "border-amber-400/70 bg-amber-50/80 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-50",
        badge: "Rework in progress",
      };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Could not load task"
          description={loadError}
          action={
            <button
              type="button"
              onClick={loadTask}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Try again
            </button>
          }
        />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Task not found</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={pageRef}
        className="h-full flex flex-col bg-white -m-6"
        style={{ minHeight: "calc(100vh - 96px)" }}
      >
        {/* Top Header */}
        <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <button
              onClick={navigateBack}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {projectInfo && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <button
                  type="button"
                  onClick={openProjectBoard}
                  className="font-medium text-gray-700 hover:text-primary-700 hover:underline"
                >
                  {projectInfo.name}
                </button>
                <span>/</span>
                <CheckSquare className="h-4 w-4" />
                <span className="font-mono">{task.id?.slice(0, 6)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Mail className="inline-block h-4 w-4 mr-1" />
              Send Email
            </button>
            <button
              type="button"
              onClick={focusDetails}
              className="p-2 hover:bg-gray-100 rounded"
              aria-label="Open task details"
              title="Open task details"
            >
              <Lock className="h-5 w-5 text-gray-600" />
            </button>
            <button
              type="button"
              onClick={handleToggleWatch}
              disabled={updatingWatch}
              className={`p-2 hover:bg-gray-100 rounded relative disabled:opacity-60 ${isWatching ? "bg-primary-50" : ""}`}
              aria-label={isWatching ? "Stop watching task" : "Watch task"}
              title={isWatching ? "Stop watching task" : "Watch task"}
            >
              <Eye
                className={`h-5 w-5 ${isWatching ? "text-primary-700" : "text-gray-600"}`}
              />
              {watchers.length > 0 && (
                <span className="absolute top-0 right-0 bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {watchers.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleShareTask}
              className="p-2 hover:bg-gray-100 rounded"
              aria-label="Copy task link"
              title="Copy task link"
            >
              <Share2 className="h-5 w-5 text-gray-600" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setHeaderMenuOpen((open) => !open)}
                className="p-2 hover:bg-gray-100 rounded"
                aria-label="Open task actions"
                aria-expanded={headerMenuOpen}
                title="Open task actions"
              >
                <MoreVertical className="h-5 w-5 text-gray-600" />
              </button>
              {headerMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={focusHistory}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <History className="h-4 w-4" />
                    View history
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "Deleting..." : "Delete task"}
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 hover:bg-gray-100 rounded"
              aria-label="Toggle fullscreen"
              title="Toggle fullscreen"
            >
              <Maximize2 className="h-5 w-5 text-gray-600" />
            </button>
            <button
              type="button"
              onClick={navigateBack}
              className="p-2 hover:bg-gray-100 rounded"
              aria-label="Close task detail"
              title="Close task detail"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Task Title */}
            <div className="mb-6 md:flex md:justify-between md:items-center">
              <div className="flex items-center gap-3 flex-wrap">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.title}
                    onChange={(e) =>
                      setEditData({ ...editData, title: e.target.value })
                    }
                    className="text-2xl font-bold w-full border-b-2 border-primary-500 focus:outline-none pb-2"
                    onBlur={handleSaveEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveEdit();
                      }
                    }}
                  />
                ) : (
                  <h1
                    className={`text-2xl font-bold text-gray-900 p-2 rounded ${canEditDetails ? "cursor-pointer hover:bg-gray-50" : ""}`}
                    onClick={() => canEditDetails && setIsEditing(true)}
                    aria-disabled={!canEditDetails}
                  >
                    {task.title}
                  </h1>
                )}
                {/* Project association — inline with title */}
                {projectInfo && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300">
                    <CheckSquare className="h-3 w-3" />
                    {projectInfo.name}
                  </span>
                )}
                {/* Self Assigned badge */}
                {task.source_type === "self_assigned" && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300">
                    <User className="h-3 w-3" />
                    Self Assigned
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 px-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${currentStatusTone.chipClass}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${currentStatusTone.dotClass}`}
                  />
                  {currentStatusTone.label}
                </span>
                {/* Task Type Badge */}
                <Badge
                  label={
                    task.task_type === "quantitative"
                      ? "QUANTITATIVE"
                      : "STANDARD"
                  }
                  colorKey={
                    task.task_type === "quantitative" ? "high" : "draft"
                  }
                  pill
                  className={
                    task.task_type === "quantitative"
                      ? "font-bold tracking-wide"
                      : "font-semibold tracking-wide"
                  }
                />
              </div>
            </div>

            {/* Creator info */}
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 px-2">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                <User className="h-3.5 w-3.5" />
              </span>
              <span>
                Created by{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {task.created_by_name || "—"}
                </span>
              </span>
              {task.created_at ? (
                <span className="text-gray-400 dark:text-gray-500">
                  ·{" "}
                  {(() => {
                    try {
                      return timeService.formatPattern(
                        task.created_at,
                        "MMM d, yyyy",
                      );
                    } catch {
                      return String(task.created_at).slice(0, 10);
                    }
                  })()}
                </span>
              ) : null}
            </div>

            {/* Description */}
            <div className="mb-6">
              {isEditing ? (
                <textarea
                  value={editData.description}
                  onChange={(e) =>
                    setEditData({ ...editData, description: e.target.value })
                  }
                  className="w-full min-h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Add a description..."
                  onBlur={handleSaveEdit}
                />
              ) : (
                <div
                  className={`text-gray-700 whitespace-pre-wrap p-3 rounded ${canEditDetails ? "cursor-pointer hover:bg-gray-50" : ""}`}
                  onClick={() => canEditDetails && setIsEditing(true)}
                  aria-disabled={!canEditDetails}
                >
                  {task.description || "No description"}
                </div>
              )}
            </div>

            {/* Revision reason — color-coded highlight so requested changes are never missed */}
            {showRevisionSection ? (
              <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div
                  className={`flex items-center justify-between gap-2 bg-gradient-to-r px-4 py-2.5 ${revisionTone.header}`}
                >
                  <p className="flex items-center gap-2 text-sm font-bold tracking-wide text-white">
                    <GitPullRequest className="h-4 w-4" />
                    Revision reason
                  </p>
                  <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    {revisionTone.badge}
                  </span>
                </div>
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${revisionTone.iconWrap}`}
                  >
                    <GitPullRequest className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {isRevisionRequired
                        ? "The reviewer sent this task back for changes."
                        : "Rework is in progress after an earlier revision request."}
                    </p>
                    <p
                      className={`mt-2 whitespace-pre-wrap rounded-xl border-l-4 px-3.5 py-2.5 text-sm font-medium leading-6 ${revisionTone.quote}`}
                    >
                      {revisionReason ||
                        "The reviewer requested changes but did not leave a written reason."}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {revisionRequesterName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          Requested by {revisionRequesterName}
                        </span>
                      ) : null}
                      {revisionDateLabel ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {revisionDateLabel}
                        </span>
                      ) : null}
                      {Number(task?.review_round) > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5" />
                          Review round {task.review_round}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {isEditing && (
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Due date
                  </label>
                  <input
                    type="datetime-local"
                    value={editData.due_date || ""}
                    onChange={(e) =>
                      setEditData({ ...editData, due_date: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                    onBlur={handleSaveEdit}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Estimated hours
                  </label>
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={editData.estimated_hours}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        estimated_hours: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                    onBlur={handleSaveEdit}
                  />
                </div>
              </div>
            )}

            {/* Task Info Card — shows all key metadata */}
            <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {/* Type-specific header bar */}
              {task.task_type === "quantitative" ? (
                <div className="flex items-center gap-2 rounded-t-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5">
                  <span className="text-lg">🎯</span>
                  <span className="text-sm font-bold text-white tracking-wide">
                    QUANTITATIVE TASK
                  </span>
                  <span className="ml-auto text-xs text-purple-200">
                    {task.measurement_type
                      ? task.measurement_type.replace(/_/g, " ")
                      : ""}
                    {task.custom_measurement_label
                      ? ` — ${task.custom_measurement_label}`
                      : ""}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-t-xl bg-gradient-to-r from-gray-600 to-gray-500 px-4 py-2.5">
                  <span className="text-lg">📋</span>
                  <span className="text-sm font-bold text-white tracking-wide">
                    STANDARD TASK
                  </span>
                </div>
              )}

              {/* Overview grid — common fields */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {/* Priority */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Priority
                  </p>
                  <p
                    className={`mt-0.5 text-sm font-semibold ${
                      task.priority === "critical"
                        ? "text-red-600"
                        : task.priority === "high"
                          ? "text-orange-600"
                          : task.priority === "medium"
                            ? "text-blue-600"
                            : "text-gray-600"
                    }`}
                  >
                    {priorities[task.priority]?.label || task.priority || "—"}
                  </p>
                </div>

                {/* Status */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white capitalize">
                    {String(task.status || "todo").replace(/_/g, " ")}
                  </p>
                </div>

                {/* Health */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Health
                  </p>
                  <div className="mt-0.5">
                    <Badge
                      label={(task.health_status || "healthy").replace(
                        /_/g,
                        " ",
                      )}
                      colorKey={task.health_status || "healthy"}
                      pill
                    />
                  </div>
                </div>

                {/* Assignee */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Assignee
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {currentAssignee
                      ? `${currentAssignee.first_name} ${currentAssignee.last_name}`
                      : "—"}
                  </p>
                </div>

                {/* Labels / Tags */}
                <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Labels
                  </p>
                  <div className="mt-0.5">
                    {(() => {
                      const tagList = Array.isArray(task.tags)
                        ? task.tags
                        : task.tags
                          ? String(task.tags)
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean)
                          : [];
                      return tagList.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tagList.map((tag, i) => (
                            <Badge key={i} label={tag} pill />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">—</p>
                      );
                    })()}
                  </div>
                </div>

                {/* Due Date */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Due Date
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                    {task.due_date
                      ? (() => {
                          try {
                            return timeService.formatPattern(
                              task.due_date,
                              "MMM d, yyyy",
                            );
                          } catch {
                            return String(task.due_date).slice(0, 10);
                          }
                        })()
                      : "—"}
                  </p>
                </div>

                {task.carry_forward_due_date ? <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">New due date</p><p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white"><CarryForwardDueDate task={task} /></p></div> : null}

                {/* Created */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Created
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                    {task.created_at
                      ? (() => {
                          try {
                            return timeService.formatPattern(
                              task.created_at,
                              "MMM d, yyyy",
                            );
                          } catch {
                            return String(task.created_at).slice(0, 10);
                          }
                        })()
                      : "—"}
                  </p>
                </div>

                {/* Created By */}
                {task.created_by_name ? (
                  <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Created By
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {task.created_by_name}
                    </p>
                  </div>
                ) : null}

                {/* Estimated Hours — shown for both types */}
                <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Est. Hours
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                    {task.estimated_hours != null && task.estimated_hours !== ""
                      ? `${Number(task.estimated_hours)}h`
                      : "—"}
                  </p>
                </div>

                {/* Story Points — if set */}
                {task.story_points != null ? (
                  <div className="border-b border-r border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Story Points
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
                      {task.story_points}
                    </p>
                  </div>
                ) : null}

                {/* Department — if set */}
                {task.department || task.department_id ? (
                  <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-700/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Department
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {task.department || "Assigned"}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Quantitative Task — Progress & Metrics Section */}
              {task.task_type !== "quantitative" ? (
                <div className="border-t border-indigo-100 px-3 py-2.5 dark:border-indigo-900/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Proof
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setProofsOpen(true)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                      {proofs.length ? ` (${proofs.length})` : ""}
                    </button>
                    {task.status === "in_review" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewProofEntries([
                            { id: 0, category: "text", value: "" },
                          ]);
                          setUploadProofOpen(true);
                        }}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {task.task_type === "quantitative" && (
                <div className="border-t border-purple-200 bg-gradient-to-b from-purple-50/80 to-white px-4 py-4 dark:border-purple-900/40 dark:from-purple-950/20 dark:to-gray-800">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-purple-800 dark:text-purple-300">
                      📊 Production Progress
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-[11px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        {task.measurement_type
                          ? task.measurement_type.replace(/_/g, " ")
                          : task.custom_measurement_label || "Quantitative"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setProofsOpen(true)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-purple-300 px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/30"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Proofs
                        {proofs.length ? ` (${proofs.length})` : ""}
                      </button>
                      {task.status === "in_review" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewProofEntries([
                              { id: 0, category: "text", value: "" },
                            ]);
                            setUploadProofOpen(true);
                          }}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-purple-300 px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/30"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Proof
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Big progress stat */}
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                      {task.completed_quantity ?? 0}
                    </span>
                    <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                      /
                    </span>
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {task.target_quantity ?? "∞"}
                    </span>
                    <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                      {task.target_unit || ""}
                    </span>
                    <span className="ml-auto text-lg font-bold text-purple-600 dark:text-purple-400">
                      {task.target_quantity && task.target_quantity > 0
                        ? `${Math.min(100, Math.round(((task.completed_quantity ?? 0) / task.target_quantity) * 100))}%`
                        : "0%"}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round(((task.completed_quantity ?? 0) / (task.target_quantity || 1)) * 100))}%`,
                      }}
                    />
                  </div>

                  {/* Target details */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-purple-200 bg-white/80 px-3 py-2 dark:border-purple-900/40 dark:bg-gray-800/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Completed
                      </p>
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {task.completed_quantity ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-white/80 px-3 py-2 dark:border-purple-900/40 dark:bg-gray-800/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Target
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {task.target_quantity ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-white/80 px-3 py-2 dark:border-purple-900/40 dark:bg-gray-800/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Remaining
                      </p>
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                        {Math.max(
                          0,
                          (task.target_quantity ?? 0) -
                            (task.completed_quantity ?? 0),
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-white/80 px-3 py-2 dark:border-purple-900/40 dark:bg-gray-800/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Unit
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {task.target_unit || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AI Task Breakdown */}
            <div className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    AI Task Breakdown
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Generate subtasks, dependencies, and milestones for this
                    task.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateBreakdown}
                  disabled={breakdownLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {breakdownLoading ? "Generating..." : "Generate breakdown"}
                </button>
              </div>

              {breakdownError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                  {breakdownError}
                </div>
              ) : null}

              {breakdown ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">
                      Summary
                    </div>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                      {breakdown.summary}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                      <div>
                        Total estimate: {breakdown.time_estimate_hours} hours
                      </div>
                      <div>
                        Dependencies: {breakdown.dependencies?.length || 0}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Subtasks
                      </h4>
                      <div className="mt-3 space-y-3">
                        {breakdown.subtasks?.map((item) => (
                          <div
                            key={`${item.order}-${item.title}`}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {item.order}. {item.title}
                              </div>
                              <div className="text-xs font-semibold text-primary-600">
                                {item.estimated_hours}h
                              </div>
                            </div>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              {item.description}
                            </p>
                            {item.dependencies?.length ? (
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Depends on: {item.dependencies.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Dependencies
                        </h4>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {breakdown.dependencies?.length ? (
                            breakdown.dependencies.map((item, index) => (
                              <span
                                key={`${item}-${index}`}
                                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              >
                                {item}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              No explicit dependencies detected.
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Milestones
                        </h4>
                        <div className="mt-3 space-y-3">
                          {breakdown.milestones?.map((item) => (
                            <div
                              key={item.title}
                              className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                            >
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {item.title}
                              </div>
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                {item.description}
                              </p>
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {item.success_criteria}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Subtasks Section - Kanban Board */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Subtasks ({subtasks.length})
                </h3>
                <button
                  onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Subtask
                </button>
              </div>

              {showSubtaskForm && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newSubtaskTitle.trim()) {
                      toast.error("Subtask title is required");
                      return;
                    }
                    // Due date and estimated hours are optional - the subtask is
                    // created without them when they are left empty.
                    const subtaskPayload = {
                      title: newSubtaskTitle.trim(),
                      description: newSubtaskDescription.trim() || null,
                      parent_task_id: task.id,
                      priority: "medium",
                    };
                    if (newSubtaskDueDate)
                      subtaskPayload.due_date = newSubtaskDueDate;
                    if (
                      newSubtaskEstimatedHours &&
                      newSubtaskEstimatedHours.trim()
                    ) {
                      const hours = parseFloat(newSubtaskEstimatedHours);
                      if (!Number.isFinite(hours) || hours <= 0) {
                        toast.error(
                          "Estimated hours must be a positive number (e.g. 0.5)",
                        );
                        return;
                      }
                      subtaskPayload.estimated_hours = hours;
                    }
                    try {
                      setCreatingSubtask(true);
                      await tasksAPI.createTask(subtaskPayload);
                      toast.success("Subtask created");
                      setNewSubtaskTitle("");
                      setNewSubtaskDescription("");
                      setNewSubtaskDueDate("");
                      setNewSubtaskEstimatedHours("");
                      setShowSubtaskForm(false);
                      const data = await tasksAPI.getSubtasks(task.id);
                      setSubtasks(data.subtasks || []);
                    } catch (error) {
                      toast.error(
                        error?.response?.data?.detail ||
                          error?.message ||
                          "Failed to create subtask",
                      );
                    } finally {
                      setCreatingSubtask(false);
                    }
                  }}
                  className="mb-4 space-y-2"
                >
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Subtask title..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                    required
                    autoFocus
                  />
                  <textarea
                    value={newSubtaskDescription}
                    onChange={(e) => setNewSubtaskDescription(e.target.value)}
                    placeholder="Subtask description (optional)..."
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-0.5 block text-[10px] font-medium text-gray-500">
                        Due date (optional)
                      </label>
                      <input
                        type="date"
                        value={newSubtaskDueDate}
                        onChange={(e) => setNewSubtaskDueDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                    <div className="w-24">
                      <label className="mb-0.5 block text-[10px] font-medium text-gray-500">
                        Hours (optional)
                      </label>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={newSubtaskEstimatedHours}
                        onChange={(e) =>
                          setNewSubtaskEstimatedHours(e.target.value)
                        }
                        placeholder="0.5"
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={creatingSubtask}
                      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 flex-1"
                    >
                      {creatingSubtask ? "Creating..." : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubtaskForm(false);
                        setNewSubtaskTitle("");
                        setNewSubtaskDescription("");
                        setNewSubtaskDueDate("");
                        setNewSubtaskEstimatedHours("");
                      }}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {subtasks.length > 0 ? (
                <div className="space-y-3">
                  {/* Status tabs - selecting one shows only its subtasks as a list */}
                  <div
                    role="tablist"
                    aria-label="Subtask statuses"
                    className="flex items-center gap-0.5 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100/80 px-1.5 py-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-gray-700 dark:bg-gray-800/80"
                  >
                    {[
                      { id: "all", label: "All" },
                      ...SUBTASK_STATUS_ORDER.map((id) => ({
                        id,
                        label: getTaskStatusTone(id).label,
                      })),
                    ].map((tab) => {
                      const isActive = subtaskStatusFilter === tab.id;
                      const count =
                        tab.id === "all"
                          ? subtasks.length
                          : subtaskCountByStatus[tab.id] || 0;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setSubtaskStatusFilter(tab.id)}
                          className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-900 dark:text-indigo-300"
                              : "text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/70 dark:hover:text-gray-200"
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                              isActive
                                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                                : "bg-gray-200/80 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {count}
                          </span>
                          {isActive ? (
                            <span className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-indigo-500" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {/* Subtask rows for the selected status - click opens the detail modal */}
                  {visibleSubtasks.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {visibleSubtasks.map((subtask) => {
                          const tone = getTaskStatusTone(subtask.status);
                          const priorityMeta =
                            SUBTASK_PRIORITY_META[
                              String(subtask.priority || "medium").toLowerCase()
                            ] || SUBTASK_PRIORITY_META.medium;
                          const assigneeName = subtaskAssigneeName(subtask);
                          return (
                            <button
                              key={subtask.id}
                              type="button"
                              onClick={() => setSelectedSubtask(subtask)}
                              title={
                                subtask.description
                                  ? `${subtask.title} - ${subtask.description}`
                                  : subtask.title
                              }
                              className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
                            >
                              <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {subtask.title}
                              </p>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.chipClass}`}
                              >
                                {tone.label}
                              </span>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityMeta.chipClass}`}
                              >
                                {priorityMeta.label}
                              </span>
                              {subtask.due_date ? (
                                <span className="hidden shrink-0 text-[11px] text-gray-500 dark:text-gray-400 sm:inline-flex">
                                  Due{" "}
                                  {timeService.format(subtask.due_date, {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              ) : null}
                              {Number(subtask.estimated_hours) > 0 ? (
                                <span className="hidden shrink-0 text-[11px] text-gray-500 dark:text-gray-400 sm:inline-flex">
                                  {subtask.estimated_hours}h
                                </span>
                              ) : null}
                              {assigneeName ? (
                                <span className="hidden shrink-0 items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 md:inline-flex">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold uppercase text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                    {String(assigneeName).charAt(0)}
                                  </span>
                                  <span className="max-w-[110px] truncate">
                                    {assigneeName}
                                  </span>
                                </span>
                              ) : null}
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-400">
                        No subtasks are{" "}
                        {subtaskStatusFilter === "all"
                          ? "available"
                          : `in ${getTaskStatusTone(subtaskStatusFilter).label.toLowerCase()}`}
                        .
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[100px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 dark:border-gray-700">
                  <div className="text-center">
                    <List className="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      No subtasks yet
                    </p>
                    <button
                      onClick={() => setShowSubtaskForm(true)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-300"
                    >
                      <Plus className="h-3 w-3" />
                      Create first subtask
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Subtask detail modal - full subtask info with status/assignee actions */}
            <Modal
              isOpen={Boolean(selectedSubtask)}
              onClose={() => setSelectedSubtask(null)}
              title="Subtask details"
              size="md"
            >
              {selectedSubtask ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {selectedSubtask.title}
                    </h4>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getTaskStatusTone(selectedSubtask.status).chipClass}`}
                      >
                        {getTaskStatusTone(selectedSubtask.status).label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          SUBTASK_PRIORITY_META[
                            String(
                              selectedSubtask.priority || "medium",
                            ).toLowerCase()
                          ]?.chipClass || SUBTASK_PRIORITY_META.medium.chipClass
                        }`}
                      >
                        {
                          (
                            SUBTASK_PRIORITY_META[
                              String(
                                selectedSubtask.priority || "medium",
                              ).toLowerCase()
                            ] || SUBTASK_PRIORITY_META.medium
                          ).label
                        }
                      </span>
                      {selectedSubtask.health_status === "overdue" ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          Overdue
                        </span>
                      ) : null}
                      {selectedSubtask.health_status === "due_today" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Due Today
                        </span>
                      ) : null}
                      {selectedSubtask.is_blocked ? (
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                          Blocked
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {selectedSubtask.description ||
                        "No description provided."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Status
                      </label>
                      <select
                        value={String(
                          selectedSubtask.status || "",
                        ).toLowerCase()}
                        disabled={subtaskUpdatingField !== null}
                        onChange={(e) =>
                          updateSubtaskField("status", e.target.value)
                        }
                        className={`w-full rounded-lg border px-3 py-2 text-sm ${subtaskUpdatingField === "status" ? "cursor-wait opacity-70" : ""}`}
                      >
                        {SUBTASK_STATUS_ORDER.map((id) => (
                          <option key={id} value={id}>
                            {getTaskStatusTone(id).label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Assignee
                      </label>
                      <select
                        value={selectedSubtask.assigned_to || ""}
                        disabled={subtaskUpdatingField !== null}
                        onChange={(e) =>
                          updateSubtaskField("assigned_to", e.target.value)
                        }
                        className={`w-full rounded-lg border px-3 py-2 text-sm ${subtaskUpdatingField === "assigned_to" ? "cursor-wait opacity-70" : ""}`}
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={getUserId(u)} value={getUserId(u)}>
                            {getUserDisplayName(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Priority
                      </label>
                      <select
                        value={String(
                          selectedSubtask.priority || "medium",
                        ).toLowerCase()}
                        disabled={subtaskUpdatingField !== null}
                        onChange={(e) =>
                          updateSubtaskField("priority", e.target.value)
                        }
                        className={`w-full rounded-lg border px-3 py-2 text-sm ${subtaskUpdatingField === "priority" ? "cursor-wait opacity-70" : ""}`}
                      >
                        {Object.entries(SUBTASK_PRIORITY_META).map(
                          ([id, meta]) => (
                            <option key={id} value={id}>
                              {meta.label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Due date
                      </label>
                      <input
                        type="date"
                        value={(selectedSubtask.due_date || "").slice(0, 10)}
                        disabled={subtaskUpdatingField !== null}
                        onChange={(e) =>
                          updateSubtaskField("due_date", e.target.value)
                        }
                        className={`w-full rounded-lg border px-3 py-2 text-sm ${subtaskUpdatingField === "due_date" ? "cursor-wait opacity-70" : ""}`}
                      />
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800/60">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Estimated hours
                      </dt>
                      <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                        {Number(selectedSubtask.estimated_hours) > 0
                          ? `${selectedSubtask.estimated_hours}h`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Reviewer
                      </dt>
                      <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                        {selectedSubtask.reviewer_name || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Created by
                      </dt>
                      <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                        {selectedSubtask.created_by_name || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">
                        Created
                      </dt>
                      <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                        {selectedSubtask.created_at
                          ? timeService.format(selectedSubtask.created_at, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => openSubtaskPage(selectedSubtask)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                    >
                      Open full task
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSubtask(null)}
                      className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </Modal>

            {/* Assign-before-Assigned warning modal */}
            <Modal
              isOpen={showAssignFirstModal}
              onClose={() => setShowAssignFirstModal(false)}
              title="Assign task first"
              size="sm"
            >
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This task has no assignee yet. Select an employee to assign it
                  to before moving its status to
                  <strong className="text-gray-900 dark:text-gray-100">
                    {" "}
                    Assigned
                  </strong>
                  .
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Employee
                  </label>
                  <select
                    value={assignFirstEmployeeId}
                    onChange={(e) => setAssignFirstEmployeeId(e.target.value)}
                    disabled={assigningFirstAssignee}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="">Select employee...</option>
                    {assigneeOptions.map((u) => (
                      <option key={getUserId(u)} value={getUserId(u)}>
                        {getUserDisplayName(u)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAssignFirstConfirm}
                    disabled={assigningFirstAssignee}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
                  >
                    {assigningFirstAssignee
                      ? "Assigning..."
                      : "Assign & Set Assigned"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAssignFirstModal(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Modal>

            {/* Revision-reason modal — required before moving to Revision Required */}
            <Modal
              isOpen={showRevisionModal}
              onClose={() => {
                if (!submittingRevision) setShowRevisionModal(false);
              }}
              title="Request revision"
              size="sm"
            >
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  A revision always needs a written reason. Explain what has to
                  change before the task moves to
                  <strong className="text-gray-900 dark:text-gray-100">
                    {" "}
                    Revision Required
                  </strong>{" "}
                  — the assignee will see this reason when the task comes back
                  to them.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Revision reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={revisionModalReason}
                    onChange={(e) => setRevisionModalReason(e.target.value)}
                    disabled={submittingRevision}
                    rows={4}
                    autoFocus
                    placeholder="Explain what needs to change before this task can be approved."
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRevisionConfirm}
                    disabled={submittingRevision || !revisionModalReason.trim()}
                    className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    {submittingRevision ? "Requesting..." : "Request revision"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRevisionModal(false)}
                    disabled={submittingRevision}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Modal>

            {/* Attachments */}
            <div ref={historyRef} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Attachments ({attachments.length})
              </h3>
              {attachments.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                  {attachments.map((url, index) => {
                    const fileName = decodeURIComponent(
                      url.split("/").pop()?.split("?")[0] || "",
                    );
                    const kind = getAttachmentKind(fileName);
                    return (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        {kind === "image" ? (
                          <img
                            src={url}
                            alt={fileName}
                            className="w-full h-32 object-cover cursor-pointer"
                            crossOrigin="anonymous"
                            loading="lazy"
                            onClick={() => window.open(url, "_blank")}
                            onError={(e) => {
                              // Log error for debugging
                              console.error(
                                "Image load error:",
                                url,
                                e.target.src,
                              );
                              // Hide broken image and show placeholder
                              e.target.onerror = null;
                              e.target.style.display = "none";
                              // Create placeholder div if it doesn't exist
                              if (
                                !e.target.nextElementSibling ||
                                !e.target.nextElementSibling.classList.contains(
                                  "image-error-placeholder",
                                )
                              ) {
                                const placeholder =
                                  document.createElement("div");
                                placeholder.className =
                                  "image-error-placeholder w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-xs";
                                placeholder.textContent = "Failed to load";
                                e.target.parentNode.appendChild(placeholder);
                              }
                            }}
                            onLoad={() => {
                              console.log("Image loaded successfully:", url);
                            }}
                          />
                        ) : kind === "video" ? (
                          <div className="relative">
                            <video
                              src={url}
                              className="w-full h-32 object-cover bg-black"
                              controls
                              preload="metadata"
                            />
                            <button
                              type="button"
                              onClick={() => window.open(url, "_blank")}
                              className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/80"
                              title="Open video in new tab"
                              aria-label="Open video in new tab"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className="w-full h-32 bg-gray-100 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-gray-200"
                            onClick={() => window.open(url, "_blank")}
                          >
                            <FileText className="h-8 w-8 text-gray-400" />
                            <span className="max-w-[90%] truncate px-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                              {kind === "document" ? "Document" : "File"}
                            </span>
                          </div>
                        )}
                        <div className="p-2">
                          <p
                            className="text-xs text-gray-600 truncate"
                            title={fileName}
                          >
                            {fileName}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                  <Paperclip className="h-4 w-4 mr-2" />
                  {uploading ? "Uploading..." : "Upload File"}
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                <span className="text-xs text-gray-400">
                  Any file type (images, videos, PDF, Excel…) · Max{" "}
                  {formatFileSize(MAX_UPLOAD_SIZE)}
                </span>
              </div>
            </div>

            {/* Activity Section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Activity
              </h3>

              {/* Activity Tabs */}
              <div className="border-b border-gray-200 mb-4">
                <div className="flex space-x-4">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`py-2 px-4 border-b-2 font-medium text-sm ${
                      activeTab === "all"
                        ? "border-primary-500 text-primary-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setActiveTab("comments")}
                    className={`py-2 px-4 border-b-2 font-medium text-sm ${
                      activeTab === "comments"
                        ? "border-primary-500 text-primary-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Comments ({comments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("history")}
                    className={`py-2 px-4 border-b-2 font-medium text-sm ${
                      activeTab === "history"
                        ? "border-primary-500 text-primary-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    History
                  </button>
                </div>
              </div>

              {/* Activity Content */}
              {activeTab === "all" || activeTab === "comments" ? (
                <div>
                  {/* Comment Input */}
                  <div className="mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-600 font-semibold text-sm">
                          {user?.first_name?.[0]}
                          {user?.last_name?.[0]}
                        </span>
                      </div>
                      <form onSubmit={handleAddComment} className="flex-1">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Add a comment..."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                          rows="3"
                        />
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Suggest a reply...
                            </button>
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Status update...
                            </button>
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Thanks...
                            </button>
                          </div>
                          <button
                            type="submit"
                            disabled={!newComment.trim() || commenting}
                            aria-busy={commenting || undefined}
                            className="btn btn-primary btn-sm"
                          >
                            {commenting ? "Commenting..." : "Comment"}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Press M to comment
                        </p>
                      </form>
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="space-y-4">
                    {loadingComments ? (
                      <p className="text-gray-500 text-sm">
                        Loading comments...
                      </p>
                    ) : comments.length === 0 ? (
                      <p className="text-gray-500 text-sm">No comments yet</p>
                    ) : (
                      comments.map((comment) => (
                        <div
                          key={comment.id}
                          className="flex items-start gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-600 font-semibold text-sm">
                              {comment.user_name?.[0] || "U"}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                {comment.user_name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {timeService.formatPattern(
                                  comment.created_at,
                                  "MMMM d, yyyy",
                                )}{" "}
                                at{" "}
                                {timeService.formatPattern(
                                  comment.created_at,
                                  "h:mm a",
                                )}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              {comment.content}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                activeTab === "history" && (
                  <div className="space-y-3">
                    {changelog.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        No changes recorded
                      </p>
                    ) : (
                      changelog.map((change) => (
                        <div key={change.id} className="flex items-start gap-3">
                          <History className="h-4 w-4 text-gray-400 mt-0.5" />
                          <div className="flex-1">
                            <div className="text-sm">
                              <span className="font-medium">
                                {change.user_name}
                              </span>{" "}
                              changed{" "}
                              <span className="font-medium capitalize">
                                {change.field}
                              </span>{" "}
                              from{" "}
                              <span className="text-gray-600">
                                {change.old_value || "None"}
                              </span>{" "}
                              to{" "}
                              <span className="text-gray-600">
                                {change.new_value || "None"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {timeService.formatPattern(
                                change.created_at,
                                "MMMM d, yyyy",
                              )}{" "}
                              at{" "}
                              {timeService.formatPattern(
                                change.created_at,
                                "h:mm a",
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 border-l border-gray-200 overflow-y-auto bg-gray-50">
            <div className="p-4 space-y-4">
              {/* Status and Actions */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      Status
                    </span>
                    {updatingStatus && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Updating...
                      </span>
                    )}
                  </div>
                  <select
                    value={taskStatus}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updatingStatus}
                    aria-busy={updatingStatus || undefined}
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition ${currentStatusTone.selectClass} ${
                      updatingStatus ? "cursor-wait opacity-70" : ""
                    }`}
                  >
                    {Object.entries(statuses).map(([key, status]) => (
                      <option
                        className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        key={key}
                        value={key}
                      >
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-end">
                  <button className="p-2 hover:bg-gray-200 rounded">
                    <Zap className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
                <button className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center justify-center gap-2">
                  <span>✨</span>
                  Improve Task
                </button>
              </div>

              {/* Details Section */}
              <div ref={detailsRef}>
                <button
                  onClick={() => setDetailsExpanded(!detailsExpanded)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 mb-2"
                >
                  <span>Details</span>
                  {detailsExpanded ? (
                    <span className="text-gray-400">▼</span>
                  ) : (
                    <span className="text-gray-400">▶</span>
                  )}
                </button>

                {detailsExpanded && (
                  <div className="space-y-3 bg-white rounded-lg p-3 border border-gray-200">
                    {/* Lead */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">
                        Lead
                      </label>
                      <div
                        className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700"
                        aria-label="Project lead"
                      >
                        {projectLeadName}
                      </div>
                    </div>

                    {/* Employee */}
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-gray-500">
                          Employee
                        </label>
                        {updatingField === "assignee" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Updating...
                          </span>
                        )}
                      </div>
                      <select
                        value={selectedEmployeeId}
                        disabled={
                          !canEditDetails || updatingField === "assignee"
                        }
                        aria-busy={updatingField === "assignee" || undefined}
                        onChange={(e) => updateAssignee(e.target.value)}
                        className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white transition ${
                          updatingField === "assignee"
                            ? "cursor-wait opacity-70"
                            : ""
                        }`}
                      >
                        <option value="">No employee assigned</option>
                        {assigneeOptions.map((u) => (
                          <option key={getUserId(u)} value={getUserId(u)}>
                            {getUserDisplayName(u)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Priority */}
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-gray-500">
                          Priority
                        </label>
                        {updatingField === "priority" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Updating...
                          </span>
                        )}
                      </div>
                      <select
                        value={task.priority}
                        disabled={updatingField === "priority"}
                        aria-busy={updatingField === "priority" || undefined}
                        onChange={async (e) => {
                          try {
                            setUpdatingField("priority");
                            await tasksAPI.updateTask(task.id, {
                              priority: e.target.value,
                            });
                            toast.success("Priority updated");
                            await loadTask();
                          } catch (error) {
                            toast.error("Failed to update priority");
                          } finally {
                            setUpdatingField(null);
                          }
                        }}
                        className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white transition ${
                          updatingField === "priority"
                            ? "cursor-wait opacity-70"
                            : ""
                        }`}
                      >
                        {Object.entries(priorities).map(([key, priority]) => (
                          <option key={key} value={key}>
                            {priority.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Parent */}
                    {task.parent_task_id ? (
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          Parent
                        </label>
                        <p className="text-sm text-gray-700">
                          {task.parent_task_id}
                        </p>
                      </div>
                    ) : null}

                    {/* Due Date */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">
                        Due date
                      </label>
                      {task.due_date ? (
                        <p className="text-sm text-gray-700">
                          {(() => {
                            try {
                              return timeService.formatPattern(
                                task.due_date,
                                "MMM d, yyyy",
                              );
                            } catch {
                              return String(task.due_date).slice(0, 10);
                            }
                          })()}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400">—</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">
                        Health
                      </label>
                      <Badge
                        label={(task.health_status || "healthy").replace(
                          /_/g,
                          " ",
                        )}
                        colorKey={task.health_status || "healthy"}
                        pill
                      />
                    </div>

                    {/* Labels */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">
                        Labels
                      </label>
                      {(() => {
                        const tagList = Array.isArray(task.tags)
                          ? task.tags
                          : task.tags
                            ? String(task.tags)
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean)
                            : [];
                        return tagList.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tagList.map((tag, index) => (
                              <Badge key={index} label={tag} pill />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        );
                      })()}
                    </div>

                    {/* Start Date */}
                    {task.start_date ? (
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          Start date
                        </label>
                        <p className="text-sm text-gray-700">
                          {(() => {
                            try {
                              return timeService.formatPattern(
                                task.start_date,
                                "MMM d, yyyy",
                              );
                            } catch {
                              return String(task.start_date).slice(0, 10);
                            }
                          })()}
                        </p>
                      </div>
                    ) : null}

                    {/* Sprint */}
                    {task.sprint_id ? (
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          Sprint
                        </label>
                        <p className="text-sm text-gray-700">
                          {task.sprint_id}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Production Tracking — only for quantitative tasks */}
              {task.task_type === "quantitative" && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    🎯 Production Tracking
                  </h3>
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
                    {/* Progress stats */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                          {productionCompleted}
                        </p>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                          Completed
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {task.target_quantity || "?"}
                        </p>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                          Target
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                          {Math.max(
                            0,
                            (task.target_quantity || 0) - productionCompleted,
                          )}
                        </p>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                          Remaining
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.round((productionCompleted / (task.target_quantity || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                        {Math.min(
                          100,
                          Math.round(
                            (productionCompleted /
                              (task.target_quantity || 1)) *
                              100,
                          ),
                        )}
                        %
                      </p>
                    </div>

                    {productionCompleted !== (task.completed_quantity ?? 0) ? (
                      <p className="mb-2 text-xs font-semibold text-amber-600 dark:text-amber-300">
                        Draft changes — not saved yet
                      </p>
                    ) : null}
                    {/* Draft quantity controls */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                        Adjust draft progress
                      </p>
                      <div className="flex gap-2">
                        {[1, 3, 5, -1].map((n) => (
                          <button
                            key={n}
                            type="button"
                            disabled={
                              updatingProduction ||
                              productionCompleted + n < 0 ||
                              productionCompleted + n >
                                (task.target_quantity || Infinity)
                            }
                            onClick={() =>
                              setProductionCompleted((value) => value + n)
                            }
                            className="flex-1 rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:bg-gray-800 dark:text-purple-300 dark:hover:bg-purple-900/30"
                          >
                            {n > 0 ? `+${n}` : "−1"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes + Update button */}
                    <div className="space-y-2">
                      <textarea
                        value={productionNotes}
                        onChange={(e) => setProductionNotes(e.target.value)}
                        placeholder="Add notes (optional)..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 shadow-sm transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                      />
                      <button
                        type="button"
                        disabled={updatingProduction}
                        onClick={() => {
                          const addedItems = Math.max(
                            0,
                            productionCompleted -
                              Number(task.completed_quantity ?? 0),
                          );
                          setProofEntries(
                            Array.from(
                              { length: Math.min(addedItems, 50) },
                              (_, index) => ({
                                id: index,
                                category: "text",
                                value: "",
                              }),
                            ),
                          );
                          setProgressProofOpen(true);
                        }}
                        className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {task.status === "in_review" ? (
                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setProofsOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
                  >
                    <Eye className="h-4 w-4" />
                    {proofs.length
                      ? `View Proof (${proofs.length})`
                      : "No proof submitted"}
                  </button>
                </div>
              ) : null}

              {task.assigned_to === String(user?.id || user?._id) &&
              task.status !== "completed" &&
              task.due_date ? (
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Request extension
                  </h3>
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={handleExtensionRequest}
                  >
                    <input
                      type="datetime-local"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={extensionForm.requested_due_date}
                      onChange={(event) =>
                        setExtensionForm((state) => ({
                          ...state,
                          requested_due_date: event.target.value,
                        }))
                      }
                      required
                    />
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      rows={3}
                      placeholder="Reason"
                      value={extensionForm.reason}
                      onChange={(event) =>
                        setExtensionForm((state) => ({
                          ...state,
                          reason: event.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="submit"
                      disabled={submittingExtension}
                      className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {submittingExtension
                        ? "Submitting..."
                        : "Submit extension request"}
                    </button>
                  </form>
                </div>
              ) : null}

              {extensionRequests.length ? (
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Extension requests
                  </h3>
                  <div className="mt-3 space-y-2">
                    {extensionRequests.map((request) => (
                      <article
                        key={request.id}
                        className="rounded-xl border border-gray-200 p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-900">
                              {request.status}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {request.requested_due_date
                                ? timeService.formatPattern(
                                    request.requested_due_date,
                                    "MMM d, yyyy",
                                  )
                                : "No date"}
                            </p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                            {request.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-600">
                          {request.reason}
                        </p>
                        {request.status === "pending" &&
                        user.role !== "employee" ? (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={reviewingExtensionId === request.id}
                              onClick={() =>
                                handleExtensionReview(request.id, "approve")
                              }
                              className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={reviewingExtensionId === request.id}
                              onClick={() =>
                                handleExtensionReview(request.id, "reject")
                              }
                              className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  {/* Watch button removed from sidebar — it already exists in the top header */}
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    aria-busy={deleting || undefined}
                    aria-label={deleting ? "Deleting task" : "Delete task"}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Modal
        isOpen={progressProofOpen}
        onClose={() => !updatingProduction && setProgressProofOpen(false)}
        title="Update Progress"
        description={`${task.completed_quantity ?? 0} → ${productionCompleted} ${task.target_unit || "units"}`}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/30">
            <p className="font-semibold">
              Add work proof{" "}
              <span className="text-xs font-normal">Optional</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You can skip this step.
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Proof requested only for newly added items. Empty rows are skipped.
          </p>
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {proofEntries.map((entry, index) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 p-1.5 dark:border-gray-700"
              >
                <div className="grid items-center gap-2 sm:grid-cols-[auto_130px_minmax(0,1fr)]">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Item {index + 1}
                  </p>
                  <select
                    className="input w-full px-2 py-1.5 text-xs"
                    value={entry.category}
                    onChange={(event) =>
                      setProofEntries((current) =>
                        current.map((item) =>
                          item.id === entry.id
                            ? {
                                ...item,
                                category: event.target.value,
                                value: "",
                              }
                            : item,
                        ),
                      )
                    }
                    aria-label={`Proof category for item ${index + 1}`}
                  >
                    <option value="media_upload">Media upload</option>
                    <option value="link">Link</option>
                    <option value="text">Text</option>
                  </select>
                  {entry.category === "media_upload" ? (
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*"
                      className="block w-full min-w-0 text-xs text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-indigo-700 dark:text-gray-400 dark:file:bg-indigo-950/40 dark:file:text-indigo-300"
                      onChange={(event) =>
                        setProofEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? {
                                  ...item,
                                  value: event.target.files?.[0]?.name || "",
                                }
                              : item,
                          ),
                        )
                      }
                      aria-label={`Upload proof for item ${index + 1}`}
                    />
                  ) : (
                    <input
                      type={entry.category === "link" ? "url" : "text"}
                      className="input w-full px-2 py-1.5 text-xs"
                      value={entry.value}
                      onChange={(event) =>
                        setProofEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder={
                        entry.category === "link"
                          ? "Enter URL"
                          : "Enter text proof"
                      }
                      aria-label={`Proof value for item ${index + 1}`}
                    />
                  )}
                </div>
              </div>
            ))}
            {!proofEntries.length ? (
              <p className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-700">
                No completed items yet. You can still skip proof.
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            {["skip", "save"].map((mode) => {
              const isSubmitting = updatingProduction;
              const label = mode === "save" ? "Save Update" : "Skip";
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting || undefined}
                  onClick={async () => {
                    try {
                      setUpdatingProduction(true);
                      const response = await tasksAPI.updateProductionProgress(
                        task.id,
                        {
                          completed_quantity: productionCompleted,
                          notes: productionNotes || undefined,
                          ...(mode === "save"
                            ? {
                                proof_entries: proofEntries
                                  .filter((entry) => entry.value.trim())
                                  .map(({ category, value }) => ({
                                    category,
                                    value: value.trim(),
                                  })),
                              }
                            : {}),
                        },
                      );
                      setTask((current) => ({
                        ...current,
                        completed_quantity: productionCompleted,
                      }));
                      setProgressProofOpen(false);
                      setProofEntries([]);
                      if (response.proof_error)
                        toast.error(response.proof_error);
                      else toast.success("Progress updated");
                      await loadTask();
                    } catch {
                      toast.error("Failed to update progress");
                    } finally {
                      setUpdatingProduction(false);
                    }
                  }}
                  className={
                    mode === "save"
                      ? "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      : "rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700 disabled:opacity-50"
                  }
                >
                  {isSubmitting ? (
                    <Loader2
                      className="mr-1 inline h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {isSubmitting ? `${label}...` : label}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={reviewProofOpen}
        onClose={() => !updatingStatus && setReviewProofOpen(false)}
        title="Submit for Review"
        description="Add optional proof of your work."
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Proof is optional. Empty fields are skipped.
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {reviewProofEntries.map((entry, index) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 p-1.5 dark:border-gray-700"
              >
                <div className="grid items-center gap-2 sm:grid-cols-[auto_130px_minmax(0,1fr)]">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Proof {index + 1}
                  </span>
                  <select
                    className="input w-full px-2 py-1.5 text-xs"
                    value={entry.category}
                    onChange={(event) =>
                      setReviewProofEntries((current) =>
                        current.map((item) =>
                          item.id === entry.id
                            ? {
                                ...item,
                                category: event.target.value,
                                value: "",
                              }
                            : item,
                        ),
                      )
                    }
                    aria-label={`Proof category ${index + 1}`}
                  >
                    <option value="media_upload">Media upload</option>
                    <option value="link">Link</option>
                    <option value="text">Text</option>
                  </select>
                  {entry.category === "media_upload" ? (
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*"
                      className="block w-full min-w-0 text-xs text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-indigo-700 dark:text-gray-400 dark:file:bg-indigo-950/40 dark:file:text-indigo-300"
                      onChange={(event) =>
                        setReviewProofEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? {
                                  ...item,
                                  value: event.target.files?.[0]?.name || "",
                                }
                              : item,
                          ),
                        )
                      }
                      aria-label={`Upload proof ${index + 1}`}
                    />
                  ) : (
                    <input
                      type={entry.category === "link" ? "url" : "text"}
                      className="input w-full px-2 py-1.5 text-xs"
                      value={entry.value}
                      onChange={(event) =>
                        setReviewProofEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder={
                        entry.category === "link"
                          ? "Enter URL"
                          : "Enter text proof"
                      }
                      aria-label={`Proof value ${index + 1}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setReviewProofEntries((current) => [
                  ...current,
                  { id: Date.now(), category: "text", value: "" },
                ])
              }
              className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
            >
              + Add proof
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => setReviewProofOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold dark:border-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleReviewSubmit(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold dark:border-gray-700"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleReviewSubmit(true)}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {updatingStatus ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={uploadProofOpen}
        onClose={() => !uploadingProof && setUploadProofOpen(false)}
        title="Add Proof"
        description="Upload optional proof for this task."
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Add one or more proof items. Empty fields are skipped.
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {reviewProofEntries.map((entry, index) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 p-1.5 dark:border-gray-700"
              >
                <div className="grid items-center gap-2 sm:grid-cols-[auto_130px_minmax(0,1fr)]">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Proof {index + 1}
                  </span>
                  <select
                    className="input w-full px-2 py-1.5 text-xs"
                    value={entry.category}
                    onChange={(event) =>
                      setReviewProofEntries((current) =>
                        current.map((item) =>
                          item.id === entry.id
                            ? {
                                ...item,
                                category: event.target.value,
                                value: "",
                              }
                            : item,
                        ),
                      )
                    }
                    aria-label={`Proof category ${index + 1}`}
                  >
                    <option value="media_upload">Media upload</option>
                    <option value="link">Link</option>
                    <option value="text">Text</option>
                  </select>
                  {entry.category === "media_upload" ? (
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*"
                      className="block w-full min-w-0 text-xs text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-indigo-700 dark:text-gray-400 dark:file:bg-indigo-950/40 dark:file:text-indigo-300"
                      onChange={(event) =>
                        setReviewProofEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? {
                                  ...item,
                                  value: event.target.files?.[0]?.name || "",
                                }
                              : item,
                          ),
                        )
                      }
                      aria-label={`Upload proof ${index + 1}`}
                    />
                  ) : (
                    <input
                      type={entry.category === "link" ? "url" : "text"}
                      className="input w-full px-2 py-1.5 text-xs"
                      value={entry.value}
                      onChange={(event) =>
                        setReviewProofEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder={
                        entry.category === "link"
                          ? "Enter URL"
                          : "Enter text proof"
                      }
                      aria-label={`Proof value ${index + 1}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setReviewProofEntries((current) => [
                  ...current,
                  { id: Date.now(), category: "text", value: "" },
                ])
              }
              className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
            >
              + Add proof
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={uploadingProof}
                onClick={() => setUploadProofOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold dark:border-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploadingProof}
                onClick={handleUploadProofs}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {uploadingProof ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={proofsOpen}
        onClose={() => setProofsOpen(false)}
        title="Work Proof"
      >
        <div className="space-y-4">
          {proofs.map((proof) => (
            <div
              key={proof.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
            >
              <p className="text-xs font-semibold uppercase text-gray-500">
                {proof.context === "review_submission"
                  ? "Review Submission"
                  : "Progress Update"}
              </p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {proof.name}
              </p>
              {/^https?:\/\//i.test(proof.value) ? (
                <a
                  href={proof.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-indigo-600 dark:text-indigo-300"
                >
                  {proof.value}
                </a>
              ) : (
                <p className="break-all text-sm text-gray-600 dark:text-gray-300">
                  {proof.value}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                {proof.submitted_by_name || "Task worker"} ·{" "}
                {proof.created_at
                  ? timeService.formatPattern(
                      proof.created_at,
                      "MMM d, yyyy h:mm a",
                    )
                  : ""}
              </p>
            </div>
          ))}
          {!proofs.length ? (
            <p className="text-sm text-gray-500">No proof submitted.</p>
          ) : null}
        </div>
      </Modal>

      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          to: task?.assigned_to
            ? [
                {
                  email:
                    users.find(
                      (item) => String(item.id) === String(task.assigned_to),
                    )?.email || "",
                  name:
                    users.find(
                      (item) => String(item.id) === String(task.assigned_to),
                    )?.first_name || "",
                },
              ]
            : [],
          subject: task?.title ? `Task update: ${task.title}` : "Task update",
          html: "<p>Hello,</p><p></p>",
          text: "Hello,",
          related_entity_type: "task",
          related_entity_id: task?.id || "",
          related_module: "tasks",
        }}
      />
    </>
  );
};

export default TaskDetail;
