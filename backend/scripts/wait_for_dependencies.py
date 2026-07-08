"""Wait for MongoDB, Redis, and optionally the backend health endpoint."""

from __future__ import annotations

import os
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

from pymongo import MongoClient
import redis


TIMEOUT_SECONDS = int(os.getenv("STARTUP_TIMEOUT_SECONDS", "120"))
POLL_INTERVAL_SECONDS = float(os.getenv("STARTUP_POLL_INTERVAL_SECONDS", "2"))


def wait_for_mongo(url: str) -> None:
    client = MongoClient(url, serverSelectionTimeoutMS=2000)
    client.admin.command("ping")


def wait_for_redis(url: str) -> None:
    client = redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
    client.ping()


def wait_for_http(url: str) -> None:
    with urlopen(url, timeout=2) as response:
        if response.status >= 400:
            raise RuntimeError(f"Health check failed for {url}: {response.status}")


def main() -> int:
    checks = []

    mongo_url = os.getenv("MONGODB_URL")
    if mongo_url:
        checks.append(("MongoDB", lambda: wait_for_mongo(mongo_url)))

    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        checks.append(("Redis", lambda: wait_for_redis(redis_url)))

    backend_health_url = os.getenv("BACKEND_HEALTH_URL")
    if backend_health_url:
        checks.append(("Backend", lambda: wait_for_http(backend_health_url)))

    if not checks:
        print("No startup dependencies configured; skipping wait step.")
        return 0

    deadline = time.monotonic() + TIMEOUT_SECONDS
    pending = checks[:]

    while pending:
        remaining = []
        for name, check in pending:
            try:
                check()
                print(f"{name} is ready.")
            except (Exception, URLError) as exc:  # pragma: no cover - retry loop
                if time.monotonic() >= deadline:
                    print(f"Timed out waiting for {name}: {exc}", file=sys.stderr)
                    return 1
                remaining.append((name, check))
        if remaining:
            time.sleep(POLL_INTERVAL_SECONDS)
        pending = remaining

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
