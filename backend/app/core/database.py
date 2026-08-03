"""
Database Configuration and Connection
"""
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import logging

from app.core.config import settings
from app.models.user import User, SuperAdmin, CompanyAdmin, Admin, Manager, Lead, Employee
from app.models.company import Company, Subscription
from app.models.crm_company import CRMCompany
from app.models.crm_activity import CRMActivity
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal
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
from app.models.project import Project, Epic, Sprint
from app.models.time_tracking import TimeLog, TimeTrackingSummary
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
from app.models.department import Department
from app.models.capability import RoleCapability
from app.models.ownership_transfer import OwnershipTransfer
from app.models.ai_log import AIInteractionLog
from app.models.ai_conversation import AIConversation
from app.models.ai_user_state import AIUserState
from app.models.ai_memory import ClientMemory, CompanyMemory, ProjectMemory, UserMemory
from app.models.knowledge import KnowledgeRecord
from app.models.agent import AgentDefinition, AgentRun, AgentRunEvent, ActionProposal, SpecialistDefinition
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
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_import_job import SalesImportJob
from app.models.sales_masters import (
    SalesStage, ReasonForLost, SalesChannel, SalesTag,
    Nationality, BusinessCategory, GreetingTemplate
)
from app.models.attendance import (
    Attendance, AttendanceSession, BreakLog,
    MonitoringSession, CameraSession, ScreenShareSession
)
from app.models.timeline import TimelineEvent
from app.models.leave import LeaveRequest
from app.models.eod import EODReport
from app.models.scheduled_job import ScheduledJob
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
    Application, Candidate, CandidateJobScore, CandidateNote, CandidateSkillExtraction,
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
                Company,
                CRMCompany,
                CRMActivity,
                CRMDeal,
                CRMProposal,
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
                Epic,
                Sprint,
                TimeLog,
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
                TimelineEvent,
                LeaveRequest,
                EODReport,
                ScheduledJob,
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
