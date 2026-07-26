"""Validated API-neutral schemas for Meta configuration."""

from typing import Optional

from pydantic import BaseModel, Field


class MetaIntegrationSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    lead_sync_enabled: Optional[bool] = None
    insights_sync_enabled: Optional[bool] = None
    inbound_messaging_enabled: Optional[bool] = None
    page_id: Optional[str] = Field(default=None, max_length=128)
    page_access_token: Optional[str] = Field(default=None, min_length=1)
    business_id: Optional[str] = Field(default=None, max_length=128)
    ad_account_id: Optional[str] = Field(default=None, max_length=128)
    system_user_token: Optional[str] = Field(default=None, min_length=1)
    lead_form_id: Optional[str] = Field(default=None, max_length=128)
    whatsapp_business_id: Optional[str] = Field(default=None, max_length=128)
    default_lead_owner_id: Optional[str] = Field(default=None, max_length=128)


class MetaIntegrationSettingsView(BaseModel):
    company_id: str
    enabled: bool
    lead_sync_enabled: bool
    insights_sync_enabled: bool
    inbound_messaging_enabled: bool
    page_id: Optional[str] = None
    page_access_token_masked: Optional[str] = None
    business_id: Optional[str] = None
    ad_account_id: Optional[str] = None
    system_user_token_masked: Optional[str] = None
    lead_form_id: Optional[str] = None
    whatsapp_business_id: Optional[str] = None
    default_lead_owner_id: Optional[str] = None
