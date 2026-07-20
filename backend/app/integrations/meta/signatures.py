"""Constant-time verification helpers for public Meta webhooks."""

import hashlib
import hmac
from typing import Optional


SIGNATURE_PREFIX = "sha256="


def verify_meta_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    app_secret: Optional[str],
) -> bool:
    """Verify Meta's SHA-256 HMAC without parsing or normalizing the body."""
    if raw_body is None or not signature_header or not app_secret:
        return False
    if not signature_header.startswith(SIGNATURE_PREFIX):
        return False

    supplied_digest = signature_header[len(SIGNATURE_PREFIX) :]
    if len(supplied_digest) != hashlib.sha256().digest_size * 2:
        return False
    try:
        int(supplied_digest, 16)
    except ValueError:
        return False

    expected_digest = hmac.new(
        app_secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(supplied_digest, expected_digest)


def verify_verify_token(
    supplied_token: Optional[str], expected_token: Optional[str]
) -> bool:
    """Compare the verification token without revealing partial matches."""
    if supplied_token is None or expected_token is None:
        return False
    return hmac.compare_digest(supplied_token, expected_token)
