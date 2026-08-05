"""
Invoice PDF generator using ReportLab.
Builds a printable invoice layout with company, client, and item details.
"""
from io import BytesIO
from pathlib import Path
from typing import Optional, List
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.finance.models import Invoice, InvoiceType
from app.models.company import Company
from app.crm.models import Client

# Backend-owned copy of the SynTask logo (source: frontend/public/logo.svg).
# Resolved relative to this module so it works regardless of the working
# directory or which container the backend runs in.
ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
INVOICE_LOGO_PATH = ASSETS_DIR / "syntask-logo.png"
# Native canvas size of the logo PNG (720 x 769) to preserve its aspect ratio.
INVOICE_LOGO_WIDTH_MM = 26.0
INVOICE_LOGO_HEIGHT_MM = INVOICE_LOGO_WIDTH_MM * 769.0 / 720.0


def _format_date(value: Optional[datetime]) -> str:
    if not value:
        return "-"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return value
    return value.strftime("%d %b %Y")


def _format_currency(value: Optional[float]) -> str:
    try:
        return f"Rs. {float(value):,.2f}"
    except Exception:
        return "Rs. 0.00"


def _to_float(value, default: float = 0.0) -> float:
    """Coerce a value to float, falling back to ``default`` for None/invalid.

    Item fields are sometimes stored as ``null`` in the database; treat those
    as missing so invoice PDF generation never crashes on a None value.
    """
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_address_block(title: str, lines: List[str], styles) -> List:
    block: List = [Paragraph(f"<b>{title}</b>", styles["Label"])]
    for line in lines:
        if line:
            block.append(Paragraph(line, styles["NormalSmall"]))
    return block


def generate_invoice_pdf(invoice: Invoice, company: Optional[Company], client: Optional[Client]) -> bytes:
    """
    Generate an invoice PDF similar to the shared template.

    Args:
        invoice: Invoice document
        company: Issuing company
        client: Client document

    Returns:
        bytes: PDF content
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
    styles.add(ParagraphStyle("SectionHeader", fontSize=11, leading=14, textColor=colors.HexColor("#0f172a"), spaceBefore=6, spaceAfter=4, fontName="Helvetica-Bold"))

    elements: List = []

    # Header: logo on the left, title and company name on the right.
    # Falls back to the previous header layout if the logo asset is missing.
    title_text = "TAX INVOICE" if invoice.invoice_type == InvoiceType.TAX else "PROFORMA INVOICE"
    title_cell: List = [Paragraph(title_text, styles["Heading2"])]
    if company:
        title_cell.append(Paragraph(company.name or "Company", styles["Heading3"]))

    if INVOICE_LOGO_PATH.is_file():
        logo = Image(
            str(INVOICE_LOGO_PATH),
            width=INVOICE_LOGO_WIDTH_MM * mm,
            height=INVOICE_LOGO_HEIGHT_MM * mm,
        )
        header_table = Table([[logo, title_cell]], colWidths=[30 * mm, None])
        header_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (0, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        elements.append(header_table)
    else:
        elements.extend(title_cell)

    if company:
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
                elements.append(Paragraph(line, styles["NormalSmall"]))
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

    # Party information blocks
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

    # Items table
    items_data: List[List[str]] = [
        ["#", "Item", "Rate", "Qty", "Taxable Value", "Tax Amount", "Amount"]
    ]

    for idx, item in enumerate(invoice.items or [], start=1):
        qty = _to_float(item.get("quantity"), 1)
        rate = _to_float(item.get("unit_price"), 0)
        line_amount = _to_float(item.get("amount"), qty * rate)
        line_tax = _to_float(item.get("tax_amount"), 0) if invoice.include_tax else 0.0
        taxable_value = line_amount - line_tax if invoice.include_tax else line_amount
        items_data.append(
            [
                str(idx),
                item.get("description", ""),
                _format_currency(rate),
                f"{qty:g}",
                _format_currency(taxable_value),
                _format_currency(line_tax),
                _format_currency(line_amount),
            ]
        )

    items_table = Table(items_data, colWidths=[10 * mm, 75 * mm, 25 * mm, 18 * mm, 28 * mm, 28 * mm, 28 * mm])
    items_table_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("ALIGN", (0, 1), (0, -1), "CENTER"),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ]
    )
    items_table.setStyle(items_table_style)
    elements.append(items_table)
    elements.append(Spacer(1, 10))

    # Summary
    summary_rows: List[List[str]] = []
    summary_rows.append(["Subtotal", _format_currency(invoice.subtotal)])
    if invoice.include_tax and invoice.tax_amount:
        label = f"Tax ({invoice.tax_rate}%)" if invoice.tax_rate else "Tax"
        summary_rows.append([label, _format_currency(invoice.tax_amount)])
    summary_rows.append(["Total", _format_currency(invoice.total_amount)])

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
    elements.append(summary_table)
    elements.append(Spacer(1, 12))

    # Notes and terms
    if invoice.notes:
        elements.append(Paragraph("Notes", styles["SectionHeader"]))
        elements.append(Paragraph(invoice.notes, styles["NormalSmall"]))
        elements.append(Spacer(1, 6))
    if invoice.terms_and_conditions:
        elements.append(Paragraph("Terms & Conditions", styles["SectionHeader"]))
        elements.append(Paragraph(invoice.terms_and_conditions, styles["NormalSmall"]))

    doc.build(elements)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
