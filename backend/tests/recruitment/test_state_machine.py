import pytest

from app.recruitment.models import CandidateStatus, JobLifecycleStatus, JobStatus
from app.recruitment.services import TRANSITIONS, JobService


def test_happy_path_state_machine_is_complete():
    path = [
        CandidateStatus.NEW, CandidateStatus.SCREENING,
        CandidateStatus.SHORTLISTED, CandidateStatus.INTERVIEW_1,
        CandidateStatus.INTERVIEW_2, CandidateStatus.OFFER_SENT,
        CandidateStatus.OFFER_ACCEPTED, CandidateStatus.JOINED,
        CandidateStatus.EMPLOYEE,
    ]
    for current, target in zip(path, path[1:]):
        assert target in TRANSITIONS[current]


def test_terminal_states_have_no_forward_transition():
    for terminal in (CandidateStatus.EMPLOYEE, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN, CandidateStatus.ARCHIVED):
        assert terminal not in TRANSITIONS or not TRANSITIONS[terminal]


def test_offer_cannot_be_skipped_from_new():
    assert CandidateStatus.OFFER_SENT not in TRANSITIONS[CandidateStatus.NEW]


@pytest.mark.asyncio
async def test_archive_job_is_idempotent_for_already_archived_job():
    class ArchivedJob:
        lifecycle_status = JobLifecycleStatus.ARCHIVED
        status = JobStatus.ARCHIVED
        save_count = 0

        async def save(self):
            self.save_count += 1

    job = ArchivedJob()

    result = await JobService.archive_job(job, "user-1")

    assert result is job
    assert job.lifecycle_status == JobLifecycleStatus.ARCHIVED
    assert job.status == JobStatus.ARCHIVED
    assert job.save_count == 0


@pytest.mark.asyncio
async def test_archive_job_repairs_legacy_status_for_archived_job():
    class ArchivedJob:
        lifecycle_status = JobLifecycleStatus.ARCHIVED
        status = JobStatus.DRAFT
        updated_at = None
        save_count = 0

        async def save(self):
            self.save_count += 1

    job = ArchivedJob()

    result = await JobService.archive_job(job, "user-1")

    assert result is job
    assert job.status == JobStatus.ARCHIVED
    assert job.save_count == 1
