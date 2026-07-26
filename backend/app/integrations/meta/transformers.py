"""Provider payloads mapped into the CRM's stable lead input shape."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, Optional


def _field_values(payload: Dict[str, Any]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for field in payload.get("field_data") or []:
        if not isinstance(field, dict):
            continue
        name = str(field.get("name") or "").strip().lower()
        raw_values = field.get("values") or []
        if name and raw_values:
            values[name] = str(raw_values[0] or "").strip()
    return values


def _parse_phone(value: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not value:
        return None, None
    cleaned = re.sub(r"[\s()\-.]", "", value)
    if cleaned.startswith("+"):
        # Meta provides an E.164-like value but not a separate country field.
        # Prefer known two/three digit calling prefixes before the one-digit set.
        digits = cleaned[1:]
        for length in (3, 2, 1):
            prefix = digits[:length]
            if prefix in {"1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98", "211", "212", "213", "216", "218", "220", "221", "222", "223", "224", "225", "226", "227", "228", "229", "230", "231", "232", "233", "234", "235", "236", "237", "238", "239", "240", "241", "242", "243", "244", "245", "246", "248", "249", "250", "251", "252", "253", "254", "255", "256", "257", "258", "260", "261", "262", "263", "264", "265", "266", "267", "268", "269", "290", "291", "297", "298", "299", "350", "351", "352", "353", "354", "355", "356", "357", "358", "359", "370", "371", "372", "373", "374", "375", "376", "377", "378", "380", "381", "382", "383", "385", "386", "387", "389", "420", "421", "423", "500", "501", "502", "503", "504", "505", "506", "507", "508", "509", "590", "591", "592", "593", "594", "595", "596", "597", "598", "599", "670", "672", "673", "674", "675", "676", "677", "678", "679", "680", "681", "682", "683", "685", "686", "687", "688", "689", "690", "691", "692", "850", "852", "853", "855", "856", "880", "886", "960", "961", "962", "963", "964", "965", "966", "967", "968", "970", "971", "972", "973", "974", "975", "976", "977", "992", "993", "994", "995", "996", "998"} and len(digits) > length:
                return f"+{prefix}", digits[length:]
    digits = re.sub(r"\D", "", cleaned)
    return (None, digits) if digits else (None, None)


def _parse_created_time(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None


def _parse_consent(value: Optional[str]) -> Optional[bool]:
    if value is None or value == "":
        return None
    return value.strip().lower() in {"true", "1", "yes", "on", "consent"}


def transform_meta_lead(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Transform a Graph lead response without inventing required data."""
    fields = _field_values(payload)
    full_name = fields.get("full_name") or fields.get("name") or None
    parts = full_name.split(maxsplit=1) if full_name else []
    first_name = fields.get("first_name") or (parts[0] if parts else None)
    last_name = fields.get("last_name") or (parts[1] if len(parts) > 1 else None)
    prospect_name = full_name or " ".join(part for part in (first_name, last_name) if part) or None
    country_code, phone = _parse_phone(fields.get("phone_number") or fields.get("phone"))
    attribution = {
        "campaign_id": payload.get("campaign_id"),
        "adset_id": payload.get("adset_id"),
        "ad_id": payload.get("ad_id"),
        "form_id": payload.get("form_id"),
    }
    return {
        "first_name": first_name.strip() if first_name else None,
        "last_name": last_name.strip() if last_name else None,
        "prospect_name": prospect_name.strip() if prospect_name else None,
        "country_code": country_code,
        "phone": phone,
        "email": fields.get("email") or None,
        "source": "meta_lead_ads",
        "meta_lead_id": str(payload.get("id") or "") or None,
        "meta_campaign_id": payload.get("campaign_id"),
        "meta_adset_id": payload.get("adset_id"),
        "meta_ad_id": payload.get("ad_id"),
        "meta_form_id": payload.get("form_id"),
        "meta_created_time": _parse_created_time(payload.get("created_time")),
        "meta_consent": _parse_consent(fields.get("consent") or fields.get("privacy_consent")),
        "meta_attribution": attribution,
    }
