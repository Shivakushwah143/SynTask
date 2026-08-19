# Recruitment Advanced Workflows

## Scope

Implemented recruitment workflow foundations:

- Resume upload, validation, text extraction for PDF/DOCX/TXT, parsed profile storage, skill normalization, and deterministic candidate scoring.
- Interview availability suggestions, stale-slot recheck, Teams-oriented interview metadata, and Microsoft connection status endpoints.
- Offer draft, approval history, backend PDF generation, secure offer token, public view/accept/reject, and audit timeline.

AI ranking is decision support only. Scoring excludes protected attributes and stores component-level explanations.

## Backend Endpoints

- `POST /api/v1/recruitment/candidates/{candidate_id}/resumes`
- `POST /api/v1/recruitment/resumes/{resume_id}/process`
- `GET /api/v1/recruitment/resumes/{resume_id}/status`
- `GET /api/v1/recruitment/resumes/{resume_id}/parsed-profile`
- `PATCH /api/v1/recruitment/resumes/{resume_id}/parsed-profile`
- `POST /api/v1/recruitment/jobs/{job_id}/extract-requirements`
- `GET /api/v1/recruitment/jobs/{job_id}/requirements`
- `PATCH /api/v1/recruitment/jobs/{job_id}/requirements`
- `POST /api/v1/recruitment/jobs/{job_id}/score-candidates`
- `GET /api/v1/recruitment/jobs/{job_id}/candidate-rankings`
- `GET /api/v1/recruitment/candidates/{candidate_id}/job-score/{job_id}`
- `POST /api/v1/recruitment/jobs/{job_id}/shortlist`
- `POST /api/v1/recruitment/jobs/{job_id}/status` — validated lifecycle transition (draft, pending_approval, approved, published, paused, closed, archived); re-selecting the current status is a no-op, invalid transitions return 400
- `POST /api/v1/recruitment/interviews/availability`
- `POST /api/v1/recruitment/interviews/propose-slots`
- `POST /api/v1/recruitment/interviews/schedule`
- `POST /api/v1/recruitment/interviews/bulk-schedule`
- `GET /api/v1/recruitment/interviews/{interview_id}/attendee-status`
- `POST /api/v1/recruitment/integrations/microsoft/connect`
- `GET /api/v1/recruitment/integrations/microsoft/status`
- `POST /api/v1/recruitment/integrations/microsoft/disconnect`
- `POST /api/v1/recruitment/offers`
- `GET /api/v1/recruitment/offers/{offer_id}`
- `PATCH /api/v1/recruitment/offers/{offer_id}`
- `POST /api/v1/recruitment/offers/{offer_id}/submit-for-approval`
- `POST /api/v1/recruitment/offers/{offer_id}/approve`
- `POST /api/v1/recruitment/offers/{offer_id}/reject-approval`
- `POST /api/v1/recruitment/offers/{offer_id}/preview`
- `POST /api/v1/recruitment/offers/{offer_id}/generate-pdf`
- `POST /api/v1/recruitment/offers/{offer_id}/send`
- `POST /api/v1/recruitment/offers/{offer_id}/withdraw`
- `POST /api/v1/recruitment/offers/{offer_id}/resend`
- `GET /api/v1/recruitment/offers/{offer_id}/history`
- `GET /api/v1/public/offers/{secure_token}`
- `POST /api/v1/public/offers/{secure_token}/accept`
- `POST /api/v1/public/offers/{secure_token}/reject`
- `GET /api/v1/public/offers/{secure_token}/pdf`

## Frontend Routes

- `/hr/recruitment/candidates`: resume upload, parse status, extracted profile, normalized skills, reprocess.
- `/hr/recruitment/jobs`: requirements extraction, candidate scoring, ranking table, shortlist.
- `/hr/recruitment/jobs/:jobId`: dedicated job detail page with status dropdown, analytics counters, full details, and candidate ranking.
- `/hr/recruitment/offers`: offer editor, approval actions, preview, PDF generation, send.
- `/public/offers/:token`: candidate offer view, PDF download, accept/reject.

## Environment

Set Microsoft Graph OAuth values when real Teams/calendar integration is enabled:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_REDIRECT_URI`
- `MICROSOFT_GRAPH_SCOPES`

Required Microsoft permissions:

- `offline_access`
- `Calendars.ReadWrite`
- `OnlineMeetings.ReadWrite`
- `User.Read`

Email sending uses existing SMTP or Brevo settings:

- `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`
- or `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`

## Migration

Run:

```bash
python backend/scripts/migrate_recruitment_advanced_workflows.py
```

This ensures Mongo indexes for resume profiles, skill aliases, candidate scores, offer tokens, offer templates, and Microsoft connection records.

## Limits

The first implementation uses deterministic local parsing/scoring. Microsoft Graph event creation and actual email delivery are represented by credential-aware workflow states and should be connected to the project-wide outbound provider/Graph client before production rollout.
