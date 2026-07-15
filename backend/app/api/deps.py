"""Shared FastAPI dependencies."""
from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel

from app.core.config import settings


class PaginationParams(BaseModel):
    skip: int = 0
    limit: int = 50


def get_pagination_params(
    *,
    default_skip: int = 0,
    default_limit: int = 50,
    max_limit: int | None = None,
):
    """Return a pagination dependency with endpoint-chosen defaults."""
    effective_max = max_limit if max_limit is not None else settings.MAX_PAGE_SIZE

    async def _pagination_params(
        skip: Annotated[int, Query(ge=0)] = default_skip,
        limit: Annotated[int, Query(ge=1, le=effective_max)] = default_limit,
    ) -> PaginationParams:
        return PaginationParams(skip=skip, limit=limit)

    return Depends(_pagination_params)


Pagination20 = get_pagination_params(default_limit=20)
Pagination50 = get_pagination_params(default_limit=50)
Pagination100 = get_pagination_params(default_limit=100)
