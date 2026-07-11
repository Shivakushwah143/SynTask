from app.recruitment.models import CandidateStatus
from app.recruitment.services import TRANSITIONS


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
