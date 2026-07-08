"""Health check helper for the Celery worker."""

from __future__ import annotations

import sys

from app.worker.celery_app import celery_app


def main() -> int:
    try:
        responses = celery_app.control.ping(timeout=5)
    except Exception:
        return 1
    return 0 if responses else 1


if __name__ == "__main__":
    raise SystemExit(main())
