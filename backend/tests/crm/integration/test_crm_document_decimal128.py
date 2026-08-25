from __future__ import annotations

import os
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from beanie import init_beanie
from bson import Decimal128, ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.models.crm_document import CRMDocument, CRMDocumentType


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_MONGO_INTEGRATION") != "1",
    reason="Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container available.",
)


@pytest_asyncio.fixture
async def mongo_db():
    db_name = f"syntask_crm_document_test_{uuid4().hex}"
    client = AsyncIOMotorClient(os.getenv("MONGODB_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    await init_beanie(database=client[db_name], document_models=[CRMDocument])
    try:
        yield client[db_name]
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_crm_document_loads_decimal128_money_fields(mongo_db):
    """Regression: MongoDB stores Decimal fields as Decimal128 and pydantic v2 must
    coerce them back to Decimal or every CRMDocument read raises a ValidationError
    (e.g. the generate-pdf endpoint returned 500)."""
    document_id = str(ObjectId())
    await mongo_db["crm_documents"].insert_one(
        {
            "_id": ObjectId(document_id),
            "company_id": "company-1",
            "lead_id": "lead-1",
            "document_type": CRMDocumentType.QUOTATION.value,
            "document_number": "QUO-2026-0001",
            "title": "Quotation",
            "currency": "INR",
            "subtotal": Decimal128("26.00"),
            "discount_total": Decimal128("51.00"),
            "tax_total": Decimal128("16.38"),
            "grand_total": Decimal128("42.38"),
            "status": "draft",
            "terms": "Terms",
            "notes": "Notes",
            "content_snapshot": {},
        }
    )

    document = await CRMDocument.get(document_id)

    assert document.subtotal == Decimal("26.00")
    assert document.discount_total == Decimal("51.00")
    assert document.tax_total == Decimal("16.38")
    assert document.grand_total == Decimal("42.38")
