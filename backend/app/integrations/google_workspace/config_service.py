"""Helpers for encrypting Google Workspace integration secrets."""

from __future__ import annotations

from typing import Any, Mapping, Optional

from app.core.security import decrypt_sensitive_value, encrypt_sensitive_value


SECRET_INPUT_FIELDS = {
    "access_token": "access_token_encrypted",
    "refresh_token": "refresh_token_encrypted",
}


class GoogleWorkspaceConfigurationError(ValueError):
    """Raised when the integration cannot be used safely."""


def mask_secret(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


def encrypt_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    prepared = {key: value for key, value in payload.items() if key not in SECRET_INPUT_FIELDS}
    for input_field, storage_field in SECRET_INPUT_FIELDS.items():
        value = payload.get(input_field)
        if value:
            prepared[storage_field] = encrypt_sensitive_value(str(value))
    return prepared


def reveal_secret(encrypted_value: Optional[str]) -> Optional[str]:
    if encrypted_value is None:
        return None
    return decrypt_sensitive_value(encrypted_value)