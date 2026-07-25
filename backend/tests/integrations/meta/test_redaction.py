import pytest
from app.integrations.meta.redaction import sanitize_error_message

def test_sanitize_error_message_redacts_tokens_and_secrets():
    # Test JSON-like secrets
    json_err = '{"access_token": "EAA123XYZ", "error": "Invalid token"}'
    assert "EAA123XYZ" not in sanitize_error_message(json_err)
    assert "[REDACTED]" in sanitize_error_message(json_err)
    
    # Test named secrets with colon or equal
    named_err = "app_secret=secret123&client_id=123"
    assert "secret123" not in sanitize_error_message(named_err)
    assert "app_secret=[REDACTED]" in sanitize_error_message(named_err)
    
    # Test Bearer header
    bearer_err = "Authorization: Bearer EAAXYZ.123.456"
    sanitized = sanitize_error_message(bearer_err)
    assert "EAAXYZ.123.456" not in sanitized
    assert "[REDACTED]" in sanitized

def test_sanitize_error_message_redacts_phone_numbers_and_pii():
    # Test explicit phone/tel prefixes
    msg1 = "Failed to send to phone: +15551234567"
    assert "+15551234567" not in sanitize_error_message(msg1)
    assert "phone:[REDACTED]" in sanitize_error_message(msg1)
    
    msg2 = '{"whatsapp_id": "15559876543", "status": "failed"}'
    assert "15559876543" not in sanitize_error_message(msg2)
    assert '"whatsapp_id":[REDACTED]' in sanitize_error_message(msg2)

    # Test raw international E.164 phone numbers
    msg3 = "Message delivery to +447911123456 failed due to window closure."
    assert "+447911123456" not in sanitize_error_message(msg3)
    assert "[REDACTED]" in sanitize_error_message(msg3)

def test_sanitize_error_message_preserves_non_pii_numbers():
    # Test that Unix timestamps are not redacted
    timestamp_msg = "Event received at time: 1700000000. Processing started."
    assert "1700000000" in sanitize_error_message(timestamp_msg)
    
    # Test that generic counts or app IDs (numeric) are not redacted
    app_id_msg = "App ID: 987654321, count: 5"
    assert "987654321" in sanitize_error_message(app_id_msg)
    assert "5" in sanitize_error_message(app_id_msg)
