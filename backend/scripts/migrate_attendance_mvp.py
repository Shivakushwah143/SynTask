"""Normalize MVP attendance fields and create unique daily attendance index."""
import asyncio
from datetime import datetime

from pymongo import ASCENDING

from app.core.database import init_db, close_db
from app.models.attendance import Attendance, AttendanceStatus


async def main():
    await init_db()
    collection = Attendance.get_pymongo_collection()
    conflicts = await collection.aggregate([
        {"$group": {
            "_id": {"company_id": "$company_id", "employee_id": "$employee_id", "date": "$date"},
            "count": {"$sum": 1},
            "ids": {"$push": "$_id"},
        }},
        {"$match": {"count": {"$gt": 1}}},
    ]).to_list(length=None)
    if conflicts:
        print("Duplicate attendance records found. Resolve before creating unique index:")
        for conflict in conflicts:
            print(conflict)
        await close_db()
        raise SystemExit(1)

    now = datetime.utcnow()
    await collection.update_many({"current_break_started_at": {"$exists": False}}, {"$set": {"current_break_started_at": None}})
    await collection.update_many({"break_duration": {"$exists": False}}, {"$set": {"break_duration": 0}})
    await collection.update_many({"total_working_hours": {"$exists": False}}, {"$set": {"total_working_hours": 0}})
    await collection.update_many({"status": {"$exists": False}}, {"$set": {"status": AttendanceStatus.OFFLINE.value, "updated_at": now}})
    await collection.create_index(
        [("company_id", ASCENDING), ("employee_id", ASCENDING), ("date", ASCENDING)],
        unique=True,
        name="uniq_company_employee_attendance_date",
    )
    print("Attendance MVP migration complete.")
    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
