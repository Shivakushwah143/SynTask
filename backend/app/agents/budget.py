from __future__ import annotations

from dataclasses import dataclass


class BudgetExceeded(ValueError):
    pass


@dataclass
class BudgetReservation:
    estimated_tokens: int
    estimated_cost: float


class AgentBudgetController:
    def reserve(self, *, budget_policy: dict, estimated_tokens: int, estimated_cost: float) -> BudgetReservation:
        max_tokens = int(budget_policy.get("max_tokens_per_run", 4000))
        max_cost = float(budget_policy.get("max_cost_per_run", 1.0))
        if estimated_tokens > max_tokens:
            raise BudgetExceeded("Run token budget exceeded before provider call")
        if estimated_cost > max_cost:
            raise BudgetExceeded("Run cost budget exceeded before provider call")
        return BudgetReservation(estimated_tokens=estimated_tokens, estimated_cost=estimated_cost)

    def reconcile(self, *, reservation: BudgetReservation, actual_tokens: int, actual_cost: float) -> dict:
        if actual_tokens > reservation.estimated_tokens:
            return {"reserved_tokens": reservation.estimated_tokens, "actual_tokens": actual_tokens, "over_reserved": True}
        return {"reserved_tokens": reservation.estimated_tokens, "actual_tokens": actual_tokens, "released_tokens": reservation.estimated_tokens - actual_tokens, "actual_cost": actual_cost}
