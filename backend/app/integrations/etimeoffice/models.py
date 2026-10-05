"""
eTimeOffice integration state model.

One document per (company, provider) recording the outcome of the last sync
run so the Attendance integration-status UI and the periodic loop have a
lightweight, company-scoped view of connection health without re-fetching
eTimeOffice on every status render.

Only safe metadata is stored here — never cookies, CSRF tokens, session ids,
or provider credentials.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.core.clock import utc_now

PROVIDER_ETIMEOFFICE = "etimeoffice"


class ETimeOfficeEmployeeMapping(Document):
    """Explicit, company-scoped mapping between an eTimeOffice employee and a
    SynTask employee.

    One document per external eTimeOffice employee (``external_employee_code``
    identifies the device/punch identity; ``external_employee_name`` is
    directory metadata refreshed from the provider on every sync and is never
    used for runtime resolution). ``employee_id`` (a SynTask ``User`` id) is
    set only after HR explicitly confirms the mapping in the Attendance UI.

    Attendance sync resolves punches exclusively through this table — there is
    no fallback to ``EmployeeProfile.employee_number`` suffixes or name
    matching — so a punch is never silently assigned to the wrong employee.
    """

    company_id: Indexed(str)
    provider: str = PROVIDER_ETIMEOFFICE
    external_employee_code: Indexed(str)

    # Directory metadata refreshed from the eTimeOffice response (informational)
    external_employee_name: str = ""

    # SynTask User id when HR confirmed the mapping; None = unmapped.
    employee_id: Optional[str] = None
    created_by: Optional[str] = None
    last_seen_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "etimeoffice_employee_mappings"
        indexes = [
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("provider", ASCENDING),
                    ("external_employee_code", ASCENDING),
                ],
                unique=True,
                name="uniq_etimeoffice_mapping_company_provider_code",
            ),
            # A SynTask employee can be mapped to at most one eTimeOffice code
            # per provider (drop the mapping before remapping to another code).
            IndexModel(
                [("company_id", ASCENDING), ("provider", ASCENDING), ("employee_id", ASCENDING)],
                unique=True,
                partialFilterExpression={"employee_id": {"$type": "string"}},
                name="uniq_etimeoffice_mapping_company_provider_employee",
            ),
        ]


class ETimeOfficeSyncState(Document):
    """Company-scoped runtime state for the eTimeOffice attendance sync."""

    company_id: Indexed(str)
    provider: str = PROVIDER_ETIMEOFFICE

    # Connection health (derived from the last sync attempt, never secrets)
    connected: bool = False
    last_attempted_at: Optional[datetime] = None
    last_successful_at: Optional[datetime] = None
    last_error: Optional[str] = None

    # Outcome summary of the most recent sync run
    last_summary: Dict[str, Any] = Field(default_factory=dict)

    # In-progress guard so overlapping sync jobs are skipped (single writer).
    syncing: bool = False
    sync_started_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "attendance_sync_states"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("provider", ASCENDING)],
                unique=True,
                name="uniq_attendance_sync_state_company_provider",
            ),
        ]
