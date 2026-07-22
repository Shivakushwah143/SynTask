from types import SimpleNamespace
from pathlib import Path
import os
import subprocess
import sys

import pytest

from app.core.config import Settings
from app.integrations.meta.config_service import (
    MetaConfigurationError,
    MetaIntegrationConfigService,
    mask_secret,
    resolve_target_company_id,
    validate_activation,
)
from app.integrations.meta.models import (
    MetaIntegrationSettings,
    MetaMarketingInsight,
    MetaSyncRun,
    MetaWebhookEvent,
)
from app.integrations.meta.redaction import sanitize_error_message


def _index_documents(model):
    return [
        index.document
        for index in model.Settings.indexes
        if hasattr(index, "document")
    ]


def test_meta_integration_is_disabled_by_default():
    assert Settings.model_fields["META_INTEGRATION_ENABLED"].default is False


def test_enabled_meta_requires_deployment_credentials():
    with pytest.raises(ValueError, match="META_APP_ID"):
        Settings(
            SECRET_KEY="s" * 32,
            ENCRYPTION_KEY="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
            MONGODB_URL="mongodb://localhost/test",
            REDIS_URL="redis://localhost/0",
            SUPER_ADMIN_EMAIL="admin@example.com",
            SUPER_ADMIN_PASSWORD="strong-password-123",
            META_INTEGRATION_ENABLED=True,
        )


def test_enabled_meta_accepts_all_deployment_credentials():
    configured = Settings(
        SECRET_KEY="s" * 32,
        ENCRYPTION_KEY="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
        MONGODB_URL="mongodb://localhost/test",
        REDIS_URL="redis://localhost/0",
        SUPER_ADMIN_EMAIL="admin@example.com",
        SUPER_ADMIN_PASSWORD="strong-password-123",
        META_INTEGRATION_ENABLED=True,
        META_APP_ID="app-1",
        META_APP_SECRET="app-secret",
        META_VERIFY_TOKEN="verify-token",
    )

    assert configured.META_INTEGRATION_ENABLED is True


def test_meta_documents_are_tenant_scoped():
    for model in (
        MetaIntegrationSettings,
        MetaWebhookEvent,
        MetaSyncRun,
        MetaMarketingInsight,
    ):
        assert model.model_fields["company_id"].is_required()


def test_meta_settings_include_phase4_messaging_connection_fields():
    fields = MetaIntegrationSettings.model_fields

    assert "instagram_scoped_sender_ids" in fields
    assert "messenger_scoped_sender_ids" in fields
    assert "instagram_scopes" in fields
    assert "messenger_scopes" in fields


def test_meta_documents_define_migration_visible_tenant_indexes():
    for model in (
        MetaIntegrationSettings,
        MetaWebhookEvent,
        MetaSyncRun,
        MetaMarketingInsight,
    ):
        assert any(
            index["key"] == {"company_id": 1}
            for index in _index_documents(model)
        )


def test_meta_settings_use_unique_tenant_and_page_form_indexes():
    indexes = _index_documents(MetaIntegrationSettings)

    assert any(
        index["key"] == {"company_id": 1} and index.get("unique") is True
        for index in indexes
    )
    assert any(
        index["key"] == {"page_id": 1, "lead_form_id": 1}
        and index.get("unique") is True
        for index in indexes
    )


def test_webhook_correlation_id_allows_multiple_events_per_request():
    indexes = _index_documents(MetaWebhookEvent)

    correlation_index = next(
        index for index in indexes if index["key"] == {"correlation_id": 1}
    )
    assert correlation_index.get("unique") is not True


def test_mask_secret_never_returns_full_value():
    assert mask_secret(None) is None
    assert mask_secret("abc") == "••••"
    assert mask_secret("super-secret-token") == "••••oken"


def test_error_message_redacts_credentials_and_is_bounded():
    message = (
        "Graph failed access_token=secret-value "
        "Authorization: Bearer abc.def.ghi "
        '{"page_access_token":"json-page-token"} '
        '{"system_user_token":"json-system-token"} '
        '{"app_secret":"json-app-secret"} '
        + ("x" * 1000)
    )

    sanitized = sanitize_error_message(message)

    assert "secret-value" not in sanitized
    assert "abc.def.ghi" not in sanitized
    assert "json-page-token" not in sanitized
    assert "json-system-token" not in sanitized
    assert "json-app-secret" not in sanitized
    assert "[REDACTED]" in sanitized
    assert len(sanitized) <= 500


def test_webhook_model_redacts_error_before_persistence():
    validators = MetaWebhookEvent.__pydantic_decorators__.field_validators

    assert "_sanitize_error" in validators
    assert validators["_sanitize_error"].info.fields == ("error_message",)
    assert (
        MetaWebhookEvent._sanitize_error("access_token=secret-value")
        == "access_token=[REDACTED]"
    )


def test_prepare_update_encrypts_token_fields(monkeypatch):
    monkeypatch.setattr(
        "app.integrations.meta.config_service.encrypt_sensitive_value",
        lambda value: f"encrypted:{value}",
    )

    payload = MetaIntegrationConfigService.prepare_update(
        company_id="tenant-1",
        payload={
            "page_id": "page-1",
            "page_access_token": "page-token",
            "system_user_token": "system-token",
        },
    )

    assert payload["company_id"] == "tenant-1"
    assert payload["page_access_token_encrypted"] == "encrypted:page-token"
    assert payload["system_user_token_encrypted"] == "encrypted:system-token"
    assert "page_access_token" not in payload
    assert "system_user_token" not in payload


def test_company_admin_cannot_select_another_tenant():
    with pytest.raises(MetaConfigurationError, match="tenant"):
        resolve_target_company_id(
            actor_role="admin",
            actor_company_id="tenant-1",
            selected_company_id="tenant-2",
        )


def test_super_admin_must_select_tenant_explicitly():
    with pytest.raises(MetaConfigurationError, match="select"):
        resolve_target_company_id(
            actor_role="super_admin",
            actor_company_id=None,
            selected_company_id=None,
        )


def test_activation_rejects_owner_from_another_tenant():
    config = {
        "enabled": True,
        "company_id": "tenant-1",
        "page_id": "page-1",
        "page_access_token_encrypted": "encrypted-token",
        "lead_form_id": "form-1",
        "default_lead_owner_id": "owner-1",
    }
    owner = SimpleNamespace(company_id="tenant-2", status="active")

    with pytest.raises(MetaConfigurationError, match="tenant"):
        validate_activation(config, owner)


def test_activation_rejects_inactive_owner():
    config = {
        "enabled": True,
        "company_id": "tenant-1",
        "page_id": "page-1",
        "page_access_token_encrypted": "encrypted-token",
        "lead_form_id": "form-1",
        "default_lead_owner_id": "owner-1",
    }
    owner = SimpleNamespace(company_id="tenant-1", status="inactive")

    with pytest.raises(MetaConfigurationError, match="active"):
        validate_activation(config, owner)


def test_disabled_configuration_needs_no_owner():
    validate_activation({"enabled": False, "company_id": "tenant-1"}, None)


def test_foundation_migration_dry_run_needs_no_database():
    backend_dir = Path(__file__).resolve().parents[3]
    clean_environment = os.environ.copy()
    for key in (
        "SECRET_KEY",
        "ENCRYPTION_KEY",
        "MONGODB_URL",
        "REDIS_URL",
        "SUPER_ADMIN_EMAIL",
        "SUPER_ADMIN_PASSWORD",
    ):
        clean_environment.pop(key, None)
    result = subprocess.run(
        [sys.executable, "scripts/migrate_meta_foundation.py", "--dry-run"],
        cwd=backend_dir,
        env=clean_environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "meta_integration_settings" in result.stdout
    assert "meta_webhook_events" in result.stdout
    assert "meta_sync_runs" in result.stdout
    assert "meta_marketing_insights" in result.stdout
