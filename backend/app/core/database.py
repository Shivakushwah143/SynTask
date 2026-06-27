"""
Database Configuration and Connection
"""
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import logging

from app.core.config import settings
from app.models.user import User, SuperAdmin, CompanyAdmin, Admin, Manager, Lead, Employee
from app.models.company import Company, Subscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.company_subscription import CompanySubscription
from app.models.usage_tracking import UsageTracking
from app.models.billing_transaction import BillingTransaction
from app.models.payment_webhook import PaymentWebhook
from app.models.task import Task, TaskComment
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
from app.models.ai_log import AIInteractionLog
from app.models.ai_memory import ClientMemory, CompanyMemory, ProjectMemory, UserMemory
from app.models.invoice import Invoice
from app.models.msa import MSA
from app.models.meeting import Meeting
from app.models.timesheet import TimesheetEntry, TimesheetSummary
from app.models.sales_category import SalesCategory
from app.models.sales_product import SalesProduct
from app.models.sales_contact import SalesContact, ContactSharing
from app.models.sales_prospect import SalesProspect
from app.models.sales_masters import (
    SalesStage, ReasonForLost, SalesChannel, SalesTag,
    Nationality, BusinessCategory, GreetingTemplate
)

logger = logging.getLogger(__name__)

# Global MongoDB client
client: AsyncIOMotorClient = None


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
                serverSelectionTimeoutMS=30000,  # 30 seconds timeout
                connectTimeoutMS=20000,  # 20 seconds connection timeout
            )
        else:
            # For regular mongodb:// connections, configure TLS if needed
            client = AsyncIOMotorClient(
                mongodb_url,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=20000,
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
                Subscription,
                SubscriptionPlan,
                CompanySubscription,
                UsageTracking,
                BillingTransaction,
                PaymentWebhook,
                Task,
                TaskComment,
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
                AIInteractionLog,
                CompanyMemory,
                ProjectMemory,
                UserMemory,
                ClientMemory,
                Invoice,
                MSA,
                Meeting,
                TimesheetEntry,
                TimesheetSummary,
                SalesCategory,
                SalesProduct,
                SalesContact,
                ContactSharing,
                SalesProspect,
                SalesStage,
                ReasonForLost,
                SalesChannel,
                SalesTag,
                Nationality,
                BusinessCategory,
                GreetingTemplate,
            ]
        )
        
        logger.info("Beanie ODM initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {str(e)}")
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
