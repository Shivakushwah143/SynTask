"""
ETimeOfficeClient — server-side provider for the eTimeOffice machine-data API.

Discovery evidence (read-only probes against the live service, September 2026):
- Base URL ........ https://api.etimeoffice.com/api
- Endpoint ........ GET /DownloadInOutPunchData
- Parameters ...... Empcode=ALL, FromDate=DD/MM/YYYY, ToDate=DD/MM/YYYY
- Authentication .. HTTP Basic; the username is the colon-joined string
                    ``{CorporateID}:{Username}:{Password}:true`` and the Basic
                    password field is empty. Without the trailing ``:true`` the
                    service returns HTTP 500 "String was not recognized as a
                    valid Boolean", which is how the scheme was confirmed.
- Response ........ JSON envelope { Error, Msg, IsAdmin, InOutPunchData[] } where
                    each row is { Empcode, Name, DateString (DD/MM/YYYY),
                    INTime, OUTTime, WorkTime, OverTime, BreakTime, Status
                    ("P"/"A"), Remark, Erl_Out, Late_In } with times in HH:MM
                    (or "--:--" when not punched).

This provider ONLY reads attendance; it never writes to eTimeOffice. Vendor
field names stay inside this module — SynTask business logic consumes the
normalized records below.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PROVIDER = "etimeoffice"
INOUT_ENDPOINT = "DownloadInOutPunchData"
DEFAULT_TIMEOUT_SECONDS = 30.0
_TIME_FORMAT = "%H:%M"
_DATE_FORMAT = "%d/%m/%Y"
_NO_TIME = "--:--"


class ETimeOfficeError(Exception):
    """Base error for the eTimeOffice provider."""


class ETimeOfficeAuthError(ETimeOfficeError):
    """Authentication/authorization failed against the provider."""


class ETimeOfficeAPIError(ETimeOfficeError):
    """The provider returned an error envelope or unexpected payload."""


@dataclass
class ETimeOfficeInOutDay:
    """Normalized per-employee, per-day punch summary (provider-owned schema).

    Date/times are kept as wall-clock values exactly as the device reported
    them. SynTask converts them to UTC instants using the company policy
    timezone (see the sync service), so no vendor field names leak further.
    """

    external_employee_code: str
    date: date
    # Directory metadata (informational; never used for employee resolution)
    external_employee_name: str = ""
    check_in: Optional[time] = None
    check_out: Optional[time] = None
    work_minutes: int = 0
    break_minutes: int = 0
    overtime_minutes: int = 0
    # Vendor-derived flags passed through for information only; SynTask policy
    # still recomputes late/early through its own rules.
    vendor_late_minutes: int = 0
    vendor_early_minutes: int = 0
    status: str = "A"  # "P" present, "A" absent (vendor raw value)
    remark: str = ""
    raw: dict = field(default_factory=dict)


def _parse_time(value: Optional[str]) -> Optional[time]:
    if not value or value.strip() in ("", _NO_TIME):
        return None
    try:
        return datetime.strptime(value.strip(), _TIME_FORMAT).time()
    except ValueError:
        return None


def _parse_minutes(value: Optional[str]) -> int:
    parsed = _parse_time(value)
    if parsed is None:
        return 0
    return parsed.hour * 60 + parsed.minute


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip(), _DATE_FORMAT).date()
    except ValueError:
        return None


class ETimeOfficeClient:
    """Stateless HTTP client for the eTimeOffice machine-data download API.

    Authentication is HTTP Basic on every request (confirmed by probe), so a
    single shared ``httpx.AsyncClient`` is reused instead of logging in per
    employee request. The client is safe to share across coroutines.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        corporate_id: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = (base_url or settings.ETIMEOFFICE_API_BASE_URL).rstrip("/")
        corporate_id = corporate_id if corporate_id is not None else settings.ETIMEOFFICE_CORPORATE_ID
        username = username if username is not None else settings.ETIMEOFFICE_USERNAME
        password = password if password is not None else settings.ETIMEOFFICE_PASSWORD
        if not corporate_id or not username or not password:
            raise ETimeOfficeError("eTimeOffice credentials are not configured")
        # Evidence-proven Basic credential layout: compound username, empty
        # password. The trailing ":true" is required by the provider.
        self._auth_user = f"{corporate_id.strip()}:{username.strip()}:{password}:true"
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    def _get_client(self) -> httpx.AsyncClient:
        """Lazily create one pooled client reused across requests (Basic auth
        is stateless, so there is no login ceremony to repeat per request)."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self._timeout, verify=True)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    async def _get(self, endpoint: str, params: dict) -> dict:
        url = f"{self.base_url}/{endpoint}"
        try:
            response = await self._get_client().get(
                url, params=params, auth=(self._auth_user, "")
            )
        except httpx.HTTPError as exc:
            raise ETimeOfficeError(f"eTimeOffice request failed: {exc.__class__.__name__}") from exc

        if response.status_code in (401, 403):
            raise ETimeOfficeAuthError(
                f"eTimeOffice authentication rejected (HTTP {response.status_code})"
            )
        if response.status_code != 200:
            raise ETimeOfficeAPIError(
                f"eTimeOffice returned HTTP {response.status_code}"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ETimeOfficeAPIError("eTimeOffice returned a non-JSON response") from exc

        if not isinstance(payload, dict):
            raise ETimeOfficeAPIError("eTimeOffice returned an unexpected payload")
        if payload.get("Error"):
            raise ETimeOfficeAPIError(
                f"eTimeOffice reported an error: {str(payload.get('Msg'))[:200]}"
            )
        return payload

    async def fetch_in_out_days(
        self,
        from_date: date,
        to_date: date,
        emp_code: str = "ALL",
    ) -> List[ETimeOfficeInOutDay]:
        """Fetch daily in/out summaries for every employee in ``emp_code``.

        Read-only. The provider returns one row per employee per workday in the
        window (absent days appear with Status "A" and no punch times).
        """
        if to_date < from_date:
            raise ETimeOfficeError("Invalid date range: to_date precedes from_date")
        if (to_date - from_date) > timedelta(days=366):
            raise ETimeOfficeError("eTimeOffice date window too wide (max 366 days)")

        payload = await self._get(
            INOUT_ENDPOINT,
            {
                "Empcode": emp_code,
                "FromDate": from_date.strftime(_DATE_FORMAT),
                "ToDate": to_date.strftime(_DATE_FORMAT),
            },
        )

        rows = payload.get("InOutPunchData") or []
        days: List[ETimeOfficeInOutDay] = []
        for row in rows:
            if not isinstance(row, dict) or not str(row.get("Empcode", "")).strip():
                continue
            day_date = _parse_date(row.get("DateString")) or from_date
            days.append(
                ETimeOfficeInOutDay(
                    external_employee_code=str(row.get("Empcode")).strip(),
                    external_employee_name=str(row.get("Name") or "").strip(),
                    date=day_date,
                    check_in=_parse_time(row.get("INTime")),
                    check_out=_parse_time(row.get("OUTTime")),
                    work_minutes=_parse_minutes(row.get("WorkTime")),
                    break_minutes=_parse_minutes(row.get("BreakTime")),
                    overtime_minutes=_parse_minutes(row.get("OverTime")),
                    vendor_late_minutes=_parse_minutes(row.get("Late_In")),
                    vendor_early_minutes=_parse_minutes(row.get("Erl_Out")),
                    status=str(row.get("Status") or "A").strip().upper(),
                    remark=str(row.get("Remark") or "").strip(),
                    raw=row,
                )
            )
        return days
