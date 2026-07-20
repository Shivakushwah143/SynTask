import hashlib
import hmac

from app.integrations.meta.signatures import (
    verify_meta_signature,
    verify_verify_token,
)


def test_signature_accepts_the_hmac_of_the_exact_raw_bytes():
    body = b'{"entry":[{"id":"page-1"}]}'
    secret = "app-secret"
    signature = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()

    assert verify_meta_signature(body, signature, secret) is True


def test_signature_verification_supports_an_empty_raw_body():
    signature = "sha256=" + hmac.new(b"app-secret", b"", hashlib.sha256).hexdigest()

    assert verify_meta_signature(b"", signature, "app-secret") is True


def test_signature_rejects_a_valid_hmac_for_different_bytes():
    secret = "app-secret"
    signed = b'{"a":1}'
    signature = "sha256=" + hmac.new(
        secret.encode(), signed, hashlib.sha256
    ).hexdigest()

    assert verify_meta_signature(b'{"a": 1}', signature, secret) is False


def test_signature_rejects_missing_or_malformed_headers():
    assert verify_meta_signature(b"{}", None, "app-secret") is False
    assert verify_meta_signature(b"{}", "sha1=abc", "app-secret") is False
    assert verify_meta_signature(b"{}", "sha256=not-hex", "app-secret") is False


def test_verify_token_uses_a_boolean_contract_for_matching_and_missing_values():
    assert verify_verify_token("expected", "expected") is True
    assert verify_verify_token("unexpected", "expected") is False
    assert verify_verify_token(None, "expected") is False
