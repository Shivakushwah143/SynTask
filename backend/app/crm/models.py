"""CRM-owned model facade.

Imports legacy document classes without redefining them, preserving collections,
validation, and old import paths.
"""

from app.models.client import Client, ClientStatus, ClientType
from app.models.client_onboarding import ClientOnboarding, ClientOnboardingItem, ClientOnboardingItemStatus, ClientOnboardingStatus
from app.models.sales_prospect import InterestLevel, Lead, LeadStatus, ProspectStatus, SalesProspect

__all__ = [
    "Client",
    "ClientStatus",
    "ClientType",
    "ClientOnboarding",
    "ClientOnboardingItem",
    "ClientOnboardingItemStatus",
    "ClientOnboardingStatus",
    "InterestLevel",
    "Lead",
    "LeadStatus",
    "ProspectStatus",
    "SalesProspect",
]
