"""
Marketing-specific AI tools for Digital Marketing Client Support Agent.
These tools allow the AI to perform actions and fetch data related to marketing campaigns,
billing, subscriptions, support tickets, and client services.
"""
from __future__ import annotations

from typing import Any, Optional
from datetime import datetime, date

from app.models.ticket import Ticket, TicketPriority, TicketStatus
from app.models.meeting import Meeting
from app.models.invoice import Invoice
from app.models.subscription_plan import SubscriptionPlan
from app.models.company_subscription import CompanySubscription
from app.models.project import Project, ProjectType
from app.models.content_calendar import ContentCalendarItem, ContentItemStatus
from app.models.client import Client
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user


class MarketingTools:
    """Marketing-specific tools for AI agent."""
    
    @staticmethod
    async def create_support_ticket(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        Create a support ticket for marketing-related issues.
        
        Payload:
            - title: str (required)
            - description: str (required)
            - priority: str (optional: low, medium, high, urgent)
            - type: str (optional: marketing, billing, technical, general)
        """
        try:
            title = payload.get("title", "").strip()
            description = payload.get("description", "").strip()
            
            if not title or not description:
                return {
                    "success": False,
                    "detail": "Title and description are required"
                }
            
            # Determine priority
            priority_str = payload.get("priority", "medium").lower()
            priority_map = {
                "low": TicketPriority.LOW,
                "medium": TicketPriority.MEDIUM,
                "high": TicketPriority.HIGH,
                "urgent": TicketPriority.URGENT,
            }
            priority = priority_map.get(priority_str, TicketPriority.MEDIUM)
            
            # Determine type
            type_str = payload.get("type", "marketing").lower()
            type_map = {
                "marketing": TicketType.MARKETING,
                "billing": TicketType.BILLING,
                "technical": TicketType.TECHNICAL,
                "general": TicketType.GENERAL,
            }
            ticket_type = type_map.get(type_str, TicketType.MARKETING)
            
            # Generate ticket number
            company_id = current_user.company_id
            ticket_count = await Ticket.find(Ticket.company_id == company_id).count()
            ticket_number = f"TKT-{company_id[:8].upper()}-{ticket_count + 1:04d}"
            
            # Create ticket
            ticket = Ticket(
                ticket_number=ticket_number,
                company_id=company_id,
                title=title,
                description=description,
                priority=priority,
                type=ticket_type,
                status=TicketStatus.OPEN,
                created_by=str(current_user.id),
                created_by_name=current_user.full_name(),
                assigned_to=None,
            )
            await ticket.insert()
            
            return {
                "success": True,
                "ticket_id": str(ticket.id),
                "ticket_number": ticket_number,
                "title": title,
                "status": "open",
                "message": f"Support ticket {ticket_number} created successfully"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to create ticket: {str(e)}"
            }
    
    @staticmethod
    async def get_campaign_details(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        Fetch campaign details from projects and content calendar.
        
        Payload:
            - project_id: str (optional) - Specific project ID
            - campaign_name: str (optional) - Search by campaign name
            - limit: int (optional, default: 10)
        """
        try:
            company_id = current_user.company_id
            if not company_id:
                return {"success": False, "detail": "User must belong to a company"}
            
            project_id = payload.get("project_id")
            campaign_name = payload.get("campaign_name", "").lower()
            limit = min(payload.get("limit", 10), 25)
            
            campaigns = []
            
            # Fetch from content calendar
            query = {"company_id": company_id}
            if project_id:
                query["project_id"] = project_id
            if campaign_name:
                query["campaign"] = {"$regex": campaign_name, "$options": "i"}
            
            content_items = await ContentCalendarItem.find(query).limit(limit).to_list()
            
            for item in content_items:
                campaigns.append({
                    "campaign_id": item.campaign,
                    "project_id": item.project_id,
                    "title": item.title,
                    "platform": item.platform,
                    "content_type": item.content_type.value,
                    "status": item.status.value,
                    "priority": item.priority.value,
                    "publish_date": item.publish_date.isoformat() if item.publish_date else None,
                    "due_date": item.due_date.isoformat() if item.due_date else None,
                    "assignee": item.assignee_name,
                    "completed": item.completed,
                })
            
            # Also fetch from projects with MARKETING type
            if not project_id:
                project_query = {
                    "company_id": company_id,
                    "type": ProjectType.MARKETING,
                }
                if campaign_name:
                    project_query["name"] = {"$regex": campaign_name, "$options": "i"}
                
                marketing_projects = await Project.find(project_query).limit(limit).to_list()
                
                for project in marketing_projects:
                    # Check if already in campaigns
                    if not any(c.get("project_id") == project.project_id for c in campaigns):
                        campaigns.append({
                            "project_id": project.project_id,
                            "campaign_name": project.name,
                            "status": project.status.value,
                            "type": project.type.value,
                            "lead_id": project.lead_id,
                            "start_date": project.start_date.isoformat() if project.start_date else None,
                            "delivery_date": project.delivery_date.isoformat() if project.delivery_date else None,
                            "team_members": project.team_member_ids,
                        })
            
            return {
                "success": True,
                "campaigns": campaigns[:limit],
                "count": len(campaigns[:limit]),
                "message": f"Found {len(campaigns[:limit])} campaign(s)"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to fetch campaigns: {str(e)}"
            }
    
    @staticmethod
    async def get_invoice_details(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        Fetch invoice details for the company.
        
        Payload:
            - invoice_id: str (optional) - Specific invoice ID
            - client_id: str (optional) - Filter by client
            - status: str (optional) - Filter by status (draft, sent, paid, cancelled)
            - limit: int (optional, default: 10)
        """
        try:
            company_id = current_user.company_id
            if not company_id:
                return {"success": False, "detail": "User must belong to a company"}
            
            invoice_id = payload.get("invoice_id")
            client_id = payload.get("client_id")
            status = payload.get("status")
            limit = min(payload.get("limit", 10), 25)
            
            query = {"company_id": company_id}
            
            if invoice_id:
                query["_id"] = invoice_id
            if client_id:
                query["client_id"] = client_id
            if status:
                query["status"] = status
            
            invoices = await Invoice.find(query).sort("-invoice_date").limit(limit).to_list()
            
            invoice_list = []
            for invoice in invoices:
                invoice_list.append({
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "client_id": invoice.client_id,
                    "client_name": invoice.client_name,
                    "invoice_date": invoice.invoice_date.isoformat(),
                    "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
                    "subtotal": invoice.subtotal,
                    "tax_amount": invoice.tax_amount,
                    "total_amount": invoice.total_amount,
                    "total_received": invoice.total_received,
                    "outstanding_amount": invoice.outstanding_amount,
                    "status": invoice.status.value,
                    "currency": invoice.currency,
                })
            
            return {
                "success": True,
                "invoices": invoice_list,
                "count": len(invoice_list),
                "message": f"Found {len(invoice_list)} invoice(s)"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to fetch invoices: {str(e)}"
            }
    
    @staticmethod
    async def get_subscription_details(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        Fetch subscription details for the company.
        
        Payload:
            - plan_id: str (optional) - Specific plan ID
        """
        try:
            company_id = current_user.company_id
            if not company_id:
                return {"success": False, "detail": "User must belong to a company"}
            
            # Get company subscription
            subscription = await CompanySubscription.find_one(
                CompanySubscription.company_id == company_id
            )
            
            if not subscription:
                return {
                    "success": True,
                    "subscription": None,
                    "message": "No active subscription found"
                }
            
            # Get plan details
            plan = await SubscriptionPlan.get(subscription.plan_id) if subscription.plan_id else None
            
            subscription_data = {
                "subscription_id": str(subscription.id),
                "plan_id": subscription.plan_id,
                "plan_name": plan.name if plan else "Unknown",
                "status": subscription.status.value if hasattr(subscription, 'status') else "active",
                "start_date": subscription.start_date.isoformat() if subscription.start_date else None,
                "end_date": subscription.end_date.isoformat() if subscription.end_date else None,
                "trial_end_date": subscription.trial_end_date.isoformat() if hasattr(subscription, 'trial_end_date') and subscription.trial_end_date else None,
                "current_users": subscription.current_users if hasattr(subscription, 'current_users') else 0,
                "max_users": plan.max_users if plan else None,
                "price_monthly": plan.price_monthly if plan else 0,
                "price_yearly": plan.price_yearly if plan else 0,
                "currency": plan.currency if plan else "INR",
                "enabled_modules": plan.enabled_modules if plan else [],
                "features": plan.features if plan else [],
            }
            
            return {
                "success": True,
                "subscription": subscription_data,
                "message": "Subscription details retrieved successfully"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to fetch subscription: {str(e)}"
            }
    
    @staticmethod
    async def schedule_meeting(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        Schedule a meeting for the user.
        
        Payload:
            - title: str (required)
            - description: str (optional)
            - meeting_date: str (required, ISO format)
            - duration_minutes: int (optional, default: 60)
            - attendees: list[str] (optional, user IDs)
        """
        try:
            title = payload.get("title", "").strip()
            description = payload.get("description", "").strip()
            meeting_date_str = payload.get("meeting_date")
            duration_minutes = payload.get("duration_minutes", 60)
            attendees = payload.get("attendees", [])
            
            if not title or not meeting_date_str:
                return {
                    "success": False,
                    "detail": "Title and meeting date are required"
                }
            
            meeting_date = datetime.fromisoformat(meeting_date_str)
            
            # Create meeting
            meeting = Meeting(
                company_id=current_user.company_id,
                title=title,
                description=description,
                meeting_date=meeting_date,
                duration_minutes=duration_minutes,
                organizer_id=str(current_user.id),
                organizer_name=current_user.full_name(),
                attendee_ids=attendees,
                status="scheduled",
            )
            await meeting.insert()
            
            return {
                "success": True,
                "meeting_id": str(meeting.id),
                "title": title,
                "meeting_date": meeting_date.isoformat(),
                "duration_minutes": duration_minutes,
                "message": f"Meeting '{title}' scheduled successfully"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to schedule meeting: {str(e)}"
            }
    
    @staticmethod
    async def list_services(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        List available digital marketing services.
        
        Payload:
            - category: str (optional) - Filter by category
        """
        try:
            # Predefined marketing services
            services = [
                {
                    "service_id": "seo",
                    "name": "Search Engine Optimization (SEO)",
                    "category": "SEO",
                    "description": "Improve your website's visibility on search engines",
                    "features": [
                        "Keyword research and optimization",
                        "On-page SEO",
                        "Technical SEO",
                        "Link building",
                        "Monthly SEO reports"
                    ]
                },
                {
                    "service_id": "google_ads",
                    "name": "Google Ads Management",
                    "category": "PPC",
                    "description": "Professional Google Ads campaign management",
                    "features": [
                        "Campaign setup and optimization",
                        "Keyword bidding strategy",
                        "Ad copy creation",
                        "Performance tracking",
                        "ROI optimization"
                    ]
                },
                {
                    "service_id": "meta_ads",
                    "name": "Meta Ads (Facebook & Instagram)",
                    "category": "Social Media",
                    "description": "Facebook and Instagram advertising campaigns",
                    "features": [
                        "Audience targeting",
                        "Creative design",
                        "A/B testing",
                        "Campaign optimization",
                        "Performance analytics"
                    ]
                },
                {
                    "service_id": "social_media",
                    "name": "Social Media Marketing",
                    "category": "Social Media",
                    "description": "Complete social media management",
                    "features": [
                        "Content calendar",
                        "Post scheduling",
                        "Community management",
                        "Engagement tracking",
                        "Monthly reports"
                    ]
                },
                {
                    "service_id": "email_marketing",
                    "name": "Email Marketing",
                    "category": "Email",
                    "description": "Email campaign management and automation",
                    "features": [
                        "Email template design",
                        "List segmentation",
                        "Automation workflows",
                        "A/B testing",
                        "Performance analytics"
                    ]
                },
                {
                    "service_id": "content_marketing",
                    "name": "Content Marketing",
                    "category": "Content",
                    "description": "Content strategy and creation",
                    "features": [
                        "Content strategy",
                        "Blog writing",
                        "Video content",
                        "Infographic design",
                        "Content calendar"
                    ]
                },
                {
                    "service_id": "landing_pages",
                    "name": "Landing Page Development",
                    "category": "Web Development",
                    "description": "High-converting landing page design and development",
                    "features": [
                        "Custom design",
                        "Responsive development",
                        "A/B testing",
                        "Conversion optimization",
                        "Analytics integration"
                    ]
                },
                {
                    "service_id": "analytics",
                    "name": "Analytics & Reporting",
                    "category": "Analytics",
                    "description": "Comprehensive analytics and reporting",
                    "features": [
                        "Custom dashboards",
                        "Monthly reports",
                        "ROI tracking",
                        "Competitor analysis",
                        "Insights and recommendations"
                    ]
                },
                {
                    "service_id": "lead_generation",
                    "name": "Lead Generation",
                    "category": "Lead Generation",
                    "description": "Strategic lead generation campaigns",
                    "features": [
                        "Landing page optimization",
                        "Form design",
                        "Lead nurturing",
                        "CRM integration",
                        "Conversion tracking"
                    ]
                },
                {
                    "service_id": "crm_management",
                    "name": "CRM Management",
                    "category": "CRM",
                    "description": "CRM setup and management",
                    "features": [
                        "CRM configuration",
                        "Data management",
                        "Automation setup",
                        "User training",
                        "Support"
                    ]
                }
            ]
            
            # Filter by category if provided
            category = payload.get("category", "").lower()
            if category:
                services = [s for s in services if category in s["category"].lower()]
            
            return {
                "success": True,
                "services": services,
                "count": len(services),
                "message": f"Found {len(services)} service(s)"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to list services: {str(e)}"
            }
    
    @staticmethod
    async def search_faq(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
        """
        Search FAQ knowledge base.
        
        Payload:
            - query: str (required) - Search query
            - limit: int (optional, default: 5)
        """
        try:
            query = payload.get("query", "").lower().strip()
            limit = min(payload.get("limit", 5), 10)
            
            if not query:
                return {
                    "success": False,
                    "detail": "Search query is required"
                }
            
            # Predefined FAQ database (in production, this would query a knowledge base)
            faqs = [
                {
                    "question": "How do I track my campaign performance?",
                    "answer": "You can track campaign performance through the Reports section. Navigate to Reports > Campaign Performance to view detailed analytics including impressions, clicks, conversions, and ROI.",
                    "category": "Campaigns"
                },
                {
                    "question": "How can I view my invoices?",
                    "answer": "Go to the Invoices section to view all your invoices. You can filter by status (paid, pending, overdue) and download PDF copies. For detailed invoice explanations, ask me!",
                    "category": "Billing"
                },
                {
                    "question": "How do I upgrade my subscription plan?",
                    "answer": "Navigate to Settings > Subscription to view available plans. Click 'Upgrade' on your desired plan. Changes take effect immediately, and we'll prorate any differences.",
                    "category": "Subscription"
                },
                {
                    "question": "What is the process for creating a support ticket?",
                    "answer": "You can create a support ticket by going to the Tickets section and clicking 'New Ticket', or simply ask me to create one for you! I'll need the issue details and priority level.",
                    "category": "Support"
                },
                {
                    "question": "How often do I receive campaign reports?",
                    "answer": "You receive weekly performance reports every Monday and comprehensive monthly reports on the 1st of each month. You can also generate custom reports anytime from the Reports section.",
                    "category": "Reports"
                },
                {
                    "question": "What marketing services are included in my plan?",
                    "answer": "Your plan includes SEO, Google Ads, Meta Ads, Social Media Marketing, and Email Marketing. For a complete list of services, ask me to list your available services.",
                    "category": "Services"
                },
                {
                    "question": "How do I schedule a meeting with my account manager?",
                    "answer": "You can schedule a meeting by going to the Meetings section or simply ask me to schedule one for you. I'll need the preferred date, time, and agenda.",
                    "category": "Meetings"
                },
                {
                    "question": "Where can I see my SEO performance?",
                    "answer": "SEO performance metrics are available in the Reports section under SEO Analytics. You'll find keyword rankings, organic traffic, backlinks, and optimization recommendations.",
                    "category": "SEO"
                },
                {
                    "question": "How do I update my payment method?",
                    "answer": "Go to Settings > Billing > Payment Methods to add or update your payment information. Changes will be applied to your next billing cycle.",
                    "category": "Billing"
                },
                {
                    "question": "What is the typical response time for support tickets?",
                    "answer": "We aim to respond to all tickets within 24 hours during business days. High-priority tickets (urgent) are typically addressed within 4-8 hours.",
                    "category": "Support"
                }
            ]
            
            # Simple keyword matching (in production, use semantic search)
            scored_faqs = []
            for faq in faqs:
                score = 0
                # Check if query words appear in question or answer
                query_words = query.split()
                for word in query_words:
                    if word in faq["question"].lower():
                        score += 2
                    if word in faq["answer"].lower():
                        score += 1
                    if word in faq["category"].lower():
                        score += 1
                
                if score > 0:
                    scored_faqs.append({**faq, "score": score})
            
            # Sort by score and limit
            scored_faqs.sort(key=lambda x: x["score"], reverse=True)
            results = scored_faqs[:limit]
            
            return {
                "success": True,
                "faqs": results,
                "count": len(results),
                "message": f"Found {len(results)} FAQ(s) matching your query"
            }
            
        except Exception as e:
            return {
                "success": False,
                "detail": f"Failed to search FAQ: {str(e)}"
            }


# Import TicketType
from app.models.ticket import TicketType


def register_marketing_tools(tool_executor, get_current_user_dependency):
    """
    Register all marketing tools with the tool executor.
    
    Args:
        tool_executor: ToolExecutor instance
        get_current_user_dependency: FastAPI dependency for getting current user
    """
    tools = MarketingTools()
    
    async def create_support_ticket_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.create_support_ticket(payload, current_user)
    
    async def get_campaign_details_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.get_campaign_details(payload, current_user)
    
    async def get_invoice_details_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.get_invoice_details(payload, current_user)
    
    async def get_subscription_details_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.get_subscription_details(payload, current_user)
    
    async def schedule_meeting_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.schedule_meeting(payload, current_user)
    
    async def list_services_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.list_services(payload, current_user)
    
    async def search_faq_wrapper(payload: dict[str, Any]) -> dict[str, Any]:
        current_user = await get_current_user_dependency()
        return await tools.search_faq(payload, current_user)
    
    # Register tools
    tool_executor.register("create_support_ticket", create_support_ticket_wrapper)
    tool_executor.register("get_campaign_details", get_campaign_details_wrapper)
    tool_executor.register("get_invoice_details", get_invoice_details_wrapper)
    tool_executor.register("get_subscription_details", get_subscription_details_wrapper)
    tool_executor.register("schedule_meeting", schedule_meeting_wrapper)
    tool_executor.register("list_services", list_services_wrapper)
    tool_executor.register("search_faq", search_faq_wrapper)