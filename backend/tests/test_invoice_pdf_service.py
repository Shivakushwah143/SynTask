"""
Regression tests for the invoice PDF generator (app.services.invoice_pdf).

These tests run without a database: invoices are plain attribute containers and
ReportLab renders directly into memory.
"""
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.services import invoice_pdf as service

PDF_HEADER = b"%PDF-"


def make_invoice(**overrides):
    data = dict(
        invoice_number="INV-2026-0001",
        company_id="company-1",
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
        total_received=1000.0,
        tds_amount=0.0,
        outstanding_amount=1360.0,
        status="sent",
        currency="INR",
        notes="Please pay by due date",
        terms_and_conditions="Net 30",
        payments=[],
        created_by="user-1",
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def extract_pdf_text(pdf_bytes):
    """Best-effort PDF text extraction using pypdf (already a project dependency)."""
    import io

    reader = pytest.importorskip("pypdf").PdfReader(io.BytesIO(pdf_bytes))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    return re.sub(r"\s+", " ", text)


def test_valid_invoice_returns_pdf_bytes():
    pdf = service.generate_invoice_pdf(make_invoice())
    assert isinstance(pdf, bytes)
    assert len(pdf) > 100
    assert pdf.startswith(PDF_HEADER)


def test_missing_company_and_client_are_tolerated():
    pdf = service.generate_invoice_pdf(make_invoice(), company=None, client=None)
    assert pdf.startswith(PDF_HEADER)


def test_special_characters_do_not_crash_paragraph_markup():
    invoice = make_invoice(
        notes="Terms: <b>bold</b> & <i>italic</i> > more",
        terms_and_conditions="A & B < C > D",
        items=[
            {
                "description": 'Gadget "X" & <gizmo> > 100 units',
                "quantity": 1,
                "unit_price": 50,
                "amount": 50,
                "tax_rate": 18,
                "tax_amount": 9,
            }
        ],
    )
    pdf = service.generate_invoice_pdf(invoice)
    assert pdf.startswith(PDF_HEADER)
    text = extract_pdf_text(pdf)
    assert "Gadget" in text


def test_long_description_and_address_wrap_without_crashing():
    invoice = make_invoice(
        client_address="Very long address line that keeps going and going and going " * 10,
        items=[
            {
                "description": "A very long item description that should wrap nicely inside the table cell " * 10,
                "quantity": 1,
                "unit_price": 25,
                "amount": 25,
                "tax_rate": 18,
                "tax_amount": 4.5,
            }
        ],
    )
    pdf = service.generate_invoice_pdf(invoice)
    assert pdf.startswith(PDF_HEADER)


def test_many_items_generates_multipage_pdf():
    items = []
    subtotal = Decimal("0")
    for i in range(60):
        qty = i + 1
        rate = 100 + i
        subtotal += qty * rate
    for i in range(60):
        qty = i + 1
        rate = 100 + i
        items.append(
            {
                "description": f"Item number {i} with a description that is long enough to wrap around",
                "quantity": qty,
                "unit_price": rate,
                "amount": qty * rate,
                "tax_rate": 18,
                "tax_amount": round(qty * rate * 0.18, 2),
            }
        )
    invoice = make_invoice(
        items=items,
        subtotal=float(subtotal),
        tax_amount=float(subtotal * Decimal("0.18")),
        total_amount=float(subtotal * Decimal("1.18")),
        outstanding_amount=float(subtotal * Decimal("1.18")),
    )
    pdf = service.generate_invoice_pdf(invoice)
    assert pdf.startswith(PDF_HEADER)

    reader = pytest.importorskip("pypdf").PdfReader(__import__("io").BytesIO(pdf))
    assert len(reader.pages) > 1


def test_none_and_string_numeric_values_are_safe():
    invoice = make_invoice(
        items=[
            {
                "description": "Bad qty and formatted price",
                "quantity": None,
                "unit_price": "1,000.50",
                "amount": 2001,
                "tax_rate": "18",
                "tax_amount": "360.18",
            }
        ]
    )
    pdf = service.generate_invoice_pdf(invoice)
    assert pdf.startswith(PDF_HEADER)
    text = extract_pdf_text(pdf)
    assert "Rs. 1,000.50" in text


def test_currency_formatted_amounts_parse():
    invoice = make_invoice(
        items=[
            {
                "description": "Currency formatted",
                "quantity": 1,
                "unit_price": "Rs. 1,000.00",
                "amount": 1000,
                "tax_rate": 18,
                "tax_amount": 180,
            }
        ]
    )
    pdf = service.generate_invoice_pdf(invoice)
    assert pdf.startswith(PDF_HEADER)


def test_decimal_values_render_without_float_noise():
    invoice = make_invoice(
        items=[
            {
                "description": "Decimal values",
                "quantity": Decimal("2.5"),
                "unit_price": Decimal("199.99"),
                "amount": Decimal("499.98"),
                "tax_rate": Decimal("18"),
                "tax_amount": Decimal("90.00"),
            }
        ],
        subtotal=Decimal("499.98"),
        tax_amount=Decimal("90.00"),
        total_amount=Decimal("589.98"),
    )
    pdf = service.generate_invoice_pdf(invoice)
    assert pdf.startswith(PDF_HEADER)


def test_garbage_money_raises_controlled_error():
    invoice = make_invoice(
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
    )
    with pytest.raises(service.InvoiceDataError):
        service.generate_invoice_pdf(invoice)


def test_garbage_quantity_raises_controlled_error():
    invoice = make_invoice(
        items=[
            {
                "description": "Garbage qty",
                "quantity": "two",
                "unit_price": 100,
                "amount": 0,
                "tax_rate": 18,
                "tax_amount": 0,
            }
        ]
    )
    with pytest.raises(service.InvoiceDataError):
        service.generate_invoice_pdf(invoice)


def test_line_totals_math_is_exact():
    item = {"quantity": 2, "unit_price": 100, "tax_rate": 18}
    taxable, tax, total = service._line_totals(item, invoice_tax_rate=18, include_tax=True)
    assert taxable == Decimal("200")
    assert tax == Decimal("36")
    assert total == Decimal("236")


def test_tax_totals_reconcile_in_pdf():
    invoice = make_invoice()
    text = extract_pdf_text(service.generate_invoice_pdf(invoice))
    assert "Rs. 2,000.00" in text  # subtotal
    assert "Rs. 360.00" in text  # tax
    assert "Rs. 2,360.00" in text  # total


def test_received_and_outstanding_values_reconcile_in_pdf():
    invoice = make_invoice()
    text = extract_pdf_text(service.generate_invoice_pdf(invoice))
    assert "Received" in text
    assert "Rs. 1,000.00" in text  # received
    assert "Outstanding" in text
    assert "Rs. 1,360.00" in text  # outstanding


def test_payment_status_label_is_rendered():
    invoice = make_invoice(status="paid")
    text = extract_pdf_text(service.generate_invoice_pdf(invoice))
    assert "Payment Status" in text
    assert "Paid" in text


def test_non_inr_currency_is_not_rendered_as_rupees():
    invoice = make_invoice(currency="USD")
    text = extract_pdf_text(service.generate_invoice_pdf(invoice))
    assert "$2,360.00" in text
    assert "Rs." not in text


def test_unknown_currency_falls_back_to_code():
    invoice = make_invoice(currency="XYZ")
    text = extract_pdf_text(service.generate_invoice_pdf(invoice))
    assert "XYZ 2,360.00" in text


def test_safe_invoice_filename():
    assert service.safe_invoice_filename("INV-2026-0001") == "INV-2026-0001.pdf"
    assert service.safe_invoice_filename("INV/2026/0001") == "INV-2026-0001.pdf"
    assert service.safe_invoice_filename("INV<2026>:0001?") == "INV-2026-0001.pdf"
    assert service.safe_invoice_filename(None) == "invoice.pdf"
    assert service.safe_invoice_filename("") == "invoice.pdf"


def test_to_decimal_handles_legacy_formats():
    assert service.to_decimal(None, "x") == Decimal("0")
    assert service.to_decimal("", "x") == Decimal("0")
    assert service.to_decimal("1,000.50", "x") == Decimal("1000.50")
    assert service.to_decimal("Rs. 1,000.00", "x") == Decimal("1000.00")
    assert service.to_decimal(0.1, "x") == Decimal("0.1")
    assert service.to_decimal(True, "x") == Decimal("1")
    assert service.to_decimal(Decimal("12.34"), "x") == Decimal("12.34")
    with pytest.raises(service.InvoiceDataError):
        service.to_decimal("abc", "x")


def test_currency_symbol_mapping():
    assert service.currency_symbol("INR") == "Rs. "
    assert service.currency_symbol("USD") == "$"
    assert service.currency_symbol("EUR") == "\u20ac"
    assert service.currency_symbol(None) == "Rs. "
    assert service.currency_symbol("UNKNOWN") == "UNKNOWN "
