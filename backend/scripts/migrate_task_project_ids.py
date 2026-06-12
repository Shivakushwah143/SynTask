"""
One-time migration: populate Task.project_object_id from Task.project_id.

Run from backend:
    .\.venv\Scripts\python.exe scripts\migrate_task_project_ids.py
"""
import asyncio
import os
import sys

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.project import Project
from app.models.task import Task


async def migrate() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await init_beanie(database=db, document_models=[Project, Task])

    tasks = await Task.find({"project_id": {"$ne": None}, "project_object_id": None}).to_list()
    updated = 0

    for task in tasks:
        project = await Project.find_one(
            Project.company_id == task.company_id,
            Project.project_id == task.project_id,
        )
        if project:
            task.project_object_id = str(project.id)
            await task.save()
            updated += 1

    print(f"Updated project_object_id for {updated} tasks out of {len(tasks)} candidates")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
