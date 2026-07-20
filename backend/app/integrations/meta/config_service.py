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
