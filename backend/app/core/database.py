"""
Database Configuration and Connection
"""
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import logging

from app.core.config import settings
from app.models.user import User, SuperAdmin, CompanyAdmin, Admin, Manager, Lead, Employee
from app.models.employee_profile import EmployeeProfile
from app.models.hr_document import HRDocument, HRDocumentType, HRDocumentVersion
from app.models.company import Company, Subscription
from app.models.crm_company import CRMCompany
from app.models.crm_activity import CRMActivity
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal
from app.models.crm_document import CRMDocument, CRMDocumentEvent, CRMDocumentSequence
from app.models.subscription_plan import SubscriptionPlan
from app.models.company_subscription import CompanySubscription
from app.models.usage_tracking import UsageTracking
from app.models.billing_transaction import BillingTransaction
from app.models.payment_webhook import PaymentWebhook
from app.models.audit_log import AuditLog
from app.models.feature_flag import FeatureFlag
from app.models.task import Task, TaskComment, TaskExtensionRequest
from app.models.ticket import Ticket, TicketComment
from app.models.notification import Notification
from app.models.project import Project, Epic, Sprint, ProjectTypeConfiguration
from app.models.scheduled_job import ScheduledJob, ScheduledJobOccurrence
from app.models.work_request import WorkRequest
from app.models.project_template import ProjectTemplate, TemplateTask, TemplateTaskChecklistItem
from app.models.time_tracking import ActiveTimeSession, TimeLog, TimeTrackingSummary
from app.models.workflow import Workflow, WorkflowStatus, WorkflowTransition
from app.models.automation import AutomationRule, AutomationExecution
from app.models.webhook import Webhook, WebhookDelivery
from app.models.issue_types import IssueType
from app.models.components import Component
from app.models.versions import Version
from app.models.issue_linking import IssueLink
from app.models.watchers import Watcher
from app.models.changelog import ChangeLog
from app.models.chat import Conversation, ChatMessage
from app.models.page import Page
from app.models.client import Client
from app.models.client_saved_view import ClientSavedView
from app.models.client_service import ClientService
from app.models.client_deliverable import ClientDeliverable
from app.models.client_onboarding import ClientOnboarding, ClientOnboardingItem
from app.models.department import Department
from app.models.capability import RoleCapability
from app.models.ownership_transfer import OwnershipTransfer
from app.models.ai_log import AIInteractionLog
from app.models.ai_conversation import AIConversation
from app.models.ai_user_state import AIUserState
from app.models.ai_memory import ClientMemory, CompanyMemory, ProjectMemory, UserMemory
from app.models.knowledge import KnowledgeRecord
from app.models.agent import AgentDefinition, AgentRun, AgentRunEvent, ActionProposal, SpecialistDefinition
from app.models.ai_evaluation import AIEvalCaseResult, AIEvalRun
from app.models.ai_observability import AITrace, AISpan
from app.rag.models import (
    RAGCitation,
    RAGKnowledgeChunk,
    RAGKnowledgeSource,
    RAGKnowledgeSourceVersion,
    RAGRetrievalRun,
)
from app.rag.feedback import RAGFeedback
from app.models.creative_review import (
    CreativeAssetMetadata,
    CreativeCampaignReview,
    CreativeIssue,
    CreativeReview,
    CreativeReviewHistory,
    CreativeSuggestion,
    ReviewPolicy,
)
from app.models.invoice import Invoice
from app.models.msa import MSA
from app.models.meeting import Meeting
from app.models.content_calendar import ContentCalendarItem
from app.models.timesheet import TimesheetEntry, TimesheetSummary
from app.models.sales_category import SalesCategory
from app.models.sales_product import SalesProduct
from app.models.sales_contact import SalesContact, ContactSharing
from app.models.sales_lead_file import SalesLeadFile
from app.models.sales_prospect import SalesProspect
from app.models.sales_discovery_audit import SalesAudit, SalesDiscovery
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_import_job import SalesImportJob
from app.models.sales_masters import (
    SalesStage, ReasonForLost, SalesChannel, SalesTag,
    Nationality, BusinessCategory, GreetingTemplate
)
from app.models.attendance import (
    Attendance, AttendanceSession, BreakLog,
    MonitoringSession, CameraSession, ScreenShareSession,
    AttendancePolicy, Holiday, AttendanceCorrectionRequest
)
from app.integrations.etimeoffice.models import (
    ETimeOfficeEmployeeMapping,
    ETimeOfficeSyncState,
)
from app.models.timeline import TimelineEvent
from app.models.leave import LeaveBalance, LeaveRequest, LeaveTypeConfig
from app.models.salary import SalaryComponent, SalaryStructure
from app.models.payroll import PayrollPeriod, PayrollRecord
from app.models.payslip import Payslip
from app.models.lifecycle import (
    EmployeeLifecycleEvent,
    EmployeeSeparationRequest,
    EmployeeOffboarding,
)
from app.models.eod import EODReport
from app.models.capability import seed_default_capabilities
from app.integrations.meta.models import (
    MetaIntegrationSettings,
    MetaMarketingInsight,
    MetaSyncRun,
    MetaWebhookEvent,
)
from app.integrations.meta.messaging_models import (
    MetaChannelConnection,
    MetaConversation,
    MetaMessage,
    MetaOnboardingSession,
)
from app.integrations.meta.readiness_models import MetaReadinessRecord
from app.integrations.meta.identity_models import (
    CustomerIdentity,
    CrossChannelIdentityLink,
)
from app.integrations.meta.ai_draft_models import MetaAIDraft
from app.integrations.google_workspace.models import (
    GoogleWorkspaceConnection,
    GoogleWorkspaceMail,
    GoogleWorkspaceCalendarEvent,
)
from app.recruitment.models import (
    Application, Candidate, CandidateJobScore, CandidateNote, CandidatePortalCredential, CandidateSkillExtraction,
    CandidateTimeline, Interview, InterviewFeedback, JobRequirementProfile,
    MicrosoftOAuthState, MicrosoftRecruitmentConnection, Offer, OfferAccessToken,
    OfferTemplate, RecruitmentAttachment, RecruitmentAudit, RecruitmentEmailDelivery,
    RecruitmentExternalOperation, RecruitmentImportJob, RecruitmentJob, RecruitmentOutbox,
    Resume, ResumeParsedProfile, SkillAlias,
)

logger = logging.getLogger(__name__)


# Global MongoDB client
client: AsyncIOMotorClient = None
MONGODB_TIMEOUT_MS = 5000


async def _migrate_employee_profile_candidate_index(database) -> None:
    """
    Migrate historical EmployeeProfile candidate indexes to the current
    canonical unique partial-index definition before Beanie initializes models.
    """
    collection = database["employee_profiles"]
    index_name = "company_id_1_candidate_id_1"
    expected_keys = [("company_id", 1), ("candidate_id", 1)]
    expected_partial_filter = {"candidate_id": {"$type": "string"}}

    indexes = await collection.index_information()
    existing = indexes.get(index_name)

    if not existing:
        logger.info(
            "EmployeeProfile candidate index does not exist; "
            "Beanie will create the canonical index."
        )
        return

    current_keys = list(existing.get("key", []))
    is_correct = (
        current_keys == expected_keys
        and existing.get("unique") is True
        and existing.get("partialFilterExpression") == expected_partial_filter
        and existing.get("sparse") is not True
    )

    if is_correct:
        logger.info("EmployeeProfile candidate index is already canonical.")
        return

    if current_keys != expected_keys:
        logger.warning(
            "Index %s exists with unexpected keys %s; leaving it untouched.",
            index_name,
            current_keys,
        )
        return

    logger.warning(
        "Dropping legacy EmployeeProfile candidate index %s. Existing definition: %s",
        index_name,
        existing,
    )
    await collection.drop_index(index_name)
    logger.info(
        "Legacy EmployeeProfile candidate index removed. "
        "Beanie will recreate the canonical index."
    )


async def _migrate_task_source_marker_index(database) -> None:
    """
    Migrate the tasks_template_and_schedule_source_marker index.

    The old definition used ``sparse=True, unique=True`` which does NOT
    exclude documents where the indexed fields are explicitly set to
    ``null`` (sparse only skips documents where the field is *absent*).
    Since Beanie sets all Optional[str] fields to null by default, every
    normal task was indexed, causing E11000 duplicate-key errors.

    The new definition uses a partial filter for generated project-template
    and recurring scheduled-work markers only. Sales follow-ups can create
    multiple tasks for the same lead over time and are intentionally excluded.
    """
    collection = database["tasks"]
    old_index_name = "tasks_template_and_schedule_source_marker"

    indexes = await collection.index_information()
    existing = indexes.get(old_index_name)

    if not existing:
        logger.info(
            "Task source-marker index does not exist; Beanie will create "
            "the canonical partial index."
        )
        return

    # Check if the existing index is already the new partial definition.
    current_keys = list(existing.get("key", []))
    expected_keys = [
        ("company_id", 1),
        ("source_type", 1),
        ("related_entity_type", 1),
        ("related_entity_id", 1),
    ]
    expected_partial_filter = {
        "source_type": {"$in": ["project_template", "scheduled_work"]},
        "related_entity_id": {"$type": "string"},
    }
    is_canonical = (
        current_keys == expected_keys
        and existing.get("unique") is True
        and existing.get("partialFilterExpression") == expected_partial_filter
        and existing.get("sparse") is not True
    )

    if is_canonical:
        logger.info("Task source-marker partial index is already canonical.")
        return

    # Old sparse+unique index must be dropped so Beanie can create the
    # new partial unique index without a conflict.
    logger.warning(
        "Dropping legacy task source-marker index %s (keys=%s, partial=%s). "
        "Beanie will recreate the canonical partial unique index.",
        old_index_name,
        current_keys,
        existing.get("partialFilterExpression"),
    )
    await collection.drop_index(old_index_name)
    logger.info("Legacy task source-marker index removed.")


async def init_db():
    """Initialize database connection and Beanie ODM"""
    global client
    
    try:
        # Get MongoDB connection URL
        mongodb_url = settings.MONGODB_URL
        
        # For mongodb+srv:// connections (MongoDB Atlas), TLS is automatically enabled
        # We just need to ensure proper connection parameters
        if "mongodb+srv://" in mongodb_url:
            # Add retryWrites and other Atlas-required parameters if not present
            if "retryWrites" not in mongodb_url:
                separator = "&" if "?" in mongodb_url else "?"
                mongodb_url = f"{mongodb_url}{separator}retryWrites=true&w=majority"
            
            # For mongodb+srv://, don't set tls explicitly - it's automatic
            client = AsyncIOMotorClient(
                mongodb_url,
                serverSelectionTimeoutMS=MONGODB_TIMEOUT_MS,
                connectTimeoutMS=MONGODB_TIMEOUT_MS,
            )
        else:
            # For regular mongodb:// connections, fail fast in dev/QA.
            client = AsyncIOMotorClient(
                mongodb_url,
                serverSelectionTimeoutMS=MONGODB_TIMEOUT_MS,
                connectTimeoutMS=MONGODB_TIMEOUT_MS,
            )
        
        # Ping the database to verify connection
        await client.admin.command('ping')
        logger.info("Successfully connected to MongoDB")
        
        # Get database
        database = client[settings.DATABASE_NAME]

        # ── Pre-flight: drop stale indexes whose spec changed ────────
        # Beanie raises IndexKeySpecsConflict when the model declares a
        # different spec (e.g. unique added) but the database already has
        # an index with the same auto-generated name.  Drop stale indexes
        # so Beanie can recreate them with the correct spec.
        await _migrate_employee_profile_candidate_index(database)
        await _migrate_task_source_marker_index(database)

        # Initialize Beanie with document models
        await init_beanie(
            database=database,
            document_models=[
                User,
                SuperAdmin,
                CompanyAdmin,
                Admin,  # New Admin model
                Manager,  # New Manager model
                Lead,
                Employee,
                EmployeeProfile,
                HRDocumentType,
                HRDocument,
                HRDocumentVersion,
                Company,
                CRMCompany,
                CRMActivity,
                CRMDeal,
                CRMProposal,
                CRMDocument,
                CRMDocumentEvent,
                CRMDocumentSequence,
                Subscription,
                SubscriptionPlan,
                CompanySubscription,
                UsageTracking,
                BillingTransaction,
                PaymentWebhook,
                AuditLog,
                FeatureFlag,
                Task,
                TaskComment,
                TaskExtensionRequest,
                Ticket,
                TicketComment,
                Notification,
                Project,
                ProjectTypeConfiguration,
                ScheduledJob,
                ScheduledJobOccurrence,
                WorkRequest,
                Epic,
                Sprint,
                TimeLog,
                ActiveTimeSession,
                TimeTrackingSummary,
                Workflow,
                WorkflowStatus,
                WorkflowTransition,
                AutomationRule,
                AutomationExecution,
                Webhook,
                WebhookDelivery,
                IssueType,
                Component,
                Version,
                IssueLink,
                Watcher,
                ChangeLog,
                Conversation,
                ChatMessage,
                Page,
                Client,
                ClientSavedView,
                ClientService,
                ClientDeliverable,
                ClientOnboarding,
                ClientOnboardingItem,
                Department,
                RoleCapability,
                OwnershipTransfer,
                AIInteractionLog,
                AIConversation,
                AIUserState,
                CompanyMemory,
                ProjectMemory,
                UserMemory,
                ClientMemory,
                KnowledgeRecord,
                AgentDefinition,
                SpecialistDefinition,
                AgentRun,
                AgentRunEvent,
                ActionProposal,
                AIEvalRun,
                AIEvalCaseResult,
                AITrace,
                AISpan,
                RAGKnowledgeSource,
                RAGKnowledgeSourceVersion,
                RAGKnowledgeChunk,
                RAGRetrievalRun,
                RAGCitation,
                RAGFeedback,
                CreativeAssetMetadata,
                CreativeCampaignReview,
                CreativeReview,
                CreativeIssue,
                CreativeSuggestion,
                CreativeReviewHistory,
                ReviewPolicy,
                ProjectTemplate,
                TemplateTask,
                TemplateTaskChecklistItem,
                Invoice,
                MSA,
                Meeting,
                ContentCalendarItem,
                TimesheetEntry,
                TimesheetSummary,
                SalesCategory,
                SalesProduct,
                SalesContact,
                ContactSharing,
                SalesLeadFile,
                SalesProspect,
                SalesDiscovery,
                SalesAudit,
                SalesLeadNote,
                SalesPipelineHistory,
                SalesImportJob,
                SalesStage,
                ReasonForLost,
                SalesChannel,
                SalesTag,
                Nationality,
                BusinessCategory,
                GreetingTemplate,
                Attendance,
                AttendanceSession,
                BreakLog,
                MonitoringSession,
                CameraSession,
                ScreenShareSession,
                AttendancePolicy,
                Holiday,
                AttendanceCorrectionRequest,
                ETimeOfficeEmployeeMapping,
                ETimeOfficeSyncState,
                TimelineEvent,
                LeaveRequest,
                LeaveTypeConfig,
                LeaveBalance,
                SalaryComponent,
                SalaryStructure,
                PayrollPeriod,
                PayrollRecord,
                Payslip,
                EmployeeLifecycleEvent,
                EmployeeSeparationRequest,
                EmployeeOffboarding,
                EODReport,
                ScheduledJob,
                ScheduledJobOccurrence,
                WorkRequest,
                MetaIntegrationSettings,
                MetaWebhookEvent,
                MetaSyncRun,
                MetaMarketingInsight,
                MetaChannelConnection,
                MetaConversation,
                MetaMessage,
                MetaOnboardingSession,
                MetaReadinessRecord,
                CustomerIdentity,
                CrossChannelIdentityLink,
                MetaAIDraft,
                GoogleWorkspaceConnection,
                GoogleWorkspaceMail,
                GoogleWorkspaceCalendarEvent,
                RecruitmentJob,
                Candidate,
                CandidatePortalCredential,
                Application,
                Resume,
                ResumeParsedProfile,
                SkillAlias,
                CandidateSkillExtraction,
                JobRequirementProfile,
                CandidateJobScore,
                Interview,
                InterviewFeedback,
                Offer,
                OfferTemplate,
                OfferAccessToken,
                MicrosoftRecruitmentConnection,
                MicrosoftOAuthState,
                RecruitmentExternalOperation,
                RecruitmentEmailDelivery,
                CandidateNote,
                RecruitmentAttachment,
                RecruitmentImportJob,
                CandidateTimeline,
                RecruitmentOutbox,
                RecruitmentAudit,
            ]
        )

        await seed_default_capabilities()
        from app.agents.registry import register_builtin_agent_definitions

        await register_builtin_agent_definitions()
        
        logger.info("Beanie ODM initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {str(e)}")
        if client:
            client.close()
            client = None
        logger.warning(
            "MongoDB initialization failed. "
            "Set MONGODB_URL to a reachable database to enable persistence."
        )
        raise


async def close_db():
    """Close database connection"""
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed")


def get_database():
    """Get database instance"""
    return client[settings.DATABASE_NAME]
