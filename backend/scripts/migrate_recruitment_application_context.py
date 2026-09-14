"""Safely backfill application ownership for legacy recruitment records.

Run after deploying the application-context model.  This script intentionally
does not infer ambiguous relationships; it prints them for manual review.
"""
import asyncio

from app.core.database import init_db
from app.recruitment.models import Application, CandidateTimeline, Interview, Offer


async def backfill() -> None:
    await init_db()
    report = {"offers_linked": 0, "interviews_linked": 0, "timeline_linked": 0, "ambiguous": []}
    for model, key in ((Offer, "offers_linked"), (Interview, "interviews_linked"), (CandidateTimeline, "timeline_linked")):
        records = await model.find({"application_id": None}).to_list()
        for record in records:
            candidate_id, job_id = getattr(record, "candidate_id", None), getattr(record, "job_id", None)
            if not candidate_id or not job_id:
                report["ambiguous"].append({"model": model.__name__, "id": str(record.id), "reason": "missing candidate or job"})
                continue
            applications = await Application.find({"company_id": record.company_id, "candidate_id": candidate_id, "job_id": job_id, "deleted_at": None}).to_list()
            if len(applications) != 1:
                report["ambiguous"].append({"model": model.__name__, "id": str(record.id), "reason": f"matched {len(applications)} applications"})
                continue
            record.application_id = str(applications[0].id)
            await record.save()
            report[key] += 1
    print(report)


if __name__ == "__main__":
    asyncio.run(backfill())
