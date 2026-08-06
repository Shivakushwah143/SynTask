"""
Regression tests for GET /api/v1/invoices/{invoice_id}/pdf.

All database access is replaced with fakes; the full PDF pipeline (endpoint +
generator) runs in-process so responses can be asserted byte-for-byte.
"""
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.v1.endpoints import invoices as invoices_module
from app.finance.models import Invoice
from app.main import app
from app.models.user import UserRole
from app.services.invoice_pdf import generate_invoice_pdf

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def make_user(company_id="company-1", role=UserRole.ADMIN):
    return SimpleNamespace(
        id="user-1",
        company_id=company_id,
        role=role,
        full_name=lambda: "Test Admin",
    )


def make_invoice(company_id="company-1", **overrides):
    data = dict(
        invoice_number="INV-2026-0001",
        company_id=company_id,
        client_id="client-1",
        client_name="Acme Corp",
        client_email="billing@acme.example",
        client_contact="+1 555 0100",
        client_address="1 Infinite Loop, Cupertino",
        client_city="Cupertino",
        client_state="CA",
        client_country="USA",
        client_zip_code="95014",
        client_company_name="Acme Corporation",
        invoice_type="tax",
        include_tax=True,
        invoice_date=datetime(2026, 7, 15),
        due_date=datetime(2026, 8, 15),
        items=[
            {
                "description": "Consulting services",
                "quantity": 2,
                "unit_price": 1000,
                "amount": 2000,
                "tax_rate": 18,
                "tax_amount": 360,
            }
        ],
        subtotal=2000.0,
        tax_rate=18,
        tax_amount=360.0,
        total_amount=2360.0,
        total_received=0.0,
        tds_amount=0.0,
        outstanding_amount=2360.0,
        status="sent",
        currency="INR",
        notes="Please pay by due date",
        terms_and_conditions="Net 30",
        payments=[],
        created_by="user-1",
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def install_auth(user):
    # The invoices router is mounted with a router-level require_module gate that
    # depends on get_current_user, so that dependency must be overridden too.
    async def fake_current_user():
        return user

    app.dependency_overrides[get_current_user] = fake_current_user


def install_invoice_lookup(monkeypatch, invoice, *, get_error=None, find_one_result=None):
    async def fake_get(invoice_id):
        if get_error is not None:
            raise get_error
        return invoice

    async def fake_find_one(query, **kwargs):
        if find_one_result is not None:
            return find_one_result
        return invoice

    monkeypatch.setattr(invoices_module.Invoice, "get", fake_get)
    monkeypatch.setattr(invoices_module.Invoice, "find_one", fake_find_one)


def install_company_lookup(monkeypatch, company):
    async def fake_company_get(company_id):
        return company

    monkeypatch.setattr(invoices_module.Company, "get", fake_company_get)


def test_valid_invoice_returns_pdf(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice())
    install_company_lookup(monkeypatch, None)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    assert 'attachment; filename="INV-2026-0001.pdf"' in response.headers["content-disposition"]
    assert response.headers["content-length"] == str(len(response.content))


def test_missing_invoice_returns_404(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, None, find_one_result=None)

    response = client.get("/api/v1/invoices/missing/pdf")

    assert response.status_code == 404


def test_malformed_invoice_id_returns_404_not_500(monkeypatch):
    install_auth(make_user())
    # A malformed id makes the raw ObjectId lookup raise; the endpoint must not 500.
    install_invoice_lookup(monkeypatch, None, get_error=RuntimeError("Invalid ObjectId"), find_one_result=None)

    response = client.get("/api/v1/invoices/not-an-object-id/pdf")

    assert response.status_code == 404


def test_cross_company_invoice_returns_403(monkeypatch):
    install_auth(make_user(company_id="company-1"))
    install_invoice_lookup(monkeypatch, make_invoice(company_id="company-2"))

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 403


def test_super_admin_can_download_any_company_invoice(monkeypatch):
    install_auth(make_user(company_id="company-1", role=UserRole.SUPER_ADMIN))
    install_invoice_lookup(monkeypatch, make_invoice(company_id="company-2"))
    install_company_lookup(monkeypatch, None)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


def test_deleted_client_does_not_block_download(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice())
    install_company_lookup(monkeypatch, None)

    client_get_calls = []
    real_client_get = invoices_module.Client.get

    async def spy_client_get(client_id):
        client_get_calls.append(client_id)
        return None  # deleted client

    monkeypatch.setattr(invoices_module.Client, "get", spy_client_get)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")
    assert client_get_calls == [], "PDF endpoint must not look up the client document"
    # Restore the real classmethod so later tests are not affected.
    monkeypatch.setattr(invoices_module.Client, "get", real_client_get)


def test_missing_company_does_not_crash_generation(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice())
    install_company_lookup(monkeypatch, None)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


def test_stale_company_reference_does_not_crash_generation(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice())

    async def failing_company_get(company_id):
        raise RuntimeError("Invalid ObjectId")

    monkeypatch.setattr(invoices_module.Company, "get", failing_company_get)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


def test_generator_failure_returns_meaningful_500(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice())
    install_company_lookup(monkeypatch, None)

    def failing_generate(invoice, company):
        raise RuntimeError("reportlab exploded")

    monkeypatch.setattr(invoices_module, "generate_invoice_pdf", failing_generate)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 500
    assert response.json()["detail"] == "Invoice PDF could not be generated"


def test_invalid_pdf_output_returns_500(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice())
    install_company_lookup(monkeypatch, None)

    monkeypatch.setattr(invoices_module, "generate_invoice_pdf", lambda invoice, company: b"not a pdf")

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 500
    assert response.json()["detail"] == "Invoice PDF could not be generated"


def test_filename_is_sanitized(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(monkeypatch, make_invoice(invoice_number="INV/2026/0001"))
    install_company_lookup(monkeypatch, None)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert 'attachment; filename="INV-2026-0001.pdf"' in disposition
    assert "/" not in disposition


def test_garbage_item_values_return_controlled_500(monkeypatch):
    install_auth(make_user())
    install_invoice_lookup(
        monkeypatch,
        make_invoice(
            items=[
                {
                    "description": "Garbage",
                    "quantity": 1,
                    "unit_price": "not-a-number",
                    "amount": 0,
                    "tax_rate": 18,
                    "tax_amount": 0,
                }
            ]
        ),
    )
    install_company_lookup(monkeypatch, None)

    response = client.get("/api/v1/invoices/inv-1/pdf")

    assert response.status_code == 500
    assert response.json()["detail"] == "Invoice PDF could not be generated"
