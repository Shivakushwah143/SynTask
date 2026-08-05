"""
Invoice PDF generator using ReportLab.
Builds a printable invoice layout with company, client, and item details.

Robustness contract:
- Every value rendered into the PDF is normalized first (None/empty handled,
  Decimals converted without float rounding, strings escaped for Paragraph).
- Garbage monetary values raise InvoiceDataError instead of silently printing
  wrong financial figures; the caller decides how to surface that error.
- The items table is sized relative to the document frame so columns are never
  clipped, wraps long descriptions, and repeats headers across pages.
"""
import logging
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    LongTable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.finance.models import Invoice, InvoiceStatus, InvoiceType

logger = logging.getLogger(__name__)

# Currency symbols with trailing space where the symbol is a word/abbreviation.
_CURRENCY_SYMBOLS = {
    "INR": "Rs. ",
    "USD": "$",
    "EUR": "\u20ac",
    "GBP": "\u00a3",
    "JPY": "\u00a5",
    "CNY": "\u00a5",
    "AED": "AED ",
    "SGD": "S$ ",
    "AUD": "A$ ",
    "CAD": "C$ ",
}

_FILENAME_UNSAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")

_PAYMENT_STATUS_LABELS = {
    "draft": "Draft",
    "sent": "Sent",
    "paid": "Paid",
    "cancelled": "Cancelled",
}

_MONEY_TOKENS = ("\u20b9", "Rs.", "Rs", "INR", "$", "\u20ac", "\u00a3", "\u00a5", "USD", "EUR", "GBP", "AED", "SGD")


class InvoiceDataError(ValueError):
    """Raised when an invoice field cannot be safely interpreted for rendering."""


def safe_text(value: Optional[object]) -> str:
    """Normalize an arbitrary DB value into a displayable string ('' for None)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return str(value)


def escape_paragraph(value: Optional[object]) -> str:
    """
    Escape text so ReportLab Paragraph markup cannot mis-parse user content.

    Paragraph treats '<', '>' and '&' as markup; escaping keeps literal text safe.
    """
    return (
        safe_text(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def to_decimal(value: Optional[object], field_name: str, default: Decimal = Decimal("0")) -> Decimal:
    """
    Convert a stored invoice value into a Decimal without float rounding.

    - None / empty strings -> `default` (controlled fallback, logged).
    - int/float/Decimal -> exact conversion via string.
    - Currency-formatted strings (e.g. "Rs. 1,000.50") are stripped and parsed.
    - Unparseable non-empty strings raise InvoiceDataError so a wrong financial
      figure is never printed silently.
    """
    if value is None:
        if default:
            logger.warning("invoice_pdf: missing %s, using %s", field_name, default)
        return default
    if isinstance(value, bool):
        return Decimal("1") if value else Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned == "":
            if default:
                logger.warning("invoice_pdf: empty %s, using %s", field_name, default)
            return default
        for token in _MONEY_TOKENS:
            cleaned = cleaned.replace(token, "")
        cleaned = cleaned.replace(",", "").strip()
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            logger.warning("invoice_pdf: unparseable %s value %r", field_name, value)
            raise InvoiceDataError(f"Invalid {field_name} value") from None
    logger.warning("invoice_pdf: unsupported %s type %s", field_name, type(value).__name__)
    raise InvoiceDataError(f"Invalid {field_name} value")


def to_quantity(value: Optional[object], field_name: str) -> Decimal:
    """Quantity conversion: default 1 when missing, otherwise strict parsing."""
    return to_decimal(value, field_name, default=Decimal("1"))


def currency_symbol(currency: Optional[object]) -> str:
    code = safe_text(currency).strip().upper()
    if not code:
        return _CURRENCY_SYMBOLS["INR"]
    return _CURRENCY_SYMBOLS.get(code, f"{code} ")


def format_currency(value: Optional[object], currency: Optional[object], field_name: str = "amount") -> str:
    amount = to_decimal(value, field_name).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{currency_symbol(currency)}{amount:,.2f}"


def safe_invoice_filename(invoice_number: Optional[object]) -> str:
    """Sanitize an invoice number into a safe attachment filename."""
    name = _FILENAME_UNSAFE_RE.sub("-", safe_text(invoice_number)).strip("-._")[:100]
    return f"{name or 'invoice'}.pdf"


def _format_date(value: Optional[object]) -> str:
    if not value:
        return "-"
    if isinstance(value, str):
        try:
            from datetime import datetime

            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return value
    try:
        return value.strftime("%d %b %Y")
    except Exception:
        return safe_text(value)


def _status_label(status: Optional[object]) -> str:
    if isinstance(status, InvoiceStatus):
        status = status.value
    return _PAYMENT_STATUS_LABELS.get(safe_text(status).strip().lower(), "Draft")


def _build_address_block(title: str, lines: List[str], styles) -> List:
    block: List = [Paragraph(f"<b>{escape_paragraph(title)}</b>", styles["Label"])]
    for line in lines:
        if line:
            block.append(Paragraph(escape_paragraph(line), styles["NormalSmall"]))
    return block


def _item_tax_rate(item, invoice_tax_rate) -> Decimal:
    """Effective tax rate (percent) for one item, stored value wins."""
    stored = item.get("tax_rate")
    if stored is not None and safe_text(stored) != "":
        return to_decimal(stored, "item.tax_rate")
    if invoice_tax_rate is not None and safe_text(invoice_tax_rate) != "":
        return to_decimal(invoice_tax_rate, "invoice.tax_rate")
    return Decimal("0")


def _authoritative_or_computed(stored: Optional[object], computed: Decimal) -> Decimal:
    """
    Stored totals win; computed values fill in when a legacy invoice never
    persisted them (None or an all-zero placeholder while items are non-zero).
    """
    if stored is None:
        return computed
    parsed = to_decimal(stored, "invoice totals")
    if parsed == 0 and computed > 0:
        return computed
    return parsed


def _line_totals(item, invoice_tax_rate, include_tax) -> tuple:
    """
    Compute per-line figures using exact Decimal math.

    Returns (taxable_value, tax_amount, line_total) where:
        taxable_value = quantity * unit_price
        tax_amount     = stored item tax when present, else taxable * rate / 100
        line_total     = taxable_value + tax_amount
    """
    if not isinstance(item, dict):
        logger.warning("invoice_pdf: invoice item is not a mapping (%s), aborting", type(item).__name__)
        raise InvoiceDataError("Invalid invoice item")

    qty = to_quantity(item.get("quantity"), "item.quantity")
    rate = to_decimal(item.get("unit_price"), "item.unit_price")
    taxable_value = qty * rate

    if not include_tax:
        return taxable_value, Decimal("0"), taxable_value

    stored_tax = item.get("tax_amount")
    if stored_tax is not None and safe_text(stored_tax) != "":
        tax_amount = to_decimal(stored_tax, "item.tax_amount")
    else:
        tax_amount = (taxable_value * _item_tax_rate(item, invoice_tax_rate) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    return taxable_value, tax_amount, taxable_value + tax_amount


def generate_invoice_pdf(
    invoice: Invoice,
    company: Optional[object] = None,
    client: Optional[object] = None,  # kept for backward compatibility; snapshot fields on the invoice are authoritative
) -> bytes:
    """
    Generate an invoice PDF similar to the shared template.

    Args:
        invoice: Invoice document (client snapshot fields on the invoice are authoritative).
        company: Optional issuing company document (deleted/missing company is tolerated).
        client: Optional client document (unused; kept for API compatibility).

    Returns:
        bytes: PDF content

    Raises:
        InvoiceDataError: when an item contains values that cannot be safely rendered.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("Label", fontSize=9, leading=11, textColor=colors.HexColor("#1d4ed8")))
    styles.add(ParagraphStyle("NormalSmall", fontSize=9, leading=11, textColor=colors.HexColor("#111827")))
    styles.add(ParagraphStyle("Muted", fontSize=8, leading=10, textColor=colors.HexColor("#6b7280")))
    styles.add(
        ParagraphStyle(
            "SectionHeader",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=6,
            spaceAfter=4,
            fontName="Helvetica-Bold",
        )
    )

    elements: List = []

    # Title and company name
    title_text = "TAX INVOICE" if safe_text(invoice.invoice_type).strip().lower() == "tax" else "PROFORMA INVOICE"
    elements.append(Paragraph(escape_paragraph(title_text), styles["Heading2"]))
    if company:
        elements.append(Paragraph(escape_paragraph(company.name or "Company"), styles["Heading3"]))
        company_lines = [
            company.registration_number or "",
            company.address or "",
            ", ".join(filter(None, [company.city, company.state, company.zip_code])),
            company.country or "",
            f"Phone: {company.phone}" if company.phone else "",
            f"Email: {company.email}" if company.email else "",
            f"Website: {company.website}" if company.website else "",
            f"Tax ID: {company.tax_id}" if company.tax_id else "",
        ]
        for line in company_lines:
            if line:
                elements.append(Paragraph(escape_paragraph(line), styles["NormalSmall"]))
    elements.append(Spacer(1, 8))

    # Invoice meta table (Invoice number, dates)
    meta_data = [
        ["Invoice #", invoice.invoice_number, "Invoice Date", _format_date(invoice.invoice_date)],
        ["Due Date", _format_date(invoice.due_date), "", ""],
    ]
    meta_table = Table(meta_data, colWidths=[28 * mm, 55 * mm, 28 * mm, 55 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6b7280")),
                ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#6b7280")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 10))

    # Party information blocks (snapshot fields on the invoice)
    client_lines = [
        invoice.client_name,
        invoice.client_company_name or "",
        invoice.client_address or "",
        ", ".join(filter(None, [invoice.client_city, invoice.client_state, invoice.client_zip_code])),
        invoice.client_country or "",
        f"Email: {invoice.client_email}" if invoice.client_email else "",
        f"Phone: {invoice.client_contact}" if invoice.client_contact else "",
    ]
    billing_lines = client_lines  # Using same for now; separate fields can be added later

    left_block = _build_address_block("Customer Details", client_lines, styles)
    right_block = _build_address_block("Billing Address", billing_lines, styles)
    party_table = Table([[left_block, right_block]], colWidths=[90 * mm, 80 * mm])
    party_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(party_table)
    elements.append(Spacer(1, 10))

    # Items table — widths are fractions of the printable frame so nothing is clipped.
    currency = invoice.currency or "INR"
    include_tax = bool(invoice.include_tax)
    invoice_tax_rate = invoice.tax_rate

    item_column_fractions = [0.04, 0.28, 0.14, 0.07, 0.16, 0.155, 0.155]
    item_col_widths = [doc.width * fraction for fraction in item_column_fractions]

    items_data: List[List] = [
        [
            Paragraph("#", styles["Muted"]),
            Paragraph("Item", styles["Muted"]),
            Paragraph("Rate", styles["Muted"]),
            Paragraph("Qty", styles["Muted"]),
            Paragraph("Taxable Value", styles["Muted"]),
            Paragraph("Tax Amount", styles["Muted"]),
            Paragraph("Amount", styles["Muted"]),
        ]
    ]

    computed_subtotal = Decimal("0")
    for idx, item in enumerate(invoice.items or [], start=1):
        taxable_value, tax_amount, line_total = _line_totals(item, invoice_tax_rate, include_tax)
        computed_subtotal += taxable_value
        items_data.append(
            [
                Paragraph(str(idx), styles["NormalSmall"]),
                Paragraph(escape_paragraph(item.get("description", "")), styles["NormalSmall"]),
                Paragraph(escape_paragraph(format_currency(to_decimal(item.get("unit_price"), "item.unit_price"), currency)), styles["NormalSmall"]),
                Paragraph(format(to_quantity(item.get("quantity"), "item.quantity").normalize(), "f"), styles["NormalSmall"]),
                Paragraph(escape_paragraph(format_currency(taxable_value, currency)), styles["NormalSmall"]),
                Paragraph(escape_paragraph(format_currency(tax_amount, currency)), styles["NormalSmall"]),
                Paragraph(escape_paragraph(format_currency(line_total, currency)), styles["NormalSmall"]),
            ]
        )

    # LongTable splits across pages and repeatRows=1 repeats the header row.
    items_table = LongTable(items_data, colWidths=item_col_widths, repeatRows=1)
    items_table_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("ALIGN", (0, 1), (0, -1), "CENTER"),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ]
    )
    items_table.setStyle(items_table_style)
    elements.append(items_table)
    elements.append(Spacer(1, 10))

    # Summary — stored authoritative totals win; computed values are fallbacks.
    subtotal = _authoritative_or_computed(invoice.subtotal, computed_subtotal)
    if include_tax:
        computed_tax = sum((_line_totals(item, invoice_tax_rate, True)[1] for item in invoice.items or []), Decimal("0"))
        tax_amount_total = _authoritative_or_computed(invoice.tax_amount, computed_tax)
    else:
        tax_amount_total = Decimal("0")
    total = _authoritative_or_computed(invoice.total_amount, subtotal + tax_amount_total)
    received = to_decimal(invoice.total_received, "invoice.total_received")
    tds = to_decimal(invoice.tds_amount, "invoice.tds_amount")
    if invoice.outstanding_amount is not None:
        outstanding = _authoritative_or_computed(
            invoice.outstanding_amount, max(total - received - tds, Decimal("0"))
        )
    else:
        outstanding = max(total - received - tds, Decimal("0"))

    summary_rows: List[List[str]] = [
        ["Subtotal", format_currency(subtotal, currency)],
    ]
    if include_tax and tax_amount_total > 0:
        if invoice.tax_rate is not None and safe_text(invoice.tax_rate) != "":
            tax_label = f"Tax ({format(to_decimal(invoice.tax_rate, 'invoice.tax_rate').normalize(), 'f')}%)"
        else:
            tax_label = "Tax"
        summary_rows.append([tax_label, format_currency(tax_amount_total, currency)])
    summary_rows.append(["Total", format_currency(total, currency)])
    summary_rows.append(["Received", format_currency(received, currency)])
    summary_rows.append(["Outstanding", format_currency(outstanding, currency)])
    summary_rows.append(["Payment Status", _status_label(invoice.status)])

    summary_table = Table(summary_rows, colWidths=[55 * mm, 35 * mm], hAlign="RIGHT")
    summary_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.HexColor("#111827")),
                ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#111827")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    elements.append(KeepTogether(summary_table))
    elements.append(Spacer(1, 12))

    # Notes and terms
    if invoice.notes:
        elements.append(Paragraph("Notes", styles["SectionHeader"]))
        elements.append(Paragraph(escape_paragraph(invoice.notes), styles["NormalSmall"]))
        elements.append(Spacer(1, 6))
    if invoice.terms_and_conditions:
        elements.append(Paragraph("Terms & Conditions", styles["SectionHeader"]))
        elements.append(Paragraph(escape_paragraph(invoice.terms_and_conditions), styles["NormalSmall"]))

    doc.build(elements)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
