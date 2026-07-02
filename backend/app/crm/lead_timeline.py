from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole


def _user_display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def _can_access_lead(current_user: User, prospect: SalesProspect) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return True


async def _load_actor_map(actor_ids: set[str], company_id: str) -> Dict[str, str]:
    if not actor_ids:
        return {}

    actors = await User.find(
        {
            "_id": {"$in": list(actor_ids)},
            "company_id": company_id,
        }
    ).to_list()
    return {str(user.id): _user_display_name(user) for user in actors}


def _category_for_event(event_type: str) -> str:
    if event_type in {"lead_created", "lead_updated"}:
        return "system"
    if event_type == "lead_stage_changed":
        return "sales"
    return "system"


def _build_event(
    *,
    event_id: str,
    event_type: str,
    title: str,
    description: str,
    timestamp: datetime,
    actor: str,
    metadata: Dict[str, Any],
    expanded: bool = False,
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": event_type,
        "category": _category_for_event(event_type),
        "title": title,
        "description": description,
        "timestamp": timestamp,
        "actor": actor,
        "metadata": metadata,
        "expanded": expanded,
    }


def _build_lead_created_event(prospect: SalesProspect, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-created-{prospect.id}",
        event_type="lead_created",
        title="Lead created",
        description=f"{prospect.prospect_name} entered the CRM workspace.",
        timestamp=prospect.created_at or datetime.utcnow(),
        actor=actor_name,
        metadata={
            "company_name": prospect.company_name,
            "contact": prospect.prospect_name,
            "stage": prospect.current_stage,
            "priority": prospect.interest_level.value if getattr(prospect, "interest_level", None) else None,
            "status": prospect.status.value if getattr(prospect, "status", None) else None,
        },
        expanded=True,
    )


def _build_lead_updated_event(prospect: SalesProspect, actor_name: str) -> Optional[Dict[str, Any]]:
    updated_at = prospect.updated_at or prospect.created_at
    if not updated_at or (prospect.created_at and updated_at <= prospect.created_at):
        return None

    return _build_event(
        event_id=f"lead-updated-{prospect.id}-{int(updated_at.timestamp())}",
        event_type="lead_updated",
        title="Lead updated",
        description="Lead details were refreshed in the Sales domain.",
        timestamp=updated_at,
        actor=actor_name,
        metadata={
            "owner": prospect.owner_name or prospect.assigned_to,
            "stage": prospect.current_stage,
            "priority": prospect.interest_level.value if getattr(prospect, "interest_level", None) else None,
            "status": prospect.status.value if getattr(prospect, "status", None) else None,
            "days_in_stage": prospect.days_in_stage,
        },
    )


def _build_stage_event(item: SalesPipelineHistory, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-stage-{item.id}",
        event_type="lead_stage_changed",
        title=f"Stage changed to {item.new_stage}",
        description=(
            f"Moved from {item.previous_stage or 'Unassigned'} to {item.new_stage}."
            if item.previous_stage != item.new_stage
            else f"Stage confirmed as {item.new_stage}."
        ),
        timestamp=item.transitioned_at,
        actor=actor_name,
        metadata={
            "previous_stage": item.previous_stage,
            "new_stage": item.new_stage,
            "reason": item.reason,
            "days_in_previous_stage": item.days_in_previous_stage,
            "payload": item.payload,
        },
        expanded=bool(item.reason or item.payload),
    )


class CRMLeadTimelineService:
    @staticmethod
    async def load_timeline(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        await _can_access_lead(current_user, prospect)

        history_items = await SalesPipelineHistory.find(
            {
                "company_id": str(prospect.company_id),
                "lead_id": str(prospect.id),
            }
        ).sort("-transitioned_at").to_list()

        actor_ids: set[str] = set()
        for candidate in [prospect.created_by, prospect.assigned_by, prospect.closed_by]:
            if candidate:
                actor_ids.add(str(candidate))
        for history in history_items:
            if history.user_id:
                actor_ids.add(str(history.user_id))

        actor_map = await _load_actor_map(actor_ids, str(prospect.company_id))

        items: List[Dict[str, Any]] = []
        created_actor = actor_map.get(str(prospect.created_by), "System")
        items.append(_build_lead_created_event(prospect, created_actor))

        updated_event = _build_lead_updated_event(prospect, actor_map.get(str(prospect.assigned_by), created_actor))
        if updated_event:
            items.append(updated_event)

        for history in history_items:
            items.append(_build_stage_event(history, actor_map.get(str(history.user_id), history.user_name or "System")))

        items.sort(key=lambda item: item["timestamp"], reverse=True)

        grouped_by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for item in items:
            day_key = item["timestamp"].date().isoformat()
            grouped_by_day[day_key].append(item)

        summary = {
            "total": len(items),
            "sales": sum(1 for item in items if item["category"] == "sales"),
            "system": sum(1 for item in items if item["category"] == "system"),
            "meetings": 0,
            "files": 0,
            "comments": 0,
            "future_ai": 0,
            "last_activity_at": items[0]["timestamp"] if items else None,
        }

        return {
            "lead_id": str(prospect.id),
            "lead_name": prospect.prospect_name,
            "items": items,
            "grouped_by_day": [
                {
                    "date": day,
                    "items": day_items,
                }
                for day, day_items in sorted(grouped_by_day.items(), key=lambda entry: entry[0], reverse=True)
            ],
            "summary": summary,
        }
