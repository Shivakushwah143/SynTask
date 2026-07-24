"""Tenant-safe configuration helpers for the Meta integration."""

from typing import Any, Dict, Mapping, Optional

from app.core.security import decrypt_sensitive_value, encrypt_sensitive_value


SECRET_INPUT_FIELDS = {
    "page_access_token": "page_access_token_encrypted",
    "system_user_token": "system_user_token_encrypted",
}


class MetaConfigurationError(ValueError):
    """Configuration cannot be used safely."""


def mask_secret(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


def resolve_target_company_id(
    *,
    actor_role: str,
    actor_company_id: Optional[str],
    selected_company_id: Optional[str],
) -> str:
    if actor_role == "super_admin":
        if not selected_company_id:
            raise MetaConfigurationError("Super admin must select a tenant")
        return selected_company_id

    if not actor_company_id:
        raise MetaConfigurationError("Authenticated user has no tenant")
    if selected_company_id and selected_company_id != actor_company_id:
        raise MetaConfigurationError("Cannot configure another tenant")
    return actor_company_id


def validate_activation(config: Mapping[str, Any], owner: Optional[Any]) -> None:
    if not config.get("enabled"):
        return

    required = (
        "company_id",
        "page_id",
        "page_access_token_encrypted",
        "lead_form_id",
        "default_lead_owner_id",
    )
    missing = [field for field in required if not config.get(field)]
    if missing:
        raise MetaConfigurationError(
            f"Enabled Meta integration is missing: {', '.join(missing)}"
        )
    if owner is None:
        raise MetaConfigurationError("Default lead owner does not exist")
    if str(getattr(owner, "company_id", "")) != str(config["company_id"]):
        raise MetaConfigurationError("Default lead owner belongs to another tenant")

    owner_status = getattr(owner, "status", None)
    owner_status_value = getattr(owner_status, "value", owner_status)
    if owner_status_value != "active":
        raise MetaConfigurationError("Default lead owner must be active")


class MetaIntegrationConfigService:
    @staticmethod
    def prepare_update(*, company_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        prepared = {
            key: value
            for key, value in payload.items()
            if key not in SECRET_INPUT_FIELDS and value is not None
        }
        prepared["company_id"] = company_id

        for input_field, storage_field in SECRET_INPUT_FIELDS.items():
            value = payload.get(input_field)
            if value is not None:
                prepared[storage_field] = encrypt_sensitive_value(str(value))
        return prepared

    @staticmethod
    def reveal_secret(encrypted_value: Optional[str]) -> Optional[str]:
        if encrypted_value is None:
            return None
        return decrypt_sensitive_value(encrypted_value)

    @classmethod
    async def create_onboarding_session(
        cls, company_id: str, channel: str
    ) -> Any:
        import uuid
        from datetime import datetime, timezone, timedelta
        from app.integrations.meta.messaging_models import MetaOnboardingSession
        from app.integrations.meta.channel_adapters import ChannelType

        try:
            channel_type = ChannelType(channel)
        except ValueError:
            raise MetaConfigurationError(f"Unsupported channel type: {channel}")

        state = f"{channel_type.value}_{uuid.uuid4().hex}"
        session = MetaOnboardingSession(
            company_id=company_id,
            channel=channel_type,
            state=state,
            status="pending",
            created_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        await session.insert()
        return session

    @classmethod
    async def complete_onboarding_session(
        cls, session_id: str, code: str, current_user_id: Optional[str] = None
    ) -> Any:
        import httpx
        from datetime import datetime, timezone
        from app.core.config import settings
        from app.integrations.meta.messaging_models import MetaOnboardingSession, MetaChannelConnection
        from app.integrations.meta.channel_adapters import ChannelType
        from bson import ObjectId

        try:
            session_obj_id = ObjectId(session_id)
        except Exception:
            raise MetaConfigurationError("Invalid session ID format")

        session = await MetaOnboardingSession.get(session_obj_id)
        if not session:
            raise MetaConfigurationError("Onboarding session not found")
        if session.status != "pending":
            raise MetaConfigurationError("Onboarding session is already completed or expired")
        if session.expires_at < datetime.now(timezone.utc):
            session.status = "expired"
            await session.save()
            raise MetaConfigurationError("Onboarding session has expired")

        # 1. Exchange auth code for short-lived user access token
        async with httpx.AsyncClient() as client:
            token_url = "https://graph.facebook.com/v20.0/oauth/access_token"
            params = {
                "client_id": settings.META_APP_ID or "",
                "client_secret": settings.META_APP_SECRET or "",
                "redirect_uri": f"{settings.FRONTEND_URL}/crm/settings",
                "code": code,
            }
            res = await client.get(token_url, params=params)
            if res.status_code >= 400:
                raise MetaConfigurationError(f"OAuth exchange failed: {res.text}")
            data = res.json()
            short_lived_token = data.get("access_token")
            if not short_lived_token:
                raise MetaConfigurationError("Failed to obtain short-lived user token")

            # 2. Exchange user token for long-lived user access token
            params = {
                "grant_type": "fb_exchange_token",
                "client_id": settings.META_APP_ID or "",
                "client_secret": settings.META_APP_SECRET or "",
                "fb_exchange_token": short_lived_token,
            }
            res = await client.get(token_url, params=params)
            if res.status_code >= 400:
                raise MetaConfigurationError(f"Long-lived token exchange failed: {res.text}")
            data = res.json()
            long_lived_user_token = data.get("access_token")
            if not long_lived_user_token:
                raise MetaConfigurationError("Failed to obtain long-lived user token")

            # 3. Retrieve Page or Asset details
            if session.channel == ChannelType.INSTAGRAM:
                accounts_url = "https://graph.facebook.com/v20.0/me/accounts"
                accounts_params = {
                    "fields": "instagram_business_account{id,username,name},name,access_token",
                    "access_token": long_lived_user_token,
                }
                res = await client.get(accounts_url, params=accounts_params)
                if res.status_code >= 400:
                    raise MetaConfigurationError(f"Failed to retrieve pages: {res.text}")
                pages_data = res.json().get("data", [])
                
                ig_account = None
                connected_page_id = None
                connected_page_token = None
                for page in pages_data:
                    ig_data = page.get("instagram_business_account")
                    if ig_data:
                        ig_account = ig_data
                        connected_page_id = str(page.get("id"))
                        connected_page_token = page.get("access_token")
                        break
                
                if not ig_account:
                    raise MetaConfigurationError("No linked Instagram Professional Account found")
                
                provider_asset_id = str(ig_account["id"])
                display_name = ig_account.get("name") or ig_account.get("username")
                
                connection = await MetaChannelConnection.find_one({
                    "company_id": session.company_id,
                    "channel": ChannelType.INSTAGRAM,
                    "provider_asset_id": provider_asset_id,
                })
                if not connection:
                    connection = MetaChannelConnection(
                        company_id=session.company_id,
                        channel=ChannelType.INSTAGRAM,
                        provider_asset_id=provider_asset_id,
                    )
                connection.display_name = display_name
                connection.instagram_professional_account_id = provider_asset_id
                connection.page_id = connected_page_id
                connection.credential_ref_encrypted = encrypt_sensitive_value(connected_page_token)
                connection.status = "active"
                connection.can_receive = True
                connection.can_send = True
                connection.updated_by = current_user_id
                connection.updated_at = datetime.now(timezone.utc)
                await connection.save()
                
            elif session.channel == ChannelType.MESSENGER:
                accounts_url = "https://graph.facebook.com/v20.0/me/accounts"
                accounts_params = {
                    "fields": "id,name,access_token",
                    "access_token": long_lived_user_token,
                }
                res = await client.get(accounts_url, params=accounts_params)
                if res.status_code >= 400:
                    raise MetaConfigurationError(f"Failed to retrieve pages: {res.text}")
                pages_data = res.json().get("data", [])
                if not pages_data:
                    raise MetaConfigurationError("No Facebook Pages found")
                
                page = pages_data[0]
                provider_asset_id = str(page["id"])
                display_name = page.get("name")
                page_token = page.get("access_token")
                
                connection = await MetaChannelConnection.find_one({
                    "company_id": session.company_id,
                    "channel": ChannelType.MESSENGER,
                    "provider_asset_id": provider_asset_id,
                })
                if not connection:
                    connection = MetaChannelConnection(
                        company_id=session.company_id,
                        channel=ChannelType.MESSENGER,
                        provider_asset_id=provider_asset_id,
                    )
                connection.display_name = display_name
                connection.page_id = provider_asset_id
                connection.credential_ref_encrypted = encrypt_sensitive_value(page_token)
                connection.status = "active"
                connection.can_receive = True
                connection.can_send = True
                connection.updated_by = current_user_id
                connection.updated_at = datetime.now(timezone.utc)
                await connection.save()
            else:
                raise MetaConfigurationError("Channel not supported for OAuth")
            
            session.status = "completed"
            await session.save()
            return connection

