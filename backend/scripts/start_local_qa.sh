#!/usr/bin/env sh
# Quick local QA startup - starts MongoDB in Docker if needed, then the backend.
# Usage: cd backend && sh scripts/start_local_qa.sh

set -e

echo "Checking MongoDB..."
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "syntask_mongo\|mongo"; then
  echo "Starting MongoDB container for QA..."
  docker run -d --name syntask_mongo_qa -p 27017:27017 mongo:7
  echo "Waiting for MongoDB to be ready..."
  sleep 3
else
  echo "MongoDB already running."
fi

echo "Starting backend..."
ENVIRONMENT=development \
MONGODB_URL=mongodb://127.0.0.1:27017/syntask_qa \
DATABASE_NAME=syntask_qa \
SECRET_KEY=qa-secret-key-32-chars-long-ok \
ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || echo "dFe0TDtLs-iAjB9erp7nV3FoPVqM8vsIzaJ8N4_1MrE=") \
SUPER_ADMIN_EMAIL=admin@example.com \
SUPER_ADMIN_PASSWORD=QaTestPassword123! \
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
