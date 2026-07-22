from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.meetings import (
    can_view_meeting,
    parse_meeting_datetime,
    normalize_participant_ids,
    serialize_meeting,
    validate_meeting_access,
    validate_meeting_management_access,
    validate_meeting_duration,
    validate_meeting_participant_role,
)
from app.models.user import UserRole


def user(role, company_id="company-1"):
    return SimpleNamespace(id=f"{role.value}-1", role=role, company_id=company_id, email="user@example.com", first_name="Test", last_name="User")


def meeting(**overrides):
    base = {
        "id": "meeting-1",
        "title": "Planning",
        "description": "",
        "company_id": "company-1",
        "meeting_date": SimpleNamespace(isoformat=lambda: "2026-07-20T10:00:00"),
        "meeting_time": "10:00",
        "duration": 30,
        "host_id": "manager-1",
        "participant_ids": ["employee-1"],
        "zoom_meeting_url": "https://zoom.example/join",
        "zoom_start_url": "https://zoom.example/start",
        "zoom_password": "123456",
        "host_video_enabled": True,
        "participant_video_enabled": True,
        "status": SimpleNamespace(value="scheduled"),
        "created_at": SimpleNamespace(isoformat=lambda: "2026-07-18T10:00:00"),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_meeting_duration_allows_sixty_minutes():
    validate_meeting_duration(60)


@pytest.mark.parametrize("duration", [0, 61])
def test_meeting_duration_rejects_out_of_range_values(duration):
    with pytest.raises(HTTPException) as exc_info:
        validate_meeting_duration(duration)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Duration must be between 1 and 60 minutes"


def test_meeting_participants_must_be_junior_to_creator():
    validate_meeting_participant_role(user(UserRole.MANAGER), user(UserRole.LEAD))
    validate_meeting_participant_role(user(UserRole.LEAD), user(UserRole.EMPLOYEE))

    with pytest.raises(HTTPException) as exc_info:
        validate_meeting_participant_role(user(UserRole.LEAD), user(UserRole.MANAGER))

    assert exc_info.value.status_code == 400


def test_meeting_participant_ids_are_deduplicated():
    assert normalize_participant_ids("employee-1, employee-1, lead-1") == ["employee-1", "lead-1"]


def test_meeting_visibility_is_host_or_participant_only():
    assert can_view_meeting(user(UserRole.MANAGER), meeting())
    assert can_view_meeting(user(UserRole.EMPLOYEE), meeting())
    assert not can_view_meeting(user(UserRole.LEAD), meeting())


def test_zoom_start_url_visible_only_to_host_or_admin():
    participant_payload = serialize_meeting(meeting(), None, [], user(UserRole.EMPLOYEE))
    host_payload = serialize_meeting(meeting(), None, [], user(UserRole.MANAGER))

    assert participant_payload["zoom_meeting_url"] == "https://zoom.example/join"
    assert participant_payload["zoom_start_url"] is None
    assert host_payload["zoom_start_url"] == "https://zoom.example/start"


def test_meeting_management_access_is_host_or_admin_only():
    validate_meeting_management_access(user(UserRole.MANAGER), meeting())

    with pytest.raises(HTTPException) as exc_info:
        validate_meeting_management_access(user(UserRole.LEAD), meeting())

    assert exc_info.value.status_code == 403


def test_meeting_access_rejects_nonparticipant_same_company_user():
    with pytest.raises(HTTPException) as exc_info:
        validate_meeting_access(user(UserRole.LEAD), meeting())

    assert exc_info.value.status_code == 403


def test_parse_meeting_datetime_rejects_invalid_time():
    with pytest.raises(HTTPException) as exc_info:
        parse_meeting_datetime("2026-07-20", "99:99")

    assert exc_info.value.status_code == 400
