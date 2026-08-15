"""Tests for the job approval workflow (DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.recruitment.models import JobLifecycleStatus, JobStatus
from app.recruitment.services import JOB_LIFECYCLE_TRANSITIONS, JobService


class TestJobLifecycleTransitions:
    """Verify the job lifecycle state machine allows correct transitions."""

    def test_draft_can_be_submitted(self):
        assert JobLifecycleStatus.PENDING_APPROVAL in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.DRAFT]

    def test_pending_approval_can_be_approved(self):
        assert JobLifecycleStatus.APPROVED in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PENDING_APPROVAL]

    def test_pending_approval_can_be_rejected(self):
        assert JobLifecycleStatus.DRAFT in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PENDING_APPROVAL]

    def test_approved_can_be_published(self):
        assert JobLifecycleStatus.PUBLISHED in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.APPROVED]

    def test_draft_cannot_be_published_directly(self):
        assert JobLifecycleStatus.PUBLISHED not in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.DRAFT]

    def test_pending_approval_cannot_be_published_directly(self):
        assert JobLifecycleStatus.PUBLISHED not in JOB_LIFECYCLE_TRANSITIONS[JobLifecycleStatus.PENDING_APPROVAL]


class TestSubmitJob:
    """Test the submit_job service method."""

    @pytest.mark.asyncio
    async def test_submit_moves_to_pending_approval(self):
        job = MagicMock()
        job.lifecycle_status = JobLifecycleStatus.DRAFT
        job.status = JobStatus.DRAFT
        job.company_id = "company-1"
        job.id = "job-1"

        async def mock_save():
            pass

        job.save = mock_save

        result = await JobService.submit_job(job, "actor-1")
        assert result.lifecycle_status == JobLifecycleStatus.PENDING_APPROVAL

    @pytest.mark.asyncio
    async def test_submit_rejects_already_pending(self):
        job = MagicMock()
        job.lifecycle_status = JobLifecycleStatus.PENDING_APPROVAL
        job.status = JobStatus.DRAFT
        job.company_id = "company-1"
        job.id = "job-1"

        async def mock_save():
            pass

        job.save = mock_save

        with pytest.raises(Exception):
            await JobService.submit_job(job, "actor-1")


class TestApproveJob:
    """Test the approve_job service method."""

    @pytest.mark.asyncio
    async def test_approve_moves_to_approved(self):
        job = MagicMock()
        job.lifecycle_status = JobLifecycleStatus.PENDING_APPROVAL
        job.status = JobStatus.DRAFT
        job.company_id = "company-1"
        job.id = "job-1"

        async def mock_save():
            pass

        job.save = mock_save

        result = await JobService.approve_job(job, "actor-1")
        assert result.lifecycle_status == JobLifecycleStatus.APPROVED

    @pytest.mark.asyncio
    async def test_approve_rejects_draft_job(self):
        job = MagicMock()
        job.lifecycle_status = JobLifecycleStatus.DRAFT
        job.status = JobStatus.DRAFT
        job.company_id = "company-1"
        job.id = "job-1"

        async def mock_save():
            pass

        job.save = mock_save

        with pytest.raises(Exception):
            await JobService.approve_job(job, "actor-1")


class TestRejectJob:
    """Test the reject_job service method."""

    @pytest.mark.asyncio
    async def test_reject_returns_to_draft(self):
        job = MagicMock()
        job.lifecycle_status = JobLifecycleStatus.PENDING_APPROVAL
        job.status = JobStatus.DRAFT
        job.company_id = "company-1"
        job.id = "job-1"

        async def mock_save():
            pass

        job.save = mock_save

        result = await JobService.reject_job(job, "actor-1")
        assert result.lifecycle_status == JobLifecycleStatus.DRAFT


class TestFullApprovalWorkflow:
    """Test the complete job lifecycle from draft through approval."""

    def test_full_happy_path(self):
        """DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED → PAUSED → CLOSED"""
        path = [
            JobLifecycleStatus.DRAFT,
            JobLifecycleStatus.PENDING_APPROVAL,
            JobLifecycleStatus.APPROVED,
            JobLifecycleStatus.PUBLISHED,
            JobLifecycleStatus.PAUSED,
            JobLifecycleStatus.PUBLISHED,
            JobLifecycleStatus.CLOSED,
            JobLifecycleStatus.ARCHIVED,
        ]
        for current, target in zip(path, path[1:]):
            assert target in JOB_LIFECYCLE_TRANSITIONS[current], f"Transition {current} → {target} should be valid"

    def test_rejection_round_trip(self):
        """DRAFT → PENDING_APPROVAL → DRAFT (reject) → PENDING_APPROVAL → APPROVED"""
        path = [
            JobLifecycleStatus.DRAFT,
            JobLifecycleStatus.PENDING_APPROVAL,
            JobLifecycleStatus.DRAFT,
            JobLifecycleStatus.PENDING_APPROVAL,
            JobLifecycleStatus.APPROVED,
        ]
        for current, target in zip(path, path[1:]):
            assert target in JOB_LIFECYCLE_TRANSITIONS[current], f"Transition {current} → {target} should be valid"
