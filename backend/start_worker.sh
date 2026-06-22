#!/bin/bash
cd "$(dirname "$0")"
celery -A app.worker.celery_app worker --loglevel=info --concurrency="${CELERY_CONCURRENCY:-4}"
