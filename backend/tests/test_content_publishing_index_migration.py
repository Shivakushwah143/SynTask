import pytest

from app.core.database import _migrate_content_publishing_record_index


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length):
        return self.rows[:length]


class FakeCollection:
    def __init__(self, index, duplicates=None):
        self.index = index
        self.duplicates = duplicates or []
        self.dropped = []

    async def index_information(self):
        return {"content_item_id_1": self.index}

    def aggregate(self, pipeline):
        return FakeCursor(self.duplicates)

    async def drop_index(self, name):
        self.dropped.append(name)


@pytest.mark.asyncio
async def test_migrates_legacy_non_unique_content_item_index():
    collection = FakeCollection({"key": [("content_item_id", 1)]})
    database = {"content_publishing_records": collection}

    await _migrate_content_publishing_record_index(database)

    assert collection.dropped == ["content_item_id_1"]


@pytest.mark.asyncio
async def test_refuses_to_drop_index_when_duplicate_publishing_records_exist():
    collection = FakeCollection({"key": [("content_item_id", 1)]}, [{"_id": "content-1", "count": 2}])
    database = {"content_publishing_records": collection}

    with pytest.raises(RuntimeError, match="content-1"):
        await _migrate_content_publishing_record_index(database)

    assert collection.dropped == []
