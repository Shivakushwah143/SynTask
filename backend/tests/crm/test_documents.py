from decimal import Decimal

import pytest
from types import SimpleNamespace
from pymongo import ReturnDocument

from app.crm import documents
from app.crm.documents import _hash_token, _next_document_number, _public_url, calculate_totals, public_serialize
from app.models.crm_document import CRMDocumentStatus, CRMDocumentType


class FakeSequenceCollection:
    def __init__(self):
        self.next_number = 0
        self.calls = []

    async def find_one_and_update(self, query, update, *, upsert, return_document):
        self.calls.append((query, update, upsert, return_document))
        self.next_number += update["$inc"]["next_number"]
        return {**query, "next_number": self.next_number}


class FakeDatabase:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, name):
        assert name == "crm_document_sequences"
        return self.collection


@pytest.mark.asyncio
async def test_next_document_number_creates_first_number_atomically(monkeypatch):
    collection = FakeSequenceCollection()
    monkeypatch.setattr(documents, "get_database", lambda: FakeDatabase(collection))

    document_number = await _next_document_number("company-1", CRMDocumentType.CONTRACT)

    query, update, upsert, return_document = collection.calls[0]
    assert document_number.endswith("-0001")
    assert query["company_id"] == "company-1"
    assert update == {
        "$inc": {"next_number": 1},
        "$setOnInsert": {
            "company_id": "company-1",
            "year": query["year"],
            "document_type": "contract",
        },
    }
    assert upsert is True
    assert return_document == ReturnDocument.AFTER


@pytest.mark.asyncio
async def test_next_document_number_increments_existing_counter(monkeypatch):
    collection = FakeSequenceCollection()
    monkeypatch.setattr(documents, "get_database", lambda: FakeDatabase(collection))

    first = await _next_document_number("company-1", CRMDocumentType.QUOTATION)
    second = await _next_document_number("company-1", CRMDocumentType.QUOTATION)

    assert first.endswith("-0001")
    assert second.endswith("-0002")


def test_crm_document_totals_use_decimal_discount_and_gst():
    totals = calculate_totals(
        [
            {
                "description": "Service",
                "quantity": "2",
                "unit_price": "100.10",
                "discount": "10.05",
                "tax_rate": "18",
            }
        ],
        overall_discount="5.00",
    )

    assert totals["subtotal"] == Decimal("190.15")
    assert totals["discount_total"] == Decimal("15.05")
    assert totals["tax_total"] == Decimal("34.23")
    assert totals["grand_total"] == Decimal("219.38")
    assert totals["items"][0]["line_total"] == "224.38"


def test_public_serializer_removes_internal_document_fields():
    document = SimpleNamespace(
        id="doc-1",
        company_id="company-1",
        lead_id="lead-1",
        document_type=CRMDocumentType.CONTRACT,
        document_number="CON-2026-0001",
        title="Contract",
        currency="INR",
        subtotal=Decimal("0"),
        discount_total=Decimal("0"),
        tax_total=Decimal("0"),
        grand_total=Decimal("0"),
        status=CRMDocumentStatus.SENT,
        valid_until=None,
        content_snapshot={"lead": {"name": "Lead", "company_name": "Acme", "internal": "x"}},
        terms=None,
        notes=None,
        pdf_file_path="uploads/private.pdf",
        source_file_path=None,
        source_file_url=None,
        source_file_name=None,
        created_by="user-1",
        sent_to=None,
        send_error="smtp failed",
        token_hash=_hash_token("raw-token"),
        token_expires_at=None,
        token_revoked_at=None,
        created_at=None,
        updated_at=None,
        sent_at=None,
        viewed_at=None,
        accepted_at=None,
        rejected_at=None,
        expired_at=None,
        model_dump=lambda: document.__dict__.copy(),
    )

    payload = public_serialize(document)

    assert "company_id" not in payload
    assert "lead_id" not in payload
    assert "token_hash" not in payload
    assert "pdf_file_path" not in payload
    assert payload["content_snapshot"]["lead"] == {"name": "Lead", "company_name": "Acme"}


def test_public_url_uses_configured_frontend_origin():
    assert _public_url("abc").endswith("/public/crm-documents/abc")
    assert "api/v1" not in _public_url("abc")


@pytest.mark.asyncio
async def test_create_contract_from_document_uses_fixed_counter(monkeypatch):
    source = SimpleNamespace(
        id="quote-1",
        company_id="company-1",
        lead_id="lead-1",
        document_number="QUO-2026-0001",
        currency="INR",
        subtotal=Decimal("100"),
        discount_total=Decimal("0"),
        tax_total=Decimal("18"),
        grand_total=Decimal("118"),
        terms="Terms",
        notes=None,
        content_snapshot={"items": []},
    )

    class FakeCRMDocument:
        inserted = None

        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "contract-1"
            self.status = CRMDocumentStatus.DRAFT

        async def insert(self):
            FakeCRMDocument.inserted = self

        def model_dump(self):
            return self.__dict__.copy()

    async def fake_document_for_user(current_user, lead_id, document_id):
        return SimpleNamespace(id=lead_id), source

    async def fake_event(*args, **kwargs):
        return None

    async def fake_next_document_number(company_id, document_type):
        return "CON-2026-0001"

    monkeypatch.setattr(documents, "_document_for_user", fake_document_for_user)
    monkeypatch.setattr(documents, "_next_document_number", fake_next_document_number)
    monkeypatch.setattr(documents, "_event", fake_event)
    monkeypatch.setattr(documents, "CRMDocument", FakeCRMDocument)

    result = await documents.create_contract_from_document(
        SimpleNamespace(id="user-1"),
        "lead-1",
        "quote-1",
    )

    assert FakeCRMDocument.inserted.document_number == "CON-2026-0001"
    assert result["document"]["document_type"] == "contract"
    assert result["document"]["document_number"] == "CON-2026-0001"
