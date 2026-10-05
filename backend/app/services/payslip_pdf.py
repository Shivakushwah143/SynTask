"""
Phase 7 — Payslip PDF renderer (pure, DB-free).

Turns a prepared payslip data dict (built from a PROCESSED PayrollRecord
snapshot — see ``payslip_service.build_payslip_data``) into printable A4 PDF
bytes using the same ReportLab stack as ``invoice_pdf.py``.

Robustness contract:
- No database access inside this module (easy to unit test).
- Every rendered value is normalized first; monetary values reuse the invoice
  formatter so INR renders as "Rs. " (Helvetica has no ₹ glyph — consistent
  with every other SynTask-generated document).
- Missing optional data (logo, address, department, designation) renders
  gracefully; critical missing data is rejected earlier by the data builder.
- The logo is best-effort: if it cannot be loaded the document renders
  without it and logs a warning — it never fails PDF generation.
- Long names/designations wrap via Paragraphs; earnings/deductions tables use
  LongTable so many components flow onto additional pages instead of clipping.
"""

from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    LongTable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.invoice_pdf import (
    currency_symbol,
    escape_paragraph,
    format_currency,
    safe_text,
    to_decimal,
)

logger = logging.getLogger(__name__)

# Backend-owned copy of the SynTask logo (same asset the invoice PDF uses).
ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
PAYSLIP_LOGO_PATH = ASSETS_DIR / "syntask-logo.png"
PAYSLIP_LOGO_WIDTH_MM = 20.0
PAYSLIP_LOGO_HEIGHT_MM = PAYSLIP_LOGO_WIDTH_MM * 769.0 / 720.0

# Hex palette consistent with the invoice PDF (slate/indigo).
_COLOR_PRIMARY = colors.HexColor("#1d4ed8")
_COLOR_TEXT = colors.HexColor("#111827")
_COLOR_MUTED = colors.HexColor("#6b7280")
_COLOR_BORDER = colors.HexColor("#e5e7eb")
_COLOR_HEADER_BG = colors.HexColor("#f3f4f6")
_COLOR_GROSS = colors.HexColor("#15803d")
_COLOR_DEDUCT = colors.HexColor("#b91c1c")
_COLOR_NET_BG = colors.HexColor("#eef2ff")

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two_digits(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else "")


def _three_digits(n: int) -> str:
    if n < 100:
        return _two_digits(n)
    tail = f" {_two_digits(n % 100)}" if n % 100 else ""
    return f"{_ONES[n // 100]} Hundred{tail}"


def _inr_words(n: int) -> str:
    """Whole number → words in the Indian numbering system (crore/lakh)."""
    if n == 0:
        return "Zero"
    crore, rem = divmod(n, 10 ** 7)
    lakh, rem = divmod(rem, 10 ** 5)
    thousand, rem = divmod(rem, 10 ** 3)
    parts: List[str] = []
    if crore:
        parts.append(f"{_two_digits(crore)} Crore")
    if lakh:
        parts.append(f"{_two_digits(lakh)} Lakh")
    if thousand:
        parts.append(f"{_two_digits(thousand)} Thousand")
    if rem:
        parts.append(_three_digits(rem))
    return " ".join(parts)


def number_to_words_inr(amount) -> str:
    """Currency-aware amount in words for INR, e.g. 'Forty Five Thousand Rupees Only'.

    Non-INR currencies fall back to an empty string (the caller omits the line).
    """
    try:
        value = to_decimal(amount, "amount")
    except Exception:
        return ""
    negative = value < 0
    value = abs(value)
    rupees = int(value)
    paise = int((value - rupees).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) * 100)
    if paise == 100:
        rupees += 1
        paise = 0
    text = f"{_inr_words(rupees)} Rupees"
    if paise:
        text += f" and {_inr_words(paise)} Paise"
    text += " Only"
    return f"Minus {text}" if negative else text


def _format_date(value) -> str:
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


def _metric(label: str, value, *, highlight: bool = False):
    style = ParagraphStyle(
        f"metric-{label}",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=8.5,
        leading=10,
        textColor=_COLOR_MUTED,
        alignment=1,
    )
    style_val = ParagraphStyle(
        f"metricval-{label}",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=10,
        leading=12,
        textColor=_COLOR_NET_BG if highlight else _COLOR_TEXT,
        fontName="Helvetica-Bold",
        alignment=1,
    )
    return [
        Paragraph(escape_paragraph(label), style),
        Paragraph(str(value), style_val),
    ]


def _company_logo(data: dict) -> Optional[Image]:
    """Best-effort logo image. Never raises — None means 'render without logo'."""
    logo_url = (data.get("company") or {}).get("logo_url")
    candidate = None
    if logo_url and (logo_url.startswith("/") or (":" not in logo_url.split("/")[0] or "//" in logo_url)):
        # Only local file paths are loadable without extra plumbing; remote URLs
        # are skipped so generation never depends on external availability.
        candidate = Path(str(logo_url).lstrip("/"))
        if not candidate.is_file():
            candidate = None
    if candidate is None and PAYSLIP_LOGO_PATH.is_file():
        candidate = PAYSLIP_LOGO_PATH
    if candidate is None:
        logger.warning("payslip_pdf: no logo asset available, rendering without logo")
        return None
    try:
        return Image(
            str(candidate),
            width=PAYSLIP_LOGO_WIDTH_MM * mm,
            height=PAYSLIP_LOGO_HEIGHT_MM * mm,
        )
    except Exception:
        logger.warning("payslip_pdf: logo asset could not be loaded (%s)", candidate)
        return None


def _build_company_lines(company: Dict[str, Any]) -> List[str]:
    lines: List[str] = []
    for key in ("address", "city", "state", "zip_code", "country"):
        value = safe_text(company.get(key)).strip()
        if value:
            lines.append(value)
    if company.get("phone"):
        lines.append(f"Phone: {safe_text(company['phone'])}")
    if company.get("email"):
        lines.append(f"Email: {safe_text(company['email'])}")
    if company.get("website"):
        lines.append(f"Website: {safe_text(company['website'])}")
    if company.get("registration_number"):
        lines.append(f"Registration: {safe_text(company['registration_number'])}")
    return lines


def render_payslip_pdf(data: Dict[str, Any]) -> bytes:
    """Render a prepared payslip dataset into PDF bytes.

    Raises ``PayslipRenderError`` only for genuinely impossible input (a data
    builder bug); optional-missing presentation data is handled gracefully.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
    )

    base = getSampleStyleSheet()
    styles = {
        "H1": ParagraphStyle("H1", parent=base["Heading2"], fontSize=17, leading=20, textColor=_COLOR_PRIMARY),
        "Company": ParagraphStyle("Company", parent=base["Heading3"], fontSize=12, leading=14, textColor=_COLOR_TEXT),
        "Label": ParagraphStyle("Label", parent=base["Normal"], fontSize=8.5, leading=10, textColor=_COLOR_MUTED),
        "Value": ParagraphStyle("Value", parent=base["Normal"], fontSize=9.5, leading=12, textColor=_COLOR_TEXT),
        "ValueBold": ParagraphStyle("ValueBold", parent=base["Normal"], fontSize=9.5, leading=12, textColor=_COLOR_TEXT, fontName="Helvetica-Bold"),
        "Cell": ParagraphStyle("Cell", parent=base["Normal"], fontSize=8.5, leading=10.5, textColor=_COLOR_TEXT),
        "CellRight": ParagraphStyle("CellRight", parent=base["Normal"], fontSize=8.5, leading=10.5, textColor=_COLOR_TEXT, alignment=2),
        "Head": ParagraphStyle("Head", parent=base["Normal"], fontSize=8.5, leading=10, textColor=_COLOR_TEXT, fontName="Helvetica-Bold"),
        "Section": ParagraphStyle("Section", parent=base["Normal"], fontSize=11, leading=13, textColor=_COLOR_TEXT, fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=4),
        "Net": ParagraphStyle("Net", parent=base["Normal"], fontSize=16, leading=18, textColor=_COLOR_PRIMARY, fontName="Helvetica-Bold"),
        "NetLabel": ParagraphStyle("NetLabel", parent=base["Normal"], fontSize=9, leading=11, textColor=_COLOR_MUTED),
        "Words": ParagraphStyle("Words", parent=base["Normal"], fontSize=8.5, leading=10.5, textColor=_COLOR_TEXT, alignment=1),
        "Footer": ParagraphStyle("Footer", parent=base["Normal"], fontSize=7.5, leading=9, textColor=_COLOR_MUTED, alignment=1),
    }

    elements: List = []

    # ── Header: logo + title ─────────────────────────────────────────────────
    company = data.get("company") or {}
    title_cell: List = [Paragraph("PAYSLIP", styles["H1"])]
    if company.get("name"):
        title_cell.append(Paragraph(escape_paragraph(company["name"]), styles["Company"]))

    logo = _company_logo(data)
    if logo is not None:
        header_table = Table(
            [[logo, title_cell]],
            colWidths=[26 * mm, doc.width - 26 * mm],
        )
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(header_table)
    else:
        elements.extend(title_cell)

    # ── Company details ──────────────────────────────────────────────────────
    company_lines = _build_company_lines(company)
    if company_lines:
        elements.append(Spacer(1, 2))
        for line in company_lines:
            elements.append(Paragraph(escape_paragraph(line), styles["Cell"]))
    elements.append(Spacer(1, 4))

    # ── Employee + period info grid ──────────────────────────────────────────
    employee = data.get("employee") or {}
    period = data.get("period") or {}
    info_data = [
        [
            Paragraph("Employee Name", styles["Label"]), Paragraph(escape_paragraph(employee.get("name") or "-"), styles["ValueBold"]),
            Paragraph("Payroll Month", styles["Label"]), Paragraph(escape_paragraph(period.get("label") or "-"), styles["Value"]),
        ],
        [
            Paragraph("Employee ID", styles["Label"]), Paragraph(escape_paragraph(employee.get("employee_number") or "-"), styles["Value"]),
            Paragraph("Pay Period", styles["Label"]), Paragraph(escape_paragraph(period.get("period_range") or "-"), styles["Value"]),
        ],
        [
            Paragraph("Department", styles["Label"]), Paragraph(escape_paragraph(employee.get("department") or "-"), styles["Value"]),
            Paragraph("Payable Days", styles["Label"]), Paragraph(str(data.get("payable_days", "-")), styles["ValueBold"]),
        ],
        [
            Paragraph("Designation", styles["Label"]), Paragraph(escape_paragraph(employee.get("designation") or "-"), styles["Value"]),
            Paragraph("Generated On", styles["Label"]), Paragraph(_format_date(data.get("generated_at")), styles["Value"]),
        ],
    ]
    info_table = Table(info_data, colWidths=[30 * mm, 55 * mm, 34 * mm, doc.width - 119 * mm])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 3), (-1, 3), 0.5, _COLOR_BORDER),
    ]))
    elements.append(info_table)

    # ── Attendance summary ───────────────────────────────────────────────────
    att = data.get("attendance") or {}
    metrics = [
        ("Working Days", att.get("working_days", 0)),
        ("Present Days", att.get("present_days", 0)),
        ("Paid Leave", att.get("paid_leave_days", 0)),
        ("Unpaid Leave", att.get("unpaid_leave_days", 0)),
        ("Absent", att.get("absent_days", 0)),
        ("Half Days", att.get("half_days", 0)),
        ("Holidays", att.get("holiday_days", 0)),
        ("Week Off", att.get("week_off_days", 0)),
    ]
    rows: List = []
    for i in range(0, len(metrics), 2):
        left = metrics[i]
        right = metrics[i + 1] if i + 1 < len(metrics) else ("", "")
        rows.append([*_metric(left[0], left[1]), *_metric(right[0], right[1])])

    elements.append(Paragraph("Attendance Summary", styles["Section"]))
    att_table = Table(rows, colWidths=[(doc.width - 8 * mm) / 2, (doc.width - 8 * mm) / 2])
    att_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), _COLOR_HEADER_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(att_table)

    # ── Earnings ─────────────────────────────────────────────────────────────
    currency = data.get("currency") or "INR"
    earnings = data.get("earnings") or []
    elements.append(Paragraph("Earnings", styles["Section"]))
    earn_rows: List[List] = [[Paragraph("#", styles["Head"]), Paragraph("Component", styles["Head"]), Paragraph("Amount", styles["Head"])]]
    for idx, item in enumerate(earnings, start=1):
        earn_rows.append([
            Paragraph(str(idx), styles["CellRight"]),
            Paragraph(escape_paragraph(item.get("component_name") or "-"), styles["Cell"]),
            Paragraph(escape_paragraph(format_currency(to_decimal(item.get("calculated_amount"), "earning"), currency)), styles["CellRight"]),
        ])
    earn_rows.append([
        Paragraph("", styles["Cell"]),
        Paragraph("Gross Earnings", styles["ValueBold"]),
        Paragraph(escape_paragraph(format_currency(to_decimal(data.get("totals", {}).get("gross"), "gross"), currency)), styles["ValueBold"]),
    ])
    if not earnings:
        earn_rows.insert(1, [Paragraph("", styles["Cell"]), Paragraph("No earnings", styles["Cell"]), Paragraph("", styles["Cell"])])
    earn_table = LongTable(earn_rows, colWidths=[10 * mm, doc.width - 10 * mm - 50 * mm, 50 * mm], repeatRows=1)
    earn_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.25, _COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, _COLOR_GROSS),
        ("TEXTCOLOR", (2, -1), (2, -1), _COLOR_GROSS),
    ]))
    elements.append(earn_table)

    # ── Deductions ───────────────────────────────────────────────────────────
    deductions = data.get("deductions") or []
    elements.append(Paragraph("Deductions", styles["Section"]))
    ded_rows: List[List] = [[Paragraph("#", styles["Head"]), Paragraph("Component", styles["Head"]), Paragraph("Amount", styles["Head"])]]
    for idx, item in enumerate(deductions, start=1):
        ded_rows.append([
            Paragraph(str(idx), styles["CellRight"]),
            Paragraph(escape_paragraph(item.get("component_name") or "-"), styles["Cell"]),
            Paragraph(escape_paragraph(format_currency(to_decimal(item.get("calculated_amount"), "deduction"), currency)), styles["CellRight"]),
        ])
    ded_rows.append([
        Paragraph("", styles["Cell"]),
        Paragraph("Total Deductions", styles["ValueBold"]),
        Paragraph(escape_paragraph(format_currency(to_decimal(data.get("totals", {}).get("total_deductions"), "total_deductions"), currency)), styles["ValueBold"]),
    ])
    if not deductions:
        ded_rows.insert(1, [Paragraph("", styles["Cell"]), Paragraph("No deductions", styles["Cell"]), Paragraph("", styles["Cell"])])
    ded_table = LongTable(ded_rows, colWidths=[10 * mm, doc.width - 10 * mm - 50 * mm, 50 * mm], repeatRows=1)
    ded_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _COLOR_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.25, _COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, _COLOR_DEDUCT),
        ("TEXTCOLOR", (2, -1), (2, -1), _COLOR_DEDUCT),
    ]))
    elements.append(ded_table)

    # ── Net pay ──────────────────────────────────────────────────────────────
    totals = data.get("totals") or {}
    net = to_decimal(totals.get("net"), "net")
    net_box_data = [[
        Paragraph("NET PAY", styles["NetLabel"]),
        Paragraph(escape_paragraph(format_currency(net, currency)), styles["Net"]),
    ]]
    net_box = Table(net_box_data, colWidths=[doc.width * 0.4, doc.width * 0.6])
    net_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _COLOR_NET_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("BOX", (0, 0), (-1, -1), 0.75, _COLOR_PRIMARY),
    ]))
    elements.append(Spacer(1, 10))
    elements.append(KeepTogether(net_box))

    if str(currency).strip().upper() == "INR":
        words = number_to_words_inr(net)
        if words:
            elements.append(Spacer(1, 4))
            elements.append(Paragraph(f"Amount in words: {escape_paragraph(words)}", styles["Words"]))

    # ── Footer ───────────────────────────────────────────────────────────────
    elements.append(Spacer(1, 12))
    version = data.get("version") or 1
    elements.append(Paragraph(
        "This is a system-generated payslip based on the processed payroll record. "
        f"Payslip version {version}.",
        styles["Footer"],
    ))

    doc.build(elements)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
