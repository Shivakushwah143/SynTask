"""
Temporary probe: reproduce invoice PDF failure modes with the current code.
Deletes nothing; run with `python scripts/_probe_invoice_pdf.py`.
"""
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime
from bson import ObjectId

# Allow instantiating beanie documents without a live database (probe only).
import types
import beanie.odm.documents as _beanie_docs

class _FakeSettings:
    pymongo_collection = None

_beanie_docs.Document.get_settings = classmethod(lambda cls: _FakeSettings())

from app.finance.models import Invoice, InvoiceType, InvoiceStatus
from app.models.company import Company
from app.crm.models import Client
from app.services.invoice_pdf import generate_invoice_pdf


def make_invoice(**overrides):
    data = dict(
        invoice_number="INV-2026-0001",
        company_id=str(ObjectId()),
        client_id=str(ObjectId()),
        client_name="Acme Corp",
        client_email="billing@acme.example",
        client_contact="+1 555 0100",
        client_address="1 Infinite Loop, Cupertino",
        client_city="Cupertino",
        client_state="CA",
        client_country="USA",
        client_zip_code="95014",
        client_company_name="Acme Corporation",
        invoice_type=InvoiceType.TAX,
        include_tax=True,
        invoice_date=datetime.utcnow(),
        due_date=None,

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
        status=InvoiceStatus.SENT,
        notes="Please pay by due date",
        terms_and_conditions="Net 30",
        created_by=str(ObjectId()),
    )
    data.update(overrides)
    return Invoice(**data)


def probe(name, fn):
    try:
        fn()
        print(f"[OK]   {name}")
    except Exception as exc:
        print(f"[FAIL] {name}: {type(exc).__name__}: {exc}")
        traceback.print_exc(limit=3)


company = Company(
    name="SynTask Demo",
    email="demo@syntask.example",
    address="42 Main Street",
    city="Mumbai",
    state="MH",
    country="India",
    zip_code="400001",
    phone="+91 98765 43210",
    tax_id="GST12345",
)


def case_baseline():
    pdf = generate_invoice_pdf(make_invoice(), company, None)
    assert isinstance(pdf, bytes) and len(pdf) > 100 and pdf.startswith(b"%PDF-")
    print(f"       baseline pdf size={len(pdf)}")


def case_no_company_no_client():
    pdf = generate_invoice_pdf(make_invoice(), None, None)
    assert pdf.startswith(b"%PDF-")


def case_special_chars():
    inv = make_invoice(
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
    generate_invoice_pdf(inv, company, None)


def case_long_description_and_address():
    inv = make_invoice(
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
    generate_invoice_pdf(inv, company, None)


def case_many_items():
    inv = make_invoice(
        items=[
            {
                "description": f"Item number {i} with a description that is long enough to wrap",
                "quantity": i + 1,
                "unit_price": 100 + i,
                "amount": (i + 1) * (100 + i),
                "tax_rate": 18,
                "tax_amount": (i + 1) * (100 + i) * 0.18,
            }
            for i in range(60)
        ],
        subtotal=sum((i + 1) * (100 + i) for i in range(60)),
        tax_amount=sum((i + 1) * (100 + i) * 0.18 for i in range(60)),
        total_amount=sum((i + 1) * (100 + i) * 1.18 for i in range(60)),
        outstanding_amount=sum((i + 1) * (100 + i) * 1.18 for i in range(60)),
    )
    generate_invoice_pdf(inv, company, None)


def case_none_quantity():
    inv = make_invoice(
        items=[
            {
                "description": "Bad qty",
                "quantity": None,
                "unit_price": 100,
                "amount": 0,
                "tax_rate": 18,
                "tax_amount": 0,
            }
        ]
    )
    generate_invoice_pdf(inv, company, None)


def case_string_numeric():
    inv = make_invoice(
        items=[
            {
                "description": "String numbers",
                "quantity": "2",
                "unit_price": "1,000.50",
                "amount": 2001,
                "tax_rate": "18",
                "tax_amount": "360.18",
            }
        ]
    )
    generate_invoice_pdf(inv, company, None)


def case_decimal_values():
    from decimal import Decimal

    inv = make_invoice(
        items=[
            {
                "description": "Decimal values",
                "quantity": Decimal("2.5"),
                "unit_price": Decimal("199.99"),
                "amount": Decimal("499.975"),
                "tax_rate": Decimal("18"),
                "tax_amount": Decimal("89.9955"),
            }
        ],
        subtotal=Decimal("499.98"),
        tax_amount=Decimal("90.00"),
        total_amount=Decimal("589.98"),
    )
    generate_invoice_pdf(inv, company, None)


def case_malformed_amount_string():
    inv = make_invoice(
        items=[
            {
                "description": "Currency-formatted amount",
                "quantity": 1,
                "unit_price": "Rs. 1,000.00",
                "amount": 1000,
                "tax_rate": 18,
                "tax_amount": 180,
            }
        ]
    )
    generate_invoice_pdf(inv, company, None)


def case_garbage_amount():
    inv = make_invoice(
        items=[
            {
                "description": "Garbage amount",
                "quantity": 1,
                "unit_price": "not-a-number",
                "amount": 0,
                "tax_rate": 18,
                "tax_amount": 0,
            }
        ]
    )
    generate_invoice_pdf(inv, company, None)


if __name__ == "__main__":
    for name, fn in [
        ("baseline", case_baseline),
        ("no company/client", case_no_company_no_client),
        ("special chars in text", case_special_chars),
        ("long description/address", case_long_description_and_address),
        ("many items (60)", case_many_items),
        ("None quantity", case_none_quantity),
        ("string numerics", case_string_numeric),
        ("Decimal values", case_decimal_values),
        ("currency-formatted amount", case_malformed_amount_string),
        ("garbage amount", case_garbage_amount),
    ]:
        probe(name, fn)
