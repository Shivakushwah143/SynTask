"""Tests for the recruitment job lifecycle transitions.

Covers:
- Full lifecycle: DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED → PAUSED → PUBLISHED → CLOSED → ARCHIVED → DRAFT
- Invalid transitions return proper errors
- Status idempotency (re-selecting current status is a no-op)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.recruitment.models import JobLifecycleStatus
from app.recruitment.services import JobService, JOB_LIFECYCLE_TRANSITIONS


class TestJobLifecycleTransitions:
    """Validate the JOB_LIFECYCLE_TRANSITIONS graph."""

    def test_all_statuses_have_transitions(self):
        """Every status should have at least one outgoing transition."""
        for status in JobLifecycleStatus:
            assert status in JOB_LIFECYCLE_TRANSITIONS, f"Missing transitions for {status.value}"

    def test_draft_transitions(self):
        """Draft should allow pending_approval and archived."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.DRAFT]
        assert JobLifecycleStatus.PENDING_APPROVAL in transitions
        assert JobLifecycleStatus.ARCHIVED in transitions
        assert JobLifecycleStatus.PUBLISHED not in transitions, "Draft should NOT allow direct publish"

    def test_pending_approval_transitions(self):
        """Pending approval should allow approved, draft, archived."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PENDING_APPROVAL]
        assert JobLifecycleStatus.APPROVED in transitions
        assert JobLifecycleStatus.DRAFT in transitions
        assert JobLifecycleStatus.ARCHIVED in transitions

    def test_approved_transitions(self):
        """Approved should allow published, draft, archived."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.APPROVED]
        assert JobLifecycleStatus.PUBLISHED in transitions
        assert JobLifecycleStatus.DRAFT in transitions
        assert JobLifecycleStatus.ARCHIVED in transitions

    def test_published_transitions(self):
        """Published should allow paused, closed, archived."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PUBLISHED]
        assert JobLifecycleStatus.PAUSED in transitions
        assert JobLifecycleStatus.CLOSED in transitions
        assert JobLifecycleStatus.ARCHIVED in transitions

    def test_paused_transitions(self):
        """Paused should allow published, closed, archived."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PAUSED]
        assert JobLifecycleStatus.PUBLISHED in transitions
        assert JobLifecycleStatus.CLOSED in transitions
        assert JobLifecycleStatus.ARCHIVED in transitions

    def test_closed_transitions(self):
        """Closed should allow archived, published."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.CLOSED]
        assert JobLifecycleStatus.ARCHIVED in transitions
        assert JobLifecycleStatus.PUBLISHED in transitions

    def test_archived_transitions(self):
        """Archived should allow draft only."""
        transitions = JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.ARCHIVED]
        assert JobLifecycleStatus.DRAFT in transitions
        assert len(transitions) == 1

    def test_full_lifecycle_path(self):
        """Verify the full lifecycle path is valid."""
        path = [
            (JobLifecycleStatus.DRAFT, JobLifecycleStatus.PENDING_APPROVAL),
            (JobLifecycleStatus.PENDING_APPROVAL, JobLifecycleStatus.APPROVED),
            (JobLifecycleStatus.APPROVED, JobLifecycleStatus.PUBLISHED),
            (JobLifecycleStatus.PUBLISHED, JobLifecycleStatus.PAUSED),
            (JobLifecycleStatus.PAUSED, JobLifecycleStatus.PUBLISHED),
            (JobLifecycleStatus.PUBLISHED, JobLifecycleStatus.CLOSED),
            (JobLifecycleStatus.CLOSED, JobLifecycleStatus.ARCHIVED),
            (JobLifecycleStatus.ARCHIVED, JobLifecycleStatus.DRAFT),
        ]
        for current, target in path:
            allowed = JOB_LIFECYCLE_TRANSITIONS[current]
            assert target in allowed, f"Transition {current.value} → {target.value} should be allowed but is not in {allowed}"

    def test_invalid_transition_draft_to_published(self):
        """Draft should NOT allow direct publish (must go through approval)."""
        assert JobLifecycleStatus.PUBLISHED not in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.DRAFT]

    def test_invalid_transition_paused_to_draft(self):
        """Paused should NOT allow going directly back to draft."""
        assert JobLifecycleStatus.DRAFT not in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PAUSED]

    def test_invalid_transition_closed_to_draft(self):
        """Closed should NOT allow going directly back to draft (must archive first)."""
        assert JobLifecycleStatus.DRAFT not in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.CLOSED]


class TestValidateLifecycleTransition:
    """Test the validate_lifecycle_transition service method."""

    @pytest.mark.asyncio
    async def test_valid_transition_returns_true(self):
        result = await JobService.validate_lifecycle_transition(
            JobLifecycleStatus.DRAFT, JobLifecycleStatus.PENDING_APPROVAL
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_invalid_transition_returns_false(self):
        result = await JobService.validate_lifecycle_transition(
            JobLifecycleStatus.DRAFT, JobLifecycleStatus.PUBLISHED
        )
        assert result is False


class TestTransitionJob:
    """Test the JobService.transition_job method with mocked job."""

    @pytest.mark.asyncio
    async def test_transition_updates_status(self):
        """transition_job should update lifecycle_status and previous_status."""
        mock_job = MagicMock()
        mock_job.lifecycle_status = JobLifecycleStatus.DRAFT
        mock_job.status = MagicMock()
        mock_job.company_id = "company-1"
        mock_job.id = MagicMock()
        mock_job.save = AsyncMock()

        with patch("app.recruitment.services.record", new_callable=AsyncMock):
            result = await JobService.transition_job(
                mock_job, JobLifecycleStatus.PENDING_APPROVAL, "user-1"
            )

        assert result.lifecycle_status == JobLifecycleStatus.PENDING_APPROVAL
        assert result.previous_status == JobLifecycleStatus.DRAFT
        assert result.save.called

    @pytest.mark.asyncio
    async def test_transition_invalid_raises_400(self):
        """transition_job should raise 400 for invalid transition."""
        from fastapi import HTTPException
        mock_job = MagicMock()
        mock_job.lifecycle_status = JobLifecycleStatus.DRAFT

        with pytest.raises(HTTPException) as exc_info:
            await JobService.transition_job(
                mock_job, JobLifecycleStatus.PUBLISHED, "user-1"
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_set_status_idempotent(self):
        """set_status with current status should be a no-op."""
        mock_job = MagicMock()
        mock_job.lifecycle_status = JobLifecycleStatus.DRAFT

        result = await JobService.set_status(
            mock_job, JobLifecycleStatus.DRAFT, "user-1"
        )
        assert result == mock_job
        # save should NOT have been called
        mock_job.save.assert_not_called()
