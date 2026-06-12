import logging
from typing import Any, Dict

from app.models.automation import AutomationRule
from app.core.automation_engine import AutomationEngine

logger = logging.getLogger(__name__)


async def trigger_automation(
    trigger_type: str,
    entity_type: str,
    entity_id: str,
    company_id: str,
    changed_fields: Dict[str, Any],
    user_id: str | None = None,
) -> None:
    """Evaluate active automation rules for a trigger event."""
    rules = await AutomationRule.find(
        AutomationRule.company_id == company_id,
        AutomationRule.is_active == True,  # noqa: E712
    ).to_list()

    trigger_data = {
        "trigger_type": trigger_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "company_id": company_id,
        "user_id": user_id,
        "changed_fields": changed_fields,
        **{key: value.get("to") for key, value in changed_fields.items() if isinstance(value, dict)},
    }

    for rule in rules:
        if getattr(rule.trigger_type, "value", rule.trigger_type) != trigger_type:
            continue
        try:
            await AutomationEngine.execute_rule(rule, trigger_data)
        except Exception:
            logger.exception("Automation rule execution failed for rule %s", rule.id)
