"""Single source of truth for business-domain ownership.

This registry is metadata only. Legacy modules, API routes, and persistence names
remain compatibility contracts.
"""

DOMAIN_OWNERS = {
    "lead": "crm",
    "client": "crm",
    "project": "projects",
    "task": "tasks",
    "campaign": "marketing",
    "content": "marketing",
    "publication": "marketing",
    "invoice": "finance",
    "agreement": "finance",
    "attendance": "attendance",
    "ai": "ai_platform",
    "notification": "notification_center",
    "timeline": "timeline",
    "reports": "reporting",
}
